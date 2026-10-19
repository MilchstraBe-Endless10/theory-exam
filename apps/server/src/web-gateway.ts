import { createReadStream, existsSync, realpathSync, statSync, type Stats } from 'node:fs';
import { createServer as createHttpServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { extname, join, resolve, sep } from 'node:path';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isLoopbackAddress } from './auth.js';

const businessRoots = new Set(['health', 'auth', 'banks', 'practice', 'favorites', 'progress', 'exams', 'mistakes', 'reviews', 'updates']);
const hopByHopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host']);
const securityHeaders: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
};

export interface WebGatewayOptions {
  staticDir: string;
  apiTarget: string;
  tls?: { key: Buffer; cert: Buffer };
}

function errorReply(response: ServerResponse, status: number, message: string): void {
  const body = JSON.stringify({ error: { code: status === 404 ? 'NOT_FOUND' : 'BAD_GATEWAY', message } });
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
  response.end(body);
}

function rawPath(request: IncomingMessage): string {
  return (request.url ?? '/').split('?', 1)[0] || '/';
}

function apiIsAllowed(pathname: string): boolean {
  if (!pathname.startsWith('/api/') || pathname.includes('%') || pathname.includes('\\') || pathname.includes('//')) return false;
  const segments = pathname.split('/').slice(1);
  if (segments.some(segment => segment === '.' || segment === '..' || /^(admin|bootstrap)$/i.test(segment))) return false;
  return businessRoots.has(segments[1] ?? '');
}

function headerValues(headers: IncomingHttpHeaders): Record<string, string | string[]> {
  const forwarded: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || hopByHopHeaders.has(name.toLowerCase()) || /^(?:forwarded|x-forwarded-|x-real-ip)/i.test(name)) continue;
    forwarded[name] = value;
  }
  return forwarded;
}

function responseHeaders(headers: IncomingMessage['headers']): Record<string, string | string[]> {
  const forwarded: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || hopByHopHeaders.has(name.toLowerCase()) || name.toLowerCase() in securityHeaders || name.toLowerCase() === 'strict-transport-security' || name.toLowerCase() === 'cache-control') continue;
    forwarded[name] = value;
  }
  return forwarded;
}

function contentType(path: string): string {
  const types: Record<string, string> = {
    '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json',
  };
  return types[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

function sendFile(request: IncomingMessage, response: ServerResponse, file: string, info: Stats, cacheControl: string): void {
  response.writeHead(200, {
    'content-type': contentType(file),
    'content-length': info.size,
    'cache-control': cacheControl,
    ...(extname(file).toLowerCase() === '.html' ? { 'x-content-type-options': 'nosniff' } : {}),
  });
  if (request.method === 'HEAD') response.end();
  else createReadStream(file).on('error', () => { if (!response.headersSent) errorReply(response, 404, '文件不存在。'); else response.destroy(); }).pipe(response);
}

function safeStaticPath(root: string, pathname: string): string | null {
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded.includes('\\') || decoded.split('/').some(part => part === '.' || part === '..')) return null;
  const file = resolve(root, `.${decoded}`);
  return file === root || file.startsWith(root + sep) ? file : null;
}

function proxyApi(request: IncomingMessage, response: ServerResponse, target: URL, pathname: string): void {
  const transport = target.protocol === 'https:' ? httpsRequest : httpRequest;
  const upstream = transport({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || undefined,
    method: request.method,
    path: `${target.pathname.replace(/\/$/, '')}${request.url ?? pathname}`,
    headers: headerValues(request.headers),
    timeout: 120_000,
  }, incoming => {
    response.writeHead(incoming.statusCode ?? 502, { ...responseHeaders(incoming.headers), 'cache-control': 'no-store' });
    incoming.pipe(response);
  });
  upstream.on('timeout', () => upstream.destroy(new Error('upstream timeout')));
  upstream.on('error', () => { if (!response.headersSent) errorReply(response, 502, '学习服务暂时不可用。'); else response.destroy(); });
  request.on('aborted', () => upstream.destroy());
  response.on('close', () => { if (!response.writableFinished) upstream.destroy(); });
  request.pipe(upstream);
}

export function validateWebApiTarget(value: string): URL {
  const target = new URL(value);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.search || target.hash || target.pathname !== '/') {
    throw new Error('WEB_API_TARGET must be an HTTP(S) origin without credentials or a path.');
  }
  if (!isLoopbackAddress(target.hostname === '[::1]' ? '::1' : target.hostname)) {
    throw new Error('WEB_API_TARGET must point to a loopback Fastify listener.');
  }
  return target;
}

export function createWebGateway(options: WebGatewayOptions): Server {
  if (!existsSync(join(options.staticDir, 'index.html'))) throw new Error(`Production Web build is missing: ${join(options.staticDir, 'index.html')}`);
  const root = realpathSync(options.staticDir);
  const target = validateWebApiTarget(options.apiTarget);
  const handler = (request: IncomingMessage, response: ServerResponse) => {
    for (const [name, value] of Object.entries(securityHeaders)) response.setHeader(name, value);
    response.setHeader('cache-control', 'no-store');
    if ('encrypted' in request.socket && request.socket.encrypted) response.setHeader('strict-transport-security', 'max-age=31536000');

    const pathname = rawPath(request);
    if (pathname.includes('%') || pathname.split('/').some(segment => segment.startsWith('.')) || /(^|\/)(admin|bootstrap)(\/|$)/i.test(pathname)) {
      return errorReply(response, 404, '页面或接口不存在。');
    }
    if (/^\/api(?:\/|$)/i.test(pathname)) {
      if (request.method && !['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(request.method)) return errorReply(response, 404, '接口不存在。');
      if (!apiIsAllowed(pathname)) return errorReply(response, 404, '接口不存在。');
      return proxyApi(request, response, target, pathname);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return errorReply(response, 404, '页面或接口不存在。');

    const file = safeStaticPath(root, pathname);
    if (!file) return errorReply(response, 404, '页面或接口不存在。');
    if (existsSync(file)) {
      let info: Stats;
      try {
        const realFile = realpathSync(file);
        if (realFile !== root && !realFile.startsWith(root + sep)) return errorReply(response, 404, '页面或接口不存在。');
        info = statSync(realFile);
        if (info.isFile()) return sendFile(request, response, realFile, info, pathname === '/index.html' ? 'no-cache' : pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
      } catch { return errorReply(response, 404, '页面或接口不存在。'); }
    }
    if (extname(pathname)) return errorReply(response, 404, '页面或接口不存在。');
    const index = join(root, 'index.html');
    return sendFile(request, response, index, statSync(index), 'no-cache');
  };
  return options.tls ? createHttpsServer(options.tls, handler) : createHttpServer(handler);
}
