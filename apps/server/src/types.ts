import type { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { ServerConfig } from './config.js';

export type UserRole = 'admin' | 'user';

export interface UserRecord {
  id: string;
  username: string;
  password_hash: string;
  role: UserRole;
  disabled: number;
  created_at: string;
  updated_at: string;
}

export interface AuthenticatedUser extends Omit<UserRecord, 'password_hash'> {
  sessionTokenHash: string;
  sessionExpiresAt: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    db: DatabaseSync;
    config: ServerConfig;
    localOnly: preHandlerHookHandler;
    requireSession: preHandlerHookHandler;
    requireAdmin: preHandlerHookHandler;
  }
  interface FastifyRequest {
    authUser?: AuthenticatedUser;
  }
}

export function safeUser(user: UserRecord | AuthenticatedUser) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    disabled: Boolean(user.disabled),
    createdAt: user.created_at,
  };
}

export type App = FastifyInstance;
export type Request = FastifyRequest;
