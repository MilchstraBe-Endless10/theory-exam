import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { inTransaction } from '../db/database.js';
import { HttpError } from '../errors.js';
import { parseQuestionWorkbook, type ImportIssue, type ParsedQuestion, type ParsedWorkbook } from './excel-import.js';

export interface ExamRuleInput {
  singleCount: number;
  singlePoints: number;
  multipleCount: number;
  multiplePoints: number;
  judgementCount: number;
  judgementPoints: number;
  durationMinutes: number;
  passingScore: number;
}

export interface PreviewImportInput {
  buffer: Buffer;
  filename: string;
  bankKey: string;
  bankName: string;
  sheetName?: string;
  userId: string;
}

interface ImportJobRow {
  id: string;
  bank_id: string | null;
  requested_bank_key: string;
  requested_bank_name: string;
  file_fingerprint: string;
  source_filename: string;
  status: string;
  selected_sheet: string;
  question_count: number;
  type_counts_json: string;
  errors_json: string;
  duplicate_stems_json: string;
  staged_questions_json: string | null;
  created_by: string;
}

function sanitizeFilename(filename: string): string {
  const basename = filename.replace(/\\/g, '/').split('/').pop()?.replace(/[\u0000-\u001f]/g, '').trim() ?? '';
  return basename.slice(0, 180) || 'upload.xlsx';
}

function validateBankIdentity(bankKey: string, bankName: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,63}$/.test(bankKey)) throw new HttpError(400, 'INVALID_BANK_KEY', '题库标识须为 2–64 位字母、数字、下划线或连字符。');
  if (!bankName.trim() || bankName.trim().length > 100) throw new HttpError(400, 'INVALID_BANK_NAME', '题库名称不能为空且不能超过 100 个字符。');
}

function toImportSummary(job: ImportJobRow, sheetNames: string[], missingAnswers: ImportIssue[], alreadyExists: boolean, existingVersion?: number) {
  return {
    id: job.id,
    status: job.status,
    sourceFilename: job.source_filename,
    fingerprint: job.file_fingerprint,
    workbookSheets: sheetNames,
    selectedSheet: job.selected_sheet,
    questionCount: job.question_count,
    typeCounts: JSON.parse(job.type_counts_json) as Record<string, number>,
    missingAnswers,
    errors: JSON.parse(job.errors_json) as ImportIssue[],
    duplicateStems: JSON.parse(job.duplicate_stems_json) as ParsedWorkbook['duplicateStems'],
    alreadyExists,
    existingVersion: existingVersion ?? null,
    canConfirm: job.status === 'pending_confirmation' && !alreadyExists,
  };
}

export async function previewImport(db: DatabaseSync, input: PreviewImportInput) {
  validateBankIdentity(input.bankKey, input.bankName);
  if (!input.buffer.length) throw new HttpError(400, 'EMPTY_FILE', '上传文件为空。');
  if (!input.filename.toLowerCase().endsWith('.xlsx')) throw new HttpError(400, 'INVALID_FILE_TYPE', '仅支持 .xlsx 文件。');

  const fingerprint = createHash('sha256').update(input.buffer).digest('hex');
  const sourceFilename = sanitizeFilename(input.filename);
  const existingBank = db.prepare('SELECT id FROM question_banks WHERE bank_key = ? COLLATE NOCASE').get(input.bankKey) as { id: string } | undefined;
  const existingVersion = existingBank
    ? db.prepare('SELECT version_number FROM bank_versions WHERE bank_id = ? AND file_fingerprint = ?').get(existingBank.id, fingerprint) as { version_number: number } | undefined
    : undefined;

  let parsed: ParsedWorkbook;
  try {
    parsed = await parseQuestionWorkbook(input.buffer, input.sheetName ?? '');
  } catch (error) {
    parsed = {
      sheetNames: [], selectedSheet: '', rowCount: 0, questions: [],
      typeCounts: { single: 0, multiple: 0, judgement: 0 }, missingAnswers: [],
      errors: [{ row: null, field: '工作簿', code: 'INVALID_WORKBOOK', message: error instanceof Error ? error.message : '无法解析工作簿。' }],
      duplicateStems: [],
    };
  }

  const status = existingVersion ? 'duplicate' : parsed.errors.length ? 'blocked' : 'pending_confirmation';
  const jobId = randomUUID();
  const now = new Date().toISOString();
  const job: ImportJobRow = {
    id: jobId,
    bank_id: existingBank?.id ?? null,
    requested_bank_key: input.bankKey,
    requested_bank_name: input.bankName.trim(),
    file_fingerprint: fingerprint,
    source_filename: sourceFilename,
    status,
    selected_sheet: parsed.selectedSheet,
    question_count: parsed.rowCount,
    type_counts_json: JSON.stringify(parsed.typeCounts),
    errors_json: JSON.stringify(parsed.errors),
    duplicate_stems_json: JSON.stringify(parsed.duplicateStems),
    staged_questions_json: status === 'pending_confirmation' ? JSON.stringify(parsed.questions) : null,
    created_by: input.userId,
  };
  inTransaction(db, () => {
    db.prepare(`INSERT INTO import_jobs(
      id, bank_id, requested_bank_key, requested_bank_name, file_fingerprint, source_filename, status,
      sheet_names_json, selected_sheet, question_count, type_counts_json, missing_answer_count,
      errors_json, duplicate_stems_json, staged_questions_json, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(job.id, job.bank_id, job.requested_bank_key, job.requested_bank_name, job.file_fingerprint, job.source_filename,
        job.status, JSON.stringify(parsed.sheetNames), job.selected_sheet, job.question_count, job.type_counts_json,
        parsed.missingAnswers.length, job.errors_json, job.duplicate_stems_json, job.staged_questions_json,
        input.userId, now);
  });
  return toImportSummary(job, parsed.sheetNames, parsed.missingAnswers, Boolean(existingVersion), existingVersion?.version_number);
}

export function getImportJob(db: DatabaseSync, id: string) {
  const job = db.prepare(`SELECT id, bank_id, requested_bank_key, requested_bank_name, file_fingerprint, source_filename,
    status, selected_sheet, question_count, type_counts_json, errors_json, duplicate_stems_json,
    staged_questions_json, sheet_names_json, missing_answer_count FROM import_jobs WHERE id = ?`).get(id) as (ImportJobRow & { sheet_names_json: string; missing_answer_count: number }) | undefined;
  if (!job) throw new HttpError(404, 'IMPORT_NOT_FOUND', '导入任务不存在。');
  const errors = JSON.parse(job.errors_json) as ImportIssue[];
  const missingAnswers = errors.filter(issue => issue.code === 'MISSING_ANSWER');
  return { job, summary: toImportSummary(job, JSON.parse(job.sheet_names_json) as string[], missingAnswers, job.status === 'duplicate') };
}

export function validateExamRuleInput(rules: ExamRuleInput, counts: Record<string, number>): void {
  const entries = [
    ['single', rules.singleCount, rules.singlePoints],
    ['multiple', rules.multipleCount, rules.multiplePoints],
    ['judgement', rules.judgementCount, rules.judgementPoints],
  ] as const;
  const maxScore = entries.reduce((total, [, count, points]) => total + count * points, 0);
  if (!Number.isFinite(maxScore) || maxScore <= 0 || rules.passingScore > maxScore || rules.durationMinutes < 1) {
    throw new HttpError(400, 'INVALID_EXAM_RULES', '考试规则的总分、及格线或时长无效。');
  }
  for (const [type, count, points] of entries) {
    if (!Number.isInteger(count) || count < 0 || !Number.isFinite(points) || points < 0 || count > (counts[type] ?? 0)) {
      throw new HttpError(400, 'INVALID_EXAM_RULES', `考试规则中的${type}题数量超过本版本可用题量或参数无效。`);
    }
  }
  if (!Number.isFinite(rules.passingScore) || rules.passingScore < 0 || !Number.isInteger(rules.durationMinutes)) {
    throw new HttpError(400, 'INVALID_EXAM_RULES', '考试规则的及格线或时长参数无效。');
  }
}

export function confirmImport(db: DatabaseSync, jobId: string, rules: ExamRuleInput) {
  return inTransaction(db, () => {
    const job = db.prepare('SELECT * FROM import_jobs WHERE id = ?').get(jobId) as ImportJobRow | undefined;
    if (!job) throw new HttpError(404, 'IMPORT_NOT_FOUND', '导入任务不存在。');
    if (job.status !== 'pending_confirmation' || !job.staged_questions_json) throw new HttpError(409, 'IMPORT_NOT_CONFIRMABLE', '该导入任务存在格式错误、已导入或已处理，不能确认导入。');

    const questions = JSON.parse(job.staged_questions_json) as ParsedQuestion[];
    const counts = JSON.parse(job.type_counts_json) as Record<string, number>;
    validateExamRuleInput(rules, counts);
    if (questions.length !== job.question_count) throw new HttpError(409, 'IMPORT_PAYLOAD_INCOMPLETE', '导入预览包含错误行；默认整批阻止写入。');

    let bank = db.prepare('SELECT id, active_version_id FROM question_banks WHERE bank_key = ? COLLATE NOCASE').get(job.requested_bank_key) as { id: string; active_version_id: string | null } | undefined;
    if (bank) {
      const existing = db.prepare('SELECT version_number FROM bank_versions WHERE bank_id = ? AND file_fingerprint = ?').get(bank.id, job.file_fingerprint) as { version_number: number } | undefined;
      if (existing) {
        db.prepare("UPDATE import_jobs SET status = 'duplicate', staged_questions_json = NULL WHERE id = ?").run(jobId);
        return { duplicate: true as const, versionNumber: existing.version_number, bankId: bank.id };
      }
    } else {
      const bankId = randomUUID();
      const now = new Date().toISOString();
      db.prepare('INSERT INTO question_banks(id, bank_key, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(bankId, job.requested_bank_key, job.requested_bank_name, now, now);
      bank = { id: bankId, active_version_id: null };
    }

    const versionNumber = Number((db.prepare('SELECT COALESCE(MAX(version_number), 0) AS version FROM bank_versions WHERE bank_id = ?').get(bank.id) as { version: number }).version) + 1;
    const versionId = randomUUID();
    const createdAt = new Date().toISOString();
    db.prepare(`INSERT INTO bank_versions(id, bank_id, version_number, file_fingerprint, source_filename, sheet_name,
      question_count, type_counts_json, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(versionId, bank.id, versionNumber, job.file_fingerprint, job.source_filename, job.selected_sheet, questions.length,
        job.type_counts_json, job.created_by, createdAt);

    const insertQuestion = db.prepare(`INSERT INTO questions(id, bank_id, bank_version_id, question_type, source_type_label,
      stem, normalized_stem, options_json, answer_json, raw_answer, source_filename, source_sheet, source_row, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const question of questions) {
      insertQuestion.run(randomUUID(), bank.id, versionId, question.questionType, question.sourceTypeLabel, question.stem,
        question.normalizedStem, JSON.stringify(question.options), JSON.stringify(question.answer), question.rawAnswer,
        job.source_filename, question.sourceSheet, question.sourceRow, createdAt);
    }

    db.prepare(`INSERT INTO exam_rules(id, bank_id, bank_version_id, single_count, single_points, multiple_count,
      multiple_points, judgement_count, judgement_points, duration_minutes, passing_score, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), bank.id, versionId, rules.singleCount, rules.singlePoints, rules.multipleCount,
        rules.multiplePoints, rules.judgementCount, rules.judgementPoints, rules.durationMinutes, rules.passingScore, createdAt, createdAt);

    db.prepare('UPDATE question_banks SET active_version_id = ?, updated_at = ? WHERE id = ?').run(versionId, createdAt, bank.id);
    db.prepare("UPDATE import_jobs SET bank_id = ?, status = 'imported', confirmed_at = ?, staged_questions_json = NULL WHERE id = ?")
      .run(bank.id, createdAt, jobId);

    return { duplicate: false as const, bankId: bank.id, versionId, versionNumber, questionCount: questions.length, typeCounts: counts, rules };
  });
}

export function listBanks(db: DatabaseSync, enabledOnly: boolean) {
  const where = enabledOnly ? 'WHERE b.enabled = 1' : '';
  return db.prepare(`SELECT b.id, b.bank_key AS bankKey, b.name, b.description, b.enabled,
    v.id AS activeVersionId, v.version_number AS versionNumber, v.question_count AS questionCount,
    v.type_counts_json AS typeCountsJson, v.created_at AS versionCreatedAt,
    r.id AS ruleId, r.single_count AS singleCount, r.single_points AS singlePoints,
    r.multiple_count AS multipleCount, r.multiple_points AS multiplePoints,
    r.judgement_count AS judgementCount, r.judgement_points AS judgementPoints,
    r.duration_minutes AS durationMinutes, r.passing_score AS passingScore
    FROM question_banks b LEFT JOIN bank_versions v ON v.id = b.active_version_id
    LEFT JOIN exam_rules r ON r.bank_id = b.id AND r.bank_version_id = b.active_version_id
    ${where} ORDER BY b.name COLLATE NOCASE`).all().map(row => {
    const bank = row as Record<string, unknown>;
    return {
      id: bank.id,
      bankKey: bank.bankKey,
      name: bank.name,
      description: bank.description,
      enabled: Boolean(bank.enabled),
      activeVersion: bank.activeVersionId ? {
        id: bank.activeVersionId,
        versionNumber: bank.versionNumber,
        questionCount: bank.questionCount,
        typeCounts: JSON.parse(String(bank.typeCountsJson)),
        createdAt: bank.versionCreatedAt,
      } : null,
      examRules: bank.ruleId ? {
        singleCount: bank.singleCount,
        singlePoints: bank.singlePoints,
        multipleCount: bank.multipleCount,
        multiplePoints: bank.multiplePoints,
        judgementCount: bank.judgementCount,
        judgementPoints: bank.judgementPoints,
        durationMinutes: bank.durationMinutes,
        passingScore: bank.passingScore,
      } : null,
    };
  });
}
