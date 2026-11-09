import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';

const values = new Map();
const events = [];
const listeners = new Map();
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key),
};
globalThis.sessionStorage = { ...globalThis.localStorage };
globalThis.window = {
  location: { search: '' },
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  dispatchEvent: event => {
    events.push(event);
    for (const listener of listeners.get(event.type) ?? []) listener(event);
    return true;
  },
  addEventListener: (type, listener) => {
    const group = listeners.get(type) ?? new Set();
    group.add(listener);
    listeners.set(type, group);
  },
  removeEventListener: (type, listener) => listeners.get(type)?.delete(listener),
};

const api = await import('../src/services/api.ts');
const originalFetch = globalThis.fetch;
const user = id => ({ id, username: id, role: 'user', disabled: false, createdAt: '2026-01-01T00:00:00.000Z' });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const unauthorized = () => json({ error: { code: 'SESSION_INVALID', message: '登录状态已失效，请重新登录。' } }, 401);
const expiryEvents = () => events.filter(event => event.detail?.expired === true);

after(() => { globalThis.fetch = originalFetch; });
beforeEach(() => {
  api.clearSession(false);
  values.clear();
  events.length = 0;
  globalThis.fetch = async () => unauthorized();
});

test('401 without a remembered or active session does not report session expiry', async () => {
  const revision = api.currentSessionRevision();
  await assert.rejects(api.apiRequest('/api/auth/me', { base: 'https://session.test' }), error => error.status === 401);
  assert.equal(api.currentToken(), '');
  assert.equal(api.currentSessionRevision(), revision);
  assert.equal(expiryEvents().length, 0);
});

test('401 for the active session clears it and emits one expiry event', async () => {
  await api.saveSession({ user: user('account-a'), token: 'dummy-session-a', expiresAt: '' }, false);
  await assert.rejects(api.apiRequest('/api/favorites', { base: 'https://session.test' }), error => error.code === 'SESSION_INVALID');
  assert.equal(api.currentToken(), '');
  assert.equal(api.persistentSession(), false);
  assert.equal(expiryEvents().length, 1);
});

test('transport failure keeps the remembered session available for network recovery', async () => {
  await api.saveSession({ user: user('account-a'), token: 'dummy-session-a', expiresAt: '' }, true);
  const revision = api.currentSessionRevision();
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };

  await assert.rejects(api.apiRequest('/api/favorites', { base: 'https://session.test' }), error => error.code === 'SERVER_UNREACHABLE');
  assert.equal(api.currentToken(), 'dummy-session-a');
  assert.equal(api.persistentSession(), true);
  assert.equal(api.currentSessionRevision(), revision);
  assert.equal(expiryEvents().length, 0);
});

test('a 5xx response does not masquerade as an expired session', async () => {
  await api.saveSession({ user: user('account-a'), token: 'dummy-session-a', expiresAt: '' }, true);
  globalThis.fetch = async () => json({ error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Temporarily unavailable.' } }, 503);

  await assert.rejects(api.apiRequest('/api/favorites', { base: 'https://session.test' }), error => error.status === 503);
  assert.equal(api.currentToken(), 'dummy-session-a');
  assert.equal(api.persistentSession(), true);
  assert.equal(expiryEvents().length, 0);
});

test('a delayed 401 from account A cannot clear account B after a switch', async () => {
  await api.saveSession({ user: user('account-a'), token: 'dummy-session-a', expiresAt: '' }, false);
  let respond;
  globalThis.fetch = () => new Promise(resolve => { respond = resolve; });
  const pending = api.apiRequest('/api/favorites', { base: 'https://session.test' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof respond, 'function');

  await api.saveSession({ user: user('account-b'), token: 'dummy-session-b', expiresAt: '' }, false);
  respond(unauthorized());
  await assert.rejects(pending, error => error.code === 'SESSION_INVALID');

  assert.equal(api.currentToken(), 'dummy-session-b');
  assert.equal(expiryEvents().length, 0);
});

test('a delayed renewal response cannot restore the previous account', async () => {
  await api.saveSession({ user: user('account-a'), token: 'dummy-session-a', expiresAt: '' }, false);
  let respond;
  globalThis.fetch = (url) => {
    if (String(url).endsWith('/api/auth/csrf')) return Promise.resolve(json({ csrfToken: 'dummy-csrf' }));
    return new Promise(resolve => { respond = resolve; });
  };
  const pending = api.apiRequest('/api/auth/renew', { base: 'https://session.test', method: 'POST', body: {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof respond, 'function');

  await api.saveSession({ user: user('account-b'), token: 'dummy-session-b', expiresAt: '' }, false);
  respond(json({ user: user('account-a'), token: 'dummy-session-a', expiresAt: '' }));
  await assert.rejects(pending, error => error.code === 'SESSION_CHANGED');

  assert.equal(api.currentToken(), 'dummy-session-b');
  assert.equal(expiryEvents().length, 0);
});
