import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const origin = new URL(process.env.P5_PUBLIC_WEB_ORIGIN || '');
const caFile = process.env.P5_PUBLIC_WEB_CA_FILE || '';
const captureRoot = process.env.P5_PUBLIC_WEB_SCREENSHOT_DIR ? resolve(process.env.P5_PUBLIC_WEB_SCREENSHOT_DIR) : '';
assert.equal(origin.protocol, 'https:', 'P5_PUBLIC_WEB_ORIGIN must use HTTPS.');
assert.ok(caFile, 'P5_PUBLIC_WEB_CA_FILE must point to the approved public Web CA certificate.');

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'theory-public-web-browser-'));
const browserHome = join(temporaryDirectory, 'home');
const nssDatabase = join(browserHome, '.pki', 'nssdb');
const browserProfile = join(temporaryDirectory, 'profile');
const pending = new Map();
const failures = [];
let browser;
let socket;
let commandId = 0;

function check(condition, message) { if (!condition) throw new Error(message); }

async function waitFor(checker, message, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { if (await checker()) return; } catch { /* wait for navigation or rendering */ }
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  throw new Error(message);
}

function cdp(method, params = {}) {
  const id = ++commandId;
  return new Promise((resolveResult, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
    pending.set(id, { resolve: resolveResult, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const response = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || 'Browser evaluation failed.');
  return response.result?.value;
}

async function navigate(path) {
  await cdp('Page.navigate', { url: new URL(path, origin).toString() });
  await waitFor(() => evaluate('document.readyState === "complete"'), `Page did not load: ${path}`);
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await new Promise(resolveWait => setTimeout(resolveWait, 150));
}

async function capture(name) {
  if (!captureRoot) return;
  const { data } = await cdp('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const path = join(captureRoot, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(data, 'base64'), { flag: 'wx' });
  console.log(`Screenshot: ${path}`);
}

async function cleanup() {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  if (browser?.exitCode === null) {
    browser.kill('SIGTERM');
    await new Promise(resolveExit => { browser.once('exit', resolveExit); setTimeout(resolveExit, 2500).unref(); });
  }
  rmSync(temporaryDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

try {
  mkdirSync(nssDatabase, { recursive: true });
  execFileSync(process.env.CERTUTIL_BIN || 'certutil', ['-N', '--empty-password', '-d', `sql:${nssDatabase}`], { stdio: 'pipe' });
  execFileSync(process.env.CERTUTIL_BIN || 'certutil', ['-A', '-n', 'Approved Theory Exam Web CA', '-t', 'C,,', '-d', `sql:${nssDatabase}`, '-i', caFile], { stdio: 'pipe' });

  browser = spawn(process.env.CHROMIUM_BIN || 'chromium', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=0',
    `--user-data-dir=${browserProfile}`, '--window-size=1536,1024', 'about:blank',
  ], { env: { ...process.env, HOME: browserHome }, stdio: 'ignore' });

  const portFile = join(browserProfile, 'DevToolsActivePort');
  let debugPort = '';
  await waitFor(async () => { try { debugPort = readFileSync(portFile, 'utf8').split('\n')[0]; return Boolean(debugPort); } catch { return false; } }, 'Chromium DevTools did not start.');
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  const target = targets.find(item => item.type === 'page');
  check(target, 'Chromium page target is missing.');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') failures.push(message.params.exceptionDetails.text || 'uncaught JavaScript exception');
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error'
      && message.params.entry.source !== 'network'
      && !message.params.entry.text.includes('status of 401 (Unauthorized)')) failures.push(message.params.entry.text);
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
      const response = message.params.response;
      const responsePath = new URL(response.url).pathname;
      const expected = (response.status === 401 && ['/api/auth/me', '/api/reviews/00000000-0000-4000-8000-000000000000/results'].includes(responsePath))
        || (response.status === 404 && ['/admin', '/api/admin/status'].includes(new URL(response.url).pathname));
      if (!expected) failures.push(`${response.status} ${response.url}`);
    }
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(message.id);
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result || {});
  });
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Log.enable');
  await cdp('Network.enable');

  await navigate('/');
  const apiState = await evaluate(`(async () => {
    const health = await fetch('/api/health').then(async response => ({ status: response.status, body: await response.json() }));
    const identity = await fetch('/api/auth/me', { credentials: 'include' });
    const adminApi = await fetch('/api/admin/status');
    const adminPage = await fetch('/admin');
    return { health, identity: identity.status, adminApi: adminApi.status, adminPage: adminPage.status };
  })()`);
  assert.equal(apiState.health.status, 200, 'The public Web Gateway health route is not healthy.');
  assert.equal(apiState.identity, 401, 'An unauthenticated browser unexpectedly has a session.');
  assert.equal(apiState.adminApi, 404, 'The public Web Gateway exposed a management API route.');
  assert.equal(apiState.adminPage, 404, 'The public Web Gateway exposed a management page.');
  console.log(`PASS strict HTTPS browser reached ${origin.origin}; health=200, unauthenticated=401, management routes=404`);

  const routes = [
    '/', '/start', '/connect', '/login', '/practice', '/practice/answer', '/practice/result', '/exams',
    '/exams/answer', '/exams/result', '/records', '/mistakes', '/mistakes/review',
    '/mistakes/history/00000000-0000-4000-8000-000000000000', '/favorites', '/me',
  ];
  const viewports = [
    { width: 1920, height: 1080, mobile: false },
    { width: 1536, height: 1024, mobile: false },
    { width: 1280, height: 800, mobile: false },
    { width: 768, height: 1024, mobile: true },
    { width: 390, height: 844, mobile: true },
    { width: 360, height: 800, mobile: true },
  ];
  for (const viewport of viewports) {
    await cdp('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 });
    for (const path of routes) {
      await navigate(path);
      const layout = await evaluate(`({ width: innerWidth, clientWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth, bodyText: document.body.innerText.trim().length,
        rootChildren: document.querySelector('#root')?.children.length ?? 0, path: location.pathname })`);
      check(layout.width === viewport.width, `${path} width mismatch at ${viewport.width}px.`);
      check(layout.documentWidth <= layout.clientWidth, `${path} has horizontal overflow at ${viewport.width}x${viewport.height}.`);
      check(layout.bodyText > 0 && layout.rootChildren > 0, `${path} rendered a blank application route.`);
      if (path === '/' && viewport.width === 1536) await capture('public-1536x1024-home.png');
      if (path === '/' && viewport.width === 390) await capture('public-390x844-home.png');
      if (path === '/login' && viewport.width === 390) await capture('public-390x844-login.png');
    }
    console.log(`PASS ${routes.length} deployed routes at ${viewport.width}x${viewport.height} without blank pages or horizontal overflow`);
  }

  check(failures.length === 0, failures.join('\n'));
  console.log('PASS public Chromium reported no uncaught JavaScript or unexpected HTTP errors; TLS verification remained enabled');
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  await cleanup();
}
