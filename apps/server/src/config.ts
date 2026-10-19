import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ServerConfig {
  host: string;
  port: number;
  databasePath: string;
  corsOrigins: Set<string>;
  staticDir: string;
  environment: 'development' | 'test' | 'production';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT must be an integer from 1 to 65535');

  const dataDirectory = resolve(env.THEORY_DATA_DIR ?? join(env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'theory-exam'));
  const databasePath = env.THEORY_DATABASE_PATH ? resolve(env.THEORY_DATABASE_PATH) : join(dataDirectory, 'theory-exam.sqlite');
  const corsOrigins = new Set((env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173,capacitor://localhost')
    .split(',').map(origin => origin.trim()).filter(Boolean));
  const rawEnvironment = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(rawEnvironment)) throw new Error('NODE_ENV must be development, test, or production');

  return {
    host: env.HOST?.trim() || '127.0.0.1',
    port,
    databasePath,
    corsOrigins,
    staticDir: resolve(env.THEORY_STATIC_DIR ?? fileURLToPath(new URL('../../mobile/dist', import.meta.url))),
    environment: rawEnvironment as ServerConfig['environment'],
  };
}
