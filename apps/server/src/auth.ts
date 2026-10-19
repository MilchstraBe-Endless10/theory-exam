import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { createSessionToken, digestSessionToken, sessionExpiry } from './security.js';
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
  const authorization = request.headers.authorization;
  const token = typeof authorization === 'string' && authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token || token.length > 256) return denied(reply, 401, 'AUTH_REQUIRED', '请先登录。');

  const tokenHash = digestSessionToken(token);
  const row = request.server.db.prepare(`
    SELECT u.id, u.username, u.role, u.disabled, u.created_at, u.updated_at,
      u.must_change_password, u.is_test_account, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).get(tokenHash) as (Omit<UserRecord, 'password_hash'> & { expires_at: string }) | undefined;
  if (!row) return denied(reply, 401, 'SESSION_INVALID', '登录状态已失效，请重新登录。');
  if (Date.parse(row.expires_at) <= Date.now() || row.disabled) {
    request.server.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return denied(reply, 401, 'SESSION_INVALID', row.disabled ? '账号已停用，请联系管理员。' : '登录状态已失效，请重新登录。');
  }

  if (row.must_change_password && !passwordChangeRoutes.has(request.routeOptions.url ?? '')) {
    return denied(reply, 403, 'PASSWORD_CHANGE_REQUIRED', '首次登录请先修改密码。');
  }

  const { expires_at: sessionExpiresAt, ...user } = row;
  request.authUser = { ...user, sessionTokenHash: tokenHash, sessionExpiresAt };
};

export const requireAdmin: preHandlerHookHandler = async (request, reply) => {
  if (!request.authUser) return denied(reply, 401, 'AUTH_REQUIRED', '请先登录。');
  if (request.authUser.role !== 'admin') return denied(reply, 403, 'ADMIN_REQUIRED', '此操作仅管理员可用。');
};

export function createSession(db: FastifyRequest['server']['db'], userId: string, remember: boolean, token = '') {
  const sessionToken = token || createSessionToken();
  const tokenHash = digestSessionToken(sessionToken);
  const expiresAt = sessionExpiry(remember);
  db.prepare('INSERT INTO sessions(token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(tokenHash, userId, new Date().toISOString(), expiresAt);
  return { token: sessionToken, expiresAt, tokenHash };
}
