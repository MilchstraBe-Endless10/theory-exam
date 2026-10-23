import { readFileSync } from 'node:fs';
import { isLoopbackAddress } from './auth.js';
import { isPrivateLanIPv4, loadConfig } from './config.js';
import { createWebGateway, validateWebApiTarget } from './web-gateway.js';

const config = loadConfig();
const host = process.env.WEB_HOST?.trim() || '127.0.0.1';
const port = Number(process.env.WEB_PORT ?? '8080');
if (!isLoopbackAddress(host) && (process.env.WEB_ALLOW_LAN_BIND !== 'true' || !isPrivateLanIPv4(host))) {
  throw new Error('Non-loopback WEB_HOST must be a private IPv4 address with WEB_ALLOW_LAN_BIND=true.');
}
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('WEB_PORT must be an integer from 1 to 65535.');

const apiTarget = validateWebApiTarget(process.env.WEB_API_TARGET ?? `http://127.0.0.1:${config.port}`).toString();
const certificatePath = process.env.WEB_TLS_CERT_FILE?.trim();
const keyPath = process.env.WEB_TLS_KEY_FILE?.trim();
if (Boolean(certificatePath) !== Boolean(keyPath)) throw new Error('Set both WEB_TLS_CERT_FILE and WEB_TLS_KEY_FILE.');
if (config.environment === 'production' && !certificatePath) throw new Error('Production Web service requires a trusted TLS certificate and private key.');

const gateway = createWebGateway({
  staticDir: process.env.WEB_STATIC_DIR?.trim() || config.staticDir,
  apiTarget,
  ...(certificatePath && keyPath ? { tls: { cert: readFileSync(certificatePath), key: readFileSync(keyPath), minVersion: 'TLSv1.2' as const } } : {}),
});
let closing = false;

gateway.listen(port, host, () => {
  process.stdout.write(`Production Web gateway listening on ${host}:${port}${certificatePath ? ' (HTTPS)' : ' (HTTP; local/testing only)'}\n`);
});

function shutdown(): void {
  if (closing) return;
  closing = true;
  gateway.close(error => {
    if (error) {
      process.stderr.write('Web gateway shutdown failed.\n');
      process.exitCode = 1;
    }
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
