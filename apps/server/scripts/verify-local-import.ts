import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../src/db/database.js';
import { confirmImport, previewImport } from '../src/services/import-service.js';
import { parseQuestionWorkbook } from '../src/services/excel-import.js';

const workbookPath = fileURLToPath(new URL('../../../local-input/四级理论试题.xlsx', import.meta.url));
const dataDirectory = mkdtempSync(join(tmpdir(), 'theory-exam-real-import-'));
const databasePath = join(dataDirectory, 'import.test.sqlite');
let db: ReturnType<typeof openDatabase> | undefined;

try {
  const buffer = readFileSync(workbookPath);
  const parsed = await parseQuestionWorkbook(buffer, '客观题');
  assert.equal(parsed.selectedSheet, '客观题');
  assert.equal(parsed.rowCount, 1283);
  assert.deepEqual(parsed.typeCounts, { single: 845, multiple: 38, judgement: 400 });
  assert.equal(parsed.questions.length, 1283);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.missingAnswers.length, 0);
  assert.ok(parsed.duplicateStems.length > 0, 'duplicate stems should be reported rather than removed');

  db = openDatabase(databasePath);
  const adminId = randomUUID();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO users(id, username, password_hash, role, disabled, created_at, updated_at)
    VALUES (?, 'import-test-admin', 'test-only-hash', 'admin', 0, ?, ?)`).run(adminId, now, now);

  const preview = await previewImport(db, {
    buffer,
    filename: '四级理论试题.xlsx',
    bankKey: 'level4',
    bankName: '四级理论题库',
    sheetName: '客观题',
    userId: adminId,
  });
  assert.equal(preview.canConfirm, true);
  const result = confirmImport(db, preview.id, {
    singleCount: 120, singlePoints: 0.5,
    multipleCount: 20, multiplePoints: 1,
    judgementCount: 40, judgementPoints: 0.5,
    durationMinutes: 90, passingScore: 60,
  });
  assert.equal(result.duplicate, false);
  assert.equal(result.questionCount, 1283);
  assert.deepEqual(result.typeCounts, { single: 845, multiple: 38, judgement: 400 });
  const storedCounts = db.prepare('SELECT question_type AS type, COUNT(*) AS count FROM questions GROUP BY question_type').all() as Array<{ type: string; count: number }>;
  assert.deepEqual(Object.fromEntries(storedCounts.map(row => [row.type, row.count])), { judgement: 400, multiple: 38, single: 845 });
  const duplicateRecordCount = parsed.duplicateStems.reduce((total, group) => total + group.rows.length, 0);
  const fingerprintRepeat = await previewImport(db, {
    buffer,
    filename: '四级理论试题-copy.xlsx',
    bankKey: 'level4',
    bankName: '四级理论题库',
    sheetName: '客观题',
    userId: adminId,
  });
  assert.equal(fingerprintRepeat.alreadyExists, true);
  assert.equal(fingerprintRepeat.canConfirm, false);
  db.close();
  db = undefined;

  db = openDatabase(databasePath);
  assert.equal(Number((db.prepare('SELECT COUNT(*) AS count FROM questions').get() as { count: number }).count), 1283);
  assert.equal(Number((db.prepare('SELECT COUNT(*) AS count FROM bank_versions').get() as { count: number }).count), 1);
  const rules = db.prepare('SELECT single_count, multiple_count, judgement_count, duration_minutes FROM exam_rules').get() as Record<string, number>;
  assert.deepEqual({ ...rules }, { single_count: 120, multiple_count: 20, judgement_count: 40, duration_minutes: 90 });
  console.log(JSON.stringify({
    worksheet: parsed.selectedSheet,
    questions: parsed.rowCount,
    typeCounts: parsed.typeCounts,
    missingAnswers: parsed.missingAnswers.length,
    validationErrors: parsed.errors.length,
    duplicateStemGroups: parsed.duplicateStems.length,
    questionsInDuplicateGroups: duplicateRecordCount,
    repeatFileDetected: fingerprintRepeat.alreadyExists,
    reopenedDatabaseQuestions: Number((db.prepare('SELECT COUNT(*) AS count FROM questions').get() as { count: number }).count),
    database: 'temporary isolated test database; removed after verification',
  }, null, 2));
} finally {
  db?.close();
  rmSync(dataDirectory, { recursive: true, force: true });
}
