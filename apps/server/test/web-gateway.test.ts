import assert from 'node:assert/strict';
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { createWebGateway, validateWebApiTarget } from '../src/web-gateway.js';

const directory = mkdtempSync(join(tmpdir(), 'theory-web-gateway-'));
const staticDir = join(directory, 'dist');
mkdirSync(join(staticDir, 'assets'), { recursive: true });
writeFileSync(join(staticDir, 'index.html'), '<!doctype html><html><body><main id="root">web-ui</main></body></html>');
writeFileSync(join(staticDir, 'assets', 'app-abc123.js'), 'console.log("ready")');
const upstreamRequests: Array<{ url: string; headers: IncomingMessage['headers']; method: string }> = [];
let upstream: Server;
let gateway: Server;
let gatewayOrigin = '';

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve((server.address() as { port: number }).port);
    });
  });
}

function requestWithMethod(url: string, method: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { method }, response => { response.resume(); response.on('end', () => resolve(response.statusCode ?? 0)); });
    request.on('error', reject);
    request.end();
  });
}

function respond(request: IncomingMessage, response: ServerResponse): void {
  upstreamRequests.push({ url: request.url ?? '', headers: request.headers, method: request.method ?? '' });
  if ((request.url ?? '').startsWith('/api/admin')) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"danger":"admin upstream reached"}');
    return;
  }
  if ((request.url ?? '').startsWith('/api/auth/login')) {
    response.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'theory_session=fixture; HttpOnly; Secure; Path=/; SameSite=Strict' });
    response.end('{"user":{"id":"test-user"},"csrfToken":"csrf-fixture"}');
    return;
  }
  response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify({ status: 'ok', path: request.url }));
}

after(async () => {
  await Promise.all([gateway, upstream].map(server => new Promise<void>(resolve => server?.close(() => resolve()) ?? resolve())));
  rmSync(directory, { recursive: true, force: true });
});

test('gateway validates a loopback API target and serves only the production build', async () => {
  assert.throws(() => validateWebApiTarget('http://203.0.113.8:3000'), /loopback/);
  assert.throws(() => validateWebApiTarget('file:///etc/passwd'), /HTTP\(S\)/);
  assert.throws(() => validateWebApiTarget('http://user:pass@127.0.0.1:3000'), /credentials/);
  upstream = createServer(respond);
  const upstreamPort = await listen(upstream);
  gateway = createWebGateway({ staticDir, apiTarget: `http://127.0.0.1:${upstreamPort}` });
  gatewayOrigin = `http://127.0.0.1:${await listen(gateway)}`;

  const home = await fetch(gatewayOrigin);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /web-ui/);
  assert.equal(home.headers.get('cache-control'), 'no-cache');
  assert.equal(home.headers.get('content-security-policy')?.includes("connect-src 'self'"), true);
  assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(home.headers.get('x-frame-options'), 'DENY');

  const deepLink = await fetch(`${gatewayOrigin}/exams/result?exam=fixture`);
  assert.equal(deepLink.status, 200);
  assert.match(await deepLink.text(), /web-ui/);
  assert.equal(deepLink.headers.get('cache-control'), 'no-cache');

  const asset = await fetch(`${gatewayOrigin}/assets/app-abc123.js`);
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal((await fetch(`${gatewayOrigin}/assets/missing.js`)).status, 404);
  assert.equal((await fetch(`${gatewayOrigin}/.env`)).status, 404);
  assert.equal((await fetch(`${gatewayOrigin}/admin`)).status, 404);
  assert.equal((await fetch(`${gatewayOrigin}/api`)).status, 404);
});

test('same-origin API proxy preserves cookie, Origin, CSRF, and Set-Cookie without forwarding client IP claims', async () => {
  const login = await fetch(`${gatewayOrigin}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: gatewayOrigin },
    body: JSON.stringify({ username: 'fixture', password: 'fixture-only' }),
  });
  assert.equal(login.status, 200);
  assert.match(login.headers.get('set-cookie') ?? '', /HttpOnly; Secure; Path=\//);
  assert.equal((await login.json() as { csrfToken: string }).csrfToken, 'csrf-fixture');

  const health = await fetch(`${gatewayOrigin}/api/health`, {
    headers: {
      cookie: 'theory_session=fixture', origin: gatewayOrigin, 'x-csrf-token': 'csrf-fixture',
      'x-forwarded-for': '198.51.100.20', 'x-real-ip': '198.51.100.21',
    },
  });
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  const forwarded = upstreamRequests.at(-1)!;
  assert.equal(forwarded.headers.cookie, 'theory_session=fixture');
  assert.equal(forwarded.headers.origin, gatewayOrigin);
  assert.equal(forwarded.headers['x-csrf-token'], 'csrf-fixture');
  assert.equal(forwarded.headers['x-forwarded-for'], undefined);
  assert.equal(forwarded.headers['x-real-ip'], undefined);
});

test('admin paths, encoded variants, unknown API routes, and unsupported methods never reach upstream', async () => {
  const deniedPaths = [
    '/api/admin/status', '/api/admin/bootstrap', '/api/Admin/status', '/api/%61dmin/status',
    '/api/auth/bootstrap', '/api/auth/%2e%2e/admin/bootstrap', '/api//admin/status', '/API/admin/status',
    '/admin', '/%61dmin', '/api/unknown',
  ];
  const before = upstreamRequests.length;
  for (const path of deniedPaths) assert.equal((await fetch(`${gatewayOrigin}${path}`)).status, 404, `unexpected status for ${path}`);
  assert.equal(upstreamRequests.length, before);
  assert.equal(await requestWithMethod(`${gatewayOrigin}/api/health`, 'TRACE'), 404);
  assert.equal(upstreamRequests.length, before);
});
