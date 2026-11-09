import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { after, test } from 'node:test';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openMigratedDatabase } from '../src/db/database.js';
import { createSessionToken, digestSessionToken, newId } from '../src/security.js';
import { syncLatestGithubRelease, verifyCachedApk } from '../src/services/update-service.js';

test('authenticated update routes serve only the pinned APK cache after SHA-256 verification', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'theory-update-'));
  const cache = join(directory, 'updates');
  mkdirSync(cache);
  const apk = Buffer.from('isolated signed-apk fixture bytes');
  const apkSha256 = createHash('sha256').update(apk).digest('hex');
  writeFileSync(join(cache, 'theory-exam.apk'), apk);
  writeFileSync(join(cache, 'latest.json'), JSON.stringify({
    applicationId: 'com.theoryexam.mobile.dev', version: '1.0.1-dev.1', versionCode: 2,
    signerSha256: 'a'.repeat(64), apkSha256, releaseNotes: 'Isolated test update', apkFilename: 'theory-exam.apk',
  }));
  const db = openMigratedDatabase(join(directory, 'update.test.sqlite'));
  const userId = newId();
  const token = createSessionToken();
  db.prepare(`INSERT INTO users(id, username, password_hash, role, disabled, created_at, updated_at) VALUES (?, 'test-user', 'fixture-hash', 'user', 0, ?, ?)`)
    .run(userId, new Date().toISOString(), new Date().toISOString());
  db.prepare('INSERT INTO sessions(token_hash, user_id, created_at, expires_at, csrf_token) VALUES (?, ?, ?, ?, ?)')
    .run(digestSessionToken(token), userId, new Date().toISOString(), new Date(Date.now() + 60_000).toISOString(), randomBytes(32).toString('base64url'));
  const config = { ...loadConfig({ ...process.env, NODE_ENV: 'test', THEORY_DATABASE_PATH: join(directory, 'unused.test.sqlite'), THEORY_UPDATE_CACHE_DIR: cache }), updateCacheDirectory: cache };
  const app: FastifyInstance = await buildApp({ config, database: db, logger: false });
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  t.after(async () => { await app.close(); db.close(); rmSync(directory, { recursive: true, force: true }); });

  assert.equal((await fetch(`${address}/api/updates/latest`)).status, 401);
  const latest = await fetch(`${address}/api/updates/latest`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(latest.status, 200);
  assert.equal((await latest.json() as { version: string }).version, '1.0.1-dev.1');
  const download = await fetch(`${address}/api/updates/apk?path=../../../../etc/passwd`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('content-type'), 'application/vnd.android.package-archive');
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), apk);
  writeFileSync(join(cache, 'theory-exam.apk'), 'tampered');
  const tampered = await fetch(`${address}/api/updates/apk`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(tampered.status, 503);
  assert.equal((await tampered.json() as { error: { code: string } }).error.code, 'UPDATE_INTEGRITY_FAILED');
});

test('private GitHub sync accepts only fixed assets and rejects a manifest hash mismatch', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'theory-update-sync-'));
  const apk = Buffer.from('test apk asset');
  const apkSha256 = createHash('sha256').update(apk).digest('hex');
  const manifest = Buffer.from(JSON.stringify({ applicationId: 'com.theoryexam.mobile.dev', version: '1.0.1-dev.1', versionCode: 2, signerSha256: 'b'.repeat(64), apkSha256, releaseNotes: 'Test', apkFilename: 'theory-exam.apk' }));
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer isolated-token');
    if (url.endsWith('/releases/latest')) return Response.json({ assets: [{ id: 10, name: 'theory-exam.apk', size: apk.length }, { id: 11, name: 'theory-exam-update.json', size: manifest.length }, { id: 12, name: 'unrelated.txt', size: 1 }] });
    if (url.endsWith('/releases/assets/10')) return new Response(apk);
    if (url.endsWith('/releases/assets/11')) return new Response(manifest);
    throw new Error('Unexpected URL');
  };
  const result = await syncLatestGithubRelease({ repository: 'MilchstraBe-Endless10/theory-exam', token: 'isolated-token', cacheDirectory: directory, fetcher });
  assert.deepEqual(result, { version: '1.0.1-dev.1', versionCode: 2 });
  assert.equal(calls.length, 3);
  assert.equal(await verifyCachedApk(join(directory, 'theory-exam.apk'), apkSha256), true);
  rmSync(directory, { recursive: true, force: true });

  await assert.rejects(syncLatestGithubRelease({ repository: 'owner/repo', token: '', cacheDirectory: directory, fetcher }), /GITHUB_TOKEN is required/);
});
