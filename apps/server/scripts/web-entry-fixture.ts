import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openMigratedDatabase } from '../src/db/database.js';
import { createWebGateway } from '../src/web-gateway.js';
import { hashPassword } from '../src/security.js';

if (process.env.NODE_ENV !== 'test') throw new Error('This isolated UI fixture only runs with NODE_ENV=test.');

const directory = mkdtempSync(join(tmpdir(), 'theory-web-entry-fixture-'));
const databasePath = join(directory, 'fixture.sqlite');
const webPort = Number(process.env.WEB_PORT ?? '8080');
const config = loadConfig({
  ...process.env,
  NODE_ENV: 'test',
  THEORY_DATABASE_PATH: databasePath,
  HOST: '127.0.0.1',
  PORT: '3000',
  ADMIN_HOST: '127.0.0.1',
  ADMIN_PORT: '3001',
});
const db = openMigratedDatabase(databasePath);
const timestamp = new Date().toISOString();
db.prepare(`INSERT INTO users(id, username, password_hash, role, disabled, created_at, updated_at, must_change_password, is_test_account)
  VALUES ('p5-web-fixture-user', 'p5-web-fixture', ?, 'user', 0, ?, ?, 0, 1)`)
  .run(await hashPassword('Fixture-only-P5-Password'), timestamp, timestamp);

const business = await buildApp({ config, database: db, surface: 'business', logger: false });
const apiAddress = await business.listen({ host: '127.0.0.1', port: 0 });
const apiPort = Number(new URL(apiAddress).port);
const gateway = createWebGateway({ staticDir: config.staticDir, apiTarget: `http://127.0.0.1:${apiPort}` });
let closing = false;

gateway.listen(webPort, '127.0.0.1', () => {
  const webOrigin = `http://127.0.0.1:${webPort}`;
  config.corsOrigins.add(webOrigin);
  process.stdout.write(`Isolated Web fixture ready at ${webOrigin}; API uses a temporary SQLite database.\n`);
});

function shutdown(): void {
  if (closing) return;
  closing = true;
  gateway.close(async () => {
    await business.close();
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
