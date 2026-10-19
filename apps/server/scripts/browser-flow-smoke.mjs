import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const serverDir = fileURLToPath(new URL('..', import.meta.url));
const projectDir = resolve(serverDir, '../..');
const mobileDir = join(projectDir, 'apps', 'mobile');
const workbookPath = join(projectDir, 'local-input', '四级理论试题.xlsx');
const screenshotDir = process.env.P1_BROWSER_SCREENSHOT_DIR ? resolve(process.env.P1_BROWSER_SCREENSHOT_DIR) : '';
const adminPassword = `P1BrowserAdmin-${randomBytes(16).toString('hex')}!`;
const userPassword = `P1BrowserUser-${randomBytes(16).toString('hex')}!`;
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'theory-exam-p1-browser-'));
const profileDirectory = mkdtempSync(join(tmpdir(), 'theory-exam-p1-chromium-'));
const processes = [];
const pending = new Map();
const failures = [];
const consoleErrors = [];
let browser;
let socket;
let commandId = 0;

function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('Could not reserve a local test port.'));
      server.close(() => resolvePort(address.port));
    });
  });
}

function start(command, args, cwd, env) {
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const output = [];
  child.stdout.on('data', chunk => output.push(chunk.toString()));
  child.stderr.on('data', chunk => output.push(chunk.toString()));
  child.on('error', error => failures.push(`${command} failed: ${error.message}`));
  processes.push(child);
  return { child, output };
}

async function waitFor(checker, message, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if (await checker()) return; } catch { /* wait for the service or page */ }
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  throw new Error(message);
}

function cdp(method, params = {}) {
  const id = ++commandId;
  return new Promise((resolveResult, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve: resolveResult, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed.');
  return result.result?.value;
}

async function navigate(url) {
  await cdp('Page.navigate', { url });
  await waitFor(() => evaluate('document.readyState === "complete"'), `Page did not load: ${url}`);
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
}

async function click(selector) {
  const clicked = await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; element.click(); return true; })()`);
  assert.equal(clicked, true, `Missing control: ${selector}`);
}

async function fill(selector, value) {
  const filled = await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.value === ${JSON.stringify(value)};
  })()`);
  assert.equal(filled, true, `Could not fill input: ${selector}`);
}

async function bodyText() {
  return evaluate('document.body.innerText');
}

async function capture(name) {
  if (!screenshotDir) return;
  const result = await cdp('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: true });
  const path = join(screenshotDir, name);
  mkdirSync(screenshotDir, { recursive: true });
  writeFileSync(path, Buffer.from(result.data, 'base64'), { flag: 'wx' });
  console.log(`Screenshot: ${path}`);
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise(resolveStop => {
    child.once('exit', resolveStop);
    child.kill('SIGTERM');
    setTimeout(resolveStop, 1800).unref();
  });
}

try {
  assert.ok(readFileSync(workbookPath).length > 0, 'The local test workbook is missing.');
  const serverPort = await getFreePort();
  const vitePort = await getFreePort();
  const serverOrigin = `http://127.0.0.1:${serverPort}`;
  const viteOrigin = `http://127.0.0.1:${vitePort}`;
  const databasePath = join(temporaryDirectory, 'browser.test.sqlite');
  const serverEnv = {
    ...process.env,
    NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(serverPort),
    THEORY_DATABASE_PATH: databasePath, CORS_ORIGINS: viteOrigin,
  };
  const serverRun = start(process.execPath, ['--import', 'tsx', 'src/server.ts'], serverDir, serverEnv);
  await waitFor(async () => (await fetch(`${serverOrigin}/api/health`).catch(() => null))?.ok, 'Fastify test server did not start.');

  const viteEnv = { ...process.env, VITE_API_PROXY_TARGET: serverOrigin };
  const viteRun = start(process.execPath, [join(mobileDir, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], mobileDir, viteEnv);
  await waitFor(async () => (await fetch(`${viteOrigin}/admin`).catch(() => null))?.ok, 'Vite test server did not start.');

  const chromium = process.env.CHROMIUM_BIN || 'chromium';
  browser = start(chromium, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=0', `--user-data-dir=${profileDirectory}`, '--window-size=1536,1024', 'about:blank'], process.cwd(), process.env).child;
  const portFile = join(profileDirectory, 'DevToolsActivePort');
  let debugPort = '';
  await waitFor(async () => {
    try { debugPort = readFileSync(portFile, 'utf8').split('\n')[0]; return Boolean(debugPort); } catch { return false; }
  }, 'Chromium did not start its local DevTools endpoint.');
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  const target = targets.find(item => item.type === 'page');
  assert.ok(target, 'Chromium page target is missing.');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') consoleErrors.push(message.params.exceptionDetails.text);
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') consoleErrors.push(message.params.entry.text);
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 500) consoleErrors.push(`${message.params.response.status} ${message.params.response.url}`);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timeout);
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
  await cdp('DOM.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1536, height: 1024, deviceScaleFactor: 1, mobile: false });

  await navigate(`${viteOrigin}/`);
  const emptyHome = await bodyText();
  assert.ok(emptyHome.includes('请连接并登录本地服务'), 'Empty dashboard did not explain how to load real banks.');
  for (const fakeValue of ['845', '38', '400', '180 题', '90 分钟', '四级理论题库']) {
    assert.ok(!emptyHome.includes(fakeValue), `Empty dashboard exposed hardcoded bank data: ${fakeValue}.`);
  }
  await capture('1536x1024-desktop-home-empty.png');
  console.log('PASS desktop dashboard shows a truthful empty state before a bank is imported');

  await navigate(`${viteOrigin}/admin`);
  await waitFor(async () => (await bodyText()).includes('初始化本机管理员'), 'Admin bootstrap form did not appear.');
  await fill('.admin-auth-card input[autocomplete="username"]', 'p1-browser-admin');
  await fill('.admin-auth-card input[type="password"]', adminPassword);
  await click('.admin-auth-card button.admin-primary');
  await waitFor(async () => (await bodyText()).includes('管理员会话已认证'), 'Admin bootstrap did not complete.');

  await fill('.admin-create-user input:first-of-type', 'p1-browser-learner');
  await fill('.admin-create-user input[type="password"]', userPassword);
  await click('.admin-create-user button.admin-primary');
  await waitFor(async () => (await bodyText()).includes('p1-browser-learner'), 'Admin UI did not create the ordinary user.');

  const document = await cdp('DOM.getDocument', { depth: -1 });
  const input = await cdp('DOM.querySelector', { nodeId: document.root.nodeId, selector: '.admin-file-label input[type="file"]' });
  assert.ok(input.nodeId, 'Admin UI file input is missing.');
  await cdp('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [workbookPath] });
  await click('form.admin-import-form button.admin-primary');
  await waitFor(async () => (await bodyText()).includes('导入预览'), 'Admin UI import preview did not appear.', 60000);
  const previewText = await bodyText();
  for (const expected of ['1283', '845', '38', '400']) assert.ok(previewText.includes(expected), `Admin UI preview omitted ${expected} questions.`);
  assert.ok(previewText.includes('0') && previewText.includes('缺少答案'), 'Admin UI preview did not show zero missing answers.');
  await click('button.admin-confirm');
  await waitFor(async () => (await bodyText()).includes('导入完成：1283 道题，版本 1'), 'Admin UI import confirmation did not finish.', 60000);
  assert.ok((await bodyText()).includes('单选 845 · 多选 38 · 判断 400'), 'Imported bank counts are not shown in the admin UI.');
  await capture('admin-import-success.png');
  console.log('PASS browser admin bootstrap, account creation, real Excel preview (1283/845/38/400), and confirmation');

  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate(`${viteOrigin}/connect`);
  await click('.connect-screen .connect-option:nth-of-type(2)');
  await fill('#server-address', serverOrigin);
  await click('.connect-manual button');
  await waitFor(async () => (await bodyText()).includes('服务器连接成功，可以登录。'), 'Mobile UI could not verify the actual server health endpoint.');
  await click('.connect-screen a.auth-footnote');
  await waitFor(async () => (await evaluate('location.pathname')) === '/login', 'Connect UI did not navigate to login.');
  await fill('.login-content input[autocomplete="username"]', 'p1-browser-learner');
  await fill('.login-content input[autocomplete="current-password"]', userPassword);
  await click('.login-content form button[type="submit"]');
  await waitFor(async () => (await evaluate('location.pathname')) === '/', 'Ordinary user login did not return to the learning home.');
  const homeText = await bodyText();
  assert.ok(homeText.includes('p1-browser-learner'), 'The authenticated ordinary user is not shown on the learning home.');
  await waitFor(async () => (await bodyText()).includes('1283 道题'), 'Learning home did not load the imported bank from /api/banks.');
  await capture('390x844-ordinary-user-login.png');
  console.log('PASS browser server health check and ordinary user login');

  await navigate(`${viteOrigin}/exams`);
  await waitFor(async () => (await bodyText()).includes('四级理论题库'), 'Exam settings did not load the selected bank.');
  const examText = await bodyText();
  for (const rule of ['180', '90 分钟', '100 分', '单选题：120 题（每题 0.5 分）', '多选题：20 题（每题 1 分）', '判断题：40 题（每题 0.5 分）']) {
    assert.ok(examText.includes(rule), `Exam settings omitted server rule: ${rule}.`);
  }
  assert.ok(examText.includes('考试组卷与提交功能将在后续阶段接入'), 'P1 exam settings implied that a formal exam can already start.');
  await capture('390x844-exam-settings-from-server.png');
  console.log('PASS mobile exam settings render the imported bank and server-provided rules');

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1536, height: 1024, deviceScaleFactor: 1, mobile: false });
  await navigate(`${viteOrigin}/`);
  await waitFor(async () => (await bodyText()).includes('四级理论题库'), 'Desktop dashboard did not load the imported bank from /api/banks.');
  const desktopHome = await bodyText();
  assert.ok(desktopHome.includes('180 题') && desktopHome.includes('90 分钟') && desktopHome.includes('满分 100 分'), 'Desktop dashboard did not render server exam rules.');
  await capture('1536x1024-desktop-home-with-bank.png');
  console.log('PASS desktop dashboard renders bank metadata without changing its wide layout');

  assert.deepEqual(consoleErrors, [], `Browser console/network errors: ${consoleErrors.join(' | ')}`);
  console.log('P1 browser smoke passed.');
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
  for (const failure of failures) console.error(`FAIL ${failure}`);
  if (error instanceof Error) console.error(error.stack);
  process.exitCode = 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  await Promise.all(processes.map(stop));
  rmSync(profileDirectory, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
  rmSync(temporaryDirectory, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
}
