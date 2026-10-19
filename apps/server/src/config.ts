import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ServerConfig {
  host: string;
  port: number;
  adminHost: string;
  adminPort: number;
  databasePath: string;
  updateCacheDirectory: string;
  corsOrigins: Set<string>;
  cookieSecure: boolean;
  staticDir: string;
  environment: 'development' | 'test' | 'production';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT must be an integer from 1 to 65535');
  const adminPort = Number(env.ADMIN_PORT ?? '3001');
  if (!Number.isInteger(adminPort) || adminPort < 1 || adminPort > 65_535) throw new Error('ADMIN_PORT must be an integer from 1 to 65535');
  const adminHost = env.ADMIN_HOST?.trim() || '127.0.0.1';
  if (!['127.0.0.1', '::1', 'localhost'].includes(adminHost)) throw new Error('ADMIN_HOST must be a loopback address');
  if (adminPort === port && adminHost === (env.HOST?.trim() || '127.0.0.1')) throw new Error('ADMIN_PORT must differ from PORT');

  const dataDirectory = resolve(env.THEORY_DATA_DIR ?? join(env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'theory-exam'));
  const databasePath = env.THEORY_DATABASE_PATH ? resolve(env.THEORY_DATABASE_PATH) : join(dataDirectory, 'theory-exam.sqlite');
  const updateCacheDirectory = resolve(env.THEORY_UPDATE_CACHE_DIR ?? join(dataDirectory, 'updates'));
  const corsOrigins = new Set((env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3001,http://127.0.0.1:3001,http://[::1]:3001,capacitor://localhost,https://localhost')
    .split(',').map(origin => origin.trim()).filter(Boolean));
  const rawEnvironment = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(rawEnvironment)) throw new Error('NODE_ENV must be development, test, or production');
  const environment = rawEnvironment as ServerConfig['environment'];
  const cookieSecure = env.COOKIE_SECURE === undefined ? environment === 'production' : env.COOKIE_SECURE === 'true';
  if (environment === 'production' && !cookieSecure) throw new Error('COOKIE_SECURE must be true in production; serve the application over trusted HTTPS.');

  return {
    host: env.HOST?.trim() || '127.0.0.1',
    port,
    adminHost,
    adminPort,
    databasePath,
    updateCacheDirectory,
    corsOrigins,
    cookieSecure,
    staticDir: resolve(env.THEORY_STATIC_DIR ?? fileURLToPath(new URL('../../mobile/dist', import.meta.url))),
    environment,
  };
}
