import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrations } from './migrations.js';

export interface DatabaseStatus {
  currentVersion: number;
  latestVersion: number;
  applied: Array<{ version: number; name: string; appliedAt: string }>;
}

export function openDatabase(databasePath: string): DatabaseSync {
  const resolved = databasePath === ':memory:' ? databasePath : resolve(databasePath);
  if (resolved !== ':memory:') mkdirSync(dirname(resolved), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(resolved);
  if (resolved !== ':memory:') chmodSync(resolved, 0o600);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
  runMigrations(db);
  if (resolved !== ':memory:') {
    for (const file of [resolved, `${resolved}-wal`, `${resolved}-shm`]) if (existsSync(file)) chmodSync(file, 0o600);
  }
  return db;
}

export function runMigrations(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );`);
  const current = Number((db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get() as { version: number }).version);
  const pending = migrations.filter(migration => migration.version > current);
  if (pending.some((migration, index) => migration.version !== current + index + 1)) {
    throw new Error('Database migrations are not contiguous');
  }
  for (const migration of pending) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)')
        .run(migration.version, migration.name, new Date().toISOString());
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

export function readDatabaseStatus(db: DatabaseSync): DatabaseStatus {
  const currentVersion = Number((db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get() as { version: number }).version);
  const applied = db.prepare('SELECT version, name, applied_at AS appliedAt FROM schema_migrations ORDER BY version')
    .all() as DatabaseStatus['applied'];
  return { currentVersion, latestVersion: migrations.at(-1)?.version ?? 0, applied };
}

export function inTransaction<T>(db: DatabaseSync, action: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
