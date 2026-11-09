import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireSession, createSession, sessionCredentialFromRequest } from '../auth.js';
import { inTransaction } from '../db/database.js';
import { HttpError } from '../errors.js';
import { createCsrfToken, createSessionToken, digestSessionToken, hashPassword, isValidPassword, newId, sessionExpiry, verifyPassword } from '../security.js';
import { safeUser, type AuthenticatedUser, type UserRecord } from '../types.js';

const errorResponse = {
  type: 'object', required: ['error'], additionalProperties: false,
  properties: { error: { type: 'object', required: ['code', 'message'], additionalProperties: false, properties: { code: { type: 'string' }, message: { type: 'string' } } } },
};
const userSchema = {
  type: 'object', required: ['id', 'username', 'role', 'disabled', 'createdAt', 'mustChangePassword', 'isTestAccount'], additionalProperties: false,
  properties: { id: { type: 'string' }, username: { type: 'string' }, role: { type: 'string', enum: ['admin', 'user'] }, disabled: { type: 'boolean' }, createdAt: { type: 'string' }, mustChangePassword: { type: 'boolean' }, isTestAccount: { type: 'boolean' } },
};
const sessionSchema = {
  type: 'object', required: ['user', 'expiresAt'], additionalProperties: false,
  properties: { user: userSchema, token: { type: 'string' }, csrfToken: { type: 'string' }, expiresAt: { type: 'string' } },
};
const credentials = {
  type: 'object', required: ['username', 'password'], additionalProperties: false,
  properties: { username: { type: 'string', minLength: 1, maxLength: 64 }, password: { type: 'string', minLength: 1, maxLength: 1024 }, remember: { type: 'boolean' } },
};

interface Credentials {
  username: string;
  password: string;
  remember?: boolean;
}

function cookieSession(request: FastifyRequest, reply: FastifyReply, session: { token: string; csrfToken: string; expiresAt: string }, user: UserRecord | AuthenticatedUser) {
  const origin = request.headers.origin;
  const nativeOrigin = origin === 'https://localhost' || origin === 'capacitor://localhost';
  const browser = Boolean(origin) && !nativeOrigin;
  reply.header('cache-control', 'no-store');
  if (!browser) return { user: safeUser(user), token: session.token, expiresAt: session.expiresAt };
  const maxAge = Math.max(0, Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1000));
  const secure = request.server.config.cookieSecure ? '; Secure' : '';
  reply.header('set-cookie', `theory_session=${encodeURIComponent(session.token)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAge}${secure}`);
  return { user: safeUser(user), csrfToken: session.csrfToken, expiresAt: session.expiresAt };
}

function clearSessionCookie(request: FastifyRequest, reply: FastifyReply) {
  const secure = request.server.config.cookieSecure ? '; Secure' : '';
  reply.header('set-cookie', `theory_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${secure}`);
}

export async function registerAdminBootstrapRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: Credentials }>('/api/admin/bootstrap', {
    preHandler: app.localOnly,
    schema: { body: { ...credentials, properties: { ...credentials.properties, password: { type: 'string', minLength: 12, maxLength: 1024 } } }, response: { 201: sessionSchema, 400: errorResponse, 403: errorResponse, 409: errorResponse } },
  }, async (request, reply) => {
    const username = request.body.username.trim();
    const password = request.body.password;
    if (!username || /\s/.test(username) || !isValidPassword(password)) throw new HttpError(400, 'INVALID_CREDENTIALS', '用户名不能包含空白，密码至少 12 个字符。');
    const passwordHash = await hashPassword(password);
    const result = inTransaction(app.db, () => {
      const existingAdmin = Number((app.db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get() as { count: number }).count);
      if (existingAdmin > 0) throw new HttpError(409, 'ADMIN_ALREADY_INITIALIZED', '管理员已初始化。');
      const user: UserRecord = { id: newId(), username, password_hash: passwordHash, role: 'admin', disabled: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), must_change_password: 0, is_test_account: 0 };
      app.db.prepare('INSERT INTO users(id, username, password_hash, role, disabled, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)')
        .run(user.id, user.username, user.password_hash, user.role, user.created_at, user.updated_at);
      return { user, session: createSession(app.db, user.id, request.body.remember ?? true) };
    });
    return reply.code(201).send(cookieSession(request, reply, result.session, result.user));
  });
}

export async function registerAuthRoutes(app: FastifyInstance, dummyPasswordHash: string): Promise<void> {
  app.post<{ Body: Credentials }>('/api/auth/login', {
    config: { rateLimit: {
      hook: 'preHandler',
      max: 8,
      timeWindow: '15 minutes',
      keyGenerator: request => {
        const username = typeof (request.body as Credentials | undefined)?.username === 'string'
          ? (request.body as Credentials).username.trim().toLocaleLowerCase()
          : '<invalid>';
        return `${request.ip}:${username}`;
      },
    } },
    schema: { body: credentials, response: { 200: sessionSchema, 400: errorResponse, 401: errorResponse, 429: errorResponse } },
  }, async (request, reply) => {
    const username = request.body.username.trim();
    const user = app.db.prepare('SELECT id, username, password_hash, role, disabled, created_at, updated_at, must_change_password, is_test_account FROM users WHERE username = ? COLLATE NOCASE')
      .get(username) as UserRecord | undefined;
    const validPassword = await verifyPassword(user?.password_hash ?? dummyPasswordHash, request.body.password);
    if (!user || !validPassword || user.disabled) throw new HttpError(401, 'LOGIN_FAILED', '用户名或密码错误，或账号已停用。');
    const session = inTransaction(app.db, () => createSession(app.db, user.id, request.body.remember ?? false));
    return reply.send(cookieSession(request, reply, session, user));
  });

  app.get('/api/auth/csrf', { preHandler: app.requireSession }, async request => ({ csrfToken: request.authUser!.sessionCsrfToken }));

  app.get('/api/auth/me', {
    preHandler: app.requireSession,
    schema: { response: { 200: userSchema, 401: errorResponse } },
  }, async request => safeUser(request.authUser!));

  app.post('/api/auth/renew', {
    preHandler: app.requireSession,
    schema: {
      body: { type: 'object', additionalProperties: false },
      response: { 200: sessionSchema, 401: errorResponse, 403: errorResponse },
    },
  }, async (request, reply) => {
    const session = app.db.prepare('SELECT remember FROM sessions WHERE token_hash = ?')
      .get(request.authUser!.sessionTokenHash) as { remember: number } | undefined;
    if (!session) throw new HttpError(401, 'SESSION_INVALID', '登录状态已失效，请重新登录。');
    const credential = sessionCredentialFromRequest(request);
    if (!credential.token) throw new HttpError(401, 'SESSION_INVALID', '登录状态已失效，请重新登录。');
    const expiresAt = sessionExpiry(Boolean(session.remember));
    const update = app.db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?')
      .run(expiresAt, request.authUser!.sessionTokenHash);
    if (Number(update.changes) !== 1) throw new HttpError(401, 'SESSION_INVALID', '登录状态已失效，请重新登录。');
    return reply.send(cookieSession(request, reply, {
      token: credential.token,
      csrfToken: request.authUser!.sessionCsrfToken,
      expiresAt,
    }, request.authUser!));
  });

  app.post('/api/auth/logout', {
    preHandler: app.requireSession,
    schema: { response: { 200: { type: 'object', required: ['ok'], additionalProperties: false, properties: { ok: { const: true } } }, 401: errorResponse } },
  }, async (request, reply) => {
    app.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(request.authUser!.sessionTokenHash);
    clearSessionCookie(request, reply);
    reply.header('cache-control', 'no-store');
    return { ok: true as const };
  });

  app.post<{ Body: { currentPassword: string; newPassword: string } }>('/api/auth/password', {
    preHandler: app.requireSession,
    schema: {
      body: { type: 'object', required: ['currentPassword', 'newPassword'], additionalProperties: false, properties: { currentPassword: { type: 'string', minLength: 1, maxLength: 1024 }, newPassword: { type: 'string', minLength: 12, maxLength: 1024 } } },
      response: { 200: sessionSchema, 400: errorResponse, 401: errorResponse },
    },
  }, async (request, reply) => {
    const user = app.db.prepare('SELECT id, username, password_hash, role, disabled, created_at, updated_at, must_change_password, is_test_account FROM users WHERE id = ?')
      .get(request.authUser!.id) as UserRecord | undefined;
    const priorSession = app.db.prepare('SELECT remember FROM sessions WHERE token_hash = ?')
      .get(request.authUser!.sessionTokenHash) as { remember: number } | undefined;
    if (!user || !await verifyPassword(user.password_hash, request.body.currentPassword)) throw new HttpError(401, 'CURRENT_PASSWORD_INVALID', '当前密码不正确。');
    if (!priorSession) throw new HttpError(401, 'SESSION_INVALID', '登录状态已失效，请重新登录。');
    if (!isValidPassword(request.body.newPassword) || request.body.currentPassword === request.body.newPassword) {
      throw new HttpError(400, 'INVALID_NEW_PASSWORD', '新密码至少 12 个字符，且应与当前密码不同。');
    }
    const passwordHash = await hashPassword(request.body.newPassword);
    const newToken = createSessionToken();
    const tokenHash = digestSessionToken(newToken);
    const csrfToken = createCsrfToken();
    const expiresAt = request.authUser!.sessionExpiresAt;
    inTransaction(app.db, () => {
      app.db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?').run(passwordHash, new Date().toISOString(), user.id);
      app.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
      app.db.prepare('INSERT INTO sessions(token_hash, user_id, created_at, expires_at, csrf_token, remember) VALUES (?, ?, ?, ?, ?, ?)')
        .run(tokenHash, user.id, new Date().toISOString(), expiresAt, csrfToken, priorSession.remember);
    });
    return reply.send(cookieSession(request, reply, { token: newToken, csrfToken, expiresAt }, { ...user, password_hash: passwordHash, must_change_password: 0, updated_at: new Date().toISOString() }));
  });
}
