import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const serverDir = fileURLToPath(new URL('..', import.meta.url));
const projectDir = resolve(serverDir, '../..');
const mobileDir = join(projectDir, 'apps', 'mobile');
const workbookPath = join(projectDir, 'local-input', '四级理论试题.xlsx');
const screenshotDirectory = process.env.P5_BROWSER_SCREENSHOT_DIR || process.env.P4_BROWSER_SCREENSHOT_DIR || process.env.P3_BROWSER_SCREENSHOT_DIR || process.env.P2_BROWSER_SCREENSHOT_DIR || process.env.P1_BROWSER_SCREENSHOT_DIR;
const screenshotDir = screenshotDirectory ? resolve(screenshotDirectory) : '';
const adminPassword = `P1BrowserAdmin-${randomBytes(16).toString('hex')}!`;
const userPassword = `P1BrowserUser-${randomBytes(16).toString('hex')}!`;
const changedUserPassword = `P1BrowserChanged-${randomBytes(16).toString('hex')}!`;
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'theory-exam-p1-browser-'));
const profileDirectory = mkdtempSync(join(tmpdir(), 'theory-exam-p1-chromium-'));
const processes = [];
const pending = new Map();
const failures = [];
const consoleErrors = [];
const responseFailures = [];
let browser;
let socket;
let testDatabase;
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

async function clickContaining(selector, label) {
  const clicked = await evaluate(`(() => { const element = [...document.querySelectorAll(${JSON.stringify(selector)})].find(item => item.innerText.includes(${JSON.stringify(label)})); if (!element) return false; element.click(); return true; })()`);
  assert.equal(clicked, true, `Missing ${selector} containing: ${label}`);
}

async function clickAnswer(letter, root = '.mobile-route') {
  const state = await evaluate(`(() => {
    const selector = ${JSON.stringify(root)} + ' .practice-live-screen .answer-option, ' + ${JSON.stringify(root)} + ' .question-screen .answer-option';
    const options = [...document.querySelectorAll(selector)];
    const element = options.find(item => item.querySelector('strong')?.innerText.trim() === ${JSON.stringify(`${letter}.`)});
    if (element) element.click();
    return { clicked: Boolean(element), options: options.map(item => item.querySelector('strong')?.innerText.trim() || '') };
  })()`);
  assert.equal(state.clicked, true, `Could not select option ${letter}; rendered labels: ${state.options.join(', ') || '(none)'}.`);
}

async function clickExamAnswer(letter) {
  const clicked = await evaluate(`(() => {
    const element = [...document.querySelectorAll('.exam-question-content .answer-option')]
      .find(item => item.querySelector('strong')?.innerText.trim() === ${JSON.stringify(`${letter}.`)});
    if (element) element.click();
    return Boolean(element);
  })()`);
  assert.equal(clicked, true, `Could not select exam option ${letter}.`);
}

async function clickReviewAnswer(letter) {
  const clicked = await evaluate(`(() => {
    const element = [...document.querySelectorAll('.mistake-question-card .answer-option')]
      .find(item => item.querySelector('strong')?.innerText.trim() === ${JSON.stringify(`${letter}.`)});
    if (element) element.click();
    return Boolean(element);
  })()`);
  assert.equal(clicked, true, `Could not select review option ${letter}.`);
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

async function capture(name, beyondViewport = true) {
  if (!screenshotDir) return;
  const result = await cdp('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: beyondViewport });
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
  const adminPort = await getFreePort();
  const vitePort = await getFreePort();
  const serverOrigin = `http://127.0.0.1:${serverPort}`;
  const adminOrigin = `http://127.0.0.1:${adminPort}`;
  const viteOrigin = `http://127.0.0.1:${vitePort}`;
  const databasePath = join(temporaryDirectory, 'browser.test.sqlite');
  const serverEnv = {
    ...process.env,
    NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(serverPort), ADMIN_PORT: String(adminPort),
    THEORY_DATABASE_PATH: databasePath, CORS_ORIGINS: `${viteOrigin},${adminOrigin}`,
  };
  execFileSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'migrate'], {
    cwd: serverDir, env: serverEnv, stdio: 'pipe',
  });
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
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error'
      && !message.params.entry.text.includes('status of 401 (Unauthorized)')) consoleErrors.push(message.params.entry.text);
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
      const response = message.params.response;
      const expectedUnauthenticatedProbe = response.status === 401 && new URL(response.url).pathname === '/api/auth/me';
      if (!expectedUnauthenticatedProbe) responseFailures.push(`${response.status} ${response.url}`);
      if (response.status >= 500) consoleErrors.push(`${response.status} ${response.url}`);
    }
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

  await navigate(`${adminOrigin}/admin`);
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
  await fill('.admin-import-form .admin-form-grid label:nth-child(1) input', 'level4');
  await fill('.admin-import-form .admin-form-grid label:nth-child(2) input', '四级理论题库');
  await click('form.admin-import-form button.admin-primary');
  try {
    await waitFor(async () => (await bodyText()).includes('导入预览'), 'Admin UI import preview did not appear.', 120000);
  } catch (error) {
    console.error('Admin import page state:', (await bodyText()).slice(0, 1200));
    console.error('Safe import form diagnostics:', JSON.stringify(await evaluate(`({ bankKey: document.querySelector('.admin-import-form .admin-form-grid label:nth-child(1) input')?.value,
      bankName: document.querySelector('.admin-import-form .admin-form-grid label:nth-child(2) input')?.value,
      fileSelected: Boolean(document.querySelector('.admin-file-label input[type=file]')?.files?.length) })`)));
    throw error;
  }
  const previewText = await bodyText();
  for (const expected of ['1283', '845', '38', '400']) assert.ok(previewText.includes(expected), `Admin UI preview omitted ${expected} questions.`);
  assert.ok(previewText.includes('0') && previewText.includes('缺少答案'), 'Admin UI preview did not show zero missing answers.');
  await click('button.admin-confirm');
  await waitFor(async () => (await bodyText()).includes('导入完成：1283 道题，版本 1'), 'Admin UI import confirmation did not finish.', 120000);
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
  let loginResolved = false;
  try {
    await waitFor(async () => evaluate('Boolean(document.querySelector(".password-gate-card") || document.querySelector(".login-content .form-error") || location.pathname === "/")'), 'Login did not resolve.', 8000);
    loginResolved = true;
  } catch { /* include safe UI/session state below */ }
  const firstLoginState = await evaluate('({ gate: Boolean(document.querySelector(".password-gate-card")), error: document.querySelector(".login-content .form-error")?.innerText ?? "", route: location.pathname, tokenStored: Boolean(localStorage.getItem("theory-exam.session-token") || sessionStorage.getItem("theory-exam.session-token.temporary")), cookieVisibleToJavaScript: document.cookie.includes("theory_session"), loginButtonDisabled: document.querySelector(".login-content button[type=submit]")?.disabled ?? null, body: document.body.innerText.slice(0, 260) })');
  assert.ok(loginResolved && firstLoginState.gate && !firstLoginState.tokenStored && !firstLoginState.cookieVisibleToJavaScript, `First-login gate or HttpOnly cookie session failed: ${JSON.stringify(firstLoginState)}`);
  await fill('.password-gate-card input[autocomplete="current-password"]', userPassword);
  await fill('.password-gate-card input[autocomplete="new-password"]', changedUserPassword);
  await fill('.password-gate-card label:nth-of-type(3) input', changedUserPassword);
  await click('.password-gate-card button[type="submit"]');
  await waitFor(async () => !(await evaluate('Boolean(document.querySelector(".password-gate-card"))')), 'First-login password change did not clear the gate.');
  try {
    await waitFor(async () => (await evaluate('location.pathname')) === '/' && (await bodyText()).includes('你好，p1-browser-learner') && (await bodyText()).includes('1283 道题'), 'Ordinary user login did not restore the account and imported bank on the learning home.');
  } catch (error) {
    const safeState = await evaluate(`(async () => {
      let banks = { status: 0, items: [] };
      try {
        const response = await fetch(${JSON.stringify(`${serverOrigin}/api/banks`)}, { credentials: 'include' });
        const payload = await response.json();
        banks = { status: response.status, items: Array.isArray(payload.items) ? payload.items.map(bank => ({ name: bank.name, questionCount: bank.activeVersion?.questionCount ?? null })) : [], errorCode: payload.error?.code || '' };
      } catch (reason) { banks.errorCode = reason instanceof Error ? reason.name : 'fetch-error'; }
      return { route: location.pathname, gate: Boolean(document.querySelector('.password-gate-card')), body: document.body.innerText.slice(0, 500), banks };
    })()`);
    console.error('Safe post-change home diagnostics:', JSON.stringify(safeState));
    throw error;
  }
  const homeText = await bodyText();
  assert.ok(homeText.includes('p1-browser-learner'), 'The authenticated ordinary user is not shown on the learning home.');
  const persistedClientValues = await evaluate('JSON.stringify([...Object.values(localStorage), ...Object.values(sessionStorage)])');
  assert.ok(!persistedClientValues.includes(userPassword) && !persistedClientValues.includes(changedUserPassword), 'Browser storage persisted a password.');
  await capture('390x844-ordinary-user-login.png');
  console.log('PASS browser server health check and ordinary user login');

  testDatabase = new DatabaseSync(databasePath);
  const browserSession = testDatabase.prepare(`SELECT s.token_hash AS tokenHash, s.remember
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.username = ?`).get('p1-browser-learner');
  assert.ok(browserSession, 'Ordinary browser session was not persisted.');
  await evaluate(`(() => {
    window.__p5RenewAck = false;
    window.addEventListener('theory-exam:session-change', event => {
      if (event.detail?.user?.username === 'p1-browser-learner') window.__p5RenewAck = true;
    }, { once: true });
    return true;
  })()`);
  const nearExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  testDatabase.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(nearExpiry, browserSession.tokenHash);
  await evaluate('document.dispatchEvent(new Event("visibilitychange"))');
  await waitFor(async () => Date.parse(testDatabase.prepare(`SELECT expires_at AS expiresAt FROM sessions s
    JOIN users u ON u.id = s.user_id WHERE u.username = ?`).get('p1-browser-learner').expiresAt) > Date.parse(nearExpiry)
    && await evaluate('window.__p5RenewAck === true')
    && (await bodyText()).includes('p1-browser-learner'), 'Browser visibility recovery did not renew and retain the authenticated session.');
  console.log('PASS browser visibility recovery renews the existing server session');

  await navigate(`${viteOrigin}/practice`);
  await waitFor(async () => (await evaluate('document.querySelectorAll("button.practice-choice").length')) === 7, 'Daily practice modes did not load.');
  await capture('390x844-practice-selection.png');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1536, height: 1024, deviceScaleFactor: 1, mobile: false });
  await navigate(`${viteOrigin}/practice`);
  await waitFor(async () => await evaluate('Boolean(document.querySelector(".desktop-practice-grid"))'), 'Desktop practice selection did not render.');
  await capture('1536x1024-practice-selection.png');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate(`${viteOrigin}/practice`);
  await waitFor(async () => (await evaluate('document.querySelectorAll("button.practice-choice").length')) === 7, 'Mobile practice modes did not reload.');
  await waitFor(async () => (await bodyText()).includes('当前题库：四级理论题库'), 'Practice selection did not finish loading the real bank.');
  await clickContaining('button.practice-choice', '单选题练习');
  try {
    await waitFor(async () => await evaluate('location.pathname === "/practice/answer" && Boolean(document.querySelector(".practice-live-screen[data-question-id] .answer-option"))'), 'A real server-backed practice question did not load.');
  } catch (error) {
    const safeAuthState = await evaluate(`(async () => {
      try {
        const response = await fetch(${JSON.stringify(`${serverOrigin}/api/auth/me`)}, { credentials: 'include' });
        const payload = await response.json();
        return { status: response.status, identity: payload.username || '', errorCode: payload.error?.code || '', serverAddressSaved: Boolean(localStorage.getItem('theory-exam.server-address')) };
      } catch (reason) { return { status: 0, identity: '', errorCode: reason instanceof Error ? reason.name : 'fetch-error', serverAddressSaved: Boolean(localStorage.getItem('theory-exam.server-address')) }; }
    })()`);
    console.error('Safe auth state after visibility renewal:', JSON.stringify(safeAuthState));
    const state = await evaluate('({ route: location.pathname, body: document.body.innerText.slice(0, 400), practiceScreen: Boolean(document.querySelector(".practice-live-screen")), optionCount: document.querySelectorAll(".mobile-route .answer-option").length })');
    console.error('Safe practice-load diagnostics:', JSON.stringify(state));
    throw error;
  }
  const sessionId = await evaluate('new URLSearchParams(location.search).get("session")');
  const firstQuestionId = await evaluate('document.querySelector(".practice-live-screen").dataset.questionId');
  const questionText = await bodyText();
  assert.ok(!questionText.includes('正确答案') && !questionText.includes('标准答案'), 'Practice question view exposed its correct answer before submission.');
  await capture('390x844-practice-question.png');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
  await capture('360x800-practice-question.png');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1536, height: 1024, deviceScaleFactor: 1, mobile: false });
  await navigate(`${viteOrigin}/practice/answer?session=${sessionId}&position=1`);
  await waitFor(async () => await evaluate('Boolean(document.querySelector(".desktop-practice-question .desktop-question-card"))'), 'Desktop live practice question did not render.');
  await capture('1536x1024-practice-question.png');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate(`${viteOrigin}/practice/answer?session=${sessionId}&position=1`);
  await waitFor(async () => await evaluate('Boolean(document.querySelector(".practice-live-screen[data-question-id] .answer-option"))'), 'Mobile live practice question did not reload.');
  const firstQuestion = testDatabase.prepare('SELECT answer_json FROM questions WHERE id = ?').get(firstQuestionId);
  assert.ok(firstQuestion, 'Practice question was not read from the imported SQLite bank.');
  const correctLetter = JSON.parse(firstQuestion.answer_json)[0];
  await clickAnswer(correctLetter);
  const attemptsBeforeFailure = Number(testDatabase.prepare('SELECT COUNT(*) AS count FROM practice_attempts WHERE practice_session_id = ?').get(sessionId).count);
  await evaluate(`(() => {
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (String(input).includes('/submit')) {
        window.fetch = original;
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return original(input, init);
    };
  })()`);
  await clickContaining('.practice-live-actions button', '提交答案');
  await waitFor(async () => (await evaluate('location.pathname === "/practice/answer"')) && (await bodyText()).includes('无法连接服务器'), 'A simulated network failure was incorrectly shown as a saved answer.');
  assert.equal(Number(testDatabase.prepare('SELECT COUNT(*) AS count FROM practice_attempts WHERE practice_session_id = ?').get(sessionId).count), attemptsBeforeFailure);
  assert.ok(!(await bodyText()).includes('回答正确'), 'A network failure displayed successful feedback without a server response.');
  await clickContaining('.practice-live-actions button', '提交答案');
  await waitFor(async () => (await evaluate('location.pathname === "/practice/result"')) && (await bodyText()).includes('回答正确'), 'Server did not return a successful correct-answer result.');
  assert.equal(Number(testDatabase.prepare('SELECT is_correct AS value FROM practice_attempts WHERE practice_session_id = ? AND question_id = ?').get(sessionId, firstQuestionId).value), 1);
  await capture('390x844-practice-correct-feedback.png');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
  await capture('360x800-practice-correct-feedback.png');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

  await clickContaining('.question-footer button', '下一题');
  await waitFor(async () => await evaluate(`location.pathname === "/practice/answer" && Number(new URLSearchParams(location.search).get("position")) === 2 && Boolean(document.querySelector(".practice-live-screen[data-question-id] .answer-option")) && document.querySelector(".practice-live-screen").dataset.questionId !== ${JSON.stringify(firstQuestionId)}`), 'Could not move to the next question in the session.');
  const secondQuestionId = await evaluate('document.querySelector(".practice-live-screen").dataset.questionId');
  const secondQuestion = testDatabase.prepare('SELECT answer_json, options_json FROM questions WHERE id = ?').get(secondQuestionId);
  assert.ok(secondQuestion, 'Second question was not read from the imported SQLite bank.');
  const secondCorrect = JSON.parse(secondQuestion.answer_json);
  const secondOptions = Object.keys(JSON.parse(secondQuestion.options_json));
  const wrongLetter = secondOptions.find(letter => !secondCorrect.includes(letter));
  assert.ok(wrongLetter, 'Second single-choice question has no distinct wrong option.');
  await clickAnswer(wrongLetter);
  await clickContaining('.practice-live-actions button', '提交答案');
  await waitFor(async () => (await evaluate('location.pathname === "/practice/result"')) && (await bodyText()).includes('回答错误'), 'Server did not return the wrong-answer feedback.');
  assert.equal(Number(testDatabase.prepare('SELECT is_correct AS value FROM practice_attempts WHERE practice_session_id = ? AND question_id = ?').get(sessionId, secondQuestionId).value), 0);
  await capture('390x844-practice-wrong-feedback.png');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
  await capture('360x800-practice-wrong-feedback.png');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1536, height: 1024, deviceScaleFactor: 1, mobile: false });
  await navigate(`${viteOrigin}/practice/result?session=${sessionId}&position=2`);
  await waitFor(async () => (await bodyText()).includes('回答错误') && await evaluate('Boolean(document.querySelector(".desktop-practice-question"))'), 'Desktop practice result did not render.');
  await capture('1536x1024-practice-wrong-feedback.png');
  await click('.desktop-practice-actions .button-text');
  await waitFor(async () => (await evaluate('location.pathname')) === '/practice' && await evaluate('Boolean(document.querySelector(".desktop-practice-resume"))'), 'Exited practice session could not be restored from selection.');
  console.log('PASS browser real Excel question delivery, correct/wrong grading, persisted feedback, and mobile/desktop result layouts');

  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate(`${viteOrigin}/mistakes`);
  await waitFor(async () => await evaluate('document.querySelector(".mistake-stats > div:first-child strong")?.innerText === "1"'), 'Mistake book did not display the server-created wrong answer.');
  assert.deepEqual(await evaluate('({ width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth })'), { width: 390, overflow: false }, '390x844 mistake screen overflowed horizontally.');
  await capture('390x844-p4-mistake-settings.png', false);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
  assert.deepEqual(await evaluate('({ width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth })'), { width: 360, height: 800, overflow: false }, '360x800 mistake screen overflowed horizontally.');
  await capture('360x800-p4-mistake-settings.png', false);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await click('.mistake-type-options button:nth-child(2)');
  await click('button.priority-setting');
  await evaluate('(() => { const select = document.querySelector(".mistake-options select"); select.value = "10"; select.dispatchEvent(new Event("change", { bubbles: true })); })()');
  assert.equal(await evaluate('document.querySelector(".mistake-type-options button:nth-child(2)").classList.contains("is-selected") && document.querySelector("button.priority-setting").getAttribute("aria-checked") === "true" && document.querySelector(".mistake-options select").value === "10"'), true, 'Review type, strategy, and quantity filters did not combine.');
  await capture('390x844-p4-mistake-settings-selected.png', false);
  await clickContaining('.mistake-footer .mobile-button', '开始复习');
  await waitFor(async () => await evaluate('location.pathname === "/mistakes/review" && Boolean(document.querySelector(".mistake-question-card .answer-option"))'), 'Real server-backed mistake review did not open.');
  assert.ok((await bodyText()).includes('按实际数量复习 1 道题'), 'Question shortage was not explained with the actual available count.');
  let reviewRoundId = await evaluate('new URLSearchParams(location.search).get("round")');
  let reviewQuestion = testDatabase.prepare(`SELECT q.id, q.answer_json, q.options_json FROM review_round_questions rq
    JOIN questions q ON q.id = rq.question_id WHERE rq.review_round_id = ? AND rq.position = 1`).get(reviewRoundId);
  assert.ok(reviewQuestion, 'Review round did not snapshot the wrong question.');
  const beforeReviewText = await bodyText();
  assert.ok(!beforeReviewText.includes('標準答案') && !beforeReviewText.includes('正确答案'), 'Review UI exposed the answer before submission.');
  await capture('390x844-p4-review-question.png', false);
  assert.deepEqual(await evaluate('({ width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth })'), { width: 390, height: 844, overflow: false }, '390x844 review question overflowed horizontally.');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1536, height: 1024, deviceScaleFactor: 1, mobile: false });
  await capture('1536x1024-p4-review-question.png', false);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
  assert.deepEqual(await evaluate('({ width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth })'), { width: 360, height: 800, overflow: false }, '360x800 review question overflowed horizontally.');
  await capture('360x800-p4-review-question.png', false);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const firstReviewAnswer = JSON.parse(reviewQuestion.answer_json)[0];
  await clickReviewAnswer(firstReviewAnswer);
  await clickContaining('.mistake-answer-actions button', '提交答案');
  await waitFor(async () => (await bodyText()).includes('巩固中 · 连续正确 1 个复习轮次'), 'First distinct review round did not advance mastery to reinforcing.');
  assert.equal(Number(testDatabase.prepare('SELECT consecutive_correct_rounds AS value FROM mistake_states WHERE question_id = ?').get(reviewQuestion.id).value), 1);
  await capture('390x844-p4-review-feedback-reinforcing.png', false);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
  await capture('360x800-p4-review-feedback-reinforcing.png', false);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1536, height: 1024, deviceScaleFactor: 1, mobile: false });
  assert.deepEqual(await evaluate('({ width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth })'), { width: 1536, height: 1024, overflow: false }, '1536x1024 review feedback overflowed horizontally.');
  await capture('1536x1024-p4-review-feedback-reinforcing.png', false);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await clickContaining('.mistake-answer-actions a', '查看本轮结果');
  await waitFor(async () => (await evaluate('location.pathname')).includes('/mistakes/history/'), 'First review history detail did not open.');
  await waitFor(async () => (await bodyText()).includes('本轮复习已完成'), 'First review history detail did not show completion.');
  await capture('390x844-p4-review-history-first-round.png', false);
  await navigate(`${viteOrigin}/mistakes`);
  await waitFor(async () => await evaluate('document.querySelector(".mistake-stats > div:nth-child(2) strong")?.innerText === "1"'), 'Mistake status did not update to reinforcing after first round.');
  await clickContaining('.mistake-footer .mobile-button', '开始复习');
  await waitFor(async () => await evaluate('location.pathname === "/mistakes/review" && Boolean(document.querySelector(".mistake-question-card .answer-option"))'), 'Second distinct review round did not open.');
  reviewRoundId = await evaluate('new URLSearchParams(location.search).get("round")');
  reviewQuestion = testDatabase.prepare(`SELECT q.id, q.answer_json, q.options_json FROM review_round_questions rq
    JOIN questions q ON q.id = rq.question_id WHERE rq.review_round_id = ? AND rq.position = 1`).get(reviewRoundId);
  assert.ok(reviewQuestion, 'Second review round did not snapshot the question.');
  await clickReviewAnswer(JSON.parse(reviewQuestion.answer_json)[0]);
  await clickContaining('.mistake-answer-actions button', '提交答案');
  await waitFor(async () => (await bodyText()).includes('已掌握 · 连续正确 2 个复习轮次'), 'Second distinct review round did not advance mastery to mastered.');
  const masteredState = testDatabase.prepare('SELECT mastery_status AS status, consecutive_correct_rounds AS count FROM mistake_states WHERE question_id = ?').get(reviewQuestion.id);
  assert.deepEqual({ status: masteredState.status, count: Number(masteredState.count) }, { status: 'mastered', count: 2 });
  await capture('390x844-p4-review-feedback-mastered.png', false);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
  await capture('360x800-p4-review-feedback-mastered.png', false);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1536, height: 1024, deviceScaleFactor: 1, mobile: false });
  await capture('1536x1024-p4-review-feedback-mastered.png', false);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await clickContaining('.mistake-answer-actions a', '查看本轮结果');
  await waitFor(async () => (await bodyText()).includes('本轮复习已完成'), 'Mastered review history did not load.');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1536, height: 1024, deviceScaleFactor: 1, mobile: false });
  await capture('1536x1024-p4-review-history.png', false);
  await navigate(`${viteOrigin}/mistakes`);
  await waitFor(async () => await evaluate('document.querySelector(".desktop-mistakes-page .mistake-stats > div:nth-child(3) strong")?.innerText === "1"'), 'Desktop mistake book did not show the saved mastered state.');
  assert.deepEqual(await evaluate('({ width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth })'), { width: 1536, height: 1024, overflow: false }, '1536x1024 desktop mistake screen overflowed horizontally.');
  await capture('1536x1024-p4-mistake-book.png', false);
  assert.equal(Number(testDatabase.prepare('SELECT COUNT(*) AS count FROM review_attempts WHERE question_id = ?').get(reviewQuestion.id).count), 2);
  console.log('PASS browser real review round recovery UI, answer feedback, two-round mastery, history, and mobile/desktop layouts');

  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate(`${viteOrigin}/me`);
  await click('.logout-button');
  await waitFor(async () => (await bodyText()).includes('已退出登录'), 'Server-confirmed logout did not complete.');
  await navigate(`${viteOrigin}/login`);
  await fill('.login-content input[autocomplete="username"]', 'p1-browser-learner');
  await fill('.login-content input[autocomplete="current-password"]', changedUserPassword);
  await click('.login-content form button[type="submit"]');
  await waitFor(async () => (await evaluate('location.pathname')) === '/' && (await bodyText()).includes('练习正确率'), 'Relogin did not restore the real progress dashboard.');
  await waitFor(async () => await evaluate('document.querySelectorAll(".mobile-stat-card strong")[0]?.innerText === "2" && document.querySelectorAll(".mobile-stat-card strong")[1]?.innerText === "50%"'), 'Mobile dashboard did not finish loading persisted learning statistics.');
  const touched = await evaluate('document.querySelectorAll(".mobile-stat-card strong")[0]?.innerText');
  assert.equal(touched, '2', 'Dashboard did not restore the number of distinct touched questions after relogin.');
  assert.ok((await bodyText()).includes('50%'), 'Dashboard accuracy does not reflect the saved right and wrong answers.');
  await capture('390x844-home-real-practice-progress.png');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
  await capture('360x800-home-real-practice-progress.png');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1536, height: 1024, deviceScaleFactor: 1, mobile: false });
  await navigate(`${viteOrigin}/`);
  await waitFor(async () => await evaluate('document.querySelectorAll(".stat-card")[0]?.querySelector(".stat-value")?.innerText === "2" && document.querySelectorAll(".stat-card")[1]?.querySelector(".stat-value")?.innerText === "50%" && document.querySelector(".sidebar-profile-label")?.innerText === "p1-browser-learner"'), 'Desktop home did not show restored practice statistics and account identity.');
  await capture('1536x1024-home-real-practice-progress.png');
  console.log('PASS browser exit/relogin restore, accurate progress statistics, and real mobile/desktop home layouts');

  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate(`${viteOrigin}/exams`);
  await waitFor(async () => (await bodyText()).includes('四级理论题库'), 'Exam settings did not load the selected bank.');
  const examText = await bodyText();
  for (const rule of ['180', '90 分钟', '100 分', '单选题：120 题（每题 0.5 分）', '多选题：20 题（每题 1 分）', '判断题：40 题（每题 0.5 分）']) {
    assert.ok(examText.includes(rule), `Exam settings omitted server rule: ${rule}.`);
  }
  await capture('390x844-exam-settings.png', false);
  await clickContaining('.exam-settings-screen .mobile-button', '开始模拟考试');
  await waitFor(async () => (await evaluate('location.pathname')) === '/exams/answer' && (await bodyText()).includes('1 / 180'), 'Mobile UI did not open a real 180-question exam.');
  const examId = await evaluate('new URLSearchParams(location.search).get("exam")');
  const firstSnapshot = testDatabase.prepare(`SELECT s.question_id AS questionId, s.answer_json AS answerJson, s.points
    FROM exam_question_snapshots s WHERE s.exam_session_id = ? AND s.position = 1`).get(examId);
  assert.ok(firstSnapshot, 'The browser-started exam did not persist its first question snapshot.');
  const safePayload = await evaluate(`(async () => {
    const response = await fetch(${JSON.stringify(`${serverOrigin}/api/exams/${examId}`)}, { credentials: 'include' });
    return JSON.stringify({ status: response.status, body: await response.json() });
  })()`);
  assert.equal(JSON.parse(safePayload).status, 200);
  assert.ok(!safePayload.includes('answer_json') && !safePayload.includes('correctAnswer') && !safePayload.includes('raw_answer'), 'In-progress browser API leaked an answer key.');
  assert.ok(!(await bodyText()).includes('标准答案'), 'In-progress exam UI showed a standard answer.');
  await capture('390x844-exam-answer-confirmed.png', false);

  const correctLetters = JSON.parse(firstSnapshot.answerJson);
  const correctExamLetter = correctLetters[0];
  await evaluate(`(() => {
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (String(input).includes('/api/exams/${examId}/questions/1/answer')) {
        window.fetch = original;
        return Promise.reject(new TypeError('offline test'));
      }
      return original(input, init);
    };
  })()`);
  await clickExamAnswer(correctExamLetter);
  await waitFor(async () => (await bodyText()).includes('网络中断'), 'Exam answer network failure was not shown as unsynchronized.');
  assert.equal(Number(testDatabase.prepare('SELECT COUNT(*) AS count FROM exam_answers WHERE exam_session_id = ?').get(examId).count), 0, 'Failed exam answer was incorrectly stored.');
  await capture('390x844-exam-answer-offline.png', false);
  await clickContaining('.exam-answer-footer button', '下一题');
  await waitFor(async () => (await bodyText()).includes('2 / 180'), 'Exam could not move to another question while the previous answer was offline.');
  const secondSnapshot = testDatabase.prepare(`SELECT answer_json AS answerJson, points FROM exam_question_snapshots
    WHERE exam_session_id = ? AND position = 2`).get(examId);
  await clickExamAnswer(JSON.parse(secondSnapshot.answerJson)[0]);
  await waitFor(async () => Number(testDatabase.prepare(`SELECT COUNT(*) AS count FROM exam_answers a
    JOIN exam_question_snapshots s ON s.id = a.snapshot_id
    WHERE a.exam_session_id = ? AND s.position = 2`).get(examId).count) === 1,
  'The second answer did not reach the server while the first answer remained offline.');
  assert.ok((await bodyText()).includes('网络中断'), 'A successful later answer hid an earlier failed synchronization.');
  assert.deepEqual(testDatabase.prepare(`SELECT s.position FROM exam_answers a JOIN exam_question_snapshots s
    ON s.id = a.snapshot_id WHERE a.exam_session_id = ? ORDER BY s.position`).all(examId).map(row => row.position), [2]);
  await clickContaining('.exam-sync button', '重试同步');
  await waitFor(async () => (await bodyText()).includes('答案已由服务器确认'), 'Exam answer retry did not show a server confirmation.');
  assert.deepEqual(testDatabase.prepare(`SELECT s.position FROM exam_answers a JOIN exam_question_snapshots s
    ON s.id = a.snapshot_id WHERE a.exam_session_id = ? ORDER BY s.position`).all(examId).map(row => row.position), [1, 2]);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
  await capture('360x800-exam-answer-confirmed.png', false);
  await clickContaining('.exam-answer-footer button', '答题卡');
  await waitFor(async () => await evaluate('document.querySelectorAll(".question-number-grid button").length') === 180, 'Exam answer sheet did not contain all 180 positions.');
  await capture('360x800-exam-answer-sheet.png', false);
  await clickContaining('.question-number-grid button', '180');
  await waitFor(async () => (await bodyText()).includes('180 / 180'), 'Exam answer sheet did not jump to the selected question.');
  await clickContaining('.exam-answer-footer button', '答题卡');
  await clickContaining('.question-number-grid button', '1');
  await waitFor(async () => (await bodyText()).includes('1 / 180'), 'Exam answer sheet could not return to question one.');
  for (const letter of correctLetters.slice(1)) {
    await clickExamAnswer(letter);
    await waitFor(async () => (await bodyText()).includes('答案已由服务器确认'), 'Multiple-choice answer did not sync after selection.');
  }
  await navigate(`${viteOrigin}/exams/answer?exam=${examId}&position=1`);
  await waitFor(async () => await evaluate('Boolean(document.querySelector(".exam-question-content .answer-option.is-selected"))'), 'Reload did not restore the server-confirmed exam answer.');
  await capture('390x844-exam-answer-restored.png', false);

  await navigate(`${viteOrigin}/me`);
  await click('.logout-button');
  await waitFor(async () => (await bodyText()).includes('已退出登录'), 'Logout during an active exam did not complete.');
  await navigate(`${viteOrigin}/login`);
  await fill('.login-content input[autocomplete="username"]', 'p1-browser-learner');
  await fill('.login-content input[autocomplete="current-password"]', changedUserPassword);
  await click('.login-content form button[type="submit"]');
  await waitFor(async () => (await evaluate('location.pathname')) === '/' && (await bodyText()).includes('p1-browser-learner'), 'Relogin during an active exam did not complete.');
  await navigate(`${viteOrigin}/exams/answer?exam=${examId}&position=1`);
  await waitFor(async () => await evaluate('Boolean(document.querySelector(".exam-question-content .answer-option.is-selected"))'), 'Active exam answer did not restore after logout and relogin.');
  await capture('390x844-exam-answer-relogin-restored.png', false);

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1536, height: 1024, deviceScaleFactor: 1, mobile: false });
  await navigate(`${viteOrigin}/exams/answer?exam=${examId}&position=1`);
  await waitFor(async () => await evaluate('Boolean(document.querySelector(".desktop-exam-answer .exam-question-content .answer-option.is-selected"))'), 'Desktop active exam did not restore the confirmed answer.');
  await capture('1536x1024-desktop-exam-answer.png', false);

  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await click('.exam-submit');
  await waitFor(async () => await evaluate('Boolean(document.querySelector(".exam-confirm-dialog"))'), 'Exam submit did not request a second confirmation.');
  await clickContaining('.exam-confirm-dialog button', '确认交卷');
  await waitFor(async () => (await evaluate('location.pathname')) === '/exams/result' && (await bodyText()).includes('试卷复盘'), 'Exam submit did not load the saved server result and review.');
  const savedResult = testDatabase.prepare('SELECT total_score AS score, unanswered_count AS unanswered FROM exam_results WHERE exam_session_id = ?').get(examId);
  const expectedScore = [firstSnapshot, secondSnapshot].reduce((score, snapshot, index) => {
    const position = index + 1;
    const answerRow = testDatabase.prepare(`SELECT a.answer_json AS answerJson FROM exam_answers a
      JOIN exam_question_snapshots s ON s.id = a.snapshot_id WHERE a.exam_session_id = ? AND s.position = ?`).get(examId, position);
    const submitted = answerRow ? JSON.parse(answerRow.answerJson).sort() : [];
    const correct = JSON.parse(snapshot.answerJson).sort();
    const exact = submitted.length === correct.length && submitted.every((letter, item) => letter === correct[item]);
    return score + (exact ? snapshot.points : 0);
  }, 0);
  assert.equal(savedResult.score, expectedScore);
  assert.equal(savedResult.unanswered, 178);
  await capture('390x844-exam-result.png', false);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
  await capture('360x800-exam-result.png', false);
  console.log('PASS mobile real exam creation, server answer sync/retry, 180-item answer sheet, reload recovery, confirmation, score, and review');

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1536, height: 1024, deviceScaleFactor: 1, mobile: false });
  await navigate(`${viteOrigin}/exams/result?exam=${examId}`);
  await waitFor(async () => await evaluate('Boolean(document.querySelector(".desktop-exam-result .exam-review-list"))'), 'Desktop saved exam result did not render.');
  await capture('1536x1024-desktop-exam-result.png', false);
  await navigate(`${viteOrigin}/exams`);
  await waitFor(async () => await evaluate('Boolean(document.querySelector(".desktop-exam-settings"))'), 'Desktop exam settings did not render.');
  await capture('1536x1024-desktop-exam-settings.png', false);
  await navigate(`${viteOrigin}/records`);
  await waitFor(async () => (await bodyText()).includes(`${expectedScore} 分`), 'Desktop exam history did not show the saved result.');
  await capture('1536x1024-desktop-exam-records.png', false);
  await navigate(`${viteOrigin}/`);
  await waitFor(async () => (await bodyText()).includes('四级理论题库'), 'Desktop dashboard did not load the imported bank from /api/banks.');
  const desktopHome = await bodyText();
  assert.ok(desktopHome.includes('180 题') && desktopHome.includes('90 分钟') && desktopHome.includes('满分 100 分'), 'Desktop dashboard did not render server exam rules.');
  assert.ok((await bodyText()).includes(`${expectedScore} 分`), 'Desktop dashboard did not display the latest saved mock-exam score.');
  await capture('1536x1024-desktop-home-with-bank.png', false);
  console.log('PASS desktop exam settings, score history, and latest real score render without changing the wide home layout');

  const countFormalData = () => Object.fromEntries(['practice_sessions', 'practice_attempts', 'favorites', 'mistake_states',
    'exam_sessions', 'exam_question_snapshots', 'exam_answers', 'exam_results'].map(table =>
    [table, Number(testDatabase.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count)]));
  const formalDataBeforePreview = countFormalData();
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate(`${viteOrigin}/exams?preview=1`);
  await waitFor(async () => (await bodyText()).includes('开发预览不会创建或提交真实考试'), 'Exam preview did not state that it is isolated from production data.');
  await clickContaining('.exam-settings-screen .mobile-button', '开始模拟考试');
  await waitFor(async () => (await evaluate('location.pathname === "/exams/answer"')) && (await bodyText()).includes('开发预览倒计时'), 'Development exam preview did not open.');
  await click('.exam-submit');
  await waitFor(async () => (await evaluate('location.pathname === "/exams/result"')) && (await bodyText()).includes('开发预览测试数据'), 'Development exam result fixture did not render.');
  assert.deepEqual(countFormalData(), formalDataBeforePreview, 'Development exam preview modified formal SQLite data.');
  await navigate(`${viteOrigin}/practice/answer?type=single&preview=1`);
  await waitFor(async () => (await evaluate('location.pathname === "/practice/answer"')) && (await bodyText()).includes('开发预览'), 'Development practice preview did not open.');
  await clickAnswer('A');
  await clickContaining('.question-footer button', '下一题');
  await waitFor(async () => (await evaluate('location.pathname === "/practice/result"')) && (await bodyText()).includes('回答'), 'Development preview feedback did not render.');
  assert.deepEqual(countFormalData(), formalDataBeforePreview, 'Development preview modified formal practice data.');
  console.log('PASS simulated network failure stays unsubmitted; practice and exam previews leave all formal SQLite rows unchanged');

  assert.deepEqual(consoleErrors, [], `Browser console/network errors: ${consoleErrors.join(' | ')}; HTTP failures: ${responseFailures.join(' | ')}`);
  console.log('P5 browser flow passed (P1–P5 regression).');
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
  for (const failure of failures) console.error(`FAIL ${failure}`);
  if (error instanceof Error) console.error(error.stack);
  process.exitCode = 1;
} finally {
  testDatabase?.close();
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  await Promise.all(processes.map(stop));
  rmSync(profileDirectory, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
  rmSync(temporaryDirectory, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
}
