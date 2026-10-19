import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { createCsrfToken, createSessionToken, digestSessionToken, sessionExpiry } from './security.js';
import type { AuthenticatedUser, UserRecord } from './types.js';

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  if (address === '::1' || address === 'localhost') return true;
  const mapped = address.startsWith('::ffff:') ? address.slice(7) : address;
  if (/^127(?:\.\d{1,3}){3}$/.test(mapped)) return mapped.split('.').every(part => Number(part) <= 255);
  return false;
}

const passwordChangeRoutes = new Set(['/api/auth/me', '/api/auth/password', '/api/auth/logout']);

function denied(reply: FastifyReply, statusCode: number, code: string, message: string) {
  return reply.code(statusCode).send({ error: { code, message } });
}

export const requireLocal: preHandlerHookHandler = async (request, reply) => {
  // Intentionally use the socket peer address; forwarded headers are untrusted.
  if (!isLoopbackAddress(request.raw.socket.remoteAddress)) return denied(reply, 403, 'LOCAL_ONLY', '管理入口仅允许本机访问。');
};

export const requireSession: preHandlerHookHandler = async (request, reply) => {
  const credential = sessionCredentialFromRequest(request);
  const token = credential.token;
  const cookieToken = credential.fromCookie ? token : '';
  if (!token || token.length > 256) return denied(reply, 401, 'AUTH_REQUIRED', '请先登录。');

  const tokenHash = digestSessionToken(token);
  const row = request.server.db.prepare(`
    SELECT u.id, u.username, u.role, u.disabled, u.created_at, u.updated_at,
      u.must_change_password, u.is_test_account, s.expires_at, s.csrf_token
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).get(tokenHash) as (Omit<UserRecord, 'password_hash'> & { expires_at: string; csrf_token: string }) | undefined;
  if (!row) return denied(reply, 401, 'SESSION_INVALID', '登录状态已失效，请重新登录。');
  if (Date.parse(row.expires_at) <= Date.now() || row.disabled) {
    request.server.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return denied(reply, 401, 'SESSION_INVALID', row.disabled ? '账号已停用，请联系管理员。' : '登录状态已失效，请重新登录。');
  }

  if (row.must_change_password && !passwordChangeRoutes.has(request.routeOptions.url ?? '')) {
    return denied(reply, 403, 'PASSWORD_CHANGE_REQUIRED', '首次登录请先修改密码。');
  }

  if (cookieToken && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.origin;
    const csrf = request.headers['x-csrf-token'];
    const expected = Buffer.from(row.csrf_token);
    const actual = Buffer.from(typeof csrf === 'string' ? csrf : '');
    if (!origin || !request.server.config.corsOrigins.has(origin) || expected.length === 0 || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return denied(reply, 403, 'CSRF_INVALID', '请求安全校验失败，请刷新页面后重试。');
    }
  }

  const { expires_at: sessionExpiresAt, csrf_token: sessionCsrfToken, ...user } = row;
  request.authUser = { ...user, sessionTokenHash: tokenHash, sessionExpiresAt, sessionCsrfToken };
};

export const requireAdmin: preHandlerHookHandler = async (request, reply) => {
  if (!request.authUser) return denied(reply, 401, 'AUTH_REQUIRED', '请先登录。');
  if (request.authUser.role !== 'admin') return denied(reply, 403, 'ADMIN_REQUIRED', '此操作仅管理员可用。');
};

export function createSession(db: FastifyRequest['server']['db'], userId: string, remember: boolean, token = '') {
  const sessionToken = token || createSessionToken();
  const tokenHash = digestSessionToken(sessionToken);
  const csrfToken = createCsrfToken();
  const expiresAt = sessionExpiry(remember);
  db.prepare('INSERT INTO sessions(token_hash, user_id, created_at, expires_at, csrf_token, remember) VALUES (?, ?, ?, ?, ?, ?)')
    .run(tokenHash, userId, new Date().toISOString(), expiresAt, csrfToken, Number(remember));
  return { token: sessionToken, csrfToken, expiresAt, tokenHash };
}

export function sessionCredentialFromRequest(request: FastifyRequest): { token: string; fromCookie: boolean } {
  const authorization = request.headers.authorization;
  const bearerToken = typeof authorization === 'string' && authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : '';
  const cookieToken = bearerToken ? '' : readCookie(request.headers.cookie, 'theory_session');
  return { token: bearerToken || cookieToken, fromCookie: Boolean(cookieToken) };
}

function readCookie(header: string | undefined, name: string): string {
  for (const part of (header ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key !== name) continue;
    try { return decodeURIComponent(value.join('=')); } catch { return ''; }
  }
  return '';
}
