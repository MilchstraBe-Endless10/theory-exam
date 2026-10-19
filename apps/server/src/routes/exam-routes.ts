import type { FastifyInstance } from 'fastify';
import { HttpError } from '../errors.js';
import { createExam, getActiveExam, getExam, listExamHistory, saveExamAnswer, submitExam } from '../services/exam-service.js';

const uuid = { type: 'string', minLength: 36, maxLength: 36 };
const idParams = { type: 'object', required: ['id'], additionalProperties: false, properties: { id: uuid } };
const questionParams = { type: 'object', required: ['id', 'position'], additionalProperties: false, properties: {
  id: uuid, position: { type: 'string', pattern: '^[1-9][0-9]*$' },
} };

export async function registerExamRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { bankId: string } }>('/api/exams', {
    preHandler: app.requireSession,
    schema: { body: { type: 'object', required: ['bankId'], additionalProperties: false, properties: { bankId: uuid } } },
  }, async (request, reply) => {
    const payload = createExam(app.db, request.authUser!.id, request.body.bankId, app.examNow());
    return reply.code(payload.resumed ? 200 : 201).send(payload);
  });

  app.get('/api/exams/active', { preHandler: app.requireSession }, async request =>
    getActiveExam(app.db, request.authUser!.id, app.examNow()));

  app.get<{ Querystring: { bankId?: string } }>('/api/exams/history', {
    preHandler: app.requireSession,
    schema: { querystring: { type: 'object', additionalProperties: false, properties: { bankId: uuid } } },
  }, async request => listExamHistory(app.db, request.authUser!.id, request.query.bankId, app.examNow()));

  app.get<{ Params: { id: string } }>('/api/exams/:id', {
    preHandler: app.requireSession, schema: { params: idParams },
  }, async request => getExam(app.db, request.authUser!.id, request.params.id, app.examNow()));

  app.get<{ Params: { id: string } }>('/api/exams/:id/result', {
    preHandler: app.requireSession, schema: { params: idParams },
  }, async request => {
    const payload = getExam(app.db, request.authUser!.id, request.params.id, app.examNow());
    if (!payload.result) throw new HttpError(409, 'EXAM_NOT_FINISHED', '考试尚未结算，暂时不能查看答案和成绩。');
    return payload.result;
  });

  app.put<{ Params: { id: string; position: string }; Body: { answer: string[]; expectedVersion: number; requestId: string; marked?: boolean } }>('/api/exams/:id/questions/:position/answer', {
    preHandler: app.requireSession,
    schema: {
      params: questionParams,
      body: { type: 'object', required: ['answer', 'expectedVersion', 'requestId'], additionalProperties: false, properties: {
        answer: { type: 'array', minItems: 0, maxItems: 5, items: { type: 'string', pattern: '^[A-E]$' } },
        expectedVersion: { type: 'integer', minimum: 0 },
        requestId: { type: 'string', minLength: 8, maxLength: 128 },
        marked: { type: 'boolean' },
      } },
    },
  }, async request => saveExamAnswer(app.db, request.authUser!.id, request.params.id, Number(request.params.position),
    request.body.answer, request.body.expectedVersion, request.body.requestId, request.body.marked, app.examNow()));

  app.post<{ Params: { id: string } }>('/api/exams/:id/submit', {
    preHandler: app.requireSession, schema: { params: idParams },
  }, async request => submitExam(app.db, request.authUser!.id, request.params.id, app.examNow()));
}
