import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';
import ExcelJS from 'exceljs';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openMigratedDatabase } from '../src/db/database.js';
import { migrations } from '../src/db/migrations.js';
import { hashPassword } from '../src/security.js';
import { confirmImport, previewImport } from '../src/services/import-service.js';

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'theory-exam-p4-review-'));
const databasePath = join(temporaryDirectory, 'review.test.sqlite');
const workbookPath = fileURLToPath(new URL('../../../local-input/四级理论试题.xlsx', import.meta.url));
const usernames = ['review-owner', 'review-peer', 'review-test-account', 'review-fourth'];
const fixturePassword = `review-fixture-${randomBytes(12).toString('hex')}!`;
let app: FastifyInstance;
let origin = '';
let bankId = '';
let bankVersionId = '';
let tokens = new Map<string, string>();
let databaseDir = '';

async function request(path: string, options: { method?: string; token?: string; body?: unknown } = {}) {
  const headers = new Headers();
  if (options.token) headers.set('authorization', `Bearer ${options.token}`);
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  const response = await fetch(`${origin}${path}`, {
    method: options.method ?? 'GET', headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { response, payload: response.status === 204 ? {} : await response.json() as Record<string, any> };
}

function questionById(id: string) {
  return app.db.prepare(`SELECT id, bank_id, bank_version_id, question_type, stem, options_json, answer_json,
    source_sheet, source_row FROM questions WHERE id = ?`).get(id) as {
    id: string; bank_id: string; bank_version_id: string; question_type: 'single' | 'multiple' | 'judgement';
    stem: string; options_json: string; answer_json: string; source_sheet: string; source_row: number;
  };
}

function firstQuestion(type: 'single' | 'multiple' | 'judgement', offset = 0) {
  const row = app.db.prepare(`SELECT id FROM questions WHERE bank_id = ? AND bank_version_id = ? AND question_type = ?
    ORDER BY source_row LIMIT 1 OFFSET ?`).get(bankId, bankVersionId, type, offset) as { id: string } | undefined;
  assert.ok(row, `real Excel question exists for ${type} at offset ${offset}`);
  return questionById(row.id);
}

function wrongAnswer(question: ReturnType<typeof questionById>): string[] {
  const correct = JSON.parse(question.answer_json) as string[];
  const options = JSON.parse(question.options_json) as Record<string, string>;
  if (question.question_type !== 'multiple') return [Object.keys(options).find(letter => !correct.includes(letter))!];
  if (correct.length > 1) return correct.slice(0, -1);
  return [correct[0]!, Object.keys(options).find(letter => !correct.includes(letter))!].sort();
}

async function login(username: string): Promise<string> {
  const { response, payload } = await request('/api/auth/login', { method: 'POST', body: { username, password: fixturePassword } });
  assert.equal(response.status, 200, JSON.stringify(payload));
  return payload.token as string;
}

async function createReview(token: string, options: {
  questionType?: 'all' | 'single' | 'multiple' | 'judgement';
  strategy?: 'random' | 'weak';
  quantity?: '10' | '20' | 'all';
  masteryStatus?: 'pending' | 'mastered';
} = {}) {
  return request('/api/reviews', { method: 'POST', token, body: {
    bankId, questionType: options.questionType ?? 'all', strategy: options.strategy ?? 'random',
    quantity: options.quantity ?? 'all', masteryStatus: options.masteryStatus ?? 'pending',
  } });
}

function insertMistakes(username: string, questions: Array<{ id: string; status?: 'review' | 'reinforcing' | 'mastered'; wrongCount?: number }>) {
  const userId = (app.db.prepare('SELECT id FROM users WHERE username = ?').get(username) as { id: string }).id;
  const insert = app.db.prepare(`INSERT INTO mistake_states(user_id, bank_id, bank_version_id, question_id, wrong_count,
    consecutive_correct_rounds, mastery_status, last_review_round_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`);
  const now = new Date().toISOString();
  for (const item of questions) {
    const q = questionById(item.id);
    const status = item.status ?? 'review';
    insert.run(userId, bankId, bankVersionId, q.id, item.wrongCount ?? 1, status === 'reinforcing' ? 1 : status === 'mastered' ? 2 : 0, status, now);
  }
}

async function initialize() {
  const config = loadConfig({ ...process.env, NODE_ENV: 'test', THEORY_DATABASE_PATH: databasePath, THEORY_STATIC_DIR: join(temporaryDirectory, 'static') });
  app = await buildApp({ config, logger: false });
  origin = await app.listen({ host: '127.0.0.1', port: 0 });

  const bootstrap = await request('/api/admin/bootstrap', { method: 'POST', body: { username: 'review-admin', password: fixturePassword } });
  assert.equal(bootstrap.response.status, 201);
  const now = new Date().toISOString();
  const adminId = bootstrap.payload.user.id as string;
  for (const [index, username] of usernames.entries()) {
    app.db.prepare(`INSERT INTO users(id, username, password_hash, role, disabled, created_at, updated_at, must_change_password, is_test_account)
      VALUES (?, ?, ?, 'user', 0, ?, ?, 0, ?)`)
      .run(randomUUID(), username, await hashPassword(fixturePassword), now, now, Number(index === 2));
  }
  tokens = new Map(await Promise.all(usernames.map(async username => [username, await login(username)] as const)));

  const buffer = readFileSync(workbookPath);
  const preview = await previewImport(app.db, { buffer, filename: '四级理论试题.xlsx', bankKey: 'p4-level4', bankName: 'P4 隔离题库', sheetName: '客观题', userId: adminId });
  assert.equal(preview.canConfirm, true);
  assert.equal(preview.questionCount, 1283);
  assert.deepEqual(preview.typeCounts, { single: 845, multiple: 38, judgement: 400 });
  const imported = confirmImport(app.db, preview.id, {
    singleCount: 120, singlePoints: 0.5, multipleCount: 20, multiplePoints: 1,
    judgementCount: 40, judgementPoints: 0.5, durationMinutes: 90, passingScore: 60,
  });
  bankId = imported.bankId;
  bankVersionId = (app.db.prepare('SELECT active_version_id AS id FROM question_banks WHERE id = ?').get(bankId) as { id: string }).id;
  databaseDir = temporaryDirectory;
}

test('P4 review rounds, mastery states, filters, ownership, recovery, and version history', async t => {
  await initialize();
  t.after(async () => {
    await app?.close().catch(() => undefined);
    rmSync(databaseDir || temporaryDirectory, { recursive: true, force: true });
  });

  await t.test('V5 is an additive migration; four fixture accounts remain ordinary and isolated', async () => {
    assert.equal(migrations.at(-1)?.version, 5);
    assert.equal(Number((app.db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as { version: number }).version), 5);
    assert.equal(Number((app.db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='user'").get() as { count: number }).count), 4);
    assert.equal(Number((app.db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='user' AND is_test_account=1").get() as { count: number }).count), 1);
    const ordinaryAdminAttempt = await request('/api/admin/users', { token: tokens.get('review-test-account')! });
    assert.equal(ordinaryAdminAttempt.response.status, 403);
  });

  let primaryQuestionId = '';
  let masteryRoundId = '';
  await t.test('ordinary wrongs activate review; mastery advances only in distinct formal rounds and retries are idempotent', async () => {
    const learner = tokens.get('review-owner')!;
    const question = firstQuestion('single');
    primaryQuestionId = question.id;
    const questionResponse = await request('/api/practice/sessions', { method: 'POST', token: learner, body: { bankId, mode: 'single', quantity: 1 } });
    assert.equal(questionResponse.response.status, 201);
    const practiceId = questionResponse.payload.session.id as string;
    const safePayload = JSON.stringify(questionResponse.payload);
    assert.equal(safePayload.includes('answer_json'), false);
    assert.equal(safePayload.includes('correctAnswer'), false);
    const submittedWrong = await request(`/api/practice/sessions/${practiceId}/submit`, { method: 'POST', token: learner, body: { answer: wrongAnswer(question) } });
    assert.equal(submittedWrong.response.status, 200);
    let state = app.db.prepare('SELECT wrong_count, mastery_status, consecutive_correct_rounds FROM mistake_states WHERE question_id = ?').get(question.id) as Record<string, number | string | null>;
    assert.deepEqual({ ...state }, { wrong_count: 1, mastery_status: 'review', consecutive_correct_rounds: 0 });

    const ordinaryCorrectSession = await request('/api/practice/sessions', { method: 'POST', token: learner, body: { bankId, mode: 'single', quantity: 1 } });
    const ordinaryCorrect = await request(`/api/practice/sessions/${ordinaryCorrectSession.payload.session.id}/submit`, {
      method: 'POST', token: learner, body: { answer: JSON.parse(question.answer_json) },
    });
    assert.equal(ordinaryCorrect.payload.isCorrect, true);
    state = app.db.prepare('SELECT wrong_count, mastery_status, consecutive_correct_rounds FROM mistake_states WHERE question_id = ?').get(question.id) as Record<string, number | string | null>;
    assert.deepEqual({ ...state }, { wrong_count: 1, mastery_status: 'review', consecutive_correct_rounds: 0 });

    const first = await createReview(learner, { questionType: 'single', quantity: '10' });
    assert.equal(first.response.status, 201, JSON.stringify(first.payload));
    assert.equal(first.payload.availableCount, 1);
    assert.equal(first.payload.round.questionCount, 1);
    assert.equal(first.payload.round.reducedToAvailable, true);
    masteryRoundId = first.payload.round.id as string;
    const readBeforeSubmit = await request(`/api/reviews/${masteryRoundId}/question?position=1`, { token: learner });
    assert.equal(readBeforeSubmit.response.status, 200);
    const safe = JSON.stringify(readBeforeSubmit.payload);
    assert.equal(safe.includes('answer_json'), false);
    assert.equal(safe.includes('raw_answer'), false);
    assert.equal(safe.includes('correctAnswer'), false);

    const firstCorrect = await request(`/api/reviews/${masteryRoundId}/submit`, { method: 'POST', token: learner, body: { answer: JSON.parse(question.answer_json) } });
    assert.equal(firstCorrect.payload.isCorrect, true);
    assert.deepEqual(firstCorrect.payload.mastery, { status: 'reinforcing', consecutiveCorrectRounds: 1 });
    const retry = await request(`/api/reviews/${masteryRoundId}/submit`, { method: 'POST', token: learner, body: { answer: JSON.parse(question.answer_json) } });
    assert.equal(retry.payload.attemptId, firstCorrect.payload.attemptId);
    const changed = await request(`/api/reviews/${masteryRoundId}/submit`, { method: 'POST', token: learner, body: { answer: wrongAnswer(question) } });
    assert.equal(changed.response.status, 409);
    state = app.db.prepare('SELECT wrong_count, mastery_status, consecutive_correct_rounds FROM mistake_states WHERE question_id = ?').get(question.id) as Record<string, number | string | null>;
    assert.deepEqual({ ...state }, { wrong_count: 1, mastery_status: 'reinforcing', consecutive_correct_rounds: 1 });

    const second = await createReview(learner, { questionType: 'single', quantity: '20', strategy: 'weak' });
    assert.equal(second.payload.round.questionCount, 1);
    const secondCorrect = await request(`/api/reviews/${second.payload.round.id}/submit`, { method: 'POST', token: learner, body: { answer: JSON.parse(question.answer_json) } });
    assert.deepEqual(secondCorrect.payload.mastery, { status: 'mastered', consecutiveCorrectRounds: 2 });

    const mastered = await createReview(learner, { questionType: 'single', quantity: 'all', masteryStatus: 'mastered' });
    assert.equal(mastered.payload.round.questionCount, 1);
    const masteredWrong = await request(`/api/reviews/${mastered.payload.round.id}/submit`, { method: 'POST', token: learner, body: { answer: wrongAnswer(question) } });
    assert.deepEqual(masteredWrong.payload.mastery, { status: 'review', consecutiveCorrectRounds: 0 });
    const wrongRetry = await request(`/api/reviews/${mastered.payload.round.id}/submit`, { method: 'POST', token: learner, body: { answer: wrongAnswer(question) } });
    assert.equal(wrongRetry.payload.attemptId, masteredWrong.payload.attemptId);
    state = app.db.prepare('SELECT wrong_count, mastery_status, consecutive_correct_rounds FROM mistake_states WHERE question_id = ?').get(question.id) as Record<string, number | string | null>;
    assert.deepEqual({ ...state }, { wrong_count: 2, mastery_status: 'review', consecutive_correct_rounds: 0 });

    const afterMasteredPractice = await request('/api/practice/sessions', { method: 'POST', token: learner, body: { bankId, mode: 'single', quantity: 1 } });
    const ordinaryWrong = await request(`/api/practice/sessions/${afterMasteredPractice.payload.session.id}/submit`, { method: 'POST', token: learner, body: { answer: wrongAnswer(question) } });
    assert.equal(ordinaryWrong.payload.isCorrect, false);
    state = app.db.prepare('SELECT wrong_count, mastery_status, consecutive_correct_rounds, last_review_round_id FROM mistake_states WHERE question_id = ?').get(question.id) as Record<string, number | string | null>;
    assert.deepEqual({ ...state }, { wrong_count: 3, mastery_status: 'review', consecutive_correct_rounds: 0, last_review_round_id: null });
  });

  await t.test('answer sets are normalized, multi-select is exact, and one round cannot count twice', async () => {
    const token = tokens.get('review-peer')!;
    const question = firstQuestion('multiple');
    insertMistakes('review-peer', [{ id: question.id }]);
    const first = await createReview(token, { questionType: 'multiple', quantity: '10' });
    assert.equal(first.payload.round.questionCount, 1);
    const correct = JSON.parse(question.answer_json) as string[];
    const shuffled = [...correct].reverse();
    const incomplete = await request(`/api/reviews/${first.payload.round.id}/submit`, { method: 'POST', token, body: { answer: wrongAnswer(question) } });
    assert.equal(incomplete.payload.isCorrect, false);
    assert.deepEqual(incomplete.payload.mastery, { status: 'review', consecutiveCorrectRounds: 0 });
    const wrongRetry = await request(`/api/reviews/${first.payload.round.id}/submit`, { method: 'POST', token, body: { answer: wrongAnswer(question) } });
    assert.equal(wrongRetry.payload.attemptId, incomplete.payload.attemptId);
    const second = await createReview(token, { questionType: 'multiple', quantity: '10' });
    const submitted = await request(`/api/reviews/${second.payload.round.id}/submit`, { method: 'POST', token, body: { answer: shuffled } });
    assert.equal(submitted.payload.isCorrect, true);
    assert.deepEqual(submitted.payload.mastery, { status: 'reinforcing', consecutiveCorrectRounds: 1 });
    const repeated = await request(`/api/reviews/${second.payload.round.id}/submit`, { method: 'POST', token, body: { answer: correct } });
    assert.equal(repeated.response.status, 200);
    assert.equal(repeated.payload.attemptId, submitted.payload.attemptId);
    const state = app.db.prepare('SELECT consecutive_correct_rounds FROM mistake_states WHERE user_id = (SELECT id FROM users WHERE username = ?) AND question_id = ?')
      .get('review-peer', question.id) as { consecutive_correct_rounds: number };
    assert.equal(state.consecutive_correct_rounds, 1);
  });

  await t.test('thin and exact answer validation applies across review types', async () => {
    const token = tokens.get('review-fourth')!;
    const question = firstQuestion('single', 1);
    insertMistakes('review-fourth', [{ id: question.id }]);
    const round = await createReview(token, { questionType: 'single' });
    const fewer = await request(`/api/reviews/${round.payload.round.id}/submit`, { method: 'POST', token, body: { answer: [] } });
    assert.equal(fewer.response.status, 400);
    const multiple = await request(`/api/reviews/${round.payload.round.id}/submit`, { method: 'POST', token, body: { answer: ['A', 'B'] } });
    assert.equal(multiple.response.status, 400);
  });

  await t.test('weak ordering prioritizes review status, then higher wrong count; filters and quantities match real rows', async () => {
    const token = tokens.get('review-test-account')!;
    const singles = Array.from({ length: 22 }, (_, index) => ({ id: firstQuestion('single', index).id, status: (index === 2 ? 'reinforcing' : 'review') as 'review' | 'reinforcing', wrongCount: index === 1 ? 5 : index === 2 ? 99 : 1 }));
    const multiples = [firstQuestion('multiple', 1), firstQuestion('multiple', 2)].map(row => ({ id: row.id, status: 'review' as const, wrongCount: 2 }));
    const judgement = [{ id: firstQuestion('judgement').id, status: 'review' as const, wrongCount: 1 }];
    insertMistakes('review-test-account', [...singles, ...multiples, ...judgement]);
    const stats = await request(`/api/mistakes/stats?bankId=${bankId}`, { token });
    assert.equal(stats.response.status, 200);
    assert.equal(stats.payload.review + stats.payload.reinforcing + stats.payload.mastered, 25, JSON.stringify(stats.payload));

    for (const [quantity, expected] of [['10', 10], ['20', 20], ['all', 22]] as const) {
      const round = await createReview(token, { questionType: 'single', strategy: 'weak', quantity });
      assert.equal(round.response.status, 201);
      assert.equal(round.payload.availableCount, 22);
      assert.equal(round.payload.round.questionCount, expected);
      const order = app.db.prepare('SELECT question_id FROM review_round_questions WHERE review_round_id = ? ORDER BY position')
        .all(round.payload.round.id) as Array<{ question_id: string }>;
      assert.equal(new Set(order.map(row => row.question_id)).size, order.length);
      if (quantity === 'all') {
        assert.equal(order[0]?.question_id, singles[1]!.id);
        assert.notEqual(order[1]?.question_id, singles[2]!.id);
        assert.equal(order.at(-1)?.question_id, singles[2]!.id);
      }
      await request(`/api/reviews/${round.payload.round.id}/exit`, { method: 'POST', token, body: {} });
    }

    const multipleRound = await createReview(token, { questionType: 'multiple', quantity: 'all' });
    const listed = await request(`/api/reviews/${multipleRound.payload.round.id}`, { token });
    assert.equal(listed.payload.round.questionCount, 2);
    const typedItems = await request(`/api/mistakes?bankId=${bankId}&questionType=multiple&masteryStatus=pending`, { token });
    assert.equal(typedItems.payload.items.length, 2);
    assert.ok(typedItems.payload.items.every((item: { type: string }) => item.type === 'multiple'));
  });

  await t.test('empty filters are real empty states; four accounts cannot read each other’s rounds or mistakes', async () => {
    const owner = tokens.get('review-owner')!;
    const newEmptyAccount = tokens.get('review-peer')!;
    const empty = await createReview(newEmptyAccount, { questionType: 'judgement', quantity: '10' });
    assert.equal(empty.response.status, 409);
    assert.equal(empty.payload.error.code, 'NO_REVIEW_QUESTIONS');

    const peer = tokens.get('review-peer')!;
    const foreign = await request(`/api/reviews/${masteryRoundId}`, { token: peer });
    assert.equal(foreign.response.status, 404);
    const otherStats = await request(`/api/mistakes/stats?bankId=${bankId}`, { token: peer });
    assert.equal(otherStats.payload.review, 0);
    assert.equal(otherStats.payload.reinforcing, 1);
    assert.equal(otherStats.payload.mastered, 0);
    const ownerHistory = await request(`/api/reviews/history?bankId=${bankId}`, { token: owner });
    assert.ok(ownerHistory.payload.items.length >= 3);
  });

  await t.test('history results are available only to the owner after formal submissions', async () => {
    const owner = tokens.get('review-owner')!;
    const peer = tokens.get('review-peer')!;
    const own = await request(`/api/reviews/${masteryRoundId}/results`, { token: owner });
    assert.equal(own.response.status, 200);
    assert.equal(own.payload.items.length, 1);
    assert.deepEqual(own.payload.items[0].result.correctAnswer, JSON.parse(questionById(primaryQuestionId).answer_json));
    const denied = await request(`/api/reviews/${masteryRoundId}/results`, { token: peer });
    assert.equal(denied.response.status, 404);
  });

  let recoveryRoundId = '';
  await t.test('exited rounds survive restart and resume at the same unanswered position', async () => {
    const token = tokens.get('review-peer')!;
    const questions = [firstQuestion('single', 3), firstQuestion('single', 4)];
    insertMistakes('review-peer', questions.map(row => ({ id: row.id })));
    const round = await createReview(token, { questionType: 'single', quantity: 'all' });
    recoveryRoundId = round.payload.round.id as string;
    const firstQuestionRow = questionById(round.payload.currentQuestion.question.id as string);
    const firstAnswer = await request(`/api/reviews/${recoveryRoundId}/submit`, { method: 'POST', token, body: { answer: wrongAnswer(firstQuestionRow) } });
    assert.equal(firstAnswer.response.status, 200);
    const moved = await request(`/api/reviews/${recoveryRoundId}/position`, { method: 'POST', token, body: { position: 2 } });
    assert.equal(moved.response.status, 200);
    const position = 2;
    await request(`/api/reviews/${recoveryRoundId}/exit`, { method: 'POST', token, body: {} });
    await app.close();
    const config = loadConfig({ ...process.env, NODE_ENV: 'test', THEORY_DATABASE_PATH: databasePath, THEORY_STATIC_DIR: join(temporaryDirectory, 'static') });
    app = await buildApp({ config, logger: false });
    origin = await app.listen({ host: '127.0.0.1', port: 0 });
    const active = await request(`/api/reviews/active?bankId=${bankId}`, { token });
    assert.equal(active.payload.round.status, 'exited');
    const resumed = await request(`/api/reviews/${recoveryRoundId}/resume`, { method: 'POST', token, body: {} });
    assert.equal(resumed.response.status, 200);
    assert.equal(resumed.payload.round.submittedCount, 1);
    assert.equal(resumed.payload.currentQuestion.position, position);
  });

  await t.test('history remains readable against its original question version after an Excel revision', async () => {
    const token = tokens.get('review-owner')!;
    const question = firstQuestion('judgement', 1);
    insertMistakes('review-owner', [{ id: question.id }]);
    const round = await createReview(token, { questionType: 'judgement', quantity: 'all' });
    const wrong = await request(`/api/reviews/${round.payload.round.id}/submit`, { method: 'POST', token, body: { answer: wrongAnswer(question) } });
    assert.equal(wrong.response.status, 200);
    const originalVersionId = round.payload.round.bankVersionId as string;

    const book = new ExcelJS.Workbook();
    const source = readFileSync(workbookPath);
    await book.xlsx.load(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer);
    const sheet = book.getWorksheet('客观题')!;
    sheet.getCell(2, 2).value = `${String(sheet.getCell(2, 2).value)}（版本测试）`;
    const revisedBuffer = Buffer.from(await book.xlsx.writeBuffer());
    const adminId = (app.db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get() as { id: string }).id;
    const preview = await previewImport(app.db, { buffer: revisedBuffer, filename: '四级理论试题-revision.xlsx', bankKey: 'p4-level4', bankName: 'P4 隔离题库', sheetName: '客观题', userId: adminId });
    assert.equal(preview.canConfirm, true);
    const imported = confirmImport(app.db, preview.id, {
      singleCount: 120, singlePoints: 0.5, multipleCount: 20, multiplePoints: 1,
      judgementCount: 40, judgementPoints: 0.5, durationMinutes: 90, passingScore: 60,
    });
    const updatedVersionId = (app.db.prepare('SELECT active_version_id AS id FROM question_banks WHERE id = ?').get(bankId) as { id: string }).id;
    assert.notEqual(imported.duplicate, true);
    assert.notEqual(updatedVersionId, originalVersionId);
    const historyResult = await request(`/api/reviews/${round.payload.round.id}/result?position=1`, { token });
    assert.equal(historyResult.response.status, 200);
    assert.equal(historyResult.payload.round.bankVersionId, originalVersionId);
    assert.equal(historyResult.payload.question.bankVersionId, originalVersionId);
    assert.equal(historyResult.payload.result.isCorrect, false);
  });
});
