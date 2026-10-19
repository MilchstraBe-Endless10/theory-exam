import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { inTransaction } from '../db/database.js';
import { HttpError } from '../errors.js';

export type PracticeMode = 'sequential' | 'random' | 'single' | 'multiple' | 'judgement' | 'unanswered' | 'favorites' | 'mistakes';
type QuestionType = 'single' | 'multiple' | 'judgement';

interface SessionRow {
  id: string;
  user_id: string;
  bank_id: string;
  bank_version_id: string;
  mode: PracticeMode;
  current_position: number;
  question_count: number;
  submitted_count: number;
  status: 'in_progress' | 'completed' | 'exited';
  created_at: string;
  updated_at: string;
}

interface QuestionRow {
  id: string;
  bank_id: string;
  bank_version_id: string;
  question_type: QuestionType;
  stem: string;
  options_json: string;
  answer_json: string;
  source_sheet: string;
  source_row: number;
}

function sessionFor(db: DatabaseSync, userId: string, sessionId: string): SessionRow {
  const session = db.prepare('SELECT * FROM practice_sessions WHERE id = ? AND user_id = ?')
    .get(sessionId, userId) as SessionRow | undefined;
  if (!session) throw new HttpError(404, 'PRACTICE_SESSION_NOT_FOUND', '练习会话不存在。');
  return session;
}

function publicQuestion(row: QuestionRow) {
  return {
    id: row.id,
    bankId: row.bank_id,
    bankVersionId: row.bank_version_id,
    type: row.question_type,
    stem: row.stem,
    options: JSON.parse(row.options_json) as Record<string, string>,
    source: { sheet: row.source_sheet, row: row.source_row },
  };
}

function questionAt(db: DatabaseSync, session: SessionRow, position: number, userId: string) {
  const row = db.prepare(`SELECT q.id, q.bank_id, q.bank_version_id, q.question_type, q.stem, q.options_json,
      q.answer_json, q.source_sheet, q.source_row
    FROM practice_session_questions sq JOIN questions q ON q.id = sq.question_id
    WHERE sq.practice_session_id = ? AND sq.position = ? AND q.bank_version_id = ?`)
    .get(session.id, position, session.bank_version_id) as QuestionRow | undefined;
  if (!row) throw new HttpError(404, 'PRACTICE_QUESTION_NOT_FOUND', '该练习位置没有题目。');
  const attempt = db.prepare(`SELECT id, answer_json, is_correct, created_at FROM practice_attempts
    WHERE user_id = ? AND practice_session_id = ? AND question_id = ?`)
    .get(userId, session.id, row.id) as { id: string; answer_json: string; is_correct: number; created_at: string } | undefined;
  return {
    question: publicQuestion(row),
    position,
    total: session.question_count,
    submitted: Boolean(attempt),
    userAnswer: attempt ? JSON.parse(attempt.answer_json) as string[] : null,
    isCurrent: position === session.current_position,
  };
}

export function createPracticeSession(db: DatabaseSync, userId: string, bankId: string, mode: PracticeMode, quantity?: number) {
  const bank = db.prepare(`SELECT b.active_version_id AS versionId FROM question_banks b
    WHERE b.id = ? AND b.enabled = 1 AND b.active_version_id IS NOT NULL`).get(bankId) as { versionId: string } | undefined;
  if (!bank) throw new HttpError(404, 'BANK_NOT_AVAILABLE', '题库不存在、未启用或没有有效版本。');

  const filters = [`q.bank_id = ?`, `q.bank_version_id = ?`];
  const args: (string | number)[] = [bankId, bank.versionId];
  if (mode === 'single' || mode === 'multiple' || mode === 'judgement') {
    filters.push('q.question_type = ?'); args.push(mode);
  } else if (mode === 'unanswered') {
    filters.push(`NOT EXISTS (SELECT 1 FROM practice_attempts a WHERE a.user_id = ? AND a.question_id = q.id)`); args.push(userId);
  } else if (mode === 'favorites') {
    filters.push(`EXISTS (SELECT 1 FROM favorites f WHERE f.user_id = ? AND f.question_id = q.id)`); args.push(userId);
  } else if (mode === 'mistakes') {
    filters.push(`EXISTS (SELECT 1 FROM mistake_states m WHERE m.user_id = ? AND m.question_id = q.id AND m.mastery_status IN ('review', 'reinforcing'))`); args.push(userId);
  }
  const order = mode === 'random' ? 'ORDER BY random()' : 'ORDER BY q.source_row, q.id';
  const limit = quantity === undefined ? '' : 'LIMIT ?';
  if (quantity !== undefined) args.push(quantity);
  const rows = db.prepare(`SELECT q.id FROM questions q WHERE ${filters.join(' AND ')} ${order} ${limit}`).all(...args) as Array<{ id: string }>;
  if (!rows.length) throw new HttpError(409, 'NO_PRACTICE_QUESTIONS', '当前筛选条件下没有可练习的题目。');

  const id = randomUUID();
  const now = new Date().toISOString();
  inTransaction(db, () => {
    db.prepare(`INSERT INTO practice_sessions(id, user_id, bank_id, bank_version_id, mode, current_position,
      question_count, submitted_count, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, 0, 'in_progress', ?, ?)`)
      .run(id, userId, bankId, bank.versionId, mode, rows.length, now, now);
    const insert = db.prepare('INSERT INTO practice_session_questions(practice_session_id, position, question_id) VALUES (?, ?, ?)');
    rows.forEach((row, index) => insert.run(id, index + 1, row.id));
  });
  const session = sessionFor(db, userId, id);
  return { session: sessionSummary(session), currentQuestion: questionAt(db, session, 1, userId).question };
}

export function sessionSummary(session: SessionRow) {
  return {
    id: session.id, bankId: session.bank_id, bankVersionId: session.bank_version_id,
    mode: session.mode, currentPosition: session.current_position, questionCount: session.question_count,
    submittedCount: session.submitted_count, status: session.status,
    createdAt: session.created_at, updatedAt: session.updated_at,
  };
}

export function getActivePracticeSession(db: DatabaseSync, userId: string, bankId: string) {
  const session = db.prepare(`SELECT * FROM practice_sessions WHERE user_id = ? AND bank_id = ?
    AND status IN ('in_progress', 'exited') ORDER BY updated_at DESC LIMIT 1`).get(userId, bankId) as SessionRow | undefined;
  if (!session) return { session: null, currentQuestion: null };
  return { session: sessionSummary(session), currentQuestion: questionAt(db, session, session.current_position, userId).question };
}

export function getPracticeSession(db: DatabaseSync, userId: string, sessionId: string) {
  const session = sessionFor(db, userId, sessionId);
  return { session: sessionSummary(session), currentQuestion: questionAt(db, session, session.current_position, userId) };
}

export function getPracticeQuestion(db: DatabaseSync, userId: string, sessionId: string, position: number) {
  const session = sessionFor(db, userId, sessionId);
  if (!Number.isInteger(position) || position < 1 || position > session.question_count) {
    throw new HttpError(400, 'INVALID_PRACTICE_POSITION', '题号超出本次练习范围。');
  }
  return questionAt(db, session, position, userId);
}

export function movePracticePosition(db: DatabaseSync, userId: string, sessionId: string, position: number) {
  return inTransaction(db, () => {
    const session = sessionFor(db, userId, sessionId);
    if (!Number.isInteger(position) || position < 1 || position > session.question_count) {
      throw new HttpError(400, 'INVALID_PRACTICE_POSITION', '题号超出本次练习范围。');
    }
    const now = new Date().toISOString();
    db.prepare('UPDATE practice_sessions SET current_position = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .run(position, now, sessionId, userId);
    return { session: sessionSummary(sessionFor(db, userId, sessionId)), currentQuestion: questionAt(db, sessionFor(db, userId, sessionId), position, userId) };
  });
}

export function resumePracticeSession(db: DatabaseSync, userId: string, sessionId: string) {
  return inTransaction(db, () => {
    const session = sessionFor(db, userId, sessionId);
    if (session.status === 'completed') throw new HttpError(409, 'PRACTICE_COMPLETED', '本次练习已经完成。');
    db.prepare(`UPDATE practice_sessions SET status = 'in_progress', updated_at = ? WHERE id = ? AND user_id = ?`)
      .run(new Date().toISOString(), sessionId, userId);
    return getPracticeSession(db, userId, sessionId);
  });
}

export function exitPracticeSession(db: DatabaseSync, userId: string, sessionId: string) {
  return inTransaction(db, () => {
    const session = sessionFor(db, userId, sessionId);
    if (session.status !== 'completed') db.prepare(`UPDATE practice_sessions SET status = 'exited', updated_at = ? WHERE id = ? AND user_id = ?`)
      .run(new Date().toISOString(), sessionId, userId);
    return { session: sessionSummary(sessionFor(db, userId, sessionId)) };
  });
}

function normalizeUserAnswer(row: QuestionRow, input: unknown): string[] {
  if (!Array.isArray(input) || input.some(value => typeof value !== 'string')) throw new HttpError(400, 'INVALID_ANSWER', '答案必须是选项字母数组。');
  const answer = input as string[];
  const options = JSON.parse(row.options_json) as Record<string, string>;
  if (!answer.length || answer.some(letter => !/^[A-E]$/.test(letter) || !options[letter]) || new Set(answer).size !== answer.length) {
    throw new HttpError(400, 'INVALID_ANSWER', '答案必须是题目中的有效选项，且不能重复。');
  }
  if (row.question_type !== 'multiple' && answer.length !== 1) throw new HttpError(400, 'INVALID_ANSWER', '该题型只能提交一个选项。');
  return [...answer].sort();
}

function submissionResult(db: DatabaseSync, userId: string, session: SessionRow, row: QuestionRow, attempt: { id: string; answer_json: string; is_correct: number; created_at: string }) {
  const correctAnswer = JSON.parse(row.answer_json) as string[];
  const options = JSON.parse(row.options_json) as Record<string, string>;
  const progress = db.prepare(`SELECT COUNT(*) AS submittedCount,
      SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correctCount
    FROM practice_attempts WHERE user_id = ? AND practice_session_id = ?`).get(userId, session.id) as { submittedCount: number; correctCount: number | null };
  return {
    attemptId: attempt.id,
    isCorrect: Boolean(attempt.is_correct),
    userAnswer: JSON.parse(attempt.answer_json) as string[],
    correctAnswer,
    correctOptions: Object.fromEntries(correctAnswer.map(letter => [letter, options[letter]])),
    explanation: '原题库未提供解析',
    submittedAt: attempt.created_at,
    progress: {
      submittedCount: Number(progress.submittedCount), correctCount: Number(progress.correctCount ?? 0),
      totalQuestions: session.question_count, currentPosition: session.current_position,
    },
  };
}

export function submitPracticeAnswer(db: DatabaseSync, userId: string, sessionId: string, input: unknown) {
  return inTransaction(db, () => {
    const session = sessionFor(db, userId, sessionId);
    const link = db.prepare(`SELECT q.id, q.bank_id, q.bank_version_id, q.question_type, q.stem, q.options_json,
      q.answer_json, q.source_sheet, q.source_row FROM practice_session_questions sq JOIN questions q ON q.id = sq.question_id
      WHERE sq.practice_session_id = ? AND sq.position = ? AND q.bank_id = ? AND q.bank_version_id = ?`)
      .get(session.id, session.current_position, session.bank_id, session.bank_version_id) as QuestionRow | undefined;
    if (!link) throw new HttpError(404, 'PRACTICE_QUESTION_NOT_FOUND', '该练习位置没有题目。');
    const answer = normalizeUserAnswer(link, input);
    const prior = db.prepare(`SELECT id, answer_json, is_correct, created_at FROM practice_attempts
      WHERE user_id = ? AND practice_session_id = ? AND question_id = ?`).get(userId, session.id, link.id) as
      { id: string; answer_json: string; is_correct: number; created_at: string } | undefined;
    if (prior) {
      if (JSON.stringify(JSON.parse(prior.answer_json)) !== JSON.stringify(answer)) {
        throw new HttpError(409, 'PRACTICE_ANSWER_ALREADY_SUBMITTED', '这道题已经正式提交，不能重复修改答案。');
      }
      return submissionResult(db, userId, session, link, prior);
    }
    if (session.status !== 'in_progress') throw new HttpError(409, 'PRACTICE_NOT_ACTIVE', '该练习会话当前不能提交答案，请先恢复练习。');
    const correctAnswer = JSON.parse(link.answer_json) as string[];
    const isCorrect = JSON.stringify(answer) === JSON.stringify([...correctAnswer].sort());
    const attemptId = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO practice_attempts(id, user_id, bank_id, bank_version_id, question_id, mode, answer_json,
      is_correct, created_at, practice_session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(attemptId, userId, session.bank_id, session.bank_version_id, link.id, session.mode, JSON.stringify(answer), Number(isCorrect), now, session.id);
    if (!isCorrect) {
      db.prepare(`INSERT INTO mistake_states(user_id, bank_id, bank_version_id, question_id, wrong_count,
        consecutive_correct_rounds, mastery_status, last_review_round_id, updated_at)
        VALUES (?, ?, ?, ?, 1, 0, 'review', NULL, ?)
        ON CONFLICT(user_id, question_id) DO UPDATE SET wrong_count = wrong_count + 1,
          bank_id = excluded.bank_id, bank_version_id = excluded.bank_version_id,
          consecutive_correct_rounds = 0, mastery_status = 'review', last_review_round_id = NULL, updated_at = excluded.updated_at`)
        .run(userId, session.bank_id, session.bank_version_id, link.id, now);
    }
    const submittedCount = Number((db.prepare('SELECT COUNT(*) AS count FROM practice_attempts WHERE practice_session_id = ?').get(session.id) as { count: number }).count);
    const status = submittedCount >= session.question_count ? 'completed' : 'in_progress';
    db.prepare('UPDATE practice_sessions SET submitted_count = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(submittedCount, status, now, session.id);
    const saved = { id: attemptId, answer_json: JSON.stringify(answer), is_correct: Number(isCorrect), created_at: now };
    return submissionResult(db, userId, { ...session, submitted_count: submittedCount, status, updated_at: now }, link, saved);
  });
}

export function getPracticeResult(db: DatabaseSync, userId: string, sessionId: string, position: number) {
  const session = sessionFor(db, userId, sessionId);
  const question = db.prepare(`SELECT q.id, q.bank_id, q.bank_version_id, q.question_type, q.stem, q.options_json,
      q.answer_json, q.source_sheet, q.source_row FROM practice_session_questions sq JOIN questions q ON q.id = sq.question_id
    WHERE sq.practice_session_id = ? AND sq.position = ? AND q.bank_version_id = ?`)
    .get(session.id, position, session.bank_version_id) as QuestionRow | undefined;
  if (!question) throw new HttpError(404, 'PRACTICE_QUESTION_NOT_FOUND', '该练习位置没有题目。');
  const attempt = db.prepare(`SELECT id, answer_json, is_correct, created_at FROM practice_attempts
    WHERE user_id = ? AND practice_session_id = ? AND question_id = ?`).get(userId, session.id, question.id) as
    { id: string; answer_json: string; is_correct: number; created_at: string } | undefined;
  if (!attempt) throw new HttpError(409, 'PRACTICE_ANSWER_REQUIRED', '该题尚未提交答案。');
  return { session: sessionSummary(session), position, question: publicQuestion(question), result: submissionResult(db, userId, session, question, attempt) };
}

export function setFavorite(db: DatabaseSync, userId: string, bankId: string, questionId: string, enabled: boolean) {
  return inTransaction(db, () => {
    const question = db.prepare(`SELECT q.bank_id, q.bank_version_id FROM questions q JOIN question_banks b ON b.id = q.bank_id
      WHERE q.id = ? AND q.bank_id = ? AND q.bank_version_id = b.active_version_id AND b.enabled = 1`)
      .get(questionId, bankId) as { bank_id: string; bank_version_id: string } | undefined;
    if (!question) throw new HttpError(404, 'QUESTION_NOT_FOUND', '题目不属于该题库的当前有效版本。');
    if (enabled) db.prepare(`INSERT INTO favorites(user_id, bank_id, bank_version_id, question_id, created_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, question_id) DO NOTHING`)
      .run(userId, question.bank_id, question.bank_version_id, questionId, new Date().toISOString());
    else db.prepare('DELETE FROM favorites WHERE user_id = ? AND bank_id = ? AND question_id = ?').run(userId, bankId, questionId);
    const favorite = Boolean(db.prepare('SELECT 1 AS value FROM favorites WHERE user_id = ? AND question_id = ?').get(userId, questionId));
    return { questionId, favorite };
  });
}

export function listFavorites(db: DatabaseSync, userId: string, bankId: string) {
  const bank = db.prepare('SELECT active_version_id AS versionId FROM question_banks WHERE id = ? AND enabled = 1')
    .get(bankId) as { versionId: string | null } | undefined;
  if (!bank?.versionId) throw new HttpError(404, 'BANK_NOT_AVAILABLE', '题库不存在、未启用或没有有效版本。');
  const rows = db.prepare(`SELECT q.id, q.bank_id, q.bank_version_id, q.question_type, q.stem, q.options_json,
      q.answer_json, q.source_sheet, q.source_row FROM favorites f JOIN questions q ON q.id = f.question_id
    WHERE f.user_id = ? AND f.bank_id = ? AND q.bank_version_id = ? ORDER BY f.created_at DESC`)
    .all(userId, bankId, bank.versionId) as unknown as QuestionRow[];
  return { items: rows.map(row => publicQuestion(row)), count: rows.length };
}

function rate(correct: number, count: number) { return count ? Math.round(correct / count * 1000) / 10 : null; }

export function getLearningProgress(db: DatabaseSync, userId: string, bankId: string) {
  const bank = db.prepare(`SELECT b.name, b.active_version_id AS versionId, v.question_count AS questionCount
    FROM question_banks b LEFT JOIN bank_versions v ON v.id = b.active_version_id
    WHERE b.id = ? AND b.enabled = 1`).get(bankId) as { name: string; versionId: string | null; questionCount: number | null } | undefined;
  if (!bank?.versionId) throw new HttpError(404, 'BANK_NOT_AVAILABLE', '题库不存在、未启用或没有有效版本。');
  const byType: Record<QuestionType, { questionCount: number; touchedCount: number; submissionCount: number; correctCount: number; accuracyRate: number | null }> = {} as never;
  const typeRows = db.prepare(`SELECT q.question_type AS type, COUNT(DISTINCT q.id) AS questionCount,
      COUNT(DISTINCT a.question_id) AS touchedCount, COUNT(a.id) AS submissionCount,
      COALESCE(SUM(a.is_correct), 0) AS correctCount
    FROM questions q LEFT JOIN practice_attempts a ON a.question_id = q.id AND a.user_id = ?
    WHERE q.bank_id = ? AND q.bank_version_id = ? GROUP BY q.question_type`)
    .all(userId, bankId, bank.versionId) as Array<{ type: QuestionType; questionCount: number; touchedCount: number; submissionCount: number; correctCount: number }>;
  for (const type of ['single', 'multiple', 'judgement'] as const) {
    const row = typeRows.find(item => item.type === type);
    const submissionCount = Number(row?.submissionCount ?? 0);
    const correctCount = Number(row?.correctCount ?? 0);
    byType[type] = { questionCount: Number(row?.questionCount ?? 0), touchedCount: Number(row?.touchedCount ?? 0), submissionCount, correctCount, accuracyRate: rate(correctCount, submissionCount) };
  }
  const attempts = db.prepare(`SELECT COUNT(*) AS submissionCount, COALESCE(SUM(is_correct), 0) AS correctCount,
      COUNT(DISTINCT question_id) AS touchedCount FROM practice_attempts
    WHERE user_id = ? AND bank_id = ? AND bank_version_id = ?`).get(userId, bankId, bank.versionId) as { submissionCount: number; correctCount: number; touchedCount: number };
  const favoriteCount = Number((db.prepare(`SELECT COUNT(*) AS count FROM favorites f JOIN questions q ON q.id = f.question_id
    WHERE f.user_id = ? AND f.bank_id = ? AND q.bank_version_id = ?`).get(userId, bankId, bank.versionId) as { count: number }).count);
  const mistakeCount = Number((db.prepare(`SELECT COUNT(*) AS count FROM mistake_states WHERE user_id = ? AND bank_id = ?
    AND bank_version_id = ? AND mastery_status IN ('review', 'reinforcing')`).get(userId, bankId, bank.versionId) as { count: number }).count);
  const recentSessions = db.prepare(`SELECT s.id, s.mode, s.status, s.question_count AS questionCount,
      s.submitted_count AS submittedCount, s.created_at AS createdAt, s.updated_at AS updatedAt,
      COUNT(a.id) AS attempts, COALESCE(SUM(a.is_correct), 0) AS correctCount
    FROM practice_sessions s LEFT JOIN practice_attempts a ON a.practice_session_id = s.id
    WHERE s.user_id = ? AND s.bank_id = ? AND s.bank_version_id = ?
    GROUP BY s.id ORDER BY s.updated_at DESC LIMIT 5`).all(userId, bankId, bank.versionId) as Array<Record<string, unknown>>;
  const submissionCount = Number(attempts.submissionCount);
  const correctCount = Number(attempts.correctCount);
  const questionCount = Number(bank.questionCount ?? 0);
  const touchedCount = Number(attempts.touchedCount);
  return {
    bank: { id: bankId, name: bank.name, bankVersionId: bank.versionId },
    questionCount, touchedCount, unansweredCount: Math.max(0, questionCount - touchedCount),
    explorationRate: questionCount ? Math.round(touchedCount / questionCount * 1000) / 10 : null,
    submissionCount, correctCount, accuracyRate: rate(correctCount, submissionCount),
    byType, favoriteCount, pendingMistakeCount: mistakeCount, recentSessions,
  };
}
