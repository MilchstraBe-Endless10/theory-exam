import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = fileURLToPath(new URL('..', import.meta.url));
async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a local Web test port.');
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return String(address.port);
}

const webPort = process.env.WEB_PORT ?? await availablePort();
const origin = `http://127.0.0.1:${webPort}`;
const captureRoot = process.argv[2] ? resolve(process.argv[2]) : '';
const pending = new Map();
const failures = [];
let fixture;
let browser;
let profileDir;
let socket;
let commandId = 0;

function check(condition, message) { if (!condition) throw new Error(message); }

async function waitFor(checker, message, timeout = 15000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try { if (await checker()) return; } catch { /* next poll */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(message);
}

function cdp(method, params = {}) {
  const id = ++commandId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const response = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || 'Browser evaluation failed');
  return response.result?.value;
}

async function navigate(path) {
  await cdp('Page.navigate', { url: `${origin}${path}` });
  await waitFor(() => evaluate('document.readyState === "complete" && location.pathname === ' + JSON.stringify(path.split('?')[0])), `route did not open: ${path}`);
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
}

async function fill(selector, value) {
  const ok = await evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!input) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  check(ok, `missing field: ${selector}`);
}

async function capture(name) {
  if (!captureRoot) return;
  const { data } = await cdp('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const path = join(captureRoot, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(data, 'base64'), { flag: 'wx' });
}

async function cleanup() {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  for (const child of [browser, fixture]) {
    if (child?.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise(resolve => { child.once('exit', resolve); setTimeout(resolve, 2500).unref(); });
    }
  }
  if (profileDir) await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
}

try {
  fixture = spawn(join(serverDir, 'node_modules/.bin/tsx'), [join(serverDir, 'scripts/web-entry-fixture.ts')], {
    cwd: serverDir,
    env: { ...process.env, NODE_ENV: 'test', WEB_PORT: webPort },
    stdio: 'ignore',
  });
  fixture.on('error', error => failures.push(`fixture failed: ${error.message}`));
  await waitFor(async () => (await fetch(origin).catch(() => null))?.ok, 'isolated production Web fixture did not start');

  profileDir = await mkdtemp(join(tmpdir(), 'theory-web-browser-'));
  browser = spawn(process.env.CHROMIUM_BIN || 'chromium', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`, 'about:blank',
  ], { stdio: 'ignore' });
  browser.on('error', error => failures.push(`Chromium failed to start: ${error.message}`));
  const portFile = join(profileDir, 'DevToolsActivePort');
  let debugPort = '';
  await waitFor(async () => { try { debugPort = (await readFile(portFile, 'utf8')).split('\n')[0]; return Boolean(debugPort); } catch { return false; } }, 'Chromium DevTools did not start');
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  const target = targets.find(item => item.type === 'page');
  check(target, 'Chromium has no page target');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') failures.push(message.params.exceptionDetails.text || 'browser exception');
    if (!message.id) return;
    const entry = pending.get(message.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(message.id);
    message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result || {});
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Network.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

  await navigate('/login');
  await fill('input[autocomplete="username"]', 'p5-web-fixture');
  await fill('input[autocomplete="current-password"]', 'Fixture-only-P5-Password');
  await cdp('Runtime.evaluate', { expression: 'document.querySelector("form button[type=submit]").click()' });
  await waitFor(() => evaluate('location.pathname === "/"'), 'same-origin Web login did not complete');
  const sessionState = await evaluate(`(async () => {
    await new Promise(resolve => setTimeout(resolve, 250));
    const identity = await fetch('/api/auth/me', { credentials: 'include' }).then(response => response.json());
    const csrf = await fetch('/api/auth/csrf', { credentials: 'include' }).then(response => response.json());
    const badCsrf = await fetch('/api/auth/renew', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}' });
    const goodCsrf = await fetch('/api/auth/renew', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf.csrfToken }, body: '{}' });
    const blockedAdmin = await fetch('/api/admin/status', { credentials: 'include' });
    return { identity, cookieVisible: document.cookie.includes('theory_session'), local: Object.values(localStorage).join(' '), badCsrf: badCsrf.status, goodCsrf: goodCsrf.status, blockedAdmin: blockedAdmin.status };
  })()`);
  check(sessionState.identity.id === 'p5-web-fixture-user', 'browser identity did not come from the shared isolated API');
  check(!sessionState.cookieVisible, 'session cookie is visible to JavaScript');
  check(!/session-token|Bearer\s/i.test(sessionState.local), 'browser storage contains a persistent session token');
  check(sessionState.badCsrf === 403, 'cookie write without CSRF token was not rejected');
  check(sessionState.goodCsrf === 200, 'same-origin CSRF-protected session renewal failed');
  check(sessionState.blockedAdmin === 404, 'Web gateway exposed the admin API');
  console.log('PASS production build login uses same-origin HttpOnly cookie and CSRF checks');
  await capture('390x844/home-after-login.png');

  await navigate('/practice');
  check(await evaluate('!!document.querySelector(".mobile-screen")'), 'practice SPA route did not render');
  await cdp('Page.reload');
  await waitFor(() => evaluate('document.readyState === "complete" && location.pathname === "/practice"'), 'SPA route refresh failed');
  check(await evaluate('!!document.querySelector(".mobile-screen")'), 'refreshed practice route did not render');
  const mobileOverflow = await evaluate('document.documentElement.scrollWidth > innerWidth');
  check(!mobileOverflow, 'mobile Web page has horizontal overflow');
  await capture('390x844/practice-route-refresh.png');
  console.log('PASS mobile Web route refresh, same-origin API, and 390x844 layout');

  await cdp('Emulation.clearDeviceMetricsOverride');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1536, height: 1024, deviceScaleFactor: 1, mobile: false });
  await navigate('/');
  const desktop = await evaluate('({ width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth })');
  check(desktop.width === 1536 && desktop.height === 1024 && !desktop.overflow, 'desktop Web home did not fit 1536x1024');
  await capture('1536x1024/home-after-login.png');
  console.log('PASS desktop Web home at 1536x1024');

  const routeMatrix = [
    '/', '/start', '/connect', '/login', '/practice', '/practice/answer', '/practice/result',
    '/exams', '/exams/answer', '/exams/result', '/records', '/mistakes', '/mistakes/review',
    '/mistakes/history/layout-audit', '/favorites', '/me',
  ];
  const viewportMatrix = [
    { width: 1920, height: 1080, mobile: false },
    { width: 1536, height: 1024, mobile: false },
    { width: 1280, height: 800, mobile: false },
    { width: 768, height: 1024, mobile: true },
    { width: 390, height: 844, mobile: true },
    { width: 360, height: 800, mobile: true },
  ];
  for (const viewport of viewportMatrix) {
    await cdp('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 });
    for (const path of routeMatrix) {
      await navigate(path);
      const layout = await evaluate(`({
        path: location.pathname,
        width: innerWidth,
        clientWidth: document.documentElement.clientWidth,
        visualWidth: visualViewport?.width ?? null,
        documentWidth: document.documentElement.scrollWidth,
        bodyText: document.body.innerText.trim().length,
        rootChildren: document.querySelector('#root')?.children.length ?? 0,
      })`);
      if (path === '/mistakes' && viewport.width === 768) await capture('768x1024/mistakes-after-fix.png');
      check(layout.width === viewport.width, `${path} viewport width mismatch at ${viewport.width}px: inner=${layout.width}, client=${layout.clientWidth}, visual=${layout.visualWidth}`);
      check(layout.documentWidth <= layout.clientWidth, `${path} has horizontal overflow at ${viewport.width}x${viewport.height}: ${layout.documentWidth}px > ${layout.clientWidth}px`);
      check(layout.bodyText > 0 && layout.rootChildren > 0, `${path} rendered a blank page at ${viewport.width}x${viewport.height}`);
      if (path === '/' && (viewport.width === 1920 || viewport.width === 1280 || viewport.width === 768 || viewport.width === 360)) {
        await capture(`${viewport.width}x${viewport.height}/home-after-login.png`);
      }
    }
    console.log(`PASS ${routeMatrix.length} Web routes fit ${viewport.width}x${viewport.height} without horizontal overflow or blank screens`);
  }

  check(failures.length === 0, failures.join('\n'));
  console.log('PASS Chromium reported no uncaught JavaScript exceptions');
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  await cleanup();
}
