import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createSession } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import { openMigratedDatabase } from '../src/db/database.js';

let temporaryDirectory = '';
let app: FastifyInstance;
let cookie = '';

before(async () => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), 'theory-cookie-origin-'));
  const database = openMigratedDatabase(join(temporaryDirectory, 'cookie.test.sqlite'));
  const base = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    THEORY_DATABASE_PATH: join(temporaryDirectory, 'unused.sqlite'),
    CORS_ORIGINS: 'https://118.24.61.190:10393',
  });
  const config = { ...base, environment: 'production' as const, cookieSecure: true };
  app = await buildApp({ config, database, surface: 'business', runBackgroundJobs: false, logger: false });

  const userId = 'cookie-origin-user';
  const now = new Date().toISOString();
  app.db.prepare(`INSERT INTO users (id, username, password_hash, role, disabled, created_at, updated_at, must_change_password, is_test_account)
    VALUES (?, ?, ?, 'user', 0, ?, ?, 0, 0)`).run(userId, 'cookie-origin-user', 'unused-test-hash', now, now);
  const session = createSession(app.db, userId, true);
  cookie = `theory_session=${encodeURIComponent(session.token)}`;
});

after(async () => {
  if (app) await app.close();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

test('browser cookies are accepted on the configured Web port, not the same-IP API port', async () => {
  const web = await app.inject({ method: 'GET', url: '/api/auth/me', headers: {
    host: '118.24.61.190:10393', cookie,
  } });
  assert.equal(web.statusCode, 200);
  assert.equal((web.json() as { username: string }).username, 'cookie-origin-user');

  const api = await app.inject({ method: 'GET', url: '/api/auth/me', headers: {
    host: '118.24.61.190:30946', cookie,
  } });
  assert.equal(api.statusCode, 403);
  assert.equal((api.json() as { error: { code: string } }).error.code, 'COOKIE_HOST_MISMATCH');
});

test('cross-port Web Origin cannot call the public API listener directly', async () => {
  const response = await app.inject({ method: 'OPTIONS', url: '/api/auth/me', headers: {
    host: '118.24.61.190:30946', origin: 'https://118.24.61.190:10393',
    'access-control-request-method': 'GET',
  } });
  assert.equal(response.statusCode, 403);
  assert.equal((response.json() as { error: { code: string } }).error.code, 'ORIGIN_HOST_MISMATCH');
});
