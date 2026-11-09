import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openMigratedDatabase } from '../src/db/database.js';
import { hashPassword } from '../src/security.js';
import { createWebGateway } from '../src/web-gateway.js';

const directory = mkdtempSync(join(tmpdir(), 'theory-surface-isolation-'));
let businessApp: Awaited<ReturnType<typeof buildApp>> | undefined;
let adminApp: Awaited<ReturnType<typeof buildApp>> | undefined;
let proxy: Server | undefined;
let db: DatabaseSync | undefined;

after(async () => {
  proxy?.close();
  await Promise.allSettled([businessApp?.close(), adminApp?.close()]);
  db?.close();
  rmSync(directory, { recursive: true, force: true });
});

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve((server.address() as { port: number }).port);
    });
  });
}

test('loopback-forwarded learning listener cannot reach management routes or page', async () => {
  const databasePath = join(directory, 'isolated.sqlite');
  const staticDir = join(directory, 'static');
  mkdirSync(staticDir);
  writeFileSync(join(staticDir, 'index.html'), '<!doctype html><title>local admin test</title>');
  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    THEORY_DATABASE_PATH: databasePath,
    HOST: '127.0.0.1',
    PORT: '3000',
    ADMIN_HOST: '127.0.0.1',
    ADMIN_PORT: '3001',
  });
  db = openMigratedDatabase(databasePath);
  const sharedUserId = 'isolated-shared-user';
  const sharedPasswordHash = await hashPassword('web-test-password-only');
  db.prepare(`INSERT INTO users(id, username, password_hash, role, disabled, created_at, updated_at, must_change_password, is_test_account)
    VALUES (?, 'shared-user', ?, 'user', 0, ?, ?, 0, 1)`).run(sharedUserId, sharedPasswordHash, new Date().toISOString(), new Date().toISOString());
  businessApp = await buildApp({ config, database: db, staticDir, surface: 'business', logger: false });
  adminApp = await buildApp({ config: { ...config, host: '127.0.0.1', port: 3001 }, database: db, staticDir, surface: 'admin', logger: false });
  const businessAddress = await businessApp.listen({ host: '127.0.0.1', port: 0 });
  const businessPort = Number(new URL(businessAddress).port);
  const adminAddress = await adminApp.listen({ host: '127.0.0.1', port: 0 });

  proxy = createWebGateway({ staticDir, apiTarget: `http://127.0.0.1:${businessPort}` });
  const proxyPort = await listen(proxy);
  const proxyBase = `http://127.0.0.1:${proxyPort}`;
  config.corsOrigins.add(proxyBase);

  const directAdminPage = await fetch(`${businessAddress}/admin`);
  assert.equal(directAdminPage.status, 404);
  const directAdminApi = await fetch(`${businessAddress}/api/admin/status`);
  assert.equal(directAdminApi.status, 404);
  const adminPageThroughProxy = await fetch(`${proxyBase}/admin`, { headers: { 'X-Forwarded-For': '198.51.100.40' } });
  assert.equal(adminPageThroughProxy.status, 404);
  const adminStatusThroughProxy = await fetch(`${proxyBase}/api/admin/status`, { headers: { 'X-Forwarded-For': '198.51.100.40' } });
  assert.equal(adminStatusThroughProxy.status, 404);
  const bootstrapThroughProxy = await fetch(`${proxyBase}/api/admin/bootstrap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Forwarded-For': '198.51.100.40' },
    body: JSON.stringify({ username: 'isolated-admin', password: 'temporary-test-only-password' }),
  });
  assert.equal(bootstrapThroughProxy.status, 404);
  assert.equal(Number((db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get() as { count: number }).count), 0);

  const localAdminPage = await fetch(`${adminAddress}/admin`);
  assert.equal(localAdminPage.status, 200);
  assert.match(await localAdminPage.text(), /local admin test/);
  const bootstrapLocally = await fetch(`${adminAddress}/api/admin/bootstrap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'isolated-admin', password: 'temporary-test-only-password' }),
  });
  assert.equal(bootstrapLocally.status, 201);
  const bootstrapResult = await bootstrapLocally.json() as { token: string };
  const localAdminStatus = await fetch(`${adminAddress}/api/admin/status`, { headers: { Authorization: `Bearer ${bootstrapResult.token}` } });
  assert.equal(localAdminStatus.status, 200);

  const managementRouteThroughProxy = await fetch(`${proxyBase}/api/admin/status`, { headers: { Authorization: `Bearer ${bootstrapResult.token}`, 'X-Forwarded-For': '198.51.100.40' } });
  assert.equal(managementRouteThroughProxy.status, 404);
  for (const path of ['/api/Admin/status', '/api/%61dmin/status', '/%61dmin', '/api/auth/%2e%2e/admin/bootstrap', '/api//admin/status']) {
    assert.equal((await fetch(`${proxyBase}${path}`)).status, 404, `gateway accepted blocked path ${path}`);
  }
  assert.equal((await fetch(`${proxyBase}/api/health`)).status, 200);

  const webLogin = await fetch(`${proxyBase}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: proxyBase },
    body: JSON.stringify({ username: 'shared-user', password: 'web-test-password-only', remember: true }),
  });
  assert.equal(webLogin.status, 200);
  const webSession = await webLogin.json() as { user: { id: string }; csrfToken: string };
  assert.equal('token' in webSession, false);
  const webCookie = (webLogin.headers.get('set-cookie') ?? '').split(';', 1)[0]!;
  assert.match(webLogin.headers.get('set-cookie') ?? '', /HttpOnly; Path=\/; SameSite=Strict/);
  const webMe = await fetch(`${proxyBase}/api/auth/me`, { headers: { cookie: webCookie, origin: proxyBase } });
  assert.equal((await webMe.json() as { id: string }).id, sharedUserId);
  const csrfBlocked = await fetch(`${proxyBase}/api/auth/renew`, {
    method: 'POST', headers: { cookie: webCookie, origin: 'http://attacker.invalid', 'x-csrf-token': webSession.csrfToken, 'content-type': 'application/json' }, body: '{}',
  });
  assert.equal(csrfBlocked.status, 403);
  const browserMutation = await fetch(`${proxyBase}/api/auth/renew`, {
    method: 'POST', headers: { cookie: webCookie, origin: proxyBase, 'x-csrf-token': webSession.csrfToken, 'content-type': 'application/json' }, body: '{}',
  });
  assert.equal(browserMutation.status, 200);

  const androidLogin = await fetch(`${businessAddress}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://localhost' },
    body: JSON.stringify({ username: 'shared-user', password: 'web-test-password-only', remember: true }),
  });
  const androidSession = await androidLogin.json() as { user: { id: string }; token: string };
  assert.equal(androidLogin.status, 200);
  assert.ok(androidSession.token);
  const androidMe = await fetch(`${businessAddress}/api/auth/me`, { headers: { authorization: `Bearer ${androidSession.token}` } });
  assert.equal((await androidMe.json() as { id: string }).id, webSession.user.id);
  assert.equal(webSession.user.id, sharedUserId);
  assert.equal(Number((db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?').get(sharedUserId) as { count: number }).count), 2);
});
