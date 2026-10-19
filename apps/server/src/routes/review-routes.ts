import type { FastifyInstance } from 'fastify';
import {
  createReviewRound, exitReviewRound, getActiveReviewRound, getMistakeStats, getReviewQuestion,
  getReviewResult, getReviewRound, listMistakes, listReviewHistory, listReviewResults, moveReviewPosition,
  resumeReviewRound, submitReviewAnswer, type MasteryStatus, type ReviewQuantity, type ReviewScope,
  type ReviewStrategy, type ReviewTypeFilter,
} from '../services/review-service.js';

const idParams = { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string', minLength: 36, maxLength: 36 } } };
const bankQuery = { type: 'object', required: ['bankId'], additionalProperties: false, properties: { bankId: { type: 'string', minLength: 36, maxLength: 36 } } };
const types: ReviewTypeFilter[] = ['all', 'single', 'multiple', 'judgement'];
const scopes: ReviewScope[] = ['pending', 'mastered'];
const statuses: Array<MasteryStatus | 'pending' | 'all'> = ['all', 'pending', 'review', 'reinforcing', 'mastered'];

export async function registerReviewRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { bankId: string } }>('/api/mistakes/stats', {
    preHandler: app.requireSession,
    schema: { querystring: bankQuery },
  }, request => getMistakeStats(app.db, request.authUser!.id, request.query.bankId));

  app.get<{ Querystring: { bankId: string; masteryStatus?: MasteryStatus | 'pending' | 'all'; questionType?: ReviewTypeFilter } }>('/api/mistakes', {
    preHandler: app.requireSession,
    schema: { querystring: { type: 'object', required: ['bankId'], additionalProperties: false, properties: {
      bankId: { type: 'string', minLength: 36, maxLength: 36 },
      masteryStatus: { type: 'string', enum: statuses }, questionType: { type: 'string', enum: types },
    } } },
  }, request => listMistakes(app.db, request.authUser!.id, {
    bankId: request.query.bankId, masteryStatus: request.query.masteryStatus ?? 'pending', questionType: request.query.questionType ?? 'all',
  }));

  app.get<{ Querystring: { bankId: string } }>('/api/reviews/active', {
    preHandler: app.requireSession, schema: { querystring: bankQuery },
  }, request => getActiveReviewRound(app.db, request.authUser!.id, request.query.bankId));

  app.get<{ Querystring: { bankId: string } }>('/api/reviews/history', {
    preHandler: app.requireSession, schema: { querystring: bankQuery },
  }, request => listReviewHistory(app.db, request.authUser!.id, request.query.bankId));

  app.post<{ Body: { bankId: string; questionType: ReviewTypeFilter; strategy: ReviewStrategy; quantity: ReviewQuantity; masteryStatus: ReviewScope } }>('/api/reviews', {
    preHandler: app.requireSession,
    schema: { body: { type: 'object', required: ['bankId', 'questionType', 'strategy', 'quantity', 'masteryStatus'], additionalProperties: false, properties: {
      bankId: { type: 'string', minLength: 36, maxLength: 36 }, questionType: { type: 'string', enum: types },
      strategy: { type: 'string', enum: ['random', 'weak'] }, quantity: { type: 'string', enum: ['10', '20', 'all'] },
      masteryStatus: { type: 'string', enum: scopes },
    } } },
  }, async (request, reply) => reply.code(201).send(createReviewRound(app.db, request.authUser!.id, request.body)));

  app.get<{ Params: { id: string } }>('/api/reviews/:id', { preHandler: app.requireSession, schema: { params: idParams } }, request =>
    getReviewRound(app.db, request.authUser!.id, request.params.id));

  app.get<{ Params: { id: string }; Querystring: { position: string } }>('/api/reviews/:id/question', {
    preHandler: app.requireSession,
    schema: { params: idParams, querystring: { type: 'object', required: ['position'], additionalProperties: false, properties: { position: { type: 'string', pattern: '^[1-9][0-9]*$' } } } },
  }, request => getReviewQuestion(app.db, request.authUser!.id, request.params.id, Number(request.query.position)));

  app.post<{ Params: { id: string }; Body: { position: number } }>('/api/reviews/:id/position', {
    preHandler: app.requireSession,
    schema: { params: idParams, body: { type: 'object', required: ['position'], additionalProperties: false, properties: { position: { type: 'integer', minimum: 1, maximum: 5000 } } } },
  }, request => moveReviewPosition(app.db, request.authUser!.id, request.params.id, request.body.position));

  app.post<{ Params: { id: string } }>('/api/reviews/:id/resume', { preHandler: app.requireSession, schema: { params: idParams } }, request =>
    resumeReviewRound(app.db, request.authUser!.id, request.params.id));

  app.post<{ Params: { id: string } }>('/api/reviews/:id/exit', { preHandler: app.requireSession, schema: { params: idParams } }, request =>
    exitReviewRound(app.db, request.authUser!.id, request.params.id));

  app.post<{ Params: { id: string }; Body: { answer: string[] } }>('/api/reviews/:id/submit', {
    preHandler: app.requireSession,
    schema: { params: idParams, body: { type: 'object', required: ['answer'], additionalProperties: false, properties: {
      answer: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string', minLength: 1, maxLength: 1 } },
    } } },
  }, request => submitReviewAnswer(app.db, request.authUser!.id, request.params.id, request.body.answer));

  app.get<{ Params: { id: string }; Querystring: { position: string } }>('/api/reviews/:id/result', {
    preHandler: app.requireSession,
    schema: { params: idParams, querystring: { type: 'object', required: ['position'], additionalProperties: false, properties: { position: { type: 'string', pattern: '^[1-9][0-9]*$' } } } },
  }, request => getReviewResult(app.db, request.authUser!.id, request.params.id, Number(request.query.position)));

  app.get<{ Params: { id: string } }>('/api/reviews/:id/results', { preHandler: app.requireSession, schema: { params: idParams } }, request =>
    listReviewResults(app.db, request.authUser!.id, request.params.id));
}
