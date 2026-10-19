import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { join } from 'node:path';
import { requireAdmin, requireLocal, requireSession, isLoopbackAddress } from './auth.js';
import { loadConfig, type ServerConfig } from './config.js';
import { openDatabase, readDatabaseStatus } from './db/database.js';
import { HttpError } from './errors.js';
import { hashPassword } from './security.js';
import { registerAdminRoutes } from './routes/admin-routes.js';
import { registerAuthRoutes } from './routes/auth-routes.js';
import { registerPracticeRoutes } from './routes/practice-routes.js';

export interface BuildAppOptions {
  config?: ServerConfig;
  databasePath?: string;
  staticDir?: string;
  logger?: boolean | FastifyServerOptions['logger'];
}

function errorPayload(code: string, message: string) {
  return { error: { code, message } };
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const baseConfig = options.config ?? loadConfig();
  const config: ServerConfig = {
    ...baseConfig,
    databasePath: options.databasePath ?? baseConfig.databasePath,
    staticDir: options.staticDir ?? baseConfig.staticDir,
  };
  const db = openDatabase(config.databasePath);
  const app = Fastify({
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
  });
  app.decorate('db', db);
  app.decorate('config', config);
  app.decorate('localOnly', requireLocal);
  app.decorate('requireSession', requireSession);
  app.decorate('requireAdmin', requireAdmin);
  app.addHook('onClose', async () => db.close());

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && config.corsOrigins.has(origin)) {
      reply.header('access-control-allow-origin', origin);
      reply.header('vary', 'Origin');
      reply.header('access-control-allow-headers', 'Authorization, Content-Type');
      reply.header('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }
    if (request.method === 'OPTIONS') {
      if (origin && !config.corsOrigins.has(origin)) return reply.code(403).send(errorPayload('ORIGIN_NOT_ALLOWED', '请求来源未配置。'));
      return reply.code(204).send();
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) return reply.code(error.statusCode).send(errorPayload(error.code, error.message));
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
      if (!isLoopbackAddress(request.raw.socket.remoteAddress)) return reply.code(403).send(errorPayload('LOCAL_ONLY', '管理入口仅允许本机访问。'));
      if (existsSync(join(config.staticDir, 'index.html'))) return reply.type('text/html; charset=utf-8').sendFile('index.html');
    }
    if (path.startsWith('/api/')) return reply.code(404).send(errorPayload('NOT_FOUND', '接口不存在。'));
    if (request.method === 'GET' && existsSync(join(config.staticDir, 'index.html'))) return reply.type('text/html; charset=utf-8').sendFile('index.html');
    return reply.code(404).send(errorPayload('NOT_FOUND', '页面或接口不存在。'));
  });

  app.get('/api/health', {
    schema: { response: { 200: { type: 'object', required: ['status', 'database'], additionalProperties: false, properties: { status: { const: 'ok' }, database: { type: 'object', required: ['status', 'migrationVersion'], additionalProperties: false, properties: { status: { const: 'ok' }, migrationVersion: { type: 'integer' } } } } } } },
  }, async () => ({ status: 'ok' as const, database: { status: 'ok' as const, migrationVersion: readDatabaseStatus(db).currentVersion } }));

  app.get('/admin', { preHandler: requireLocal }, async (_request, reply) => {
    if (!existsSync(join(config.staticDir, 'index.html'))) return reply.code(503).type('text/plain').send('管理界面尚未构建。请先运行 apps/mobile 的 npm run build。');
    return reply.type('text/html; charset=utf-8').sendFile('index.html');
  });
  app.get('/admin/', { preHandler: requireLocal }, async (_request, reply) => {
    if (!existsSync(join(config.staticDir, 'index.html'))) return reply.code(503).type('text/plain').send('管理界面尚未构建。请先运行 apps/mobile 的 npm run build。');
    return reply.type('text/html; charset=utf-8').sendFile('index.html');
  });

  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: () => ({ statusCode: 429, ...errorPayload('RATE_LIMITED', '登录尝试过多，请稍后再试。') }),
  });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 8, fieldSize: 2048 } });
  if (existsSync(config.staticDir)) await app.register(fastifyStatic, { root: config.staticDir, prefix: '/', decorateReply: true });

  const dummyPasswordHash = await hashPassword('invalid-placeholder-password-never-used-for-a-user');
  await registerAuthRoutes(app, dummyPasswordHash);
  await registerAdminRoutes(app);
  await registerPracticeRoutes(app);
  return app;
}
