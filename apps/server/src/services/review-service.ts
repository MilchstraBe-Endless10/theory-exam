import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { inTransaction } from '../db/database.js';
import { HttpError } from '../errors.js';

export type ReviewQuestionType = 'single' | 'multiple' | 'judgement';
export type ReviewTypeFilter = 'all' | ReviewQuestionType;
export type ReviewStrategy = 'random' | 'weak';
export type ReviewQuantity = '10' | '20' | 'all';
export type ReviewScope = 'pending' | 'mastered';
export type MasteryStatus = 'review' | 'reinforcing' | 'mastered';

interface ReviewRoundRow {
  id: string;
  user_id: string;
  bank_id: string;
  bank_version_id: string;
  question_type_filter: ReviewTypeFilter;
  strategy: ReviewStrategy;
  quantity_selection: ReviewQuantity;
  mastery_status_filter: ReviewScope;
  available_count: number;
  question_count: number;
  current_position: number;
  submitted_count: number;
  status: 'in_progress' | 'completed' | 'exited';
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  exited_at: string | null;
}

interface ReviewQuestionRow {
  id: string;
  bank_id: string;
  bank_version_id: string;
  question_type: ReviewQuestionType;
  stem: string;
  options_json: string;
  answer_json: string;
  source_sheet: string;
  source_row: number;
  mastery_status: MasteryStatus;
  wrong_count: number;
  consecutive_correct_rounds: number;
  last_review_round_id: string | null;
}

interface ReviewAttemptRow {
  id: string;
  answer_json: string;
  is_correct: number;
  mastery_status_after: MasteryStatus;
  consecutive_correct_rounds_after: number;
  submitted_at: string;
}

function roundFor(db: DatabaseSync, userId: string, roundId: string): ReviewRoundRow {
  const round = db.prepare('SELECT * FROM review_rounds WHERE id = ? AND user_id = ?').get(roundId, userId) as ReviewRoundRow | undefined;
  if (!round) throw new HttpError(404, 'REVIEW_ROUND_NOT_FOUND', '复习轮次不存在。');
  return round;
}

function bankFor(db: DatabaseSync, bankId: string): { versionId: string } {
  const bank = db.prepare(`SELECT active_version_id AS versionId FROM question_banks
    WHERE id = ? AND enabled = 1 AND active_version_id IS NOT NULL`).get(bankId) as { versionId: string } | undefined;
  if (!bank) throw new HttpError(404, 'BANK_NOT_AVAILABLE', '题库不存在、未启用或没有有效版本。');
  return bank;
}

function roundSummary(round: ReviewRoundRow) {
  return {
    id: round.id,
    bankId: round.bank_id,
    bankVersionId: round.bank_version_id,
    questionType: round.question_type_filter,
    strategy: round.strategy,
    quantity: round.quantity_selection,
    masteryStatus: round.mastery_status_filter,
    availableCount: round.available_count,
    questionCount: round.question_count,
    currentPosition: round.current_position,
    submittedCount: round.submitted_count,
    status: round.status,
    createdAt: round.created_at,
    updatedAt: round.updated_at,
    completedAt: round.completed_at,
    exitedAt: round.exited_at,
    reducedToAvailable: round.quantity_selection !== 'all' && round.available_count < Number(round.quantity_selection),
  };
}

function questionAt(db: DatabaseSync, round: ReviewRoundRow, position: number) {
  const row = db.prepare(`SELECT q.id, q.bank_id, q.bank_version_id, q.question_type, q.stem,
      q.options_json, q.answer_json, q.source_sheet, q.source_row, m.mastery_status, m.wrong_count,
      m.consecutive_correct_rounds, m.last_review_round_id
    FROM review_round_questions rq JOIN questions q ON q.id = rq.question_id
    JOIN mistake_states m ON m.user_id = ? AND m.question_id = q.id
    WHERE rq.review_round_id = ? AND rq.position = ? AND q.bank_id = ? AND q.bank_version_id = ?`)
    .get(round.user_id, round.id, position, round.bank_id, round.bank_version_id) as ReviewQuestionRow | undefined;
  if (!row) throw new HttpError(404, 'REVIEW_QUESTION_NOT_FOUND', '该复习轮次的位置没有题目。');
  const attempt = db.prepare('SELECT answer_json FROM review_attempts WHERE review_round_id = ? AND question_id = ?')
    .get(round.id, row.id) as { answer_json: string } | undefined;
  return {
    question: {
      id: row.id,
      bankId: row.bank_id,
      bankVersionId: row.bank_version_id,
      type: row.question_type,
      stem: row.stem,
      options: JSON.parse(row.options_json) as Record<string, string>,
      source: { sheet: row.source_sheet, row: row.source_row },
      masteryStatus: row.mastery_status,
      wrongCount: row.wrong_count,
      consecutiveCorrectRounds: row.consecutive_correct_rounds,
    },
    position,
    total: round.question_count,
    submitted: Boolean(attempt),
    userAnswer: attempt ? JSON.parse(attempt.answer_json) as string[] : null,
  };
}

export function createReviewRound(
  db: DatabaseSync,
  userId: string,
  input: { bankId: string; questionType: ReviewTypeFilter; strategy: ReviewStrategy; quantity: ReviewQuantity; masteryStatus: ReviewScope },
) {
  const bank = bankFor(db, input.bankId);
  const active = db.prepare(`SELECT id FROM review_rounds WHERE user_id = ? AND bank_id = ? AND status = 'in_progress' LIMIT 1`)
    .get(userId, input.bankId) as { id: string } | undefined;
  if (active) throw new HttpError(409, 'REVIEW_ROUND_IN_PROGRESS', '已有进行中的复习轮次，请先继续或退出。', { roundId: active.id });

  const filters = [
    'm.user_id = ?', 'm.bank_id = ?', 'm.bank_version_id = ?', 'q.bank_id = ?', 'q.bank_version_id = ?',
    input.masteryStatus === 'mastered' ? "m.mastery_status = 'mastered'" : "m.mastery_status IN ('review', 'reinforcing')",
  ];
  const args: Array<string | number> = [userId, input.bankId, bank.versionId, input.bankId, bank.versionId];
  if (input.questionType !== 'all') { filters.push('q.question_type = ?'); args.push(input.questionType); }
  const count = Number((db.prepare(`SELECT COUNT(*) AS count FROM mistake_states m JOIN questions q ON q.id = m.question_id
    WHERE ${filters.join(' AND ')}`).get(...args) as { count: number }).count);
  if (!count) throw new HttpError(409, 'NO_REVIEW_QUESTIONS', '当前题型和掌握状态下没有可复习的错题。', { availableCount: 0 });

  const ordering = input.strategy === 'weak'
    ? "CASE m.mastery_status WHEN 'review' THEN 0 ELSE 1 END, m.wrong_count DESC, random()"
    : 'random()';
  const rows = db.prepare(`SELECT q.id FROM mistake_states m JOIN questions q ON q.id = m.question_id
    WHERE ${filters.join(' AND ')} ORDER BY ${ordering}`).all(...args) as Array<{ id: string }>;
  const limit = input.quantity === 'all' ? rows.length : Number(input.quantity);
  const selected = rows.slice(0, limit);
  const id = randomUUID();
  const now = new Date().toISOString();
  inTransaction(db, () => {
    db.prepare(`INSERT INTO review_rounds(id, user_id, bank_id, bank_version_id, question_type_filter,
      strategy, quantity_selection, mastery_status_filter, available_count, question_count, current_position,
      submitted_count, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 'in_progress', ?, ?)`)
      .run(id, userId, input.bankId, bank.versionId, input.questionType, input.strategy, input.quantity,
        input.masteryStatus, count, selected.length, now, now);
    const addQuestion = db.prepare('INSERT INTO review_round_questions(review_round_id, position, question_id) VALUES (?, ?, ?)');
    selected.forEach((row, index) => addQuestion.run(id, index + 1, row.id));
  });
  const round = roundFor(db, userId, id);
  return { round: roundSummary(round), currentQuestion: questionAt(db, round, 1), availableCount: count };
}

export function getActiveReviewRound(db: DatabaseSync, userId: string, bankId: string) {
  const round = db.prepare(`SELECT * FROM review_rounds WHERE user_id = ? AND bank_id = ?
    AND status IN ('in_progress', 'exited') ORDER BY CASE status WHEN 'in_progress' THEN 0 ELSE 1 END, updated_at DESC LIMIT 1`)
    .get(userId, bankId) as ReviewRoundRow | undefined;
  if (!round) return { round: null, currentQuestion: null };
  return { round: roundSummary(round), currentQuestion: round.status === 'completed' ? null : questionAt(db, round, round.current_position) };
}

export function getReviewRound(db: DatabaseSync, userId: string, roundId: string) {
  const round = roundFor(db, userId, roundId);
  return {
    round: roundSummary(round),
    currentQuestion: round.status === 'completed' ? null : questionAt(db, round, round.current_position),
  };
}

export function getReviewQuestion(db: DatabaseSync, userId: string, roundId: string, position: number) {
  const round = roundFor(db, userId, roundId);
  if (!Number.isInteger(position) || position < 1 || position > round.question_count) {
    throw new HttpError(400, 'INVALID_REVIEW_POSITION', '题号超出本次复习范围。');
  }
  return questionAt(db, round, position);
}

export function moveReviewPosition(db: DatabaseSync, userId: string, roundId: string, position: number) {
  return inTransaction(db, () => {
    const round = roundFor(db, userId, roundId);
    if (round.status !== 'in_progress') throw new HttpError(409, 'REVIEW_ROUND_NOT_ACTIVE', '请先恢复进行中的复习轮次。');
    if (!Number.isInteger(position) || position < 1 || position > round.question_count) {
      throw new HttpError(400, 'INVALID_REVIEW_POSITION', '题号超出本次复习范围。');
    }
    const now = new Date().toISOString();
    db.prepare('UPDATE review_rounds SET current_position = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .run(position, now, roundId, userId);
    const updated = roundFor(db, userId, roundId);
    return { round: roundSummary(updated), currentQuestion: questionAt(db, updated, position) };
  });
}

export function resumeReviewRound(db: DatabaseSync, userId: string, roundId: string) {
  return inTransaction(db, () => {
    const round = roundFor(db, userId, roundId);
    if (round.status === 'completed') throw new HttpError(409, 'REVIEW_ROUND_COMPLETED', '本轮复习已经完成。');
    const other = db.prepare(`SELECT id FROM review_rounds WHERE user_id = ? AND bank_id = ? AND status = 'in_progress' AND id != ?`)
      .get(userId, round.bank_id, roundId) as { id: string } | undefined;
    if (other) throw new HttpError(409, 'REVIEW_ROUND_IN_PROGRESS', '已有另一轮复习正在进行。', { roundId: other.id });
    db.prepare(`UPDATE review_rounds SET status = 'in_progress', exited_at = NULL, updated_at = ? WHERE id = ? AND user_id = ?`)
      .run(new Date().toISOString(), roundId, userId);
    return getReviewRound(db, userId, roundId);
  });
}

export function exitReviewRound(db: DatabaseSync, userId: string, roundId: string) {
  return inTransaction(db, () => {
    const round = roundFor(db, userId, roundId);
    if (round.status !== 'completed') {
      const now = new Date().toISOString();
      db.prepare(`UPDATE review_rounds SET status = 'exited', exited_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
        .run(now, now, roundId, userId);
    }
    return { round: roundSummary(roundFor(db, userId, roundId)) };
  });
}

function normalizeAnswer(question: ReviewQuestionRow, input: unknown): string[] {
  if (!Array.isArray(input) || input.some(value => typeof value !== 'string')) {
    throw new HttpError(400, 'INVALID_ANSWER', '答案必须是选项字母数组。');
  }
  const answer = input as string[];
  const options = JSON.parse(question.options_json) as Record<string, string>;
  if (!answer.length || answer.some(letter => !/^[A-E]$/.test(letter) || !options[letter]) || new Set(answer).size !== answer.length) {
    throw new HttpError(400, 'INVALID_ANSWER', '答案必须是题目中的有效选项，且不能重复。');
  }
  if (question.question_type !== 'multiple' && answer.length !== 1) {
    throw new HttpError(400, 'INVALID_ANSWER', '该题型只能提交一个选项。');
  }
  return [...answer].sort();
}

function resultFor(round: ReviewRoundRow, question: ReviewQuestionRow, attempt: ReviewAttemptRow) {
  const answer = JSON.parse(question.answer_json) as string[];
  const options = JSON.parse(question.options_json) as Record<string, string>;
  return {
    attemptId: attempt.id,
    isCorrect: Boolean(attempt.is_correct),
    userAnswer: JSON.parse(attempt.answer_json) as string[],
    correctAnswer: answer,
    correctOptions: Object.fromEntries(answer.map(letter => [letter, options[letter]])),
    explanation: '原题库未提供解析',
    submittedAt: attempt.submitted_at,
    mastery: { status: attempt.mastery_status_after, consecutiveCorrectRounds: attempt.consecutive_correct_rounds_after },
    progress: { submittedCount: round.submitted_count, totalQuestions: round.question_count, currentPosition: round.current_position, status: round.status },
  };
}

function fullQuestionRow(db: DatabaseSync, round: ReviewRoundRow, questionId: string): ReviewQuestionRow {
  const row = db.prepare(`SELECT q.id, q.bank_id, q.bank_version_id, q.question_type, q.stem,
      q.options_json, q.answer_json, q.source_sheet, q.source_row, m.mastery_status, m.wrong_count,
      m.consecutive_correct_rounds, m.last_review_round_id
    FROM review_round_questions rq JOIN questions q ON q.id = rq.question_id
    JOIN mistake_states m ON m.user_id = ? AND m.question_id = q.id
    WHERE rq.review_round_id = ? AND q.id = ? AND q.bank_id = ? AND q.bank_version_id = ?`)
    .get(round.user_id, round.id, questionId, round.bank_id, round.bank_version_id) as ReviewQuestionRow | undefined;
  if (!row) throw new HttpError(404, 'REVIEW_QUESTION_NOT_FOUND', '该题目不属于此复习轮次。');
  return row;
}

export function submitReviewAnswer(db: DatabaseSync, userId: string, roundId: string, input: unknown) {
  return inTransaction(db, () => {
    const round = roundFor(db, userId, roundId);
    const link = db.prepare('SELECT question_id FROM review_round_questions WHERE review_round_id = ? AND position = ?')
      .get(round.id, round.current_position) as { question_id: string } | undefined;
    if (!link) throw new HttpError(404, 'REVIEW_QUESTION_NOT_FOUND', '该复习位置没有题目。');
    const question = fullQuestionRow(db, round, link.question_id);
    const answer = normalizeAnswer(question, input);
    const prior = db.prepare(`SELECT id, answer_json, is_correct, mastery_status_after, consecutive_correct_rounds_after,
      submitted_at FROM review_attempts WHERE review_round_id = ? AND question_id = ?`)
      .get(round.id, question.id) as ReviewAttemptRow | undefined;
    if (prior) {
      if (JSON.stringify(JSON.parse(prior.answer_json)) !== JSON.stringify(answer)) {
        throw new HttpError(409, 'REVIEW_ANSWER_ALREADY_SUBMITTED', '这道题在本轮已经提交，不能更改答案。');
      }
      return resultFor(round, question, prior);
    }
    if (round.status !== 'in_progress') throw new HttpError(409, 'REVIEW_ROUND_NOT_ACTIVE', '该复习轮次当前不能提交答案，请先恢复复习。');

    const correctAnswer = [...JSON.parse(question.answer_json) as string[]].sort();
    const isCorrect = JSON.stringify(answer) === JSON.stringify(correctAnswer);
    const now = new Date().toISOString();
    let masteryStatus: MasteryStatus;
    let consecutive: number;
    if (isCorrect && question.mastery_status !== 'mastered' && question.last_review_round_id !== round.id) {
      consecutive = question.mastery_status === 'review' ? 1 : Math.min(2, question.consecutive_correct_rounds + 1);
      masteryStatus = consecutive >= 2 ? 'mastered' : 'reinforcing';
      db.prepare(`UPDATE mistake_states SET mastery_status = ?, consecutive_correct_rounds = ?, last_review_round_id = ?, updated_at = ?
        WHERE user_id = ? AND question_id = ?`)
        .run(masteryStatus, consecutive, round.id, now, userId, question.id);
    } else if (isCorrect && question.mastery_status !== 'mastered') {
      masteryStatus = question.mastery_status;
      consecutive = question.consecutive_correct_rounds;
    } else if (isCorrect) {
      masteryStatus = 'mastered';
      consecutive = 2;
      db.prepare(`UPDATE mistake_states SET mastery_status = 'mastered', consecutive_correct_rounds = 2,
        last_review_round_id = ?, updated_at = ? WHERE user_id = ? AND question_id = ?`)
        .run(round.id, now, userId, question.id);
    } else {
      masteryStatus = 'review';
      consecutive = 0;
      db.prepare(`UPDATE mistake_states SET wrong_count = wrong_count + 1, mastery_status = 'review',
        consecutive_correct_rounds = 0, last_review_round_id = ?, updated_at = ? WHERE user_id = ? AND question_id = ?`)
        .run(round.id, now, userId, question.id);
    }

    const attemptId = randomUUID();
    db.prepare(`INSERT INTO review_attempts(id, review_round_id, question_id, answer_json, is_correct,
      mastery_status_after, consecutive_correct_rounds_after, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(attemptId, round.id, question.id, JSON.stringify(answer), Number(isCorrect), masteryStatus, consecutive, now);
    const submittedCount = Number((db.prepare('SELECT COUNT(*) AS count FROM review_attempts WHERE review_round_id = ?')
      .get(round.id) as { count: number }).count);
    const status = submittedCount >= round.question_count ? 'completed' : 'in_progress';
    db.prepare(`UPDATE review_rounds SET submitted_count = ?, status = ?,
      completed_at = ?, updated_at = ?, exited_at = NULL WHERE id = ? AND user_id = ?`)
      .run(submittedCount, status, status === 'completed' ? now : null, now, round.id, userId);
    const updatedRound = roundFor(db, userId, round.id);
    const updatedQuestion = fullQuestionRow(db, updatedRound, question.id);
    const saved: ReviewAttemptRow = {
      id: attemptId, answer_json: JSON.stringify(answer), is_correct: Number(isCorrect),
      mastery_status_after: masteryStatus, consecutive_correct_rounds_after: consecutive, submitted_at: now,
    };
    return resultFor(updatedRound, updatedQuestion, saved);
  });
}

export function getReviewResult(db: DatabaseSync, userId: string, roundId: string, position: number) {
  const round = roundFor(db, userId, roundId);
  if (!Number.isInteger(position) || position < 1 || position > round.question_count) {
    throw new HttpError(400, 'INVALID_REVIEW_POSITION', '题号超出本次复习范围。');
  }
  const link = db.prepare('SELECT question_id FROM review_round_questions WHERE review_round_id = ? AND position = ?')
    .get(round.id, position) as { question_id: string } | undefined;
  if (!link) throw new HttpError(404, 'REVIEW_QUESTION_NOT_FOUND', '该复习位置没有题目。');
  const question = fullQuestionRow(db, round, link.question_id);
  const attempt = db.prepare(`SELECT id, answer_json, is_correct, mastery_status_after, consecutive_correct_rounds_after,
    submitted_at FROM review_attempts WHERE review_round_id = ? AND question_id = ?`)
    .get(round.id, question.id) as ReviewAttemptRow | undefined;
  if (!attempt) throw new HttpError(409, 'REVIEW_ANSWER_REQUIRED', '该题尚未提交答案。');
  return { round: roundSummary(round), position, question: questionAt(db, round, position).question, result: resultFor(round, question, attempt) };
}

export function listReviewResults(db: DatabaseSync, userId: string, roundId: string) {
  const round = roundFor(db, userId, roundId);
  const rows = db.prepare(`SELECT rq.position, rq.question_id AS questionId, a.id, a.answer_json, a.is_correct,
      a.mastery_status_after, a.consecutive_correct_rounds_after, a.submitted_at
    FROM review_round_questions rq LEFT JOIN review_attempts a
      ON a.review_round_id = rq.review_round_id AND a.question_id = rq.question_id
    WHERE rq.review_round_id = ? ORDER BY rq.position`).all(round.id) as Array<{
      position: number; questionId: string; id: string | null; answer_json: string | null; is_correct: number | null;
      mastery_status_after: MasteryStatus | null; consecutive_correct_rounds_after: number | null; submitted_at: string | null;
    }>;
  return {
    round: roundSummary(round),
    items: rows.filter((row): row is typeof row & {
      id: string; answer_json: string; is_correct: number; mastery_status_after: MasteryStatus;
      consecutive_correct_rounds_after: number; submitted_at: string;
    } => row.id !== null && row.answer_json !== null && row.is_correct !== null && row.mastery_status_after !== null
      && row.consecutive_correct_rounds_after !== null && row.submitted_at !== null).map(row => {
      const question = fullQuestionRow(db, round, row.questionId);
      const attempt: ReviewAttemptRow = {
        id: row.id, answer_json: row.answer_json, is_correct: row.is_correct,
        mastery_status_after: row.mastery_status_after,
        consecutive_correct_rounds_after: row.consecutive_correct_rounds_after,
        submitted_at: row.submitted_at,
      };
      return {
        position: row.position,
        question: questionAt(db, round, row.position).question,
        result: resultFor(round, question, attempt),
      };
    }),
  };
}

export function listReviewHistory(db: DatabaseSync, userId: string, bankId: string) {
  const rows = db.prepare(`SELECT r.*, COUNT(a.id) AS answered_count, COALESCE(SUM(a.is_correct), 0) AS correct_count
    FROM review_rounds r LEFT JOIN review_attempts a ON a.review_round_id = r.id
    WHERE r.user_id = ? AND r.bank_id = ? GROUP BY r.id ORDER BY r.created_at DESC LIMIT 100`)
    .all(userId, bankId) as unknown as Array<ReviewRoundRow & { answered_count: number; correct_count: number }>;
  return { items: rows.map(row => ({ ...roundSummary(row), answeredCount: row.answered_count, correctCount: row.correct_count })) };
}

export function getMistakeStats(db: DatabaseSync, userId: string, bankId: string) {
  const bank = bankFor(db, bankId);
  const rows = db.prepare(`SELECT m.mastery_status AS status, q.question_type AS type, COUNT(*) AS count
    FROM mistake_states m JOIN questions q ON q.id = m.question_id
    WHERE m.user_id = ? AND m.bank_id = ? AND m.bank_version_id = ? AND q.bank_version_id = ?
    GROUP BY m.mastery_status, q.question_type`).all(userId, bankId, bank.versionId, bank.versionId) as Array<{ status: MasteryStatus; type: ReviewQuestionType; count: number }>;
  const count = (status: MasteryStatus) => rows.filter(row => row.status === status).reduce((sum, row) => sum + Number(row.count), 0);
  const byType = Object.fromEntries((['single', 'multiple', 'judgement'] as const).map(type => [type, {
    review: Number(rows.find(row => row.type === type && row.status === 'review')?.count ?? 0),
    reinforcing: Number(rows.find(row => row.type === type && row.status === 'reinforcing')?.count ?? 0),
    mastered: Number(rows.find(row => row.type === type && row.status === 'mastered')?.count ?? 0),
  }])) as Record<ReviewQuestionType, { review: number; reinforcing: number; mastered: number }>;
  return { bankId, bankVersionId: bank.versionId, review: count('review'), reinforcing: count('reinforcing'), mastered: count('mastered'), byType };
}

export function listMistakes(
  db: DatabaseSync,
  userId: string,
  input: { bankId: string; masteryStatus: MasteryStatus | 'pending' | 'all'; questionType: ReviewTypeFilter },
) {
  const bank = bankFor(db, input.bankId);
  const filters = ['m.user_id = ?', 'm.bank_id = ?', 'm.bank_version_id = ?', 'q.bank_version_id = ?'];
  const args: Array<string | number> = [userId, input.bankId, bank.versionId, bank.versionId];
  if (input.masteryStatus === 'pending') filters.push("m.mastery_status IN ('review', 'reinforcing')");
  else if (input.masteryStatus !== 'all') { filters.push('m.mastery_status = ?'); args.push(input.masteryStatus); }
  if (input.questionType !== 'all') { filters.push('q.question_type = ?'); args.push(input.questionType); }
  const items = db.prepare(`SELECT q.id AS questionId, q.question_type AS type, q.stem,
      m.mastery_status AS masteryStatus, m.consecutive_correct_rounds AS consecutiveCorrectRounds,
      m.wrong_count AS wrongCount, m.updated_at AS updatedAt
    FROM mistake_states m JOIN questions q ON q.id = m.question_id
    WHERE ${filters.join(' AND ')} ORDER BY CASE m.mastery_status WHEN 'review' THEN 0 WHEN 'reinforcing' THEN 1 ELSE 2 END,
      m.wrong_count DESC, q.source_row`).all(...args);
  return { items, count: items.length };
}
