import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { confirmImport, previewImport } from '../src/services/import-service.js';

const workbookPath = fileURLToPath(new URL('../../../local-input/四级理论试题.xlsx', import.meta.url));

test('P3 server-backed exams: real bank import, fixed snapshot, sync, scoring, expiry, recovery, and ownership', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'theory-exam-p3-'));
  const config = loadConfig({ ...process.env, NODE_ENV: 'test', THEORY_DATABASE_PATH: join(directory, 'exam.sqlite'), THEORY_STATIC_DIR: join(directory, 'static') });
  let now = new Date('2026-10-19T00:00:00.000Z');
  let app: FastifyInstance = await buildApp({ config, logger: false, now: () => new Date(now) });
  let origin = await app.listen({ host: '127.0.0.1', port: 0 });
  let adminToken = '';
  let completedExamId = '';
  const tokens = new Map<string, string>();
  const passwords = new Map<string, string>();
  const request = async (path: string, options: { method?: string; token?: string; body?: unknown } = {}) => {
    const headers = new Headers();
    if (options.token) headers.set('authorization', `Bearer ${options.token}`);
    if (options.body !== undefined) headers.set('content-type', 'application/json');
    const response = await fetch(`${origin}${path}`, { method: options.method ?? 'GET', headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body) });
    return { response, payload: response.status === 204 ? {} : await response.json() as Record<string, any> };
  };
  const login = async (username: string) => {
    const password = passwords.get(username) ?? 'initial-test-password-1234!';
    const response = await request('/api/auth/login', { method: 'POST', body: { username, password } });
    assert.equal(response.response.status, 200, JSON.stringify(response.payload));
    if (response.payload.user.mustChangePassword) {
      const gated = await request('/api/exams/active', { token: response.payload.token });
      assert.equal(gated.response.status, 403);
      assert.equal(gated.payload.error.code, 'PASSWORD_CHANGE_REQUIRED');
      const changedPassword = `changed-${username}-test-password-2026!`;
      const changed = await request('/api/auth/password', { method: 'POST', token: response.payload.token,
        body: { currentPassword: password, newPassword: changedPassword } });
      assert.equal(changed.response.status, 200);
      passwords.set(username, changedPassword);
      tokens.set(username, changed.payload.token);
    } else tokens.set(username, response.payload.token);
    return tokens.get(username)!;
  };
  const boot = await request('/api/admin/bootstrap', { method: 'POST', body: { username: 'exam-admin', password: 'admin-test-password-1234!' } });
  assert.equal(boot.response.status, 201);
  adminToken = boot.payload.token;
  for (const username of ['learner', 'peer', 'restart-user']) {
    const created = await request('/api/admin/users', { method: 'POST', token: adminToken,
      body: { username, password: 'initial-test-password-1234!' } });
    assert.equal(created.response.status, 201);
  }
  const learnerToken = await login('learner');
  const learnerSecondDeviceToken = await login('learner');
  const peerToken = await login('peer');
  const restartToken = await login('restart-user');
  const adminId = (app.db.prepare("SELECT id FROM users WHERE username = 'exam-admin'").get() as { id: string }).id;
  const buffer = readFileSync(workbookPath);
  const preview = await previewImport(app.db, { buffer, filename: '四级理论试题.xlsx', bankKey: 'level4', bankName: '四级理论题库', sheetName: '客观题', userId: adminId });
  assert.equal(preview.canConfirm, true);
  const imported = confirmImport(app.db, preview.id, {
    singleCount: 120, singlePoints: 0.5, multipleCount: 20, multiplePoints: 1,
    judgementCount: 40, judgementPoints: 0.5, durationMinutes: 90, passingScore: 60,
  });
  assert.equal(imported.questionCount, 1283);
  assert.deepEqual(imported.typeCounts, { single: 845, multiple: 38, judgement: 400 });
  const bankId = imported.bankId;

  t.after(async () => {
    await app.close().catch(() => undefined);
    rmSync(directory, { recursive: true, force: true });
  });

  await t.test('server forms the unique 180-question versioned snapshot and hides the key', async () => {
    const started = await request('/api/exams', { method: 'POST', token: learnerToken, body: { bankId } });
    assert.equal(started.response.status, 201, JSON.stringify(started.payload));
    const examId = started.payload.session.id as string;
    assert.equal(started.payload.session.totalQuestions, 180);
    const orderedTypes = started.payload.questions.map((question: any) => question.type);
    assert.ok(orderedTypes.slice(0, 120).every((type: string) => type === 'single'));
    assert.ok(orderedTypes.slice(120, 140).every((type: string) => type === 'multiple'));
    assert.ok(orderedTypes.slice(140).every((type: string) => type === 'judgement'));
    assert.deepEqual(orderedTypes.reduce((counts: Record<string, number>, type: string) => ({ ...counts, [type]: (counts[type] ?? 0) + 1 }), {}),
      { single: 120, multiple: 20, judgement: 40 });
    assert.equal(new Set(started.payload.questions.map((q: any) => q.questionId)).size, 180);
    const snapshots = app.db.prepare('SELECT question_id, points FROM exam_question_snapshots WHERE exam_session_id = ?').all(examId) as Array<{ question_id: string; points: number }>;
    assert.equal(snapshots.reduce((sum, row) => sum + row.points, 0), 100);
    const typePoints = app.db.prepare(`SELECT json_extract(snapshot_json, '$.type') AS type, SUM(points) AS score
      FROM exam_question_snapshots WHERE exam_session_id = ? GROUP BY json_extract(snapshot_json, '$.type')`).all(examId) as Array<{ type: string; score: number }>;
    assert.deepEqual(Object.fromEntries(typePoints.map(row => [row.type, row.score])), { single: 60, multiple: 20, judgement: 20 });
    const responseJson = JSON.stringify(started.payload);
    assert.equal(responseJson.includes('answer_json'), false);
    assert.equal(responseJson.includes('raw_answer'), false);
    assert.equal(responseJson.includes('correctAnswer'), false);
    const singlePosition = started.payload.questions.find((question: any) => question.type === 'single').position;
    const invalidSingle = await request(`/api/exams/${examId}/questions/${singlePosition}/answer`, { method: 'PUT', token: peerToken,
      body: { answer: ['A', 'B'], expectedVersion: 0, requestId: 'invalid-single-answer' } });
    assert.equal(invalidSingle.response.status, 404, 'another user cannot use a known exam to test answer validity');
    const originalRules = app.db.prepare(`SELECT r.* FROM exam_rules r
      JOIN question_banks b ON b.id = r.bank_id AND b.active_version_id = r.bank_version_id
      WHERE r.bank_id = ?`).get(bankId) as {
      id: string; bank_id: string; bank_version_id: string; single_count: number; single_points: number;
      multiple_count: number; multiple_points: number; judgement_count: number; judgement_points: number;
      duration_minutes: number; passing_score: number; created_at: string; updated_at: string;
    };
    app.db.prepare('UPDATE exam_rules SET single_count = 846 WHERE bank_id = ?').run(bankId);
    const shortage = await request('/api/exams', { method: 'POST', token: peerToken, body: { bankId } });
    assert.equal(shortage.response.status, 409);
    assert.equal(shortage.payload.error.code, 'EXAM_QUESTION_SHORTAGE');
    assert.deepEqual(shortage.payload.error.details, { type: 'single', required: 846, available: 845 });
    app.db.prepare('UPDATE exam_rules SET single_count = ? WHERE bank_id = ?').run(originalRules.single_count, bankId);
    app.db.prepare('DELETE FROM exam_rules WHERE bank_id = ? AND bank_version_id = ?').run(bankId, originalRules.bank_version_id);
    const noRules = await request('/api/exams', { method: 'POST', token: peerToken, body: { bankId } });
    assert.equal(noRules.response.status, 409);
    assert.equal(noRules.payload.error.code, 'EXAM_RULES_MISSING');
    app.db.prepare(`INSERT INTO exam_rules(id, bank_id, bank_version_id, single_count, single_points, multiple_count,
      multiple_points, judgement_count, judgement_points, duration_minutes, passing_score, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(originalRules.id, originalRules.bank_id, originalRules.bank_version_id, originalRules.single_count,
        originalRules.single_points, originalRules.multiple_count, originalRules.multiple_points, originalRules.judgement_count,
        originalRules.judgement_points, originalRules.duration_minutes, originalRules.passing_score, originalRules.created_at,
        originalRules.updated_at);
    const ownSingle = await request(`/api/exams/${examId}/questions/${singlePosition}/answer`, { method: 'PUT', token: learnerToken,
      body: { answer: ['A', 'B'], expectedVersion: 0, requestId: 'invalid-multi-single-00' } });
    assert.equal(ownSingle.response.status, 400);
    assert.equal(ownSingle.payload.error.code, 'INVALID_EXAM_ANSWER');
    const repeat = await request('/api/exams', { method: 'POST', token: learnerToken, body: { bankId } });
    assert.equal(repeat.response.status, 200);
    assert.equal(repeat.payload.session.id, examId);
    assert.equal(repeat.payload.resumed, true);
    const forbidden = await request(`/api/exams/${examId}`, { token: peerToken });
    assert.equal(forbidden.response.status, 404);
  });

  await t.test('answer writes are versioned/idempotent, then grading and wrong-state updates happen once', async () => {
    const exam = await request('/api/exams/active', { token: learnerToken });
    const examId = exam.payload.session.id as string;
    const snapshots = app.db.prepare(`SELECT s.id AS snapshotId, s.question_id AS questionId, s.position, s.answer_json AS answerJson,
      s.points, s.snapshot_json AS snapshotJson FROM exam_question_snapshots s WHERE s.exam_session_id = ? ORDER BY s.position`)
      .all(examId) as Array<{ snapshotId: string; questionId: string; position: number; answerJson: string; points: number; snapshotJson: string }>;
    const first = snapshots.find(row => JSON.parse(row.snapshotJson).type === 'judgement')!;
    const firstAnswer = JSON.parse(first.answerJson) as string[];
    const firstSaveBody = { answer: firstAnswer, expectedVersion: 0, requestId: 'exam-write-first-0001', marked: true };
    const saved = await request(`/api/exams/${examId}/questions/${first.position}/answer`, { method: 'PUT', token: learnerToken, body: firstSaveBody });
    assert.equal(saved.response.status, 200);
    assert.equal(saved.payload.version, 1);
    const retry = await request(`/api/exams/${examId}/questions/${first.position}/answer`, { method: 'PUT', token: learnerToken, body: firstSaveBody });
    assert.equal(retry.response.status, 200);
    assert.equal(retry.payload.idempotent, true);
    const conflict = await request(`/api/exams/${examId}/questions/${first.position}/answer`, { method: 'PUT', token: learnerSecondDeviceToken,
      body: { ...firstSaveBody, requestId: 'exam-write-stale-0002', answer: [] } });
    assert.equal(conflict.response.status, 409);
    assert.equal(conflict.payload.error.code, 'ANSWER_VERSION_CONFLICT');
    assert.equal(conflict.payload.error.details.current.version, 1);

    const single = snapshots.find(row => JSON.parse(row.snapshotJson).type === 'single')!;
    const multipleRows = snapshots.filter(row => JSON.parse(row.snapshotJson).type === 'multiple');
    const omittedRow = multipleRows.find(row => (JSON.parse(row.answerJson) as string[]).length > 1)!;
    const extraRow = multipleRows.find(row => row.position !== omittedRow.position &&
      Object.keys(JSON.parse(row.snapshotJson).options).some(letter => !(JSON.parse(row.answerJson) as string[]).includes(letter)))!;
    const wrongRow = multipleRows.find(row => row.position !== omittedRow.position && row.position !== extraRow.position &&
      Object.keys(JSON.parse(row.snapshotJson).options).some(letter => !(JSON.parse(row.answerJson) as string[]).includes(letter)))!;
    const unorderedCorrectRow = multipleRows.find(row => ![omittedRow.position, extraRow.position, wrongRow.position].includes(row.position) &&
      (JSON.parse(row.answerJson) as string[]).length > 1)!;
    const unanswered = snapshots.find(row => JSON.parse(row.snapshotJson).type === 'judgement' && row.position !== first.position)!;
    const wrongSingle = Object.keys(JSON.parse(single.snapshotJson).options).find(letter => !JSON.parse(single.answerJson).includes(letter))!;
    const omittedAnswer = (JSON.parse(omittedRow.answerJson) as string[]).slice(0, -1);
    const extraLetter = Object.keys(JSON.parse(extraRow.snapshotJson).options).find(letter => !(JSON.parse(extraRow.answerJson) as string[]).includes(letter))!;
    const extraAnswer = [...JSON.parse(extraRow.answerJson) as string[], extraLetter].sort();
    const wrongLetter = Object.keys(JSON.parse(wrongRow.snapshotJson).options).find(letter => !(JSON.parse(wrongRow.answerJson) as string[]).includes(letter))!;
    const wrongAnswer = [wrongLetter];
    const invalidMultiAnswers = new Map<number, string[]>([
      [omittedRow.position, omittedAnswer], [extraRow.position, extraAnswer], [wrongRow.position, wrongAnswer],
    ]);
    const pendingWrites = snapshots.filter(row => row.position !== unanswered.position).map(async row => {
      if (row.position === first.position) return;
      const isSingleWrong = row.position === single.position;
      const answer = isSingleWrong ? [wrongSingle] : invalidMultiAnswers.get(row.position) ??
        (row.position === unorderedCorrectRow.position ? (JSON.parse(row.answerJson) as string[]).reverse() : JSON.parse(row.answerJson) as string[]);
      const response = await request(`/api/exams/${examId}/questions/${row.position}/answer`, {
        method: 'PUT', token: learnerToken,
        body: { answer, expectedVersion: 0, requestId: randomUUID(), marked: false },
      });
      assert.equal(response.response.status, 200, `${row.position} ${JSON.stringify(response.payload)}`);
    });
    await Promise.all(pendingWrites);

    const submissions = await Promise.all([1, 2].map(() => request(`/api/exams/${examId}/submit`, {
      method: 'POST', token: learnerToken, body: {},
    })));
    assert.ok(submissions.every(item => item.response.status === 200));
    const finished = submissions.find(item => item.payload.idempotent === false)!;
    assert.ok(finished);
    assert.equal(submissions.filter(item => item.payload.idempotent === false).length, 1);
    const result = finished.payload.result;
    assert.equal(result.score.total, 96);
    assert.deepEqual(result.score, { total: 96, maximum: 100, passingScore: 60, passed: true, single: 59.5, multiple: 17, judgement: 19.5 });
    assert.deepEqual(result.counts, { total: 180, correct: 175, wrong: 4, unanswered: 1 });
    assert.equal(result.questions.length, 180);
    const replayByPosition = new Map(result.questions.map((item: any) => [item.position, item]));
    assert.equal((replayByPosition.get(unorderedCorrectRow.position) as any).earnedPoints, 1);
    assert.deepEqual([...invalidMultiAnswers.keys()].map(position => (replayByPosition.get(position) as any).earnedPoints), [0, 0, 0]);
    const retrySubmit = await request(`/api/exams/${examId}/submit`, { method: 'POST', token: learnerToken, body: {} });
    assert.equal(retrySubmit.response.status, 200);
    assert.equal(retrySubmit.payload.idempotent, true);
    assert.equal(Number((app.db.prepare('SELECT COUNT(*) AS count FROM exam_results WHERE exam_session_id = ?').get(examId) as { count: number }).count), 1);
    const wrongRows = app.db.prepare('SELECT question_id, wrong_count FROM mistake_states WHERE user_id = (SELECT user_id FROM exam_sessions WHERE id = ?)').all(examId) as Array<{ question_id: string; wrong_count: number }>;
    assert.equal(wrongRows.length, 4);
    assert.ok(wrongRows.every(row => row.wrong_count === 1));
    assert.equal(wrongRows.some(row => row.question_id === unanswered.questionId), false);
    const blockedWrite = await request(`/api/exams/${examId}/questions/${first.position}/answer`, { method: 'PUT', token: learnerToken,
      body: { answer: [], expectedVersion: 1, requestId: 'exam-after-submit-0001' } });
    assert.equal(blockedWrite.response.status, 409);

    completedExamId = examId;
  });

  await t.test('deadline is server-controlled; exact cutoff rejects changes and expires with saved answers only', async () => {
    const started = await request('/api/exams', { method: 'POST', token: peerToken, body: { bankId } });
    assert.equal(started.response.status, 201);
    const examId = started.payload.session.id as string;
    const question = started.payload.questions[0] as { position: number; questionId: string; type: string };
    const correct = JSON.parse((app.db.prepare('SELECT answer_json FROM questions WHERE id = ?').get(question.questionId) as { answer_json: string }).answer_json) as string[];
    now = new Date(Date.parse(started.payload.session.deadlineAt) - 1);
    const lastAllowed = await request(`/api/exams/${examId}/questions/${question.position}/answer`, { method: 'PUT', token: peerToken,
      body: { answer: correct, expectedVersion: 0, requestId: 'before-deadline-0001' } });
    assert.equal(lastAllowed.response.status, 200);
    now = new Date(started.payload.session.deadlineAt);
    const atCutoff = await request(`/api/exams/${examId}/questions/${question.position}/answer`, { method: 'PUT', token: peerToken,
      body: { answer: [], expectedVersion: 1, requestId: 'at-deadline-write-1' } });
    assert.equal(atCutoff.response.status, 409);
    const expired = await request(`/api/exams/${examId}`, { token: peerToken });
    assert.equal(expired.response.status, 200);
    assert.equal(expired.payload.session.status, 'expired');
    assert.equal(expired.payload.result.counts.correct, 1);
    assert.equal(expired.payload.result.counts.unanswered, 179);
    const active = await request('/api/exams/active', { token: peerToken });
    assert.equal(active.payload.session, null);
    assert.equal(Number((app.db.prepare('SELECT COUNT(*) AS count FROM exam_results WHERE exam_session_id = ?').get(examId) as { count: number }).count), 1);
  });

  await t.test('restart restores an active exam, and disabled users cannot access it', async () => {
    now = new Date('2026-10-19T03:00:00.000Z');
    const started = await request('/api/exams', { method: 'POST', token: restartToken, body: { bankId } });
    assert.equal(started.response.status, 201);
    const examId = started.payload.session.id as string;
    const first = started.payload.questions[0];
    const answer = JSON.parse((app.db.prepare('SELECT answer_json FROM questions WHERE id = ?').get(first.questionId) as { answer_json: string }).answer_json) as string[];
    await request(`/api/exams/${examId}/questions/1/answer`, { method: 'PUT', token: restartToken,
      body: { answer, expectedVersion: 0, requestId: 'restart-save-00001' } });
    await app.close();
    app = await buildApp({ config, logger: false, now: () => new Date(now) });
    origin = await app.listen({ host: '127.0.0.1', port: 0 });
    const restored = await request('/api/exams/active', { token: restartToken });
    assert.equal(restored.response.status, 200);
    assert.equal(restored.payload.session.id, examId);
    assert.deepEqual(restored.payload.questions[0].answer, answer);
    assert.equal(restored.payload.questions[0].version, 1);
    app.db.prepare('UPDATE users SET disabled = 1 WHERE username = ?').run('restart-user');
    const disabledRead = await request(`/api/exams/${examId}`, { token: restartToken });
    assert.equal(disabledRead.response.status, 401);

    app.db.prepare('UPDATE users SET disabled = 0 WHERE username = ?').run('restart-user');
    const restartRecoveryToken = await login('restart-user');
    now = new Date(started.payload.session.deadlineAt);
    await app.close();
    app = await buildApp({ config, logger: false, now: () => new Date(now) });
    origin = await app.listen({ host: '127.0.0.1', port: 0 });
    const expiredAfterRestart = await request('/api/exams/active', { token: restartRecoveryToken });
    assert.equal(expiredAfterRestart.response.status, 200);
    assert.equal(expiredAfterRestart.payload.session, null);
    const expiredResult = app.db.prepare(`SELECT r.details_json AS details FROM exam_results r
      JOIN exam_sessions s ON s.id = r.exam_session_id WHERE s.user_id = (
        SELECT id FROM users WHERE username = 'restart-user')`).get() as { details: string };
    assert.equal(JSON.parse(expiredResult.details).status, 'expired');

    const oldVersion = (app.db.prepare('SELECT bank_version_id AS id FROM exam_sessions WHERE id = ?').get(completedExamId) as { id: string }).id;
    const version2 = randomUUID(); const timestamp = now.toISOString();
    app.db.prepare(`INSERT INTO bank_versions(id, bank_id, version_number, file_fingerprint, source_filename, sheet_name,
      question_count, type_counts_json, created_by, created_at) VALUES (?, ?, 2, 'upgrade-test-fingerprint', 'next.xlsx', '客观题', 0, '{}', ?, ?)`)
      .run(version2, bankId, adminId, timestamp);
    app.db.prepare('UPDATE question_banks SET active_version_id = ? WHERE id = ?').run(version2, bankId);
    const historyReview = await request(`/api/exams/${completedExamId}/result`, { token: learnerToken });
    assert.equal(historyReview.response.status, 200);
    assert.equal(historyReview.payload.bankVersionId, oldVersion);
    assert.equal(historyReview.payload.questions.length, 180);
    assert.ok(historyReview.payload.questions.every((item: any) => item.correctAnswer.length > 0));
  });
});
