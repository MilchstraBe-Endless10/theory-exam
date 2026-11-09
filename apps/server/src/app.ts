import { existsSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import type { ServerOptions } from 'node:https';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { join } from 'node:path';
import { requireAdmin, requireLocal, requireSession, isLoopbackAddress } from './auth.js';
import { loadConfig, type ServerConfig } from './config.js';
import { openDatabase, openMigratedDatabase, readDatabaseStatus, readDatabaseStatusAtPath } from './db/database.js';
import { HttpError } from './errors.js';
import { hashPassword } from './security.js';
import { registerAdminRoutes } from './routes/admin-routes.js';
import { registerAdminBootstrapRoute, registerAuthRoutes } from './routes/auth-routes.js';
import { registerBankRoutes } from './routes/bank-routes.js';
import { registerPracticeRoutes } from './routes/practice-routes.js';
import { registerExamRoutes } from './routes/exam-routes.js';
import { registerReviewRoutes } from './routes/review-routes.js';
import { registerUpdateRoutes } from './routes/update-routes.js';
import { settleExpiredExams } from './services/exam-service.js';

export interface BuildAppOptions {
  config?: ServerConfig;
  database?: DatabaseSync;
  databasePath?: string;
  surface?: 'combined' | 'business' | 'admin';
  staticDir?: string;
  logger?: boolean | FastifyServerOptions['logger'];
  https?: ServerOptions;
  runBackgroundJobs?: boolean;
  now?: () => Date;
}

function errorPayload(code: string, message: string, details?: Record<string, unknown>) {
  return { error: { code, message, ...(details ? { details } : {}) } };
}

const nativeOrigins = new Set(['https://localhost', 'capacitor://localhost']);

function originMatchesRequestHost(origin: string, host: string | undefined): boolean {
  if (!host) return false;
  try { return new URL(origin).host.toLowerCase() === host.toLowerCase(); }
  catch { return false; }
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const baseConfig = options.config ?? loadConfig();
  const surface = options.surface ?? 'combined';
  const config: ServerConfig = {
    ...baseConfig,
    databasePath: options.databasePath ?? baseConfig.databasePath,
    staticDir: options.staticDir ?? baseConfig.staticDir,
  };
  if (!options.database && config.environment !== 'test') {
    const status = readDatabaseStatusAtPath(config.databasePath);
    if (status.state !== 'ready') throw new Error(`${status.message} Run apps/server npm run db:migrate before starting the service.`);
  }
  const db = options.database ?? (config.environment === 'test'
    ? openMigratedDatabase(config.databasePath)
    : openDatabase(config.databasePath));
  const serverOptions = {
    logger: options.logger === false ? false : {
      ...(typeof options.logger === 'object' ? options.logger : {}),
      level: typeof options.logger === 'object' ? options.logger.level ?? 'info' : 'info',
      redact: {
        paths: [
          'req.body',
          'req.headers.authorization', 'req.headers.cookie',
        ],
        censor: '[REDACTED]',
      },
    },
    trustProxy: false,
    bodyLimit: 12 * 1024 * 1024,
  };
  const app = options.https
    ? Fastify({ ...serverOptions, https: options.https }) as unknown as FastifyInstance
    : Fastify(serverOptions);
  app.decorate('db', db);
  app.decorate('config', config);
  app.decorate('localOnly', requireLocal);
  app.decorate('requireSession', requireSession);
  app.decorate('requireAdmin', requireAdmin);
  const examNow = options.now ?? (() => new Date());
  app.decorate('examNow', examNow);
  if (surface !== 'admin' && options.runBackgroundJobs !== false) {
    settleExpiredExams(db, examNow());
    const expiryTimer = setInterval(() => {
      try { settleExpiredExams(db, examNow()); }
      catch (error) { app.log.error({ err: error }, 'expired exam settlement failed'); }
    }, 15_000);
    expiryTimer.unref();
    app.addHook('onClose', async () => clearInterval(expiryTimer));
  }
  if (!options.database) app.addHook('onClose', async () => db.close());

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    reply.header('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http: https: capacitor://localhost; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    const origin = request.headers.origin;
    if (config.environment === 'production' && origin && !nativeOrigins.has(origin)
      && !originMatchesRequestHost(origin, request.headers.host)) {
      return reply.code(403).send(errorPayload('ORIGIN_HOST_MISMATCH', '请求来源与当前服务入口不匹配。'));
    }
    if (origin && config.corsOrigins.has(origin)) {
      reply.header('access-control-allow-origin', origin);
      reply.header('vary', 'Origin');
      reply.header('access-control-allow-credentials', 'true');
      reply.header('access-control-allow-headers', 'Authorization, Content-Type, X-CSRF-Token');
      reply.header('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }
    if (request.method === 'OPTIONS') {
      if (origin && !config.corsOrigins.has(origin)) return reply.code(403).send(errorPayload('ORIGIN_NOT_ALLOWED', '请求来源未配置。'));
      return reply.code(204).send();
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) return reply.code(error.statusCode).send(errorPayload(error.code, error.message, error.details));
    const details = typeof error === 'object' && error !== null
      ? error as { validation?: unknown; statusCode?: number }
      : {};
    if (details.validation) return reply.code(400).send(errorPayload('INVALID_REQUEST', '请求参数不符合接口要求。'));
    if (details.statusCode === 413) return reply.code(413).send(errorPayload('PAYLOAD_TOO_LARGE', '请求内容超过大小限制。'));
    if (details.statusCode === 429) return reply.code(429).send(errorPayload('RATE_LIMITED', '登录尝试过多，请稍后再试。'));
    request.log.error({ err: error, requestId: request.id }, 'request failed');
    return reply.code(500).send(errorPayload('INTERNAL_ERROR', '服务暂时无法完成请求。'));
  });

  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0] ?? request.url;
    if (path === '/admin' || path.startsWith('/admin/')) {
      if (surface === 'business') return reply.code(404).send(errorPayload('NOT_FOUND', '页面或接口不存在。'));
      if (!isLoopbackAddress(request.raw.socket.remoteAddress)) return reply.code(403).send(errorPayload('LOCAL_ONLY', '管理入口仅允许本机访问。'));
      if (existsSync(join(config.staticDir, 'index.html'))) return reply.type('text/html; charset=utf-8').sendFile('index.html');
    }
    if (surface === 'admin' && !path.startsWith('/api/')) return reply.code(404).send(errorPayload('NOT_FOUND', '页面或接口不存在。'));
    if (path.startsWith('/api/')) return reply.code(404).send(errorPayload('NOT_FOUND', '接口不存在。'));
    if (request.method === 'GET' && existsSync(join(config.staticDir, 'index.html'))) return reply.type('text/html; charset=utf-8').sendFile('index.html');
    return reply.code(404).send(errorPayload('NOT_FOUND', '页面或接口不存在。'));
  });

  app.get('/api/health', {
    schema: { response: { 200: { type: 'object', required: ['status', 'database'], additionalProperties: false, properties: { status: { const: 'ok' }, database: { type: 'object', required: ['status', 'migrationVersion'], additionalProperties: false, properties: { status: { const: 'ok' }, migrationVersion: { type: 'integer' } } } } } } },
  }, async () => ({ status: 'ok' as const, database: { status: 'ok' as const, migrationVersion: readDatabaseStatus(db).currentVersion } }));

  if (surface !== 'business') {
    app.get('/admin', { preHandler: requireLocal }, async (_request, reply) => {
      if (!existsSync(join(config.staticDir, 'index.html'))) return reply.code(503).type('text/plain').send('管理界面尚未构建。请先运行 apps/mobile 的 npm run build。');
      return reply.type('text/html; charset=utf-8').sendFile('index.html');
    });
    app.get('/admin/', { preHandler: requireLocal }, async (_request, reply) => {
      if (!existsSync(join(config.staticDir, 'index.html'))) return reply.code(503).type('text/plain').send('管理界面尚未构建。请先运行 apps/mobile 的 npm run build。');
      return reply.type('text/html; charset=utf-8').sendFile('index.html');
    });
  }

  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: () => ({ statusCode: 429, ...errorPayload('RATE_LIMITED', '登录尝试过多，请稍后再试。') }),
  });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 8, fieldSize: 2048 } });
  if (existsSync(config.staticDir)) await app.register(fastifyStatic, { root: config.staticDir, prefix: '/', decorateReply: true });

  const dummyPasswordHash = await hashPassword('invalid-placeholder-password-never-used-for-a-user');
  await registerAuthRoutes(app, dummyPasswordHash);
  if (surface !== 'business') {
    await registerAdminBootstrapRoute(app);
    await registerAdminRoutes(app);
  }
  if (surface !== 'admin') {
    await registerBankRoutes(app);
    await registerPracticeRoutes(app);
    await registerExamRoutes(app);
    await registerReviewRoutes(app);
    await registerUpdateRoutes(app);
  }
  return app;
}
