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
  token: string;
  expiresAt: string;
}

export class ApiError extends Error {
  constructor(message: string, public readonly code = 'NETWORK_ERROR', public readonly status = 0) {
    super(message);
    this.name = 'ApiError';
  }
}

const SERVER_KEY = 'theory-exam.server-address';
const LOCAL_TOKEN_KEY = 'theory-exam.session-token';
const SESSION_TOKEN_KEY = 'theory-exam.session-token.temporary';
const sessionEvent = 'theory-exam:session-change';
const serverEvent = 'theory-exam:server-change';

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
  return localStorage.getItem(LOCAL_TOKEN_KEY) ?? sessionStorage.getItem(SESSION_TOKEN_KEY) ?? '';
}

export function persistentSession(): boolean {
  return Boolean(localStorage.getItem(LOCAL_TOKEN_KEY));
}

export function saveSession(session: ApiSession, remember: boolean): void {
  clearSession(false);
  (remember ? localStorage : sessionStorage).setItem(remember ? LOCAL_TOKEN_KEY : SESSION_TOKEN_KEY, session.token);
  window.dispatchEvent(new CustomEvent(sessionEvent, { detail: { user: session.user } }));
}

export function clearSession(notify = true): void {
  localStorage.removeItem(LOCAL_TOKEN_KEY);
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
  if (notify) window.dispatchEvent(new CustomEvent(sessionEvent, { detail: { user: null } }));
}

export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; headers?: HeadersInit; base?: string; auth?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  if (previewMode()) throw new ApiError('开发预览不会访问或修改正式服务端数据。', 'PREVIEW_ISOLATED');
  const base = (options.base ?? savedServerAddress() ?? '').replace(/\/+$/, '');
  if (!base) throw new ApiError('请先连接服务器。', 'SERVER_NOT_CONFIGURED');
  const headers = new Headers(options.headers);
  const token = options.auth === false ? '' : currentToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
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
    response = await fetch(`${base}${path}`, { method: options.method ?? 'GET', headers, body, signal: controller.signal });
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
    if (response.status === 401 && token && !path.endsWith('/login')) {
      clearSession();
      window.dispatchEvent(new CustomEvent(sessionEvent, { detail: { user: null, expired: true } }));
    }
    throw new ApiError(value.error?.message || `服务器请求失败（HTTP ${response.status}）。`, value.error?.code, response.status);
  }
  return payload as T;
}

export const authSessionEvent = sessionEvent;
export const serverConfigEvent = serverEvent;
