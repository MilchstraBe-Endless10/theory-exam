import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Algorithm, hash, verify } from '@node-rs/argon2';

export const SESSION_HOURS = 12;
export const REMEMBER_DAYS = 30;
export const PASSWORD_MIN_LENGTH = 12;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
    outputLen: 32,
  });
}

export async function verifyPassword(encoded: string, password: string): Promise<boolean> {
  try {
    return await verify(encoded, password);
  } catch {
    return false;
  }
}

export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function createCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

export function digestSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newId(): string {
  return randomUUID();
}

export function sessionExpiry(remember: boolean, now = Date.now()): string {
  const lifetime = remember ? REMEMBER_DAYS * 24 : SESSION_HOURS;
  return new Date(now + lifetime * 60 * 60 * 1000).toISOString();
}

export function isValidPassword(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH && Buffer.byteLength(password, 'utf8') <= 1024;
}
