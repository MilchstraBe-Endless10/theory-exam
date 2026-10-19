import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { requireAdmin, requireLocal, requireSession } from '../auth.js';
import { readDatabaseStatus, inTransaction } from '../db/database.js';
import { HttpError } from '../errors.js';
import { hashPassword, isValidPassword } from '../security.js';
import { safeUser, type UserRecord } from '../types.js';
import { confirmImport, getImportJob, listBanks, previewImport, validateExamRuleInput, type ExamRuleInput } from '../services/import-service.js';

const errorResponse = {
  type: 'object', required: ['error'], additionalProperties: false,
  properties: { error: { type: 'object', required: ['code', 'message'], additionalProperties: false, properties: { code: { type: 'string' }, message: { type: 'string' } } } },
};
const adminHooks = [requireLocal, requireSession, requireAdmin];
const userSchema = {
  type: 'object', required: ['id', 'username', 'role', 'disabled', 'createdAt', 'mustChangePassword', 'isTestAccount'], additionalProperties: false,
  properties: { id: { type: 'string' }, username: { type: 'string' }, role: { type: 'string', enum: ['admin', 'user'] }, disabled: { type: 'boolean' }, createdAt: { type: 'string' }, mustChangePassword: { type: 'boolean' }, isTestAccount: { type: 'boolean' } },
};
const ruleProperties = {
  singleCount: { type: 'integer', minimum: 0 },
  singlePoints: { type: 'number', minimum: 0 },
  multipleCount: { type: 'integer', minimum: 0 },
  multiplePoints: { type: 'number', minimum: 0 },
  judgementCount: { type: 'integer', minimum: 0 },
  judgementPoints: { type: 'number', minimum: 0 },
  durationMinutes: { type: 'integer', minimum: 1, maximum: 1440 },
  passingScore: { type: 'number', minimum: 0 },
};
const ruleSchema = { type: 'object', required: Object.keys(ruleProperties), additionalProperties: false, properties: ruleProperties };
const importConfirmationSchema = {
  type: 'object', required: ['duplicate', 'bankId', 'versionNumber'], additionalProperties: false,
  properties: {
    duplicate: { type: 'boolean' }, bankId: { type: 'string' }, versionId: { type: 'string' },
    versionNumber: { type: 'integer' }, questionCount: { type: 'integer' },
    typeCounts: { type: 'object', additionalProperties: { type: 'integer' } }, rules: ruleSchema,
  },
};

interface CreateUserBody { username: string; password: string; isTestAccount?: boolean }
interface ResetPasswordBody { newPassword: string }
interface DisableUserBody { disabled: boolean }

function routeError(error: unknown, fallback: string): never {
  if (error instanceof HttpError) throw error;
  throw new HttpError(400, 'IMPORT_FAILED', error instanceof Error ? error.message : fallback);
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/status', { preHandler: requireLocal }, async () => {
    const adminCount = Number((app.db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get() as { count: number }).count);
    const database = readDatabaseStatus(app.db);
    return { adminInitialized: adminCount > 0, database: { status: 'ok', currentMigration: database.currentVersion, latestMigration: database.latestVersion } };
  });

  app.get('/api/admin/users', { preHandler: adminHooks }, async () => {
    const users = app.db.prepare('SELECT id, username, role, disabled, created_at, updated_at, must_change_password, is_test_account FROM users ORDER BY created_at DESC')
      .all() as unknown as UserRecord[];
    return { items: users.map(safeUser) };
  });

  app.post<{ Body: CreateUserBody }>('/api/admin/users', {
    preHandler: adminHooks,
    schema: {
      body: { type: 'object', required: ['username', 'password'], additionalProperties: false, properties: { username: { type: 'string', minLength: 1, maxLength: 64 }, password: { type: 'string', minLength: 12, maxLength: 1024 }, isTestAccount: { type: 'boolean' } } },
      response: {
        201: { type: 'object', required: ['user'], additionalProperties: false, properties: { user: userSchema } },
        400: errorResponse,
        403: errorResponse,
        409: errorResponse,
      },
    },
  }, async (request, reply) => {
    const username = request.body.username.trim();
    if (!username || /\s/.test(username) || !isValidPassword(request.body.password)) throw new HttpError(400, 'INVALID_CREDENTIALS', '用户名不能包含空白，密码至少 12 个字符。');
    const passwordHash = await hashPassword(request.body.password);
    const now = new Date().toISOString();
    const user: UserRecord = { id: randomUUID(), username, password_hash: passwordHash, role: 'user', disabled: 0, created_at: now, updated_at: now, must_change_password: 1, is_test_account: Number(request.body.isTestAccount ?? false) };
    try {
      app.db.prepare('INSERT INTO users(id, username, password_hash, role, disabled, created_at, updated_at, must_change_password, is_test_account) VALUES (?, ?, ?, ?, 0, ?, ?, 1, ?)')
        .run(user.id, user.username, user.password_hash, user.role, now, now, user.is_test_account);
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE')) throw new HttpError(409, 'USERNAME_EXISTS', '该用户名已存在。');
      throw error;
    }
    return reply.code(201).send({ user: safeUser(user) });
  });

  app.patch<{ Params: { id: string }; Body: DisableUserBody }>('/api/admin/users/:id', {
    preHandler: adminHooks,
    schema: { params: { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string', minLength: 36, maxLength: 36 } } }, body: { type: 'object', required: ['disabled'], additionalProperties: false, properties: { disabled: { type: 'boolean' } } }, response: { 200: { type: 'object', required: ['user'], additionalProperties: false, properties: { user: userSchema } }, 403: errorResponse, 404: errorResponse } },
  }, async request => {
    const user = app.db.prepare("SELECT id, username, password_hash, role, disabled, created_at, updated_at, must_change_password, is_test_account FROM users WHERE id = ? AND role = 'user'")
      .get(request.params.id) as UserRecord | undefined;
    if (!user) throw new HttpError(404, 'USER_NOT_FOUND', '普通用户账号不存在。');
    const now = new Date().toISOString();
    inTransaction(app.db, () => {
      app.db.prepare('UPDATE users SET disabled = ?, updated_at = ? WHERE id = ?').run(Number(request.body.disabled), now, user.id);
      if (request.body.disabled) app.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    });
    return { user: safeUser({ ...user, disabled: Number(request.body.disabled), updated_at: now }) };
  });

  app.post<{ Params: { id: string }; Body: ResetPasswordBody }>('/api/admin/users/:id/reset-password', {
    preHandler: adminHooks,
    schema: { params: { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string', minLength: 36, maxLength: 36 } } }, body: { type: 'object', required: ['newPassword'], additionalProperties: false, properties: { newPassword: { type: 'string', minLength: 12, maxLength: 1024 } } }, response: { 200: { type: 'object', required: ['ok'], additionalProperties: false, properties: { ok: { const: true } } }, 400: errorResponse, 404: errorResponse } },
  }, async request => {
    const user = app.db.prepare("SELECT id FROM users WHERE id = ? AND role = 'user'").get(request.params.id) as { id: string } | undefined;
    if (!user) throw new HttpError(404, 'USER_NOT_FOUND', '普通用户账号不存在。');
    if (!isValidPassword(request.body.newPassword)) throw new HttpError(400, 'WEAK_PASSWORD', '密码至少需要 12 个字符。');
    const passwordHash = await hashPassword(request.body.newPassword);
    inTransaction(app.db, () => {
      app.db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?').run(passwordHash, new Date().toISOString(), user.id);
      app.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    });
    return { ok: true as const };
  });

  app.get('/api/admin/banks', { preHandler: adminHooks }, async () => ({ items: listBanks(app.db, false) }));
  app.get('/api/banks', { preHandler: app.requireSession }, async () => ({ items: listBanks(app.db, true) }));

  app.get('/api/admin/imports', { preHandler: adminHooks }, async () => ({
    items: app.db.prepare(`SELECT id, source_filename AS sourceFilename, status, selected_sheet AS selectedSheet,
      question_count AS questionCount, type_counts_json AS typeCountsJson, created_at AS createdAt
      FROM import_jobs ORDER BY created_at DESC LIMIT 30`).all().map(row => {
      const item = row as Record<string, unknown>;
      const { typeCountsJson, ...safeItem } = item;
      return { ...safeItem, typeCounts: JSON.parse(String(typeCountsJson)) };
    }),
  }));

  app.post('/api/admin/imports/preview', { preHandler: adminHooks }, async (request, reply) => {
    let upload: { buffer: Buffer; filename: string } | undefined;
    const fields: Record<string, string> = {};
    try {
      for await (const part of request.parts()) {
        if (part.type === 'file') upload = { buffer: await part.toBuffer(), filename: part.filename };
        else fields[part.fieldname] = String(part.value ?? '');
      }
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes('file too large')) throw new HttpError(413, 'FILE_TOO_LARGE', '文件不得超过 10 MB。');
      throw error;
    }
    if (!upload) throw new HttpError(400, 'FILE_REQUIRED', '请选择 .xlsx 文件。');
    try {
      const summary = await previewImport(app.db, {
        buffer: upload.buffer,
        filename: upload.filename,
        bankKey: fields.bankKey ?? '',
        bankName: fields.bankName ?? '',
        sheetName: fields.sheetName ?? '',
        userId: request.authUser!.id,
      });
      return reply.code(201).send(summary);
    } catch (error) { return routeError(error, '题库预览失败。'); }
  });

  app.get<{ Params: { id: string } }>('/api/admin/imports/:id', { preHandler: adminHooks }, async request => {
    return getImportJob(app.db, request.params.id).summary;
  });

  app.post<{ Params: { id: string }; Body: ExamRuleInput }>('/api/admin/imports/:id/confirm', {
    preHandler: adminHooks,
    schema: { params: { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string', minLength: 36, maxLength: 36 } } }, body: ruleSchema, response: { 200: importConfirmationSchema, 400: errorResponse, 404: errorResponse, 409: errorResponse } },
  }, async request => confirmImport(app.db, request.params.id, request.body));

  app.put<{ Params: { id: string }; Body: ExamRuleInput }>('/api/admin/banks/:id/rules', {
    preHandler: adminHooks,
    schema: { params: { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string', minLength: 36, maxLength: 36 } } }, body: ruleSchema, response: { 200: { type: 'object', required: ['ok'], additionalProperties: false, properties: { ok: { const: true } } }, 404: errorResponse } },
  }, async request => {
    const bank = app.db.prepare('SELECT id, active_version_id FROM question_banks WHERE id = ?').get(request.params.id) as { id: string; active_version_id: string | null } | undefined;
    if (!bank || !bank.active_version_id) throw new HttpError(404, 'BANK_NOT_FOUND', '题库或启用版本不存在。');
    const counts = app.db.prepare('SELECT type_counts_json FROM bank_versions WHERE id = ?').get(bank.active_version_id) as { type_counts_json: string };
    validateExamRuleInput(request.body, JSON.parse(counts.type_counts_json) as Record<string, number>);
    const existing = app.db.prepare('SELECT id FROM exam_rules WHERE bank_id = ? AND bank_version_id = ?').get(bank.id, bank.active_version_id) as { id: string } | undefined;
    const now = new Date().toISOString();
    if (existing) app.db.prepare(`UPDATE exam_rules SET single_count=?, single_points=?, multiple_count=?, multiple_points=?,
      judgement_count=?, judgement_points=?, duration_minutes=?, passing_score=?, updated_at=? WHERE id=?`)
      .run(request.body.singleCount, request.body.singlePoints, request.body.multipleCount, request.body.multiplePoints,
        request.body.judgementCount, request.body.judgementPoints, request.body.durationMinutes, request.body.passingScore, now, existing.id);
    else app.db.prepare(`INSERT INTO exam_rules(id, bank_id, bank_version_id, single_count, single_points, multiple_count,
      multiple_points, judgement_count, judgement_points, duration_minutes, passing_score, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), bank.id, bank.active_version_id, request.body.singleCount, request.body.singlePoints,
        request.body.multipleCount, request.body.multiplePoints, request.body.judgementCount, request.body.judgementPoints,
        request.body.durationMinutes, request.body.passingScore, now, now);
    return { ok: true as const };
  });
}
