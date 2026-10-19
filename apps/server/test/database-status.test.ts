import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { openMigratedDatabase, readDatabaseStatusAtPath } from '../src/db/database.js';
import { migrations } from '../src/db/migrations.js';

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'theory-db-status-'));
after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));

function createLegacyDatabase(path: string, version: number, includeUser = true): void {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);');
  for (const migration of migrations.filter(item => item.version <= version)) {
    db.exec('BEGIN IMMEDIATE');
    db.exec(migration.sql);
    db.prepare('INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)')
      .run(migration.version, migration.name, '2026-01-01T00:00:00.000Z');
    db.exec(`PRAGMA user_version = ${migration.version}; COMMIT`);
  }
  if (includeUser) {
    const now = '2026-01-01T00:00:00.000Z';
    db.prepare(`INSERT INTO users(id, username, password_hash, role, disabled, created_at, updated_at)
      VALUES (?, ?, ?, 'user', 0, ?, ?)`).run(randomUUID(), `fixture-${version}`, '$argon2id$fixture', now, now);
  }
  db.close();
}

function fileBytes(path: string): Array<[string, string]> {
  return readdirSync(temporaryDirectory).filter(name => name === path.split('/').at(-1) || name.startsWith(`${path.split('/').at(-1)}-`))
    .sort().map(name => [name, createHash('sha256').update(readFileSync(join(temporaryDirectory, name))).digest('hex')]);
}

function logicalSnapshot(path: string) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const schema = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name").all();
    const version = Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>).map(({ name }) => name);
    const rowCounts = tables.map(name => {
      const escaped = name.replaceAll('"', '""');
      return [name, Number((db.prepare(`SELECT COUNT(*) AS count FROM "${escaped}"`).get() as { count: number }).count)];
    });
    return { schema, version, rowCounts };
  } finally { db.close(); }
}

test('db:status is read-only for legacy schemas and does not create absent files', async t => {
  for (const version of [3, 4]) {
    await t.test(`V${version} status leaves schema, data, version and file bytes unchanged`, () => {
      const path = join(temporaryDirectory, `v${version}.sqlite`);
      createLegacyDatabase(path, version);
      const before = { logical: logicalSnapshot(path), bytes: fileBytes(path) };
      for (let run = 0; run < 3; run++) {
        const status = readDatabaseStatusAtPath(path);
        assert.equal(status.state, version < (migrations.at(-1)?.version ?? 0) ? 'migration_pending' : 'ready');
        assert.equal(status.currentVersion, version);
      }
      assert.deepEqual({ logical: logicalSnapshot(path), bytes: fileBytes(path) }, before);
    });
  }

  await t.test('an absent database stays absent', () => {
    const path = join(temporaryDirectory, 'absent.sqlite');
    assert.equal(readDatabaseStatusAtPath(path).state, 'not_found');
    assert.equal(fileBytes(path).length, 0);
  });

  await t.test('a missing migration table is reported without repair', () => {
    const path = join(temporaryDirectory, 'unversioned.sqlite');
    const db = new DatabaseSync(path);
    db.exec('CREATE TABLE marker (value TEXT NOT NULL); INSERT INTO marker VALUES (\'preserved\');');
    db.close();
    const before = { logical: logicalSnapshot(path), bytes: fileBytes(path) };
    assert.equal(readDatabaseStatusAtPath(path).state, 'migration_table_missing');
    assert.deepEqual({ logical: logicalSnapshot(path), bytes: fileBytes(path) }, before);
  });

  await t.test('a database version ahead of this server is not modified', () => {
    const path = join(temporaryDirectory, 'future.sqlite');
    const db = new DatabaseSync(path);
    db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);');
    db.prepare('INSERT INTO schema_migrations VALUES (99, ?, ?)').run('future', '2026-01-01T00:00:00.000Z');
    db.exec('PRAGMA user_version=99;');
    db.close();
    const before = { logical: logicalSnapshot(path), bytes: fileBytes(path) };
    assert.equal(readDatabaseStatusAtPath(path).state, 'version_ahead');
    assert.deepEqual({ logical: logicalSnapshot(path), bytes: fileBytes(path) }, before);
  });

  await t.test('read-only status sees committed rows still held in a live WAL', () => {
    const path = join(temporaryDirectory, 'live-wal.sqlite');
    createLegacyDatabase(path, migrations.at(-1)?.version ?? 5);
    const writer = new DatabaseSync(path);
    try {
      writer.exec('PRAGMA journal_mode=WAL;');
      const now = '2026-01-02T00:00:00.000Z';
      writer.prepare(`INSERT INTO users(id, username, password_hash, role, disabled, created_at, updated_at)
        VALUES (?, ?, ?, 'user', 0, ?, ?)`).run(randomUUID(), 'wal-fixture', '$argon2id$fixture', now, now);
      assert.equal(readDatabaseStatusAtPath(path).state, 'ready');
      assert.equal(Number((writer.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count), 2);
    } finally { writer.close(); }
  });
});

test('upgrading a populated database writes a consistent restricted backup first', () => {
  const path = join(temporaryDirectory, 'upgrade.sqlite');
  createLegacyDatabase(path, 3);
  const database = openMigratedDatabase(path);
  database.close();

  const backupDirectory = join(temporaryDirectory, 'backups');
  const backups = readdirSync(backupDirectory);
  assert.equal(backups.length, 1);
  const backupPath = join(backupDirectory, backups[0]!);
  const backup = new DatabaseSync(backupPath, { readOnly: true });
  try {
    assert.equal(Number((backup.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check === 'ok'), 1);
    assert.equal(Number((backup.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as { version: number }).version), 3);
    assert.equal(Number((backup.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count), 1);
  } finally { backup.close(); }
  assert.equal(statSync(backupDirectory).mode & 0o777, 0o700);
  assert.equal(statSync(backupPath).mode & 0o777, 0o600);
});
