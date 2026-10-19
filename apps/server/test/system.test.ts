import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import ExcelJS from 'exceljs';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { isLoopbackAddress } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db/database.js';
import { parseQuestionWorkbook } from '../src/services/excel-import.js';

const password = `p1-test-${randomBytes(16).toString('hex')}!`;
const ruleSet = {
  singleCount: 1, singlePoints: 0.5,
  multipleCount: 1, multiplePoints: 1,
  judgementCount: 1, judgementPoints: 0.5,
  durationMinutes: 90, passingScore: 1.5,
};
let temporaryDirectory = '';
let databasePath = '';
let app: FastifyInstance;
let origin = '';

async function request(path: string, options: { method?: string; token?: string; body?: unknown } = {}) {
  const headers = new Headers();
  if (options.token) headers.set('authorization', `Bearer ${options.token}`);
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  const response = await fetch(`${origin}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = response.status === 204 ? {} : await response.json();
  return { response, payload };
}

async function workbook(rows: string[][]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('客观题');
  sheet.addRow(['题型', '题干', '选项A', '选项B', '选项C', '选项D', '选项E', '答案']);
  rows.forEach(row => sheet.addRow(row));
  return Buffer.from(await book.xlsx.writeBuffer());
}

const duplicateRows = [
  ['单选题', '重复题干', '选项甲', '选项乙', '', '', '', 'A'],
  ['单选题', '重复题干', '另一种选项甲', '另一种选项乙', '', '', '', 'B'],
  ['多选题', '重复题干', '甲', '乙', '丙', '', '', 'CB'],
  ['多选题', '多选规范化', '甲', '乙', '丙', '', '', 'CB'],
  ['判断题', '判断对错文字', '对', '错', '', '', '', 'B'],
  ['判断题', '判断正确错误文字', '正确', '错误', '', '', '', 'A'],
];

test('P1 server, authentication, SQLite, and two-phase Excel imports', async t => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), 'theory-exam-p1-'));
  databasePath = join(temporaryDirectory, 'server.test.sqlite');
  const config = loadConfig({ ...process.env, NODE_ENV: 'test', THEORY_DATABASE_PATH: databasePath, THEORY_STATIC_DIR: join(temporaryDirectory, 'static') });
  app = await buildApp({ config, logger: false });
  origin = await app.listen({ host: '127.0.0.1', port: 0 });
  t.after(async () => {
    if (app) await app.close().catch(() => undefined);
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  await t.test('migrations enable foreign keys, WAL, and restrictive local data permissions', () => {
    assert.equal(Number((app.db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys), 1);
    assert.equal(String((app.db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode).toLowerCase(), 'wal');
    assert.equal(Number((app.db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as { n: number }).n), 1);
    assert.equal(statSync(temporaryDirectory).mode & 0o777, 0o700);
    assert.equal(statSync(databasePath).mode & 0o777, 0o600);
  });

  const bootstrap = await request('/api/admin/bootstrap', { method: 'POST', body: { username: 'local-admin', password, remember: true } });
  assert.equal(bootstrap.response.status, 201);
  const adminSession = bootstrap.payload as { user: { id: string; role: string }; token: string };
  const adminToken = adminSession.token;
  await t.test('one-time administrator bootstrap hashes passwords and stores only token digests', async () => {
    assert.equal(adminSession.user.role, 'admin');
    const row = app.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(adminSession.user.id) as { password_hash: string };
    assert.match(row.password_hash, /^\$argon2id\$/);
    assert.notEqual(row.password_hash, password);
    const session = app.db.prepare('SELECT token_hash FROM sessions WHERE user_id = ?').get(adminSession.user.id) as { token_hash: string };
    assert.notEqual(session.token_hash, adminToken);
    assert.match(session.token_hash, /^[a-f0-9]{64}$/);
    const repeated = await request('/api/admin/bootstrap', { method: 'POST', body: { username: 'another-admin', password } });
    assert.equal(repeated.response.status, 409);
  });

  const created = await request('/api/admin/users', { method: 'POST', token: adminToken, body: { username: 'learner', password } });
  assert.equal(created.response.status, 201);
  const learner = (created.payload as { user: { id: string; username: string } }).user;
  await t.test('login, current identity, logout, password change, and admin-only controls', async () => {
    const wrong = await request('/api/auth/login', { method: 'POST', body: { username: learner.username, password: 'wrong-password' } });
    assert.equal(wrong.response.status, 401);
    const login = await request('/api/auth/login', { method: 'POST', body: { username: 'LEARNER', password } });
    assert.equal(login.response.status, 200);
    let userToken = (login.payload as { token: string }).token;
    const userMe = await request(`/api/auth/me?user_id=${adminSession.user.id}`, { token: userToken });
    assert.equal((userMe.payload as { id: string }).id, learner.id);
    assert.equal((await request('/api/admin/users', { token: userToken })).response.status, 403);
    assert.equal((await request(`/api/users/${adminSession.user.id}`, { token: userToken })).response.status, 404);
    assert.equal((await request('/api/auth/register', { method: 'POST', body: { username: 'nope', password } })).response.status, 404);

    assert.equal((await request('/api/auth/logout', { method: 'POST', token: userToken, body: {} })).response.status, 200);
    assert.equal((await request('/api/auth/me', { token: userToken })).response.status, 401);

    const again = await request('/api/auth/login', { method: 'POST', body: { username: 'learner', password } });
    userToken = (again.payload as { token: string }).token;
    assert.equal((await request(`/api/admin/users/${learner.id}`, { method: 'PATCH', token: adminToken, body: { disabled: true } })).response.status, 200);
    assert.equal((await request('/api/auth/me', { token: userToken })).response.status, 401);
    await request(`/api/admin/users/${learner.id}`, { method: 'PATCH', token: adminToken, body: { disabled: false } });

    const active = await request('/api/auth/login', { method: 'POST', body: { username: 'learner', password } });
    userToken = (active.payload as { token: string }).token;
    const changed = await request('/api/auth/password', { method: 'POST', token: userToken, body: { currentPassword: password, newPassword: 'new-password-123456' } });
    assert.equal(changed.response.status, 200);
    assert.equal((await request('/api/auth/me', { token: userToken })).response.status, 401);
    userToken = (changed.payload as { token: string }).token;
    assert.equal((await request('/api/auth/me', { token: userToken })).response.status, 200);
    await request(`/api/admin/users/${learner.id}/reset-password`, { method: 'POST', token: adminToken, body: { newPassword: password } });
    assert.equal((await request('/api/auth/me', { token: userToken })).response.status, 401);
    assert.equal((await request('/api/auth/login', { method: 'POST', body: { username: 'learner', password: 'new-password-123456' } })).response.status, 401);
    assert.equal((await request('/api/auth/login', { method: 'POST', body: { username: 'learner', password } })).response.status, 200);
  });

  await t.test('login failures are rate limited; admin routes require a loopback peer', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => request('/api/auth/login', {
      method: 'POST', body: { username: 'learner', password: 'wrong-password' },
    })));
    assert.ok(results.some(result => result.response.status === 429), `unexpected login statuses: ${results.map(result => result.response.status).join(',')}`);
    assert.equal((await request('/api/admin/status')).response.status, 200);
    assert.equal(isLoopbackAddress('127.0.0.1'), true);
    assert.equal(isLoopbackAddress('::1'), true);
    assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
    assert.equal(isLoopbackAddress('192.168.1.20'), false);
    assert.equal(isLoopbackAddress('8.8.8.8'), false);
  });

  await t.test('Excel parse rejects invalid headers and reports missing or invalid answers', async () => {
    const malformed = await workbook([['未知题型', '', '', '', '', '', '', '']]);
    const parser = await parseQuestionWorkbook(malformed);
    assert.equal(parser.errors[0]?.code, 'INVALID_TYPE');
    const badHeaders = new ExcelJS.Workbook();
    const badSheet = badHeaders.addWorksheet('Wrong');
    badSheet.addRow(['题型', '问题', '选项A']);
    const badHeader = await parseQuestionWorkbook(Buffer.from(await badHeaders.xlsx.writeBuffer()));
    assert.equal(badHeader.errors[0]?.code, 'INVALID_HEADER');
    const invalid = await workbook([
      ['单选题', '缺少答案', '甲', '乙', '', '', '', ''],
      ['单选题', '错误字母', '甲', '乙', '', '', '', 'Z'],
      ['单选题', '答案过多', '甲', '乙', '', '', '', 'AB'],
      ['判断题', '判断文字格式一', '对', '错', '', '', '', 'B'],
      ['判断题', '判断文字格式二', '正确', '错误', '', '', '', 'A'],
    ]);
    const parsed = await parseQuestionWorkbook(invalid);
    assert.equal(parsed.rowCount, 5);
    assert.equal(parsed.questions.length, 2);
    assert.ok(parsed.errors.some(issue => issue.code === 'MISSING_ANSWER' && issue.row === 2));
    assert.ok(parsed.errors.some(issue => issue.code === 'INVALID_ANSWER' && issue.row === 3));
    assert.ok(parsed.errors.some(issue => issue.code === 'ANSWER_CARDINALITY' && issue.row === 4));
    assert.deepEqual(parsed.questions.map(question => question.answer), [['B'], ['A']]);
    assert.deepEqual(parsed.questions.map(question => Object.values(question.options)[0]), ['对', '正确']);
  });

  await t.test('two-phase import is atomic, idempotent, preserves duplicate stems, and versions banks', async () => {
    const badHeaderBook = new ExcelJS.Workbook();
    const badSheet = badHeaderBook.addWorksheet('客观题');
    badSheet.addRow(['题型', '错误题干']);
    const badForm = new FormData();
    badForm.set('file', new Blob([new Uint8Array(Buffer.from(await badHeaderBook.xlsx.writeBuffer()))]), 'wrong.xlsx');
    badForm.set('bankKey', 'broken_bank'); badForm.set('bankName', '错误表头测试'); badForm.set('sheetName', '客观题');
    const invalidUpload = await fetch(`${origin}/api/admin/imports/preview`, { method: 'POST', headers: { authorization: `Bearer ${adminToken}` }, body: badForm });
    const invalidSummary = await invalidUpload.json() as { status: string; errors: Array<{ code: string }> };
    assert.equal(invalidSummary.status, 'blocked');
    assert.equal(invalidSummary.errors[0]?.code, 'INVALID_HEADER');

    const firstBuffer = await workbook(duplicateRows);
    const preview = new FormData();
    preview.set('file', new Blob([new Uint8Array(firstBuffer)]), 'fixture.xlsx');
    preview.set('bankKey', 'level4'); preview.set('bankName', '测试题库'); preview.set('sheetName', '客观题');
    const firstResponse = await fetch(`${origin}/api/admin/imports/preview`, { method: 'POST', headers: { authorization: `Bearer ${adminToken}` }, body: preview });
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json() as { id: string; questionCount: number; typeCounts: Record<string, number>; duplicateStems: Array<{ rows: number[]; types: string[] }>; errors: unknown[]; canConfirm: boolean };
    assert.equal(first.questionCount, 6);
    assert.deepEqual(first.typeCounts, { single: 2, multiple: 2, judgement: 2 });
    assert.deepEqual(first.duplicateStems[0]?.types, ['single', 'multiple']);
    assert.equal(first.errors.length, 0);
    assert.equal(first.canConfirm, true);

    const noPartial = await request(`/api/admin/imports/${first.id}/confirm`, { method: 'POST', token: adminToken, body: { ...ruleSet, singleCount: 99 } });
    assert.equal(noPartial.response.status, 400);
    assert.equal(Number((app.db.prepare('SELECT COUNT(*) AS n FROM question_banks').get() as { n: number }).n), 0);
    assert.equal((app.db.prepare('SELECT status FROM import_jobs WHERE id = ?').get(first.id) as { status: string }).status, 'pending_confirmation');

    app.db.exec("CREATE TRIGGER test_rollback_question BEFORE INSERT ON questions BEGIN SELECT RAISE(ABORT, 'forced test rollback'); END");
    const failedTransaction = await request(`/api/admin/imports/${first.id}/confirm`, { method: 'POST', token: adminToken, body: ruleSet });
    assert.equal(failedTransaction.response.status, 500);
    assert.equal(Number((app.db.prepare('SELECT COUNT(*) AS n FROM question_banks').get() as { n: number }).n), 0);
    assert.equal(Number((app.db.prepare('SELECT COUNT(*) AS n FROM bank_versions').get() as { n: number }).n), 0);
    app.db.exec('DROP TRIGGER test_rollback_question');

    const imported = await request(`/api/admin/imports/${first.id}/confirm`, { method: 'POST', token: adminToken, body: ruleSet });
    assert.equal(imported.response.status, 200);
    assert.equal((imported.payload as { questionCount: number }).questionCount, 6);
    const version1 = (imported.payload as { versionId: string }).versionId;
    assert.equal(Number((app.db.prepare('SELECT COUNT(*) AS n FROM questions WHERE bank_version_id = ?').get(version1) as { n: number }).n), 6);
    const normalized = app.db.prepare("SELECT answer_json FROM questions WHERE bank_version_id = ? AND question_type = 'multiple' AND stem = '多选规范化'").get(version1) as { answer_json: string };
    assert.deepEqual(JSON.parse(normalized.answer_json), ['B', 'C']);
    assert.equal((app.db.prepare('SELECT source_sheet FROM questions WHERE bank_version_id = ? ORDER BY source_row LIMIT 1').get(version1) as { source_sheet: string }).source_sheet, '客观题');

    const repeat = new FormData();
    repeat.set('file', new Blob([new Uint8Array(firstBuffer)]), 'fixture-copy.xlsx');
    repeat.set('bankKey', 'level4'); repeat.set('bankName', '测试题库'); repeat.set('sheetName', '客观题');
    const duplicateResponse = await fetch(`${origin}/api/admin/imports/preview`, { method: 'POST', headers: { authorization: `Bearer ${adminToken}` }, body: repeat });
    const duplicate = await duplicateResponse.json() as { alreadyExists: boolean; status: string; existingVersion: number };
    assert.equal(duplicate.alreadyExists, true);
    assert.equal(duplicate.status, 'duplicate');
    assert.equal(duplicate.existingVersion, 1);

    const revision = await workbook([...duplicateRows, ['单选题', '修订版新增题', '甲', '乙', '', '', '', 'A']]);
    const revisionForm = new FormData();
    revisionForm.set('file', new Blob([new Uint8Array(revision)]), 'revision.xlsx');
    revisionForm.set('bankKey', 'level4'); revisionForm.set('bankName', '测试题库'); revisionForm.set('sheetName', '客观题');
    const revisionPreview = await fetch(`${origin}/api/admin/imports/preview`, { method: 'POST', headers: { authorization: `Bearer ${adminToken}` }, body: revisionForm });
    const revisionJob = await revisionPreview.json() as { id: string };
    const revisionImport = await request(`/api/admin/imports/${revisionJob.id}/confirm`, { method: 'POST', token: adminToken, body: ruleSet });
    assert.equal(revisionImport.response.status, 200);
    assert.equal((revisionImport.payload as { versionNumber: number; questionCount: number }).versionNumber, 2);
    assert.equal((revisionImport.payload as { questionCount: number }).questionCount, 7);

    const anotherBankWorkbook = await workbook([['单选题', '另一题库', '甲', '乙', '', '', '', 'A']]);
    const anotherForm = new FormData();
    anotherForm.set('file', new Blob([new Uint8Array(anotherBankWorkbook)]), 'other.xlsx');
    anotherForm.set('bankKey', 'other_exam'); anotherForm.set('bankName', '其他题库'); anotherForm.set('sheetName', '客观题');
    const otherPreviewResponse = await fetch(`${origin}/api/admin/imports/preview`, { method: 'POST', headers: { authorization: `Bearer ${adminToken}` }, body: anotherForm });
    const otherJob = await otherPreviewResponse.json() as { id: string };
    const otherImport = await request(`/api/admin/imports/${otherJob.id}/confirm`, {
      method: 'POST', token: adminToken,
      body: { singleCount: 1, singlePoints: 0.5, multipleCount: 0, multiplePoints: 0, judgementCount: 0, judgementPoints: 0, durationMinutes: 60, passingScore: 0.5 },
    });
    assert.equal(otherImport.response.status, 200);
    assert.equal(Number((app.db.prepare('SELECT COUNT(*) AS n FROM question_banks').get() as { n: number }).n), 2);
    assert.equal(Number((app.db.prepare('SELECT COUNT(*) AS n FROM bank_versions').get() as { n: number }).n), 3);
    const stores = openDatabase(databasePath);
    assert.equal(Number((stores.prepare('SELECT COUNT(*) AS n FROM questions').get() as { n: number }).n), 14);
    stores.close();
  });

  await t.test('database contents and active sessions survive a server restart', async () => {
    const before = Number((app.db.prepare('SELECT COUNT(*) AS n FROM questions').get() as { n: number }).n);
    await app.close();
    app = await buildApp({ config, logger: false });
    origin = await app.listen({ host: '127.0.0.1', port: 0 });
    assert.equal((await request('/api/health')).response.status, 200);
    assert.equal(Number((app.db.prepare('SELECT COUNT(*) AS n FROM questions').get() as { n: number }).n), before);
    assert.equal((await request('/api/admin/users', { token: adminToken })).response.status, 200);
    const login = await request('/api/auth/login', { method: 'POST', body: { username: 'learner', password } });
    assert.equal(login.response.status, 200);
    const banks = await request('/api/banks', { token: (login.payload as { token: string }).token });
    assert.equal(banks.response.status, 200);
    assert.equal((banks.payload as { items: unknown[] }).items.length, 2);
  });
});

test('loopback detector accepts only actual local addresses', () => {
  assert.equal(isLoopbackAddress('127.0.0.9'), true);
  assert.equal(isLoopbackAddress('::1'), true);
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
  assert.equal(isLoopbackAddress('10.0.0.2'), false);
  assert.equal(isLoopbackAddress(undefined), false);
});
