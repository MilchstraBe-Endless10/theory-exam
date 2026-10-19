import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { inTransaction } from '../db/database.js';
import { HttpError } from '../errors.js';

type QuestionType = 'single' | 'multiple' | 'judgement';
type ExamStatus = 'in_progress' | 'submitted' | 'expired' | 'voided';
type ExamRules = {
  singleCount: number; singlePoints: number; multipleCount: number; multiplePoints: number;
  judgementCount: number; judgementPoints: number; durationMinutes: number; passingScore: number;
};
type SessionRow = {
  id: string; user_id: string; bank_id: string; bank_version_id: string; rules_snapshot_json: string;
  status: ExamStatus; started_at: string | null; deadline_at: string | null; submitted_at: string | null; created_at: string;
};
type Snapshot = { id: string; exam_session_id: string; question_id: string | null; position: number; snapshot_json: string; answer_json: string; points: number };
type AnswerRow = { answer_json: string; updated_at: string; version: number; marked: number; last_write_id: string };
type SnapshotView = { questionId: string | null; type: QuestionType; stem: string; options: Record<string, string>; source?: { sheet: string; row: number } };

const typeConfig = [
  { type: 'single', count: 'singleCount', points: 'singlePoints' },
  { type: 'multiple', count: 'multipleCount', points: 'multiplePoints' },
  { type: 'judgement', count: 'judgementCount', points: 'judgementPoints' },
] as const;

function iso(date: Date) { return date.toISOString(); }
function parseArray(value: string): string[] { return JSON.parse(value) as string[]; }
function parseRules(value: string): ExamRules { return JSON.parse(value) as ExamRules; }
function ownedSession(db: DatabaseSync, userId: string, sessionId: string): SessionRow {
  const row = db.prepare('SELECT * FROM exam_sessions WHERE id = ? AND user_id = ?').get(sessionId, userId) as SessionRow | undefined;
  if (!row) throw new HttpError(404, 'EXAM_NOT_FOUND', '考试不存在或无权访问。');
  return row;
}

function publicSnapshot(row: Snapshot): SnapshotView {
  const snapshot = JSON.parse(row.snapshot_json) as SnapshotView;
  return { ...snapshot, questionId: row.question_id };
}

function answerMap(db: DatabaseSync, examId: string) {
  const rows = db.prepare(`SELECT a.snapshot_id AS snapshotId, a.answer_json AS answerJson, a.updated_at AS updatedAt,
      a.version, a.marked FROM exam_answers a WHERE a.exam_session_id = ?`).all(examId) as Array<{
        snapshotId: string; answerJson: string; updatedAt: string; version: number; marked: number;
      }>;
  return new Map(rows.map(row => [row.snapshotId, {
    answer: parseArray(row.answerJson), updatedAt: row.updatedAt, version: row.version, marked: Boolean(row.marked),
  }]));
}

function examPayload(db: DatabaseSync, session: SessionRow, now: Date) {
  const snapshots = db.prepare(`SELECT id, exam_session_id, question_id, position, snapshot_json, answer_json, points
    FROM exam_question_snapshots WHERE exam_session_id = ? ORDER BY position`).all(session.id) as unknown as Snapshot[];
  const answers = answerMap(db, session.id);
  const rules = parseRules(session.rules_snapshot_json);
  const resultRow = db.prepare('SELECT details_json FROM exam_results WHERE exam_session_id = ?').get(session.id) as { details_json: string } | undefined;
  const deadlineAt = session.deadline_at;
  return {
    session: {
      id: session.id, bankId: session.bank_id, bankVersionId: session.bank_version_id, status: session.status,
      startedAt: session.started_at, deadlineAt, submittedAt: session.submitted_at, createdAt: session.created_at,
      totalQuestions: snapshots.length, rules,
      serverNow: iso(now), remainingSeconds: deadlineAt && session.status === 'in_progress'
        ? Math.max(0, Math.ceil((Date.parse(deadlineAt) - now.getTime()) / 1000)) : 0,
    },
    questions: snapshots.map(snapshot => {
      const answer = answers.get(snapshot.id);
      return {
        position: snapshot.position, ...publicSnapshot(snapshot),
        answer: answer?.answer ?? [], version: answer?.version ?? 0, marked: answer?.marked ?? false,
        updatedAt: answer?.updatedAt ?? null,
      };
    }),
    result: resultRow ? JSON.parse(resultRow.details_json) as Record<string, unknown> : null,
  };
}

function finalizeWithinTransaction(db: DatabaseSync, session: SessionRow, now: Date, expired: boolean) {
  const existing = db.prepare('SELECT details_json FROM exam_results WHERE exam_session_id = ?').get(session.id) as { details_json: string } | undefined;
  if (existing) return JSON.parse(existing.details_json) as Record<string, unknown>;
  const snapshots = db.prepare(`SELECT id, exam_session_id, question_id, position, snapshot_json, answer_json, points
    FROM exam_question_snapshots WHERE exam_session_id = ? ORDER BY position`).all(session.id) as unknown as Snapshot[];
  const answers = answerMap(db, session.id);
  const rules = parseRules(session.rules_snapshot_json);
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;
  const scoreByType: Record<QuestionType, number> = { single: 0, multiple: 0, judgement: 0 };
  const replay = snapshots.map(snapshot => {
    const question = publicSnapshot(snapshot);
    const userAnswer = answers.get(snapshot.id)?.answer ?? [];
    const correctAnswer = parseArray(snapshot.answer_json);
    const orderedUser = [...userAnswer].sort();
    const orderedCorrect = [...correctAnswer].sort();
    const answered = orderedUser.length > 0;
    const isCorrect = answered && orderedUser.length === orderedCorrect.length && orderedUser.every((letter, index) => letter === orderedCorrect[index]);
    const earnedPoints = isCorrect ? snapshot.points : 0;
    if (!answered) unansweredCount++;
    else if (isCorrect) { correctCount++; scoreByType[question.type] += earnedPoints; }
    else {
      wrongCount++;
      if (snapshot.question_id) {
        db.prepare(`INSERT INTO mistake_states(user_id, bank_id, bank_version_id, question_id, wrong_count,
          consecutive_correct_rounds, mastery_status, last_review_round_id, updated_at)
          VALUES (?, ?, ?, ?, 1, 0, 'review', NULL, ?)
          ON CONFLICT(user_id, question_id) DO UPDATE SET bank_id = excluded.bank_id,
            bank_version_id = excluded.bank_version_id, wrong_count = mistake_states.wrong_count + 1,
            consecutive_correct_rounds = 0, mastery_status = 'review', last_review_round_id = NULL,
            updated_at = excluded.updated_at`)
          .run(session.user_id, session.bank_id, session.bank_version_id, snapshot.question_id, iso(now));
      }
    }
    return {
      position: snapshot.position, questionId: snapshot.question_id, type: question.type, stem: question.stem,
      options: question.options, source: question.source ?? null, userAnswer, correctAnswer, points: snapshot.points,
      earnedPoints, answered, isCorrect: answered ? isCorrect : null, marked: answers.get(snapshot.id)?.marked ?? false,
    };
  });
  const totalScore = scoreByType.single + scoreByType.multiple + scoreByType.judgement;
  const maxScore = snapshots.reduce((total, snapshot) => total + snapshot.points, 0);
  const startedAt = session.started_at ? Date.parse(session.started_at) : now.getTime();
  const deadline = session.deadline_at ? Date.parse(session.deadline_at) : now.getTime();
  const durationSeconds = Math.max(0, Math.floor((Math.min(now.getTime(), deadline) - startedAt) / 1000));
  const status: ExamStatus = expired ? 'expired' : 'submitted';
  const result = {
    examId: session.id, bankId: session.bank_id, bankVersionId: session.bank_version_id,
    status, startedAt: session.started_at, deadlineAt: session.deadline_at, submittedAt: iso(now), durationSeconds,
    score: { total: totalScore, maximum: maxScore, passingScore: rules.passingScore, passed: totalScore >= rules.passingScore,
      single: scoreByType.single, multiple: scoreByType.multiple, judgement: scoreByType.judgement },
    counts: { total: snapshots.length, correct: correctCount, wrong: wrongCount, unanswered: unansweredCount },
    questions: replay,
  };
  db.prepare(`INSERT INTO exam_results(exam_session_id, total_score, correct_count, wrong_count, unanswered_count,
      duration_seconds, created_at, single_score, multiple_score, judgement_score, passed, details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(session.id, totalScore, correctCount, wrongCount, unansweredCount, durationSeconds, iso(now),
      scoreByType.single, scoreByType.multiple, scoreByType.judgement, Number(totalScore >= rules.passingScore), JSON.stringify(result));
  db.prepare('UPDATE exam_sessions SET status = ?, submitted_at = ? WHERE id = ? AND status = ?')
    .run(status, iso(now), session.id, 'in_progress');
  return result;
}

export function settleExpiredExam(db: DatabaseSync, sessionId: string, now: Date) {
  const session = db.prepare("SELECT * FROM exam_sessions WHERE id = ? AND status = 'in_progress'").get(sessionId) as SessionRow | undefined;
  if (!session?.deadline_at || Date.parse(session.deadline_at) > now.getTime()) return false;
  inTransaction(db, () => finalizeWithinTransaction(db, session, now, true));
  return true;
}

export function settleExpiredExams(db: DatabaseSync, now: Date) {
  const ids = db.prepare("SELECT id FROM exam_sessions WHERE status = 'in_progress' AND deadline_at <= ?").all(iso(now)) as Array<{ id: string }>;
  for (const { id } of ids) settleExpiredExam(db, id, now);
  return ids.length;
}

export function createExam(db: DatabaseSync, userId: string, bankId: string, now: Date) {
  settleExpiredExams(db, now);
  const existing = db.prepare("SELECT * FROM exam_sessions WHERE user_id = ? AND status = 'in_progress'").get(userId) as SessionRow | undefined;
  if (existing) return { ...examPayload(db, existing, now), resumed: true };
  return inTransaction(db, () => {
    const bank = db.prepare(`SELECT b.id, b.active_version_id AS versionId, r.id AS rulesId, r.single_count AS singleCount,
      r.single_points AS singlePoints, r.multiple_count AS multipleCount, r.multiple_points AS multiplePoints,
      r.judgement_count AS judgementCount, r.judgement_points AS judgementPoints,
      r.duration_minutes AS durationMinutes, r.passing_score AS passingScore
      FROM question_banks b LEFT JOIN exam_rules r ON r.bank_id = b.id AND r.bank_version_id = b.active_version_id
      WHERE b.id = ? AND b.enabled = 1`).get(bankId) as ({ id: string; versionId: string | null; rulesId: string | null } & Partial<ExamRules>) | undefined;
    if (!bank?.versionId) throw new HttpError(404, 'BANK_NOT_AVAILABLE', '题库不存在、未启用或没有有效版本。');
    if (!bank.rulesId) {
      throw new HttpError(409, 'EXAM_RULES_MISSING', '当前题库版本尚未配置考试规则。');
    }
    const rules: ExamRules = {
      singleCount: Number(bank.singleCount), singlePoints: Number(bank.singlePoints),
      multipleCount: Number(bank.multipleCount), multiplePoints: Number(bank.multiplePoints),
      judgementCount: Number(bank.judgementCount), judgementPoints: Number(bank.judgementPoints),
      durationMinutes: Number(bank.durationMinutes), passingScore: Number(bank.passingScore),
    };
    const maximum = typeConfig.reduce((sum, item) => sum + rules[item.count] * rules[item.points], 0);
    if (!Number.isInteger(rules.durationMinutes) || rules.durationMinutes < 1 || maximum <= 0 || rules.passingScore < 0 || rules.passingScore > maximum ||
        typeConfig.some(item => !Number.isInteger(rules[item.count]) || rules[item.count] < 0 || !Number.isFinite(rules[item.points]) || rules[item.points] < 0)) {
      throw new HttpError(409, 'EXAM_RULES_INVALID', '当前题库的考试规则配置无效，请联系管理员。');
    }
    const snapshots: Array<{ question: Record<string, unknown>; answer: string[]; points: number; type: QuestionType; id: string }> = [];
    for (const item of typeConfig) {
      const required = rules[item.count];
      if (!required) continue;
      const available = Number((db.prepare('SELECT COUNT(*) AS count FROM questions WHERE bank_id = ? AND bank_version_id = ? AND question_type = ?')
        .get(bankId, bank.versionId, item.type) as { count: number }).count);
      if (available < required) throw new HttpError(409, 'EXAM_QUESTION_SHORTAGE', `${item.type}题量不足：规则需要 ${required} 道，当前版本只有 ${available} 道。`, { type: item.type, required, available });
      const questions = db.prepare(`SELECT id, question_type, stem, options_json, answer_json, source_sheet, source_row
        FROM questions WHERE bank_id = ? AND bank_version_id = ? AND question_type = ? ORDER BY random() LIMIT ?`)
        .all(bankId, bank.versionId, item.type, required) as Array<{ id: string; question_type: QuestionType; stem: string; options_json: string; answer_json: string; source_sheet: string; source_row: number }>;
      for (const question of questions) snapshots.push({
        id: question.id, type: question.question_type, points: rules[item.points], answer: parseArray(question.answer_json),
        question: { questionId: question.id, type: question.question_type, stem: question.stem,
          options: JSON.parse(question.options_json) as Record<string, string>, source: { sheet: question.source_sheet, row: question.source_row } },
      });
    }
    const startedAt = iso(now);
    const deadlineAt = iso(new Date(now.getTime() + rules.durationMinutes * 60_000));
    const sessionId = randomUUID();
    db.prepare(`INSERT INTO exam_sessions(id, user_id, bank_id, bank_version_id, rules_snapshot_json, status,
      started_at, deadline_at, created_at) VALUES (?, ?, ?, ?, ?, 'in_progress', ?, ?, ?)`)
      .run(sessionId, userId, bankId, bank.versionId, JSON.stringify(rules), startedAt, deadlineAt, startedAt);
    const insert = db.prepare(`INSERT INTO exam_question_snapshots(id, exam_session_id, question_id, position, snapshot_json, answer_json, points)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    snapshots.forEach((snapshot, index) => insert.run(randomUUID(), sessionId, snapshot.id, index + 1,
      JSON.stringify(snapshot.question), JSON.stringify(snapshot.answer), snapshot.points));
    const session = ownedSession(db, userId, sessionId);
    return { ...examPayload(db, session, now), resumed: false };
  });
}

function requireLiveSession(db: DatabaseSync, userId: string, sessionId: string, now: Date) {
  settleExpiredExam(db, sessionId, now);
  const session = ownedSession(db, userId, sessionId);
  if (session.status !== 'in_progress') throw new HttpError(409, 'EXAM_ALREADY_FINISHED', '考试已经结束，不能再修改答案。');
  return session;
}

export function getExam(db: DatabaseSync, userId: string, sessionId: string, now: Date) {
  settleExpiredExam(db, sessionId, now);
  return examPayload(db, ownedSession(db, userId, sessionId), now);
}

export function getActiveExam(db: DatabaseSync, userId: string, now: Date) {
  settleExpiredExams(db, now);
  const session = db.prepare("SELECT * FROM exam_sessions WHERE user_id = ? AND status = 'in_progress'").get(userId) as SessionRow | undefined;
  return session ? examPayload(db, session, now) : { session: null, questions: [], result: null };
}

export function saveExamAnswer(db: DatabaseSync, userId: string, sessionId: string, position: number,
  answer: string[], expectedVersion: number, requestId: string, marked: boolean | undefined, now: Date) {
  const live = requireLiveSession(db, userId, sessionId, now);
  return inTransaction(db, () => {
    const session = ownedSession(db, userId, sessionId);
    if (session.status !== 'in_progress' || !session.deadline_at || now.getTime() >= Date.parse(session.deadline_at)) {
      throw new HttpError(409, 'EXAM_DEADLINE_PASSED', '考试已到截止时间，服务器不再接受答案修改。');
    }
    const snapshot = db.prepare(`SELECT id, exam_session_id, question_id, position, snapshot_json, answer_json, points
      FROM exam_question_snapshots WHERE exam_session_id = ? AND position = ?`).get(live.id, position) as Snapshot | undefined;
    if (!snapshot) throw new HttpError(404, 'EXAM_QUESTION_NOT_FOUND', '该考试题号不存在。');
    const question = publicSnapshot(snapshot);
    const optionSet = new Set(Object.keys(question.options));
    if (answer.some(letter => !optionSet.has(letter)) || new Set(answer).size !== answer.length) {
      throw new HttpError(400, 'INVALID_EXAM_ANSWER', '答案必须由该题现有且不重复的选项组成。');
    }
    if (question.type !== 'multiple' && answer.length > 1) {
      throw new HttpError(400, 'INVALID_EXAM_ANSWER', '单选题和判断题只能提交一个选项。');
    }
    const existing = db.prepare('SELECT answer_json, updated_at, version, marked, last_write_id FROM exam_answers WHERE exam_session_id = ? AND snapshot_id = ?')
      .get(live.id, snapshot.id) as AnswerRow | undefined;
    const nextMarked = marked ?? Boolean(existing?.marked);
    if (existing?.last_write_id === requestId) {
      if (JSON.stringify(parseArray(existing.answer_json)) !== JSON.stringify(answer) || Boolean(existing.marked) !== nextMarked) {
        throw new HttpError(409, 'IDEMPOTENCY_KEY_REUSED', '该同步请求编号已用于不同答案。');
      }
      return { position, answer, marked: nextMarked, version: existing.version, updatedAt: existing.updated_at, idempotent: true };
    }
    const currentVersion = existing?.version ?? 0;
    if (expectedVersion !== currentVersion) {
      throw new HttpError(409, 'ANSWER_VERSION_CONFLICT', '答案已在其他设备更新，请先读取服务器状态再同步。', {
        current: { answer: existing ? parseArray(existing.answer_json) : [], marked: Boolean(existing?.marked), version: currentVersion, updatedAt: existing?.updated_at ?? null },
      });
    }
    const updatedAt = iso(now);
    const version = currentVersion + 1;
    if (existing) {
      db.prepare(`UPDATE exam_answers SET answer_json = ?, updated_at = ?, version = ?, marked = ?, last_write_id = ?
        WHERE exam_session_id = ? AND snapshot_id = ? AND version = ?`)
        .run(JSON.stringify(answer), updatedAt, version, Number(nextMarked), requestId, live.id, snapshot.id, currentVersion);
    } else {
      db.prepare(`INSERT INTO exam_answers(exam_session_id, snapshot_id, answer_json, updated_at, version, marked, last_write_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(live.id, snapshot.id, JSON.stringify(answer), updatedAt, version, Number(nextMarked), requestId);
    }
    return { position, answer, marked: nextMarked, version, updatedAt, idempotent: false };
  });
}

export function submitExam(db: DatabaseSync, userId: string, sessionId: string, now: Date) {
  settleExpiredExam(db, sessionId, now);
  return inTransaction(db, () => {
    const session = ownedSession(db, userId, sessionId);
    const existing = db.prepare('SELECT details_json FROM exam_results WHERE exam_session_id = ?').get(sessionId) as { details_json: string } | undefined;
    if (existing) return { result: JSON.parse(existing.details_json) as Record<string, unknown>, idempotent: true };
    if (session.status !== 'in_progress') throw new HttpError(409, 'EXAM_ALREADY_FINISHED', '考试已经结束。');
    return { result: finalizeWithinTransaction(db, session, now, false), idempotent: false };
  });
}

export function listExamHistory(db: DatabaseSync, userId: string, bankId?: string, now = new Date()) {
  settleExpiredExams(db, now);
  const rows = db.prepare(`SELECT s.id, s.bank_id AS bankId, b.name AS bankName, s.bank_version_id AS bankVersionId,
      s.status, s.started_at AS startedAt, s.deadline_at AS deadlineAt, s.submitted_at AS submittedAt, s.created_at AS createdAt,
      r.total_score AS totalScore, r.single_score AS singleScore, r.multiple_score AS multipleScore,
      r.judgement_score AS judgementScore, r.correct_count AS correctCount, r.wrong_count AS wrongCount,
      r.unanswered_count AS unansweredCount, r.duration_seconds AS durationSeconds, r.passed AS passed
    FROM exam_sessions s JOIN question_banks b ON b.id = s.bank_id LEFT JOIN exam_results r ON r.exam_session_id = s.id
    WHERE s.user_id = ? AND (? IS NULL OR s.bank_id = ?) ORDER BY COALESCE(s.submitted_at, s.created_at) DESC LIMIT 100`)
    .all(userId, bankId ?? null, bankId ?? null) as Array<Record<string, unknown>>;
  return { items: rows.map(row => ({ ...row, passed: row.passed === null ? null : Boolean(row.passed) })) };
}
