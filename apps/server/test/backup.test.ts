import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, test } from 'node:test';
import { createDatabaseBackup, pruneDailyBackups, restoreDatabaseFromBackup, verifyDatabaseBackup } from '../src/db/backup.js';
import { openMigratedDatabase } from '../src/db/database.js';

const directories: string[] = [];
function tempDir() { const path = mkdtempSync(join(tmpdir(), 'theory-backup-')); directories.push(path); return path; }
after(() => { for (const path of directories) rmSync(path, { recursive: true, force: true }); });

test('online SQLite backup includes committed WAL data and passes integrity checks', () => {
  const directory = tempDir();
  const livePath = join(directory, 'live.test.sqlite');
  const db = openMigratedDatabase(livePath);
  try {
    db.prepare(`INSERT INTO users(id, username, password_hash, role, disabled, created_at, updated_at) VALUES ('u1', 'fixture', 'not-a-real-hash', 'user', 0, '2026-01-01', '2026-01-01')`).run();
    const backup = createDatabaseBackup(db, join(directory, 'backups'), 'manual');
    assert.equal(verifyDatabaseBackup(backup).valid, true);
    const copy = new DatabaseSync(backup, { readOnly: true });
    try { assert.equal(Number((copy.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n), 1); }
    finally { copy.close(); }
  } finally { db.close(); }
});

test('daily rotation keeps seven successful daily files and leaves manual backups alone', () => {
  const directory = tempDir();
  writeFileSync(join(directory, 'manual-keep.sqlite'), 'manual');
  for (let index = 0; index < 9; index++) {
    const path = join(directory, `daily-${index}.sqlite`);
    writeFileSync(path, 'fixture');
    const time = new Date(2026, 0, index + 1);
    utimesSync(path, time, time);
  }
  pruneDailyBackups(directory, 7);
  assert.equal(readdirSync(directory).filter(name => name.startsWith('daily-')).length, 7);
  assert.equal(readdirSync(directory).includes('manual-keep.sqlite'), true);
});

test('restore replaces an isolated target only from a verified backup', () => {
  const directory = tempDir();
  const source = join(directory, 'source.test.sqlite');
  const target = join(directory, 'target.test.sqlite');
  const sourceDb = openMigratedDatabase(source);
  sourceDb.prepare(`INSERT INTO users(id, username, password_hash, role, disabled, created_at, updated_at) VALUES ('source-user', 'source-user', 'fixture', 'user', 0, '2026-01-01', '2026-01-01')`).run();
  sourceDb.close();
  const targetDb = openMigratedDatabase(target);
  targetDb.prepare(`INSERT INTO users(id, username, password_hash, role, disabled, created_at, updated_at) VALUES ('target-user', 'target-user', 'fixture', 'user', 0, '2026-01-01', '2026-01-01')`).run();
  targetDb.close();
  restoreDatabaseFromBackup(source, target);
  const restored = new DatabaseSync(target, { readOnly: true });
  try {
    assert.equal(Number((restored.prepare("SELECT COUNT(*) AS n FROM users WHERE id = 'source-user'").get() as { n: number }).n), 1);
    assert.equal(Number((restored.prepare("SELECT COUNT(*) AS n FROM users WHERE id = 'target-user'").get() as { n: number }).n), 0);
  } finally { restored.close(); }
  const invalid = join(directory, 'invalid.sqlite');
  writeFileSync(invalid, 'not sqlite');
  assert.throws(() => restoreDatabaseFromBackup(invalid, target), /Refusing invalid backup/);
});
