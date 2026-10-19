import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { after, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { provisionAccounts, createInitialPassword, type AccountProvisionSpec } from '../src/account-provisioning.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDatabase, openMigratedDatabase } from '../src/db/database.js';
import { migrations } from '../src/db/migrations.js';
import { hashPassword, verifyPassword } from '../src/security.js';

const syntheticPassword = 'fixture-only-password-2026!';
const specifications: AccountProvisionSpec[] = [
  { username: 'fixture-one', isTestAccount: false },
  { username: 'fixture-two', isTestAccount: false },
  { username: 'fixture-three', isTestAccount: false },
  { username: 'fixture-test', isTestAccount: true },
];
const logChunks: string[] = [];
const logStream = new Writable({ write(chunk, _encoding, callback) { logChunks.push(String(chunk)); callback(); } });
let temporaryDirectory = '';
let app: FastifyInstance;
let origin = '';

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

test('P2-R account issuance, first-login password change, isolation, and credential secrecy', async t => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), 'theory-exam-p2r-'));
  t.after(async () => {
    if (app) await app.close().catch(() => undefined);
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  await t.test('V3 migration preserves V2 users and defaults existing accounts safely', async () => {
    const legacyPath = join(temporaryDirectory, 'legacy-v2.sqlite');
    const legacy = new DatabaseSync(legacyPath);
    legacy.exec('PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);');
    for (const migration of migrations.filter(item => item.version <= 2)) {
      legacy.exec('BEGIN IMMEDIATE');
      legacy.exec(migration.sql);
      legacy.prepare('INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)').run(migration.version, migration.name, new Date().toISOString());
      legacy.exec('COMMIT');
    }
    const oldHash = await hashPassword(syntheticPassword);
    legacy.prepare(`INSERT INTO users(id, username, password_hash, role, disabled, created_at, updated_at)
      VALUES ('preserved-user', 'preserved-user', ?, 'user', 0, '2026-10-01', '2026-10-01')`).run(oldHash);
    legacy.close();

    const upgraded = openMigratedDatabase(legacyPath);
    try {
      const row = upgraded.prepare('SELECT username, password_hash, must_change_password, is_test_account FROM users WHERE id = ?').get('preserved-user') as Record<string, unknown>;
      assert.equal(row.username, 'preserved-user');
      assert.equal(row.password_hash, oldHash);
      assert.equal(row.must_change_password, 0);
      assert.equal(row.is_test_account, 0);
      assert.equal(Number((upgraded.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as { version: number }).version), migrations.at(-1)?.version);
    } finally { upgraded.close(); }
  });

  const config = loadConfig({ ...process.env, NODE_ENV: 'test', THEORY_DATABASE_PATH: join(temporaryDirectory, 'accounts.test.sqlite'), THEORY_STATIC_DIR: join(temporaryDirectory, 'static') });
  app = await buildApp({ config, logger: { level: 'info', stream: logStream } });
  origin = await app.listen({ host: '127.0.0.1', port: 0 });

  const credentialsPath = join(temporaryDirectory, 'restricted', 'credentials.json');
  const provision = await provisionAccounts(app.db, specifications, credentialsPath, new Date('2026-10-19T04:00:00.000Z'));
  const issuance = JSON.parse(readFileSync(credentialsPath, 'utf8')) as { accounts: Array<{ username: string; isTestAccount: boolean; initialPassword: string }> };
  const initialPasswords = issuance.accounts;

  await t.test('provisioning emits four unique temporary passwords and never replaces an existing username', async () => {
    assert.equal(provision.createdCount, 4);
    assert.equal(new Set(initialPasswords.map(account => account.initialPassword)).size, 4);
    assert.equal(initialPasswords.every(account => /^[A-Za-z]{8}261019$/.test(account.initialPassword)), true);
    assert.equal(statSync(temporaryDirectory).mode & 0o777, 0o700);
    assert.equal(statSync(join(temporaryDirectory, 'restricted')).mode & 0o777, 0o700);
    assert.equal(statSync(credentialsPath).mode & 0o777, 0o600);
    assert.deepEqual(initialPasswords.map(account => account.isTestAccount), [false, false, false, true]);
    await assert.rejects(provisionAccounts(app.db, specifications, join(temporaryDirectory, 'second-credentials.json')));
    assert.equal(statSync(credentialsPath).mode & 0o777, 0o600);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS count FROM users WHERE role = \'user\'').get()!.count, 4);
  });

  const boot = await request('/api/admin/bootstrap', { method: 'POST', body: { username: 'fixture-admin', password: 'fixture-admin-password-2026!' } });
  assert.equal(boot.response.status, 201);
  const adminToken = String(boot.payload.token);
  const adminId = String(boot.payload.user.id);
  const tokens = new Map<string, string>();
  const permanentPasswords = new Map<string, string>();
  const exposedResponses: string[] = [JSON.stringify(boot.payload)];

  for (const account of initialPasswords) {
    const wrong = await request('/api/auth/login', { method: 'POST', body: { username: account.username, password: 'wrong-fixture-password' } });
    assert.equal(wrong.response.status, 401);
    const login = await request('/api/auth/login', { method: 'POST', body: { username: account.username, password: account.initialPassword } });
    assert.equal(login.response.status, 200);
    assert.equal(login.payload.user.role, 'user');
    assert.equal(login.payload.user.mustChangePassword, true);
    assert.equal(login.payload.user.isTestAccount, account.isTestAccount);
    const initialToken = String(login.payload.token);
    const safeIdentity = await request('/api/auth/me', { token: initialToken });
    assert.equal(safeIdentity.response.status, 200);
    assert.equal(safeIdentity.payload.mustChangePassword, true);
    assert.equal((await request('/api/banks', { token: initialToken })).payload.error.code, 'PASSWORD_CHANGE_REQUIRED');
    assert.equal((await request('/api/admin/users', { token: initialToken })).response.status, 403);
    const secondOldSession = account.username === 'fixture-one'
      ? await request('/api/auth/login', { method: 'POST', body: { username: account.username, password: account.initialPassword } })
      : null;
    if (secondOldSession) assert.equal(secondOldSession.response.status, 200);

    const newPassword = `changed-${account.username}-password-2026!`;
    const changed = await request('/api/auth/password', { method: 'POST', token: initialToken, body: { currentPassword: account.initialPassword, newPassword } });
    assert.equal(changed.response.status, 200);
    assert.equal(changed.payload.user.mustChangePassword, false);
    assert.equal((await request('/api/auth/me', { token: initialToken })).response.status, 401);
    if (secondOldSession) assert.equal((await request('/api/auth/me', { token: secondOldSession.payload.token })).response.status, 401);
    assert.equal((await request('/api/auth/login', { method: 'POST', body: { username: account.username, password: account.initialPassword } })).response.status, 401);
    const newLogin = await request('/api/auth/login', { method: 'POST', body: { username: account.username, password: newPassword } });
    assert.equal(newLogin.response.status, 200);
    assert.equal(newLogin.payload.user.mustChangePassword, false);
    tokens.set(account.username, String(newLogin.payload.token));
    permanentPasswords.set(account.username, newPassword);
    exposedResponses.push(JSON.stringify(login.payload), JSON.stringify(changed.payload), JSON.stringify(newLogin.payload), JSON.stringify(safeIdentity.payload));
  }

  await t.test('Argon2id hashes use independent salts; APIs expose neither hashes nor passwords', async () => {
    const first = await hashPassword(syntheticPassword);
    const second = await hashPassword(syntheticPassword);
    assert.notEqual(first, second);
    assert.equal(first.startsWith('$argon2id$'), true);
    assert.equal(second.startsWith('$argon2id$'), true);
    assert.equal(await verifyPassword(first, syntheticPassword), true);
    assert.equal(await verifyPassword(second, syntheticPassword), true);
    const rows = app.db.prepare("SELECT username, password_hash FROM users WHERE role = 'user'").all() as Array<{ username: string; password_hash: string }>;
    assert.equal(rows.length, 4);
    assert.equal(rows.every(row => row.password_hash.startsWith('$argon2id$')), true);
    assert.equal(rows.every(row => !initialPasswords.some(account => row.password_hash === account.initialPassword)), true);
    const listing = await request('/api/admin/users', { token: adminToken });
    assert.equal(listing.response.status, 200);
    exposedResponses.push(JSON.stringify(listing.payload));
    assert.equal(exposedResponses.every(payload => !payload.includes('password_hash') && !payload.includes('$argon2id$')), true);
    assert.equal(exposedResponses.every(payload => initialPasswords.every(account => !payload.includes(account.initialPassword))), true);
    assert.equal(exposedResponses.every(payload => permanentPasswords.size === 4 && [...permanentPasswords.values()].every(password => !payload.includes(password))), true);
  });

  await t.test('four user identities and favorites are isolated; users cannot use admin routes', async () => {
    const now = new Date().toISOString();
    const bankId = randomUUID();
    const versionId = randomUUID();
    const questionId = randomUUID();
    app.db.prepare(`INSERT INTO question_banks(id, bank_key, name, created_at, updated_at, active_version_id)
      VALUES (?, 'security_fixture', 'Security fixture', ?, ?, NULL)`).run(bankId, now, now);
    app.db.prepare(`INSERT INTO bank_versions(id, bank_id, version_number, file_fingerprint, source_filename, sheet_name,
      question_count, type_counts_json, created_by, created_at) VALUES (?, ?, 1, 'security-fixture', 'fixture.xlsx', 'sheet', 1, '{"single":1}', ?, ?)`)
      .run(versionId, bankId, adminId, now);
    app.db.prepare('UPDATE question_banks SET active_version_id = ? WHERE id = ?').run(versionId, bankId);
    app.db.prepare(`INSERT INTO questions(id, bank_id, bank_version_id, question_type, source_type_label, stem, normalized_stem,
      options_json, answer_json, raw_answer, source_filename, source_sheet, source_row, created_at)
      VALUES (?, ?, ?, 'single', 'single', 'fixture question', 'fixture question', '{"A":"yes","B":"no"}', '["A"]', 'A', 'fixture.xlsx', 'sheet', 2, ?)`)
      .run(questionId, bankId, versionId, now);
    assert.equal((await request(`/api/favorites/${questionId}?bankId=${bankId}`, { method: 'PUT', token: tokens.get('fixture-one'), body: { bankId } })).response.status, 200);
    for (const account of initialPasswords) {
      const me = await request('/api/auth/me', { token: tokens.get(account.username) });
      assert.equal(me.response.status, 200);
      assert.equal(me.payload.username, account.username);
      assert.equal((await request('/api/admin/users', { token: tokens.get(account.username) })).response.status, 403);
      const favorites = await request(`/api/favorites?bankId=${bankId}`, { token: tokens.get(account.username) });
      assert.equal(favorites.response.status, 200);
      assert.equal(favorites.payload.items.length, account.username === 'fixture-one' ? 1 : 0);
    }
  });

  await t.test('password reset and disable revoke sessions; reset forces another first-login change', async () => {
    const users = await request('/api/admin/users', { token: adminToken });
    const firstId = users.payload.items.find((user: { username: string }) => user.username === 'fixture-one').id as string;
    const secondId = users.payload.items.find((user: { username: string }) => user.username === 'fixture-two').id as string;
    const firstToken = tokens.get('fixture-one')!;
    const disabled = await request(`/api/admin/users/${firstId}`, { method: 'PATCH', token: adminToken, body: { disabled: true } });
    assert.equal(disabled.response.status, 200);
    assert.equal((await request('/api/auth/me', { token: firstToken })).response.status, 401);
    assert.equal((await request('/api/auth/login', { method: 'POST', body: { username: 'fixture-one', password: permanentPasswords.get('fixture-one') } })).response.status, 401);
    await request(`/api/admin/users/${firstId}`, { method: 'PATCH', token: adminToken, body: { disabled: false } });

    const secondToken = tokens.get('fixture-two')!;
    const resetPassword = 'fixture-reset-password-2026!';
    const reset = await request(`/api/admin/users/${secondId}/reset-password`, { method: 'POST', token: adminToken, body: { newPassword: resetPassword } });
    assert.equal(reset.response.status, 200);
    assert.equal((await request('/api/auth/me', { token: secondToken })).response.status, 401);
    assert.equal((await request('/api/auth/login', { method: 'POST', body: { username: 'fixture-two', password: permanentPasswords.get('fixture-two') } })).response.status, 401);
    const resetLogin = await request('/api/auth/login', { method: 'POST', body: { username: 'fixture-two', password: resetPassword } });
    assert.equal(resetLogin.response.status, 200);
    assert.equal(resetLogin.payload.user.mustChangePassword, true);
  });

  await t.test('structured logs redact request bodies that contain credential fields', async () => {
    const logProbe = 'synthetic-log-probe-never-a-real-password';
    app.log.info({ req: { body: { password: logProbe, currentPassword: logProbe, newPassword: logProbe } } }, 'credential redaction probe');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(logChunks.join('').includes(logProbe), false);
  });
});
