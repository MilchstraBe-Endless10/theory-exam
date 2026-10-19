import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/database.js';

const config = loadConfig();
const db = openDatabase(config.databasePath);
const businessApp = await buildApp({ config, database: db, surface: 'business' });
const adminApp = await buildApp({
  config: { ...config, host: config.adminHost, port: config.adminPort },
  database: db,
  surface: 'admin',
});
let closing = false;

async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  businessApp.log.info({ signal }, 'graceful shutdown started');
  try {
    await Promise.all([businessApp.close(), adminApp.close()]);
    db.close();
    process.exitCode = 0;
  } catch (error) {
    businessApp.log.error({ err: error }, 'graceful shutdown failed');
    process.exitCode = 1;
  }
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  const [businessAddress, adminAddress] = await Promise.all([
    businessApp.listen({ host: config.host, port: config.port }),
    adminApp.listen({ host: config.adminHost, port: config.adminPort }),
  ]);
  businessApp.log.info({ address: businessAddress }, 'learning API listening');
  adminApp.log.info({ address: adminAddress }, 'local management listener listening');
} catch (error) {
  businessApp.log.error({ err: error }, 'server failed to start');
  await Promise.allSettled([businessApp.close(), adminApp.close()]);
  db.close();
  process.exitCode = 1;
}
