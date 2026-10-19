import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { migrations } from './migrations.js';

export interface DatabaseStatus {
  currentVersion: number;
  latestVersion: number;
  applied: Array<{ version: number; name: string; appliedAt: string }>;
}

export interface DatabaseFileStatus extends Partial<DatabaseStatus> {
  state: 'ready' | 'not_found' | 'migration_table_missing' | 'migration_pending' | 'version_ahead' | 'metadata_mismatch' | 'unreadable';
  latestVersion: number;
  userVersion?: number;
  message: string;
}

function connectDatabase(databasePath: string): { db: DatabaseSync; resolved: string; existed: boolean } {
  const resolved = databasePath === ':memory:' ? databasePath : resolve(databasePath);
  if (resolved !== ':memory:') mkdirSync(dirname(resolved), { recursive: true, mode: 0o700 });
  const existed = resolved !== ':memory:' && existsSync(resolved);
  const db = new DatabaseSync(resolved);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  return { db, resolved, existed };
}

function configureDatabase(db: DatabaseSync, resolved: string): void {
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
  if (resolved !== ':memory:') {
    for (const file of [resolved, `${resolved}-wal`, `${resolved}-shm`]) if (existsSync(file)) chmodSync(file, 0o600);
  }
}

export function openDatabase(databasePath: string): DatabaseSync {
  const { db, resolved } = connectDatabase(databasePath);
  try {
    configureDatabase(db, resolved);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

/** Applies migrations only on explicit operator paths or isolated test databases. */
export function openMigratedDatabase(databasePath: string): DatabaseSync {
  const { db, resolved, existed } = connectDatabase(databasePath);
  try {
    const version = readKnownVersion(db);
    const latestVersion = migrations.at(-1)?.version ?? 0;
    const userVersion = Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
    if (version > latestVersion || userVersion > latestVersion) {
      throw new Error(`Database version is newer than this server supports (schema ${version}, user_version ${userVersion}, supported ${latestVersion}).`);
    }
    if (userVersion > 0 && userVersion !== version) {
      throw new Error(`Database migration metadata is inconsistent (schema ${version}, user_version ${userVersion}).`);
    }
    if (existed && (version < latestVersion || userVersion < latestVersion) && hasUserData(db)) {
      createConsistentBackup(db, resolved, version, latestVersion);
    }
    if (resolved !== ':memory:') chmodSync(resolved, 0o600);
    configureDatabase(db, resolved);
    runMigrations(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function runMigrations(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );`);
  const current = readKnownVersion(db);
  const latest = migrations.at(-1)?.version ?? 0;
  const userVersion = Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
  if (current > latest || userVersion > latest) {
    throw new Error(`Database version is newer than this server supports (schema ${current}, user_version ${userVersion}, supported ${latest}).`);
  }
  if (userVersion > 0 && userVersion !== current) {
    throw new Error(`Database migration metadata is inconsistent (schema ${current}, user_version ${userVersion}).`);
  }
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

/** Reads a database file without creating it, changing its journal mode, or applying migrations. */
export function readDatabaseStatusAtPath(databasePath: string): DatabaseFileStatus {
  const latestVersion = migrations.at(-1)?.version ?? 0;
  if (databasePath === ':memory:') {
    return { state: 'not_found', latestVersion, message: '内存数据库没有可查询的持久化状态。' };
  }
  const resolved = resolve(databasePath);
  if (!existsSync(resolved)) {
    return { state: 'not_found', latestVersion, message: '数据库文件不存在；状态查询未创建文件。请运行 db:migrate 初始化。' };
  }

  let db: DatabaseSync;
  try {
    db = new DatabaseSync(resolved, { readOnly: true });
  } catch (error) {
    return { state: 'unreadable', latestVersion, message: `无法只读打开数据库：${error instanceof Error ? error.message : '未知 SQLite 错误'}` };
  }
  try {
    const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(row => row.name));
    const userVersion = Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
    if (!tables.has('schema_migrations')) {
      return { state: 'migration_table_missing', currentVersion: 0, latestVersion, userVersion,
        applied: [], message: '数据库缺少 schema_migrations 表；状态查询未修改数据库。请检查数据库来源后再运行 db:migrate。' };
    }

    const applied = db.prepare('SELECT version, name, applied_at AS appliedAt FROM schema_migrations ORDER BY version')
      .all() as DatabaseStatus['applied'];
    const currentVersion = applied.at(-1)?.version ?? 0;
    if (currentVersion > latestVersion || userVersion > latestVersion) {
      return { state: 'version_ahead', currentVersion, latestVersion, userVersion, applied,
        message: `数据库版本高于当前服务支持版本（schema ${currentVersion}、user_version ${userVersion}、支持 ${latestVersion}）；未执行任何更改。` };
    }
    if (userVersion !== currentVersion || applied.some((row, index) => row.version !== index + 1 || migrations[index]?.name !== row.name)) {
      return { state: 'metadata_mismatch', currentVersion, latestVersion, userVersion, applied,
        message: `迁移元数据不一致（schema ${currentVersion}、user_version ${userVersion}）；未执行任何更改。` };
    }
    if (currentVersion < latestVersion) {
      return { state: 'migration_pending', currentVersion, latestVersion, userVersion, applied,
        message: `数据库需要迁移（${currentVersion} → ${latestVersion}）；状态查询未执行迁移。请运行 db:migrate。` };
    }
    return { state: 'ready', currentVersion, latestVersion, userVersion, applied, message: '数据库结构已是当前版本。' };
  } finally {
    db.close();
  }
}

function readKnownVersion(db: DatabaseSync): number {
  const exists = db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
  if (!exists) return 0;
  return Number((db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get() as { version: number }).version);
}

function hasUserData(db: DatabaseSync): boolean {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'")
    .all() as Array<{ name: string }>;
  return tables.some(({ name }) => {
    const escaped = name.replaceAll('"', '""');
    return Number((db.prepare(`SELECT EXISTS(SELECT 1 FROM "${escaped}" LIMIT 1) AS present`).get() as { present: number }).present) === 1;
  });
}

function createConsistentBackup(db: DatabaseSync, databasePath: string, currentVersion: number, latestVersion: number): string {
  const backupDirectory = join(dirname(databasePath), 'backups');
  mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  chmodSync(backupDirectory, 0o700);
  const suffix = randomBytes(5).toString('hex');
  const backupPath = join(backupDirectory, `pre-migration-${currentVersion}-to-${latestVersion}-${Date.now()}-${suffix}.sqlite`);
  db.prepare('VACUUM INTO ?').run(backupPath);
  chmodSync(backupPath, 0o600);
  return backupPath;
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
