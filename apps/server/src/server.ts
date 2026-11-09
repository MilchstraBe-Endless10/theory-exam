import { buildApp } from './app.js';
import { isPrivateLanIPv4, loadConfig } from './config.js';
import { openDatabase } from './db/database.js';
import { readFileSync } from 'node:fs';

const config = loadConfig();
const certificatePath = process.env.API_TLS_CERT_FILE?.trim();
const keyPath = process.env.API_TLS_KEY_FILE?.trim();
if (Boolean(certificatePath) !== Boolean(keyPath)) throw new Error('Set both API_TLS_CERT_FILE and API_TLS_KEY_FILE.');
if (config.environment === 'production' && !certificatePath) throw new Error('Production API requires a trusted TLS certificate and private key.');
const https = certificatePath && keyPath
  ? { cert: readFileSync(certificatePath), key: readFileSync(keyPath), minVersion: 'TLSv1.2' as const }
  : undefined;
const lanHost = process.env.API_LAN_HOST?.trim();
if (lanHost && (!isPrivateLanIPv4(lanHost) || lanHost === config.host)) {
  throw new Error('API_LAN_HOST must be a private IPv4 address different from HOST.');
}

const db = openDatabase(config.databasePath);
const businessApp = await buildApp({ config, database: db, surface: 'business', https });
const lanDb = lanHost ? openDatabase(config.databasePath) : undefined;
const lanBusinessApp = lanHost && lanDb ? await buildApp({
  config: { ...config, host: lanHost },
  database: lanDb,
  surface: 'business',
  https,
  runBackgroundJobs: false,
  logger: false,
}) : undefined;
const adminApp = await buildApp({
  config: { ...config, host: config.adminHost, port: config.adminPort },
  database: db,
  surface: 'admin',
});
let closing = false;
const businessApps = [businessApp, ...(lanBusinessApp ? [lanBusinessApp] : [])];
const databases = [db, ...(lanDb ? [lanDb] : [])];

async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  businessApp.log.info({ signal }, 'graceful shutdown started');
  try {
    await Promise.all([...businessApps, adminApp].map(app => app.close()));
    databases.forEach(database => database.close());
    process.exitCode = 0;
  } catch (error) {
    businessApp.log.error({ err: error }, 'graceful shutdown failed');
    process.exitCode = 1;
  }
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  const addresses = await Promise.all([
    businessApp.listen({ host: config.host, port: config.port }),
    ...(lanBusinessApp ? [lanBusinessApp.listen({ host: lanHost!, port: config.port })] : []),
    adminApp.listen({ host: config.adminHost, port: config.adminPort }),
  ]);
  businessApp.log.info({ address: addresses[0] }, 'learning API listening');
  if (lanBusinessApp) businessApp.log.info({ address: addresses[1] }, 'LAN learning API listening');
  adminApp.log.info({ address: addresses.at(-1) }, 'local management listener listening');
} catch (error) {
  businessApp.log.error({ err: error }, 'server failed to start');
  await Promise.allSettled([...businessApps, adminApp].map(app => app.close()));
  databases.forEach(database => database.close());
  process.exitCode = 1;
}
