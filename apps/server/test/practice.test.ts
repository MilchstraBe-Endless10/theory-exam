import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

let app: FastifyInstance;
let directory = '';
let origin = '';
let userToken = '';
let otherToken = '';
let bankId = '';
let firstVersionId = '';
let firstQuestionIds: string[] = [];
let adminToken = '';
let resumableSessionId = '';
let persistedWrongSessionId = '';

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

async function login(username: string) {
  const { response, payload } = await request('/api/auth/login', { method: 'POST', body: { username, password: 'test-password-1234!' } });
  assert.equal(response.status, 200);
  return payload.token as string;
}

async function createSession(mode: string, quantity?: number) {
  const { response, payload } = await request('/api/practice/sessions', { method: 'POST', token: userToken, body: { bankId, mode, ...(quantity ? { quantity } : {}) } });
  assert.equal(response.status, 201, JSON.stringify(payload));
  return payload as { session: { id: string; questionCount: number; currentPosition: number; status: string; bankVersionId: string }; currentQuestion: { id: string; type: string; options: Record<string, string> } };
}

test('P2 practice sessions, answer grading, favorites, progress, and ownership', async t => {
  directory = mkdtempSync(join(tmpdir(), 'theory-exam-p2-'));
  const config = loadConfig({ ...process.env, NODE_ENV: 'test', THEORY_DATABASE_PATH: join(directory, 'practice.sqlite'), THEORY_STATIC_DIR: join(directory, 'static') });
  app = await buildApp({ config, logger: false });
  origin = await app.listen({ host: '127.0.0.1', port: 0 });
  t.after(async () => { if (app) await app.close().catch(() => undefined); rmSync(directory, { recursive: true, force: true }); });

  const boot = await request('/api/admin/bootstrap', { method: 'POST', body: { username: 'admin', password: 'test-password-1234!' } });
  assert.equal(boot.response.status, 201);
  adminToken = boot.payload.token;
  for (const username of ['learner', 'another']) {
    assert.equal((await request('/api/admin/users', { method: 'POST', token: adminToken, body: { username, password: 'test-password-1234!' } })).response.status, 201);
  }
  userToken = await login('learner');
  otherToken = await login('another');

  bankId = randomUUID(); firstVersionId = randomUUID();
  const adminId = (app.db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: string }).id;
  const now = new Date().toISOString();
  app.db.prepare(`INSERT INTO question_banks(id, bank_key, name, created_at, updated_at, active_version_id) VALUES (?, 'demo_bank', '演示题库', ?, ?, NULL)`).run(bankId, now, now);
  app.db.prepare(`INSERT INTO bank_versions(id, bank_id, version_number, file_fingerprint, source_filename, sheet_name,
    question_count, type_counts_json, created_by, created_at) VALUES (?, ?, 1, 'fingerprint-v1', 'fixture.xlsx', '客观题', 5,
    '{"single":2,"multiple":1,"judgement":2}', ?, ?)`)
    .run(firstVersionId, bankId, adminId, now);
  app.db.prepare('UPDATE question_banks SET active_version_id = ? WHERE id = ?').run(firstVersionId, bankId);
  const fixtures = [
    ['single', '单选题一', { A: '甲', B: '乙', C: '丙' }, ['B']],
    ['single', '单选题二', { A: '甲', B: '乙' }, ['A']],
    ['multiple', '多选题', { A: '甲', B: '乙', C: '丙' }, ['A', 'C']],
    ['judgement', '判断题对错', { A: '对', B: '错' }, ['B']],
    ['judgement', '判断题正确错误', { A: '正确', B: '错误' }, ['A']],
  ] as const;
  const insert = app.db.prepare(`INSERT INTO questions(id, bank_id, bank_version_id, question_type, source_type_label,
    stem, normalized_stem, options_json, answer_json, raw_answer, source_filename, source_sheet, source_row, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'fixture.xlsx', '客观题', ?, ?)`);
  firstQuestionIds = fixtures.map(([type, stem, options, answer], index) => {
    const id = randomUUID();
    insert.run(id, bankId, firstVersionId, type, type, stem, stem, JSON.stringify(options), JSON.stringify(answer), answer.join(''), index + 2, now);
    return id;
  });

  await t.test('question reads omit answer fields, single grading is server-side and retries are idempotent', async () => {
    assert.equal((await request('/api/practice/sessions', { method: 'POST', body: { bankId, mode: 'single' } })).response.status, 401);
    const forged = await request('/api/practice/sessions', { method: 'POST', token: userToken, body: { bankId, mode: 'single', quantity: 1, user_id: 'other-user' } });
    assert.equal(forged.response.status, 201);
    const learnerId = (app.db.prepare("SELECT id FROM users WHERE username = 'learner'").get() as { id: string }).id;
    assert.equal((app.db.prepare('SELECT user_id AS userId FROM practice_sessions WHERE id = ?').get(forged.payload.session.id) as { userId: string }).userId, learnerId);
    assert.equal((await request('/api/practice/sessions', { method: 'POST', token: userToken, body: { bankId: randomUUID(), mode: 'single' } })).response.status, 404);
    const session = await createSession('single', 1);
    assert.equal(session.currentQuestion.type, 'single');
    assert.equal('answer_json' in session.currentQuestion, false);
    assert.equal('raw_answer' in session.currentQuestion, false);
    assert.equal('answer' in session.currentQuestion, false);
    const answer = JSON.parse((app.db.prepare('SELECT answer_json FROM questions WHERE id = ?').get(session.currentQuestion.id) as { answer_json: string }).answer_json) as string[];
    const invalid = await request(`/api/practice/sessions/${session.session.id}/submit`, { method: 'POST', token: userToken, body: { answer: ['Z'] } });
    assert.equal(invalid.response.status, 400);
    const submit = await request(`/api/practice/sessions/${session.session.id}/submit`, { method: 'POST', token: userToken, body: { answer } });
    assert.equal(submit.response.status, 200);
    assert.equal(submit.payload.result, undefined);
    assert.equal(submit.payload.isCorrect, true);
    assert.deepEqual(submit.payload.correctAnswer, answer);
    assert.equal(submit.payload.explanation, '原题库未提供解析');
    const retry = await request(`/api/practice/sessions/${session.session.id}/submit`, { method: 'POST', token: userToken, body: { answer } });
    assert.equal(retry.response.status, 200);
    assert.equal(retry.payload.attemptId, submit.payload.attemptId);
    assert.equal(Number((app.db.prepare('SELECT COUNT(*) AS n FROM practice_attempts WHERE practice_session_id = ?').get(session.session.id) as { n: number }).n), 1);
    const changed = await request(`/api/practice/sessions/${session.session.id}/submit`, { method: 'POST', token: userToken, body: { answer: [answer[0] === 'A' ? 'B' : 'A'] } });
    assert.equal(changed.response.status, 409);
  });

  await t.test('multi-select normalizes order and requires an exact set; both judgement label forms use answer letters', async () => {
    const multi = await createSession('multiple', 1);
    const correct = JSON.parse((app.db.prepare('SELECT answer_json FROM questions WHERE id = ?').get(multi.currentQuestion.id) as { answer_json: string }).answer_json) as string[];
    const rightOrder = await request(`/api/practice/sessions/${multi.session.id}/submit`, { method: 'POST', token: userToken, body: { answer: [...correct].reverse() } });
    assert.equal(rightOrder.response.status, 200);
    assert.equal(rightOrder.payload.isCorrect, true);

    for (const answer of [['A'], ['A', 'B', 'C']]) {
      const attempt = await createSession('multiple', 1);
      const wrong = await request(`/api/practice/sessions/${attempt.session.id}/submit`, { method: 'POST', token: userToken, body: { answer } });
      assert.equal(wrong.response.status, 200, `${JSON.stringify(answer)} ${JSON.stringify(wrong.payload)}`);
      assert.equal(wrong.payload.isCorrect, false);
    }
    const sameCount = await createSession('multiple', 1);
    const exact = JSON.parse((app.db.prepare('SELECT answer_json FROM questions WHERE id = ?').get(sameCount.currentQuestion.id) as { answer_json: string }).answer_json) as string[];
    const other = Object.keys(sameCount.currentQuestion.options).find(letter => !exact.includes(letter));
    assert.ok(other);
    const wrongChoice = [exact[0]!, other].sort();
    const sameCountWrong = await request(`/api/practice/sessions/${sameCount.session.id}/submit`, { method: 'POST', token: userToken, body: { answer: wrongChoice } });
    assert.equal(sameCountWrong.response.status, 200);
    assert.equal(sameCountWrong.payload.isCorrect, false);
    for (const qid of firstQuestionIds.slice(3)) {
      const created = await createSession('judgement', 2);
      const selected = await request(`/api/practice/sessions/${created.session.id}/position`, { method: 'POST', token: userToken, body: { position: qid === firstQuestionIds[3] ? 1 : 2 } });
      const question = selected.payload.currentQuestion.question;
      assert.equal(Object.values(question.options).some(text => typeof text === 'string' && ['对', '错', '正确', '错误'].includes(text)), true);
      const answer = JSON.parse((app.db.prepare('SELECT answer_json FROM questions WHERE id = ?').get(qid) as { answer_json: string }).answer_json) as string[];
      const result = await request(`/api/practice/sessions/${created.session.id}/submit`, { method: 'POST', token: userToken, body: { answer } });
      assert.equal(result.response.status, 200);
      assert.equal(result.payload.isCorrect, true);
    }
  });

  await t.test('wrong answers create review state; sessions resume, retain versions, and isolate accounts', async () => {
    const wrongSession = await createSession('single', 1);
    const wrong = await request(`/api/practice/sessions/${wrongSession.session.id}/submit`, { method: 'POST', token: userToken, body: { answer: ['A'] } });
    assert.equal(wrong.response.status, 200);
    assert.equal(wrong.payload.isCorrect, false);
    persistedWrongSessionId = wrongSession.session.id;
    assert.equal(Number((app.db.prepare('SELECT wrong_count AS n FROM mistake_states WHERE user_id = (SELECT id FROM users WHERE username = ?) AND question_id = ?').get('learner', wrongSession.currentQuestion.id) as { n: number }).n), 1);

    const session = await createSession('sequential', 5);
    const moved = await request(`/api/practice/sessions/${session.session.id}/position`, { method: 'POST', token: userToken, body: { position: 3 } });
    assert.equal(moved.payload.session.currentPosition, 3);
    const exited = await request(`/api/practice/sessions/${session.session.id}/exit`, { method: 'POST', token: userToken });
    assert.equal(exited.payload.session.status, 'exited');
    const active = await request(`/api/practice/sessions/active?bankId=${bankId}`, { token: userToken });
    assert.equal(active.payload.session.id, session.session.id);
    assert.equal(active.payload.session.currentPosition, 3);
    assert.equal(active.payload.currentQuestion.id, moved.payload.currentQuestion.question.id);
    assert.equal((await request(`/api/practice/sessions/${session.session.id}`, { token: otherToken })).response.status, 404);
    assert.equal((await request(`/api/practice/sessions/${session.session.id}/result?position=1`, { token: otherToken })).response.status, 404);

    const resumed = await request(`/api/practice/sessions/${session.session.id}/resume`, { method: 'POST', token: userToken });
    assert.equal(resumed.payload.session.bankVersionId, firstVersionId);
    assert.equal(resumed.payload.session.currentPosition, 3);
    assert.equal(resumed.payload.currentQuestion.question.id, moved.payload.currentQuestion.question.id);
    resumableSessionId = session.session.id;
  });

  await t.test('favorites are idempotent, unanswered selection and progress use real attempts', async () => {
    const questionId = firstQuestionIds[0]!;
    const noFavorites = await request('/api/practice/sessions', { method: 'POST', token: userToken, body: { bankId, mode: 'favorites' } });
    assert.equal(noFavorites.response.status, 409);
    assert.equal(noFavorites.payload.error.code, 'NO_PRACTICE_QUESTIONS');
    assert.equal((await request(`/api/favorites/${randomUUID()}`, { method: 'PUT', token: userToken, body: { bankId } })).response.status, 404);
    assert.equal((await request(`/api/favorites/${questionId}`, { method: 'PUT', token: userToken, body: { bankId: randomUUID() } })).response.status, 404);
    for (let i = 0; i < 2; i += 1) {
      const favorited = await request(`/api/favorites/${questionId}`, { method: 'PUT', token: userToken, body: { bankId } });
      assert.equal(favorited.response.status, 200);
      assert.equal(favorited.payload.favorite, true);
    }
    assert.equal(Number((app.db.prepare('SELECT COUNT(*) AS n FROM favorites WHERE question_id = ?').get(questionId) as { n: number }).n), 1);
    const favorites = await request(`/api/favorites?bankId=${bankId}`, { token: userToken });
    assert.equal(favorites.payload.count, 1);
    const removed = await request(`/api/favorites/${questionId}?bankId=${bankId}`, { method: 'DELETE', token: userToken });
    assert.equal(removed.response.status, 200);
    assert.equal((await request(`/api/favorites/${questionId}?bankId=${bankId}`, { method: 'DELETE', token: userToken })).response.status, 200);
    assert.equal((await request(`/api/favorites?bankId=${bankId}`, { token: otherToken })).payload.count, 0);

    const unanswered = await createSession('unanswered');
    const existingAttempts = new Set((app.db.prepare('SELECT DISTINCT question_id AS id FROM practice_attempts WHERE user_id = (SELECT id FROM users WHERE username = ?)').all('learner') as Array<{ id: string }>).map(row => row.id));
    const allIds = app.db.prepare('SELECT question_id AS id FROM practice_session_questions WHERE practice_session_id = ?').all(unanswered.session.id) as Array<{ id: string }>;
    assert.ok(allIds.length > 0);
    assert.ok(allIds.every(row => !existingAttempts.has(row.id)));

    const stats = await request(`/api/progress?bankId=${bankId}`, { token: userToken });
    assert.equal(stats.response.status, 200);
    assert.equal(stats.payload.bank.id, bankId);
    assert.ok(stats.payload.submissionCount > 0);
    assert.ok(stats.payload.touchedCount <= stats.payload.questionCount);
    assert.equal(stats.payload.byType.judgement.questionCount, 2);
    assert.equal(stats.payload.accuracyRate, Math.round(stats.payload.correctCount / stats.payload.submissionCount * 1000) / 10);
    assert.equal((await request(`/api/progress?bankId=${bankId}`, { token: otherToken })).payload.submissionCount, 0);
  });

  await t.test('random question snapshots do not repeat and persisted sessions survive restart', async () => {
    const random = await createSession('random');
    const ids = app.db.prepare('SELECT question_id AS id FROM practice_session_questions WHERE practice_session_id = ?').all(random.session.id) as Array<{ id: string }>;
    assert.equal(ids.length, 5);
    assert.equal(new Set(ids.map(row => row.id)).size, ids.length);
  });

  await t.test('failed attempt writes roll back; expired and disabled users cannot submit', async () => {
    const learnerSession = await createSession('single', 1);
    app.db.exec(`CREATE TRIGGER reject_practice_attempt BEFORE INSERT ON practice_attempts
      WHEN NEW.practice_session_id IS NOT NULL BEGIN SELECT RAISE(ABORT, 'forced practice rollback'); END`);
    const rolledBack = await request(`/api/practice/sessions/${learnerSession.session.id}/submit`, { method: 'POST', token: userToken, body: { answer: ['B'] } });
    assert.equal(rolledBack.response.status, 500);
    assert.equal(Number((app.db.prepare('SELECT COUNT(*) AS n FROM practice_attempts WHERE practice_session_id = ?').get(learnerSession.session.id) as { n: number }).n), 0);
    assert.equal(Number((app.db.prepare('SELECT submitted_count AS n FROM practice_sessions WHERE id = ?').get(learnerSession.session.id) as { n: number }).n), 0);
    app.db.exec('DROP TRIGGER reject_practice_attempt');
    assert.equal((await request(`/api/practice/sessions/${learnerSession.session.id}/submit`, { method: 'POST', token: userToken, body: { answer: ['B'] } })).response.status, 200);

    const otherSession = await request('/api/practice/sessions', { method: 'POST', token: otherToken, body: { bankId, mode: 'single', quantity: 1 } });
    assert.equal(otherSession.response.status, 201);
    const otherId = (await request('/api/auth/me', { token: otherToken })).payload.id as string;
    app.db.prepare('UPDATE sessions SET expires_at = ? WHERE user_id = ?').run(new Date(Date.now() - 1000).toISOString(), otherId);
    assert.equal((await request(`/api/practice/sessions/${otherSession.payload.session.id}/submit`, { method: 'POST', token: otherToken, body: { answer: ['A'] } })).response.status, 401);
    assert.equal((await request(`/api/admin/users/${otherId}`, { method: 'PATCH', token: adminToken, body: { disabled: true } })).response.status, 200);
    assert.equal((await request(`/api/practice/sessions/${otherSession.payload.session.id}/submit`, { method: 'POST', token: otherToken, body: { answer: ['A'] } })).response.status, 401);
  });

  await t.test('existing sessions remain bound to their historical bank version', async () => {
    const version2 = randomUUID();
    const newQuestionId = randomUUID();
    const now = new Date().toISOString();
    app.db.prepare(`INSERT INTO bank_versions(id, bank_id, version_number, file_fingerprint, source_filename, sheet_name,
      question_count, type_counts_json, created_by, created_at) VALUES (?, ?, 2, 'fingerprint-v2', 'revision.xlsx', '客观题', 1,
      '{"single":1,"multiple":0,"judgement":0}', (SELECT id FROM users WHERE role = 'admin' LIMIT 1), ?)`)
      .run(version2, bankId, now);
    app.db.prepare(`INSERT INTO questions(id, bank_id, bank_version_id, question_type, source_type_label, stem, normalized_stem,
      options_json, answer_json, raw_answer, source_filename, source_sheet, source_row, created_at)
      VALUES (?, ?, ?, 'single', '单选题', '新版本题目', '新版本题目', '{"A":"甲","B":"乙"}', '["A"]', 'A', 'revision.xlsx', '客观题', 2, ?)`)
      .run(newQuestionId, bankId, version2, now);
    app.db.prepare('UPDATE question_banks SET active_version_id = ? WHERE id = ?').run(version2, bankId);
    const resumed = await request(`/api/practice/sessions/${resumableSessionId}/resume`, { method: 'POST', token: userToken });
    assert.equal(resumed.payload.session.bankVersionId, firstVersionId);
    assert.equal(resumed.payload.currentQuestion.question.bankVersionId, firstVersionId);
    const newSession = await createSession('sequential', 1);
    assert.equal(newSession.session.bankVersionId, version2);
    assert.equal(newSession.currentQuestion.id, newQuestionId);
  });

  await t.test('database restart preserves the session and user data', async () => {
    const live = await createSession('sequential', 1);
    await app.close();
    app = await buildApp({ config: loadConfig({ ...process.env, NODE_ENV: 'test', THEORY_DATABASE_PATH: join(directory, 'practice.sqlite'), THEORY_STATIC_DIR: join(directory, 'static') }), logger: false });
    origin = await app.listen({ host: '127.0.0.1', port: 0 });
    const restored = await request(`/api/practice/sessions/${live.session.id}`, { token: userToken });
    assert.equal(restored.response.status, 200);
    assert.equal(restored.payload.session.id, live.session.id);
    assert.equal(restored.payload.currentQuestion.question.id, live.currentQuestion.id);
    assert.equal((await request('/api/auth/me', { token: userToken })).response.status, 200);
    const savedResult = await request(`/api/practice/sessions/${persistedWrongSessionId}/result?position=1`, { token: userToken });
    assert.equal(savedResult.response.status, 200);
    assert.equal(savedResult.payload.result.isCorrect, false);
  });
});
