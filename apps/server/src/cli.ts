import { existsSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { provisionAccounts, type AccountProvisionSpec } from './account-provisioning.js';
import { loadConfig } from './config.js';
import { openDatabase, readDatabaseStatus, inTransaction } from './db/database.js';
import { hashPassword, isValidPassword, newId } from './security.js';

async function askHidden(prompt: string): Promise<string> {
  if (!stdin.isTTY || !stdin.setRawMode) throw new Error('admin:init requires an interactive terminal so the password is not echoed.');
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          reject(new Error('Cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else if (character >= ' ') value += character;
      }
    };
    stdin.on('data', onData);
  });
}

async function adminInit(): Promise<void> {
  const config = loadConfig();
  const db = openDatabase(config.databasePath);
  try {
    const count = Number((db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='admin'").get() as { count: number }).count);
    if (count) throw new Error('An administrator already exists; initialization is one-time.');
    const readline = createInterface({ input: stdin, output: stdout });
    const username = (await readline.question('管理员用户名: ')).trim();
    readline.close();
    if (!username || /\s/.test(username) || username.length > 64) throw new Error('Username must be 1–64 characters without whitespace.');
    const password = await askHidden('管理员密码（至少 12 个字符，不回显）: ');
    if (!isValidPassword(password)) throw new Error('Password must contain at least 12 characters.');
    const confirmation = await askHidden('再次输入密码: ');
    if (password !== confirmation) throw new Error('Passwords do not match.');
    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();
    inTransaction(db, () => {
      const exists = Number((db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='admin'").get() as { count: number }).count);
      if (exists) throw new Error('An administrator already exists; initialization is one-time.');
      db.prepare('INSERT INTO users(id, username, password_hash, role, disabled, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)')
        .run(newId(), username, passwordHash, 'admin', now, now);
    });
    stdout.write('Administrator initialized. Start the server and visit the local /admin page.\n');
  } finally {
    db.close();
  }
}

function cleanTestDatabase(): void {
  const path = loadConfig().databasePath;
  if (!path.endsWith('.test.sqlite') || !path.includes('/tmp/')) {
    throw new Error('Refusing to delete a database unless THEORY_DATABASE_PATH points to a .test.sqlite file under /tmp.');
  }
  for (const candidate of [path, `${path}-wal`, `${path}-shm`]) if (existsSync(candidate)) unlinkSync(candidate);
  stdout.write('Temporary test database files removed.\n');
}

const command = process.argv[2] ?? 'status';
if (command === 'admin:init') {
  await adminInit();
} else if (command === 'clean-test') {
  cleanTestDatabase();
} else if (command === 'migrate' || command === 'status') {
  const db = openDatabase(loadConfig().databasePath);
  try {
    const status = readDatabaseStatus(db);
    stdout.write(`${JSON.stringify({ database: 'ready', ...status }, null, 2)}\n`);
  } finally { db.close(); }
} else if (command === 'accounts:provision') {
  const manifestArgument = process.argv.indexOf('--manifest');
  const manifestPath = manifestArgument >= 0 ? process.argv[manifestArgument + 1] : '';
  if (!process.argv.includes('--confirm') || !stdin.isTTY || !manifestPath) {
    throw new Error('Usage: cli.ts accounts:provision --manifest /absolute/path/accounts.json --confirm (interactive local terminal only).');
  }
  const resolvedManifest = resolve(manifestPath);
  const manifestStat = statSync(resolvedManifest);
  const manifestDirectory = statSync(dirname(resolvedManifest));
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  if (resolvedManifest === projectRoot || resolvedManifest.startsWith(`${projectRoot}${sep}`)) {
    throw new Error('Account manifest must stay outside the project checkout.');
  }
  if ((manifestStat.mode & 0o077) !== 0 || (manifestDirectory.mode & 0o077) !== 0 || (typeof process.getuid === 'function' && (manifestStat.uid !== process.getuid() || manifestDirectory.uid !== process.getuid()))) {
    throw new Error('Account manifest must be owned by the current Linux user and accessible only to that user (mode 0600).');
  }
  const manifest = JSON.parse(readFileSync(resolvedManifest, 'utf8')) as { accounts?: AccountProvisionSpec[] };
  if (!Array.isArray(manifest.accounts)) throw new Error('Manifest must contain an accounts array.');
  const databasePath = loadConfig().databasePath;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const credentialsPath = join(dirname(databasePath), 'issued-credentials', `initial-credentials-${stamp}.json`);
  const db = openDatabase(databasePath);
  try {
    const result = await provisionAccounts(db, manifest.accounts, credentialsPath);
    stdout.write(`Created ${result.createdCount} ordinary user accounts. One-time credentials: ${result.credentialsPath} (mode 0600).\n`);
  } finally { db.close(); }
} else {
  throw new Error('Usage: cli.ts [migrate|status|clean-test|admin:init|accounts:provision --manifest PATH --confirm]');
}
