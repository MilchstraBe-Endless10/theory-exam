import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

export interface ApiUser {
  id: string;
  username: string;
  role: 'admin' | 'user';
  disabled: boolean;
  createdAt: string;
  mustChangePassword?: boolean;
  isTestAccount?: boolean;
}

export interface ApiSession {
  user: ApiUser;
  token?: string;
  csrfToken?: string;
  expiresAt: string;
}

export class ApiError extends Error {
  constructor(message: string, public readonly code = 'NETWORK_ERROR', public readonly status = 0) {
    super(message);
    this.name = 'ApiError';
  }
}

const SERVER_KEY = 'theory-exam.server-address';
const NATIVE_TOKEN_KEY = 'session-token';
const REMEMBER_KEY = 'theory-exam.remember-session';
const sessionEvent = 'theory-exam:session-change';
const serverEvent = 'theory-exam:server-change';
let sessionToken = '';
let csrfToken = '';

// Remove tokens left by older web builds; browser sessions now use HttpOnly cookies.
if (typeof window !== 'undefined') {
  localStorage.removeItem('theory-exam.session-token');
  sessionStorage.removeItem('theory-exam.session-token.temporary');
}

export function previewMode(search = window.location.search): boolean {
  return import.meta.env.DEV && new URLSearchParams(search).get('preview') === '1';
}

export function savedServerAddress(): string {
  return localStorage.getItem(SERVER_KEY) ?? '';
}

export function adminApiBase(): string {
  // Administration always talks to the origin serving /admin; never send admin credentials to a saved remote learning server.
  return window.location.origin;
}

export function saveServerAddress(value: string): void {
  const normalized = value.trim().replace(/\/+$/, '');
  if (normalized !== savedServerAddress()) clearSession();
  localStorage.setItem(SERVER_KEY, normalized);
  window.dispatchEvent(new Event(serverEvent));
}

export function clearServerAddress(): void {
  localStorage.removeItem(SERVER_KEY);
  clearSession();
  window.dispatchEvent(new Event(serverEvent));
}

export function currentToken(): string {
  return sessionToken;
}

export function persistentSession(): boolean {
  return localStorage.getItem(REMEMBER_KEY) === 'true';
}

export async function saveSession(session: ApiSession, remember: boolean): Promise<void> {
  sessionToken = session.token ?? '';
  csrfToken = session.csrfToken ?? '';
  localStorage.setItem(REMEMBER_KEY, String(remember));
  if (Capacitor.isNativePlatform()) {
    if (remember && session.token) await SecureStorage.setItem(NATIVE_TOKEN_KEY, session.token);
    else await SecureStorage.removeItem(NATIVE_TOKEN_KEY);
  }
  window.dispatchEvent(new CustomEvent(sessionEvent, { detail: { user: session.user } }));
}

export function clearSession(notify = true): void {
  sessionToken = '';
  csrfToken = '';
  localStorage.removeItem(REMEMBER_KEY);
  if (Capacitor.isNativePlatform()) void SecureStorage.removeItem(NATIVE_TOKEN_KEY).catch(() => undefined);
  if (notify) window.dispatchEvent(new CustomEvent(sessionEvent, { detail: { user: null } }));
}

async function getSessionToken(): Promise<string> {
  if (sessionToken) return sessionToken;
  if (!Capacitor.isNativePlatform() || !persistentSession()) return '';
  sessionToken = await SecureStorage.getItem(NATIVE_TOKEN_KEY).catch(() => null) ?? '';
  return sessionToken;
}

async function getCsrfToken(base: string): Promise<string> {
  if (csrfToken) return csrfToken;
  try {
    const response = await fetch(`${base}/api/auth/csrf`, { credentials: 'include' });
    if (!response.ok) return '';
    const payload = await response.json() as { csrfToken?: string };
    csrfToken = payload.csrfToken ?? '';
  } catch { return ''; }
  return csrfToken;
}

export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; headers?: HeadersInit; base?: string; auth?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  if (previewMode()) throw new ApiError('开发预览不会访问或修改正式服务端数据。', 'PREVIEW_ISOLATED');
  const base = (options.base ?? savedServerAddress() ?? '').replace(/\/+$/, '');
  if (!base) throw new ApiError('请先连接服务器。', 'SERVER_NOT_CONFIGURED');
  const headers = new Headers(options.headers);
  const native = Capacitor.isNativePlatform();
  const token = options.auth === false ? '' : await getSessionToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const method = (options.method ?? 'GET').toUpperCase();
  if (!native && options.auth !== false && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = await getCsrfToken(base);
    if (csrf) headers.set('X-CSRF-Token', csrf);
  }
  let body: BodyInit | undefined;
  if (options.body instanceof FormData) body = options.body;
  else if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.body);
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { method, headers, body, signal: controller.signal, credentials: 'include' });
  } catch (error) {
    const message = error instanceof DOMException && error.name === 'AbortError' ? '服务器响应超时。' : '无法连接服务器，请检查地址和网络。';
    throw new ApiError(message, 'SERVER_UNREACHABLE');
  } finally {
    window.clearTimeout(timeout);
  }
  let payload: unknown;
  try { payload = response.status === 204 ? {} : await response.json(); } catch { payload = {}; }
  if (!response.ok) {
    const value = payload as { error?: { code?: string; message?: string } };
    if (response.status === 401 && options.auth !== false && !path.endsWith('/login')) {
      clearSession();
      window.dispatchEvent(new CustomEvent(sessionEvent, { detail: { user: null, expired: true } }));
    }
    throw new ApiError(value.error?.message || `服务器请求失败（HTTP ${response.status}）。`, value.error?.code, response.status);
  }
  return payload as T;
}

export async function apiDownload(path: string, onProgress: (received: number, total: number | null) => void): Promise<Uint8Array> {
  const base = savedServerAddress().replace(/\/+$/, '');
  if (!base) throw new ApiError('请先连接服务器。', 'SERVER_NOT_CONFIGURED');
  const headers = new Headers();
  const token = await getSessionToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let response: Response;
  try { response = await fetch(`${base}${path}`, { headers, credentials: 'include' }); }
  catch { throw new ApiError('无法连接服务器，请检查地址和网络。', 'SERVER_UNREACHABLE'); }
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string } };
    throw new ApiError(payload.error?.message ?? `下载失败（HTTP ${response.status}）。`, payload.error?.code, response.status);
  }
  const total = Number(response.headers.get('content-length')) || null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress(received, total);
  }
  const result = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

export const authSessionEvent = sessionEvent;
export const serverConfigEvent = serverEvent;
