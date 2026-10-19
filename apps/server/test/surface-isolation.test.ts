import assert from 'node:assert/strict';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openMigratedDatabase } from '../src/db/database.js';

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
  businessApp = await buildApp({ config, database: db, staticDir, surface: 'business', logger: false });
  adminApp = await buildApp({ config: { ...config, host: '127.0.0.1', port: 3001 }, database: db, staticDir, surface: 'admin', logger: false });
  const businessAddress = await businessApp.listen({ host: '127.0.0.1', port: 0 });
  const businessPort = Number(new URL(businessAddress).port);
  const adminAddress = await adminApp.listen({ host: '127.0.0.1', port: 0 });

  proxy = createServer((incoming, outgoing) => {
    const upstream = httpRequest({
      hostname: '127.0.0.1',
      port: businessPort,
      path: incoming.url,
      method: incoming.method,
      headers: { ...incoming.headers, host: `127.0.0.1:${businessPort}` },
    }, response => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    });
    upstream.on('error', () => { outgoing.statusCode = 502; outgoing.end(); });
    incoming.pipe(upstream);
  });
  const proxyPort = await listen(proxy);
  const proxyBase = `http://127.0.0.1:${proxyPort}`;

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
});
