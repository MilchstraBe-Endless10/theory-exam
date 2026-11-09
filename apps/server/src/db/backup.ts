import { randomBytes } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readDatabaseStatusAtPath } from './database.js';

export type BackupKind = 'manual' | 'daily';

export function createDatabaseBackup(db: DatabaseSync, backupDirectory: string, kind: BackupKind, now = new Date()): string {
  mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  chmodSync(backupDirectory, 0o700);
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const target = join(backupDirectory, `${kind}-${stamp}-${randomBytes(4).toString('hex')}.sqlite`);
  db.prepare('VACUUM INTO ?').run(target);
  chmodSync(target, 0o600);
  const verification = verifyDatabaseBackup(target);
  if (!verification.valid) {
    unlinkSync(target);
    throw new Error(`Backup verification failed: ${verification.message}`);
  }
  if (kind === 'daily') pruneDailyBackups(backupDirectory, 7);
  return target;
}

export function verifyDatabaseBackup(path: string): { valid: boolean; integrity: string; foreignKeyViolations: number; migrationState: string; message: string } {
  const resolved = resolve(path);
  if (!existsSync(resolved)) return { valid: false, integrity: 'missing', foreignKeyViolations: 0, migrationState: 'unknown', message: 'Backup file does not exist.' };
  let db: DatabaseSync;
  try { db = new DatabaseSync(resolved, { readOnly: true }); }
  catch (error) { return { valid: false, integrity: 'unreadable', foreignKeyViolations: 0, migrationState: 'unknown', message: error instanceof Error ? error.message : 'Cannot open backup.' }; }
  try {
    try {
      const integrity = String((db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check);
      const foreignKeyViolations = db.prepare('PRAGMA foreign_key_check').all().length;
      const migrationState = readDatabaseStatusAtPath(resolved).state;
      const valid = integrity === 'ok' && foreignKeyViolations === 0 && ['ready', 'migration_pending'].includes(migrationState);
      return { valid, integrity, foreignKeyViolations, migrationState, message: valid ? 'SQLite integrity and foreign-key checks passed.' : 'SQLite integrity, foreign-key, or migration metadata check failed.' };
    } catch (error) {
      return { valid: false, integrity: 'invalid', foreignKeyViolations: 0, migrationState: 'unknown', message: error instanceof Error ? error.message : 'Backup validation failed.' };
    }
  } finally { db.close(); }
}

export function pruneDailyBackups(backupDirectory: string, keep = 7): void {
  if (!existsSync(backupDirectory)) return;
  const daily = readdirSync(backupDirectory)
    .filter(name => /^daily-.*\.sqlite$/.test(name))
    .map(name => ({ path: join(backupDirectory, name), modified: statSync(join(backupDirectory, name)).mtimeMs }))
    .sort((a, b) => b.modified - a.modified);
  for (const item of daily.slice(keep)) unlinkSync(item.path);
}

/** Call only after the service has stopped and an operator has confirmed restoration. */
export function restoreDatabaseFromBackup(backupPath: string, databasePath: string): void {
  const source = resolve(backupPath);
  const target = resolve(databasePath);
  if (source === target || target === ':memory:') throw new Error('Backup and live database paths must be different persistent files.');
  const verification = verifyDatabaseBackup(source);
  if (!verification.valid) throw new Error(`Refusing invalid backup: ${verification.message}`);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  const replacement = `${target}.restore-${randomBytes(4).toString('hex')}`;
  copyFileSync(source, replacement);
  chmodSync(replacement, 0o600);
  const copied = verifyDatabaseBackup(replacement);
  if (!copied.valid) { unlinkSync(replacement); throw new Error(`Restored copy verification failed: ${copied.message}`); }
  for (const sidecar of [`${target}-wal`, `${target}-shm`]) if (existsSync(sidecar)) unlinkSync(sidecar);
  renameSync(replacement, target);
}
