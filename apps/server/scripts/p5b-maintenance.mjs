#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, basename, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const cliPath = join(repositoryRoot, 'apps/server/dist/cli.js');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${basename(command)} failed: ${(result.stderr || result.stdout || '').trim()}`);
  return (result.stdout || '').trim();
}

function verifyCertificate(caPath, leafPath, addresses) {
  for (const address of addresses) {
    run('openssl', ['verify', '-CAfile', caPath, '-verify_ip', address, leafPath]);
  }
}

function checkExpiry(name, path, warningDays) {
  const endDate = run('openssl', ['x509', '-enddate', '-noout', '-in', path]).replace(/^notAfter=/, '');
  const expiresAt = new Date(endDate);
  if (Number.isNaN(expiresAt.getTime())) throw new Error(`${name}: unable to parse certificate expiry`);
  const daysLeft = Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000);
  const state = daysLeft <= warningDays ? 'WARNING' : 'ok';
  console.log(`${name}: ${state}, expires ${expiresAt.toISOString()} (${daysLeft} days left; warning threshold ${warningDays} days)`);
  return daysLeft <= warningDays;
}

function createVerifiedArchive() {
  const databasePath = process.env.THEORY_DATABASE_PATH;
  const archiveDir = resolve(process.env.P5B_BACKUP_ARCHIVE_DIR || '');
  const mountPath = resolve(process.env.P5B_BACKUP_MOUNT || '');
  if (!databasePath || !process.env.P5B_BACKUP_ARCHIVE_DIR || !process.env.P5B_BACKUP_MOUNT) {
    throw new Error('THEORY_DATABASE_PATH, P5B_BACKUP_ARCHIVE_DIR, and P5B_BACKUP_MOUNT are required.');
  }
  const withinMount = relative(mountPath, archiveDir);
  if (withinMount === '' || withinMount === '..' || withinMount.startsWith(`..${sep}`)) {
    throw new Error('Backup archive must be a child directory of the configured backup mount.');
  }
  run('mountpoint', ['-q', mountPath]);
  const actualMount = run('findmnt', ['-n', '-o', 'TARGET', '--target', archiveDir]);
  if (resolve(actualMount) !== mountPath) throw new Error('The backup archive is not on the expected mounted filesystem.');

  const backupDir = resolve(dirname(databasePath), 'backups');
  const result = JSON.parse(run(process.execPath, [cliPath, 'db:backup:daily'], { cwd: repositoryRoot, env: process.env }));
  const sourcePath = resolve(result.path || '');
  if (result.state !== 'verified' || result.kind !== 'daily' || dirname(sourcePath) !== backupDir || !/^daily-.*\.sqlite$/.test(basename(sourcePath))) {
    throw new Error('The application did not create the expected verified daily backup.');
  }

  mkdirSync(archiveDir, { recursive: true, mode: 0o700 });
  chmodSync(archiveDir, 0o700);
  const targetPath = join(archiveDir, basename(sourcePath));
  const temporaryPath = `${targetPath}.tmp-${process.pid}`;
  try {
    copyFileSync(sourcePath, temporaryPath, 1);
    chmodSync(temporaryPath, 0o600);
    const verification = JSON.parse(run(process.execPath, [cliPath, 'db:backup:verify', '--file', temporaryPath], {
      cwd: repositoryRoot,
      env: process.env,
    }));
    if (!verification.valid || verification.integrity !== 'ok' || verification.foreignKeyViolations !== 0 || verification.migrationState !== 'ready') {
      throw new Error('The off-device backup copy failed SQLite verification.');
    }
    if (existsSync(targetPath)) throw new Error('Refusing to overwrite an existing backup archive file.');
    renameSync(temporaryPath, targetPath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
  console.log(`backup: verified, ${statSync(targetPath).size} bytes on ${actualMount}; archive file mode 0600`);
}

function main() {
  const pkiDir = resolve(process.env.P5B_PKI_DIR || '');
  const publicIp = process.env.P5B_PUBLIC_IP;
  const lanIp = process.env.P5B_LAN_IPV4;
  if (!process.env.P5B_PKI_DIR || !publicIp || !lanIp) throw new Error('P5B_PKI_DIR, P5B_PUBLIC_IP, and P5B_LAN_IPV4 are required.');
  createVerifiedArchive();

  const apiCa = join(pkiDir, 'api-ca.pem');
  const webCa = join(pkiDir, 'web-ca.pem');
  const apiLeaf = join(pkiDir, 'api-server.pem');
  const webLeaf = join(pkiDir, 'web-server.pem');
  verifyCertificate(apiCa, apiLeaf, [publicIp, lanIp, '127.0.0.1']);
  verifyCertificate(webCa, webLeaf, [publicIp, lanIp, '127.0.0.1']);

  const warnings = [
    checkExpiry('API leaf', apiLeaf, 60),
    checkExpiry('Web leaf', webLeaf, 60),
    checkExpiry('API private CA', apiCa, 180),
    checkExpiry('Web private CA', webCa, 180),
  ].some(Boolean);
  if (warnings) throw new Error('One or more TLS certificates are within the renewal warning window.');
  console.log('TLS: API and Web chains validate for public, LAN, and loopback IP SANs.');
}

try {
  main();
} catch (error) {
  console.error(`P5-B maintenance failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
}
