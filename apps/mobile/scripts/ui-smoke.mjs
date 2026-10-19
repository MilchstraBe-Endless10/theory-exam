import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = fileURLToPath(new URL('..', import.meta.url));
const origin = 'http://127.0.0.1:5174';
const preview = '?preview=1';
const captureRoot = process.argv[2] ? resolve(process.argv[2]) : '';
const failures = [];
let passed = 0;
let server;
let browser;
let socket;
let profileDir;
const pending = new Map();
const consoleErrors = [];
let commandId = 0;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function pass(message) {
  passed += 1;
  console.log(`PASS ${message}`);
}

async function waitFor(checker, message, timeout = 12000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try { if (await checker()) return; } catch { /* wait for the next browser event */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(message);
}

function cdp(method, params = {}) {
  const id = ++commandId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 8000);
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
  await waitFor(() => evaluate('document.readyState === "complete" && location.pathname === ' + JSON.stringify(path.split('?')[0]), `route did not open: ${path}`));
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
}

async function click(selector) {
  const found = await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; element.click(); return true; })()`);
  check(found, `missing clickable element: ${selector}`);
}

async function fill(selector, value) {
  const found = await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.value === ${JSON.stringify(value)};
  })()`);
  check(found, `could not fill input: ${selector}`);
}

async function capture(relativePath) {
  if (!captureRoot) return;
  const { data } = await cdp('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const path = join(captureRoot, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(data, 'base64'), { flag: 'wx' });
}

async function cleanup() {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  const stop = process => process ? new Promise(resolve => {
    if (process.exitCode !== null) return resolve();
    process.once('exit', resolve);
    process.kill('SIGTERM');
    setTimeout(resolve, 1500).unref();
  }) : Promise.resolve();
  await Promise.all([stop(browser), stop(server)]);
  if (profileDir) await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
}

try {
  server = spawn(process.execPath, [join(appDir, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5174', '--strictPort'], { cwd: appDir, stdio: 'ignore' });
  await waitFor(async () => (await fetch(origin)).ok, 'Vite dev server did not start');
  profileDir = await mkdtemp(join(tmpdir(), 'theory-exam-ui-'));
  browser = spawn(process.env.CHROMIUM_BIN || 'chromium', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, 'about:blank',
  ], { stdio: 'ignore' });
  browser.on('error', error => failures.push(`Chromium failed to start: ${error.message}`));
  const portFile = join(profileDir, 'DevToolsActivePort');
  let debugPort = '';
  await waitFor(async () => {
    try { debugPort = (await readFile(portFile, 'utf8')).split('\n')[0]; return Boolean(debugPort); } catch { return false; }
  }, 'Chromium remote debugging did not start');
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  const target = targets.find(item => item.type === 'page');
  check(target, 'Chromium has no page target');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') consoleErrors.push(message.params.exceptionDetails.text);
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') consoleErrors.push(`${message.params.entry.url || ''} ${message.params.entry.text}`);
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) consoleErrors.push(`${message.params.response.status} ${message.params.response.url}`);
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
  await cdp('Log.enable');
  await cdp('Network.enable');

  const routes = [
    ['01-start', '/start'], ['02-connect', '/connect'], ['03-login', '/login'], ['04-home', '/'],
    ['05-practice-list', '/practice'], ['06-practice-answer', '/practice/answer?type=single'],
    ['07-practice-result', '/practice/result?answer=A'], ['08-exam-settings', '/exams'],
    ['09-exam-answer', '/exams/answer'], ['10-exam-result', '/exams/result'],
    ['11-mistakes', '/mistakes'], ['12-profile', '/me'],
  ];
  for (const size of [{ width: 390, height: 844 }, { width: 360, height: 800 }]) {
    await cdp('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: 1, mobile: true });
    for (const [name, route] of routes) {
      await navigate(`${route}${route.includes('?') ? '&' : '?'}preview=1`);
      const result = await evaluate('({ width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth, screen: !!document.querySelector(".mobile-screen") })');
      check(result.width === size.width && result.height === size.height, `wrong viewport at ${route}: ${result.width}x${result.height}`);
      check(result.screen, `missing mobile screen at ${route}`);
      check(!result.overflow, `horizontal overflow at ${route} (${size.width}x${size.height})`);
      if (route === '/start') {
        const splash = await evaluate('(() => { const screen = document.querySelector(".start-screen"); const style = getComputedStyle(screen); return { height: screen.getBoundingClientRect().height, image: style.backgroundImage, size: style.backgroundSize, indicatorHeight: getComputedStyle(screen, "::after").height }; })()');
        check(splash.height >= size.height - 1, `splash background does not fill the viewport at ${size.width}x${size.height}`);
        check(splash.image.includes('splash-mountain-road-v2.png') && splash.size === 'cover', `splash artwork is not covering the viewport at ${size.width}x${size.height}`);
        check(parseFloat(splash.indicatorHeight) >= 4, `splash safe-area indicator is missing at ${size.width}x${size.height}`);
      }
      await capture(`${size.width}x${size.height}/${name}.png`);
    }
    await navigate('/practice/answer?type=single&long=1&preview=1');
    const longLayout = await evaluate('({ width: document.documentElement.scrollWidth, viewport: innerWidth, questionHeight: document.querySelector(".question-content h2").getBoundingClientRect().height, optionHeight: document.querySelector(".answer-option > span:last-child").getBoundingClientRect().height })');
    check(longLayout.width <= longLayout.viewport, `long practice question caused horizontal overflow at ${size.width}x${size.height}`);
    check(longLayout.questionHeight > 24 && longLayout.optionHeight > 20, `long question or option did not wrap at ${size.width}x${size.height}`);
    await capture(`${size.width}x${size.height}/06-practice-answer-long.png`);
    pass(`12 routes render without horizontal overflow at ${size.width}x${size.height}`);
  }

  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate(`/${preview}`);
  await click('a.mobile-link[href="/practice?preview=1"]');
  await waitFor(() => evaluate('location.pathname === "/practice"'), 'mobile practice navigation failed');
  pass('mobile bottom navigation opens daily practice');
  for (const [selector, path] of [
    ['a.mobile-link[href="/exams?preview=1"]', '/exams'],
    ['a.mobile-link[href="/mistakes?preview=1"]', '/mistakes'],
    ['a.mobile-link[href="/me?preview=1"]', '/me'],
  ]) {
    await navigate(`/${preview}`);
    await click(selector);
    await waitFor(() => evaluate('location.pathname === ' + JSON.stringify(path)), `mobile navigation failed: ${path}`);
  }
  pass('all five bottom navigation routes open their destination');

  await navigate(`/start${preview}`);
  await click('.start-footer a');
  await waitFor(() => evaluate('location.pathname === "/connect"'), 'start button did not open server connection');
  await click('button.connect-option:not([aria-expanded])');
  check((await evaluate('document.body.innerText')).includes('扫码功能将在 Android 相机权限接入后提供'), 'QR connection did not explain its current limitation');
  await click('a.back-button');
  await waitFor(() => evaluate('location.pathname === "/start"'), 'connection back button did not return to start');
  pass('start and server connection navigation work; QR preview does not claim a connection');

  await navigate(`/login${preview}`);
  await click('button[aria-label="显示密码"]');
  check(await evaluate('document.querySelector("input[autocomplete=current-password]").type === "text"'), 'password visibility toggle did not reveal the password');
  await click('button[aria-label="隐藏密码"]');
  check(await evaluate('document.querySelector("input[autocomplete=current-password]").type === "password"'), 'password visibility toggle did not conceal the password');
  await click('.remember-row input');
  check(await evaluate('document.querySelector(".remember-row input").checked === false'), 'remember-me checkbox did not toggle');
  await fill('input[autocomplete="username"]', 'preview-learner');
  await fill('input[autocomplete="current-password"]', 'preview-password');
  await click('button[type="submit"]');
  check((await evaluate('document.body.innerText')).includes('开发预览不会登录真实账号'), 'preview login did not clearly stay isolated from real accounts');
  check(!(await evaluate('document.body.innerText')).includes('登录成功'), 'preview login claimed success without a server');
  check(!(await evaluate('document.body.innerText')).includes('注册'), 'login exposes a self-registration entry');
  await click('a.back-button');
  await waitFor(() => evaluate('location.pathname === "/connect"'), 'login back button did not return to server connection');
  pass('login keeps the session unauthenticated and has no registration entry');

  await navigate(`/connect${preview}`);
  await click('button.connect-option[aria-expanded]');
  check(await evaluate('!!document.querySelector("#server-address")'), 'manual server address form did not open');
  check(await evaluate('document.querySelector(".connect-manual .mobile-button").getBoundingClientRect().bottom <= innerHeight'), 'manual server connect button is clipped on mobile');
  await capture('390x844/02-connect-manual-expanded.png');
  await evaluate('(() => { const input = document.querySelector("#server-address"); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; setter.call(input, "http://example.com"); input.dispatchEvent(new Event("input", { bubbles: true })); })()');
  await click('.connect-manual .mobile-button');
  check((await evaluate('document.body.innerText')).includes('公网地址须使用 HTTPS'), 'public HTTP address was not rejected');
  await evaluate('(() => { const input = document.querySelector("#server-address"); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; setter.call(input, "http://192.168.1.10:3000"); input.dispatchEvent(new Event("input", { bubbles: true })); })()');
  await click('.connect-manual .mobile-button');
  check((await evaluate('document.body.innerText')).includes('未发起连接请求'), 'preview connection did not stay isolated from the server');
  pass('manual connection expands, validates addresses, and does not claim a server connection');

  await navigate(`/practice${preview}`);
  await click('.practice-choice:nth-child(3)');
  await waitFor(() => evaluate('location.pathname === "/practice/answer"'), 'single-choice practice did not open its question');
  check(new URLSearchParams(await evaluate('location.search')).get('type') === 'single', 'practice choice did not preserve question type');
  await click('a.back-button');
  await waitFor(() => evaluate('location.pathname === "/practice"'), 'practice back button did not return to mode selection');
  await navigate(`/practice/answer?type=single&preview=1`);
  await click('button[aria-label="收藏题目"]');
  check(await evaluate('document.querySelector("button[aria-label=取消收藏]")?.classList.contains("is-saved")'), 'favorite button did not enter its selected state');
  await click('button[aria-label="取消收藏"]');
  check(await evaluate('!!document.querySelector("button[aria-label=收藏题目]")'), 'favorite button did not clear its selected state');
  await click('.answer-option:nth-child(1)');
  await click('.answer-option:nth-child(2)');
  check(await evaluate('document.querySelectorAll(".answer-option.is-selected").length === 1'), 'single choice allowed multiple selected answers');
  await navigate(`/practice/answer?type=multiple&preview=1`);
  await click('.answer-option:nth-child(2)');
  await click('.answer-option:nth-child(3)');
  check(await evaluate('document.querySelectorAll(".answer-option.is-selected").length === 2'), 'multiple choice did not retain two selections');
  await click('.question-footer .mobile-button:not(.is-secondary)');
  await waitFor(() => evaluate('location.pathname === "/practice/result"'), 'practice answer did not route to feedback');
  check(new URLSearchParams(await evaluate('location.search')).get('answer') === 'B,C', 'practice result did not carry selected options');
  await navigate(`/practice/answer?type=truefalse&preview=1`);
  check(await evaluate('document.querySelectorAll(".answer-option").length === 2'), 'judgement question should show two boolean options');
  await click('.answer-option:nth-child(2)');
  check(await evaluate('document.querySelectorAll(".answer-option.is-selected").length === 1'), 'judgement answer selection did not work');
  await navigate(`/practice/answer?type=single&long=1&preview=1`);
  const longLayout = await evaluate('({ width: document.documentElement.scrollWidth, viewport: innerWidth, questionHeight: document.querySelector(".question-content h2").getBoundingClientRect().height, optionHeight: document.querySelector(".answer-option > span:last-child").getBoundingClientRect().height })');
  check(longLayout.width <= longLayout.viewport, 'long practice question caused horizontal overflow');
  check(longLayout.questionHeight > 24 && longLayout.optionHeight > 20, 'long question or option did not wrap on mobile');
  pass('single, multiple and judgement selection, feedback navigation, and long text wrapping work');

  await navigate(`/exams${preview}`);
  const examRules = await evaluate('document.body.innerText');
  for (const rule of ['180', '90 分钟', '100 分', '120 题', '20 题', '40 题']) check(examRules.includes(rule), `exam settings omitted fixed rule: ${rule}`);
  await click('.settings-footer .mobile-button');
  await waitFor(() => evaluate('location.pathname === "/exams/answer"'), 'preview exam entry did not open the exam screen');
  await waitFor(() => evaluate('!!document.querySelector(".timer-display strong")'), 'exam timer did not render after starting the preview');
  const timerBefore = await evaluate('document.querySelector(".timer-display strong").textContent');
  check(!(await evaluate('document.body.innerText')).includes('暂停'), 'exam page exposes a pause action');
  await click('.exam-question-tools button');
  check(await evaluate('document.querySelector(".exam-question-tools button").classList.contains("is-marked")'), 'exam question mark did not toggle');
  await click('.exam-answer-footer .next-question');
  check((await evaluate('document.querySelector(".exam-question-tools span").textContent')).startsWith('37'), 'next exam question did not advance');
  await click('.exam-answer-footer button:first-child');
  check((await evaluate('document.querySelector(".exam-question-tools span").textContent')).startsWith('36'), 'previous exam question did not return');
  await evaluate('new Promise(resolve => setTimeout(resolve, 1200))');
  const timerAfter = await evaluate('document.querySelector(".timer-display strong").textContent');
  check(timerBefore !== timerAfter, 'preview countdown did not continue');
  check(await evaluate('document.querySelector(".exam-submit").textContent.includes("交卷")'), 'exam submit action is missing');
  await click('.question-panel-trigger');
  check(await evaluate('!!document.querySelector("[role=dialog][aria-label=答题列表]") || !!document.querySelector("[role=dialog][aria-label=题目列表]")'), 'exam question panel did not open');
  check(await evaluate('document.querySelectorAll(".question-number-grid button").length === 180'), 'preview answer panel did not show all 180 exam questions');
  await capture('390x844/09-exam-question-panel.png');
  await click('button[aria-label="关闭答题卡"]');
  check(!(await evaluate('!!document.querySelector("[role=dialog]")')), 'exam question panel did not close');
  await click('.question-panel-trigger');
  await click('.question-number-grid button:nth-child(40)');
  check(!(await evaluate('!!document.querySelector("[role=dialog]")')), 'selecting an exam question did not close the panel');
  check((await evaluate('document.querySelector(".exam-question-tools span").textContent')).startsWith('40'), 'question number panel did not navigate to the selected question');
  await click('.exam-submit');
  await waitFor(() => evaluate('location.pathname === "/exams/result"'), 'preview exam did not open its result fixture');
  await waitFor(() => evaluate('document.body.innerText.includes("开发预览")'), 'exam result fixture did not load');
  const resultText = await evaluate('document.body.innerText');
  check(resultText.includes('开发预览') && resultText.includes('86.5') && resultText.includes('155'), 'exam result fixture is not visibly marked or rendered');
  pass('exam question panel opens/closes and preview result is visibly marked');

  await navigate(`/mistakes${preview}`);
  await click('button.mistake-filter-row:nth-child(2)');
  check(await evaluate('document.querySelectorAll("button.mistake-filter-row .toggle.is-on").length === 2'), 'mistake filters did not allow combinations');
  await click('button.priority-setting');
  check(await evaluate('document.querySelector("button.priority-setting").getAttribute("aria-checked") === "true"'), 'weak-first strategy did not toggle on');
  pass('mistake type filters combine and weak-first strategy toggles');

  await click('.mistake-options select');
  await evaluate('(() => { const select = document.querySelector(".mistake-options select"); select.value = "all"; select.dispatchEvent(new Event("change", { bubbles: true })); })()');
  check(await evaluate('document.querySelector(".mistake-options select").value === "all"'), 'mistake review quantity did not change');
  await navigate(`/me${preview}`);
  await click('.profile-row:first-child');
  check(await evaluate('!!document.querySelector("[role=dialog]") && document.querySelector("[role=dialog]").innerText.includes("示例信息")'), 'profile row did not open its accurate preview detail');
  await click('button.sheet-done');
  check(!(await evaluate('!!document.querySelector("[role=dialog]")')), 'profile detail did not close');
  await click('.logout-button');
  check((await evaluate('document.body.innerText')).includes('开发预览账号不会退出正式会话'), 'preview logout did not preserve the real session');
  check(!(await evaluate('document.body.innerText')).includes('已退出登录'), 'preview logout claimed to revoke a real session');
  pass('mistake quantity and profile details/logout controls respond without saving fake data');

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1536, height: 1024, deviceScaleFactor: 1, mobile: false });
  await navigate('/');
  const desktop = await evaluate('({ width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth, dashboard: !!document.querySelector(".dashboard-page") && getComputedStyle(document.querySelector(".dashboard-page")).display !== "none" })');
  check(desktop.width === 1536 && desktop.height === 1024 && desktop.dashboard && !desktop.overflow, 'desktop dashboard regression at 1536x1024');
  pass('desktop dashboard remains visible at 1536x1024 without overflow');
  await capture('1536x1024/desktop-home.png');

  check(consoleErrors.length === 0, `browser console errors: ${consoleErrors.join(' | ')}`);
  pass('no browser console errors');
  console.log(`UI smoke passed: ${passed} checks`);
  if (captureRoot) console.log(`Screenshots saved under: ${captureRoot}`);
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
  if (error instanceof Error) console.error(error.stack);
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
