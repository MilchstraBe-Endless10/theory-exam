import type { FastifyInstance } from 'fastify';
import { HttpError } from '../errors.js';
import {
  createPracticeSession, exitPracticeSession, getActivePracticeSession, getLearningProgress,
  getPracticeQuestion, getPracticeResult, getPracticeSession, listFavorites, movePracticePosition,
  resumePracticeSession, setFavorite, submitPracticeAnswer, type PracticeMode,
} from '../services/practice-service.js';

const modes: PracticeMode[] = ['sequential', 'random', 'single', 'multiple', 'judgement', 'unanswered', 'favorites', 'mistakes'];
const sessionIdParams = { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string', minLength: 36, maxLength: 36 } } };
const questionIdParams = { type: 'object', required: ['questionId'], additionalProperties: false, properties: { questionId: { type: 'string', minLength: 36, maxLength: 36 } } };

export async function registerPracticeRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { bankId: string; mode: PracticeMode; quantity?: number } }>('/api/practice/sessions', {
    preHandler: app.requireSession,
    schema: { body: { type: 'object', required: ['bankId', 'mode'], additionalProperties: false, properties: {
      bankId: { type: 'string', minLength: 36, maxLength: 36 }, mode: { type: 'string', enum: modes }, quantity: { type: 'integer', minimum: 1, maximum: 5000 },
    } } },
  }, async (request, reply) => reply.code(201).send(createPracticeSession(app.db, request.authUser!.id, request.body.bankId, request.body.mode, request.body.quantity)));

  app.get<{ Querystring: { bankId: string } }>('/api/practice/sessions/active', {
    preHandler: app.requireSession,
    schema: { querystring: { type: 'object', required: ['bankId'], additionalProperties: false, properties: { bankId: { type: 'string', minLength: 36, maxLength: 36 } } } },
  }, async request => getActivePracticeSession(app.db, request.authUser!.id, request.query.bankId));

  app.get<{ Params: { id: string } }>('/api/practice/sessions/:id', { preHandler: app.requireSession, schema: { params: sessionIdParams } }, async request =>
    getPracticeSession(app.db, request.authUser!.id, request.params.id));

  app.post<{ Params: { id: string }; Body: { position: number } }>('/api/practice/sessions/:id/position', {
    preHandler: app.requireSession,
    schema: { params: sessionIdParams, body: { type: 'object', required: ['position'], additionalProperties: false, properties: { position: { type: 'integer', minimum: 1, maximum: 5000 } } } },
  }, async request => movePracticePosition(app.db, request.authUser!.id, request.params.id, request.body.position));

  app.post<{ Params: { id: string } }>('/api/practice/sessions/:id/resume', { preHandler: app.requireSession, schema: { params: sessionIdParams } }, async request =>
    resumePracticeSession(app.db, request.authUser!.id, request.params.id));

  app.post<{ Params: { id: string } }>('/api/practice/sessions/:id/exit', { preHandler: app.requireSession, schema: { params: sessionIdParams } }, async request =>
    exitPracticeSession(app.db, request.authUser!.id, request.params.id));

  app.get<{ Params: { id: string }; Querystring: { position: string } }>('/api/practice/sessions/:id/question', {
    preHandler: app.requireSession,
    schema: { params: sessionIdParams, querystring: { type: 'object', required: ['position'], additionalProperties: false, properties: { position: { type: 'string', pattern: '^[1-9][0-9]*$' } } } },
  }, async request => getPracticeQuestion(app.db, request.authUser!.id, request.params.id, Number(request.query.position)));

  app.post<{ Params: { id: string }; Body: { answer: unknown } }>('/api/practice/sessions/:id/submit', {
    preHandler: app.requireSession,
    schema: { params: sessionIdParams, body: { type: 'object', required: ['answer'], additionalProperties: false, properties: { answer: {
      type: 'array', minItems: 1, maxItems: 5, items: { type: 'string', minLength: 1, maxLength: 1 },
    } } } },
  }, async request => {
    return submitPracticeAnswer(app.db, request.authUser!.id, request.params.id, request.body.answer);
  });

  app.get<{ Params: { id: string }; Querystring: { position: string } }>('/api/practice/sessions/:id/result', {
    preHandler: app.requireSession,
    schema: { params: sessionIdParams, querystring: { type: 'object', required: ['position'], additionalProperties: false, properties: { position: { type: 'string', pattern: '^[1-9][0-9]*$' } } } },
  }, async request => getPracticeResult(app.db, request.authUser!.id, request.params.id, Number(request.query.position)));

  app.get<{ Querystring: { bankId: string } }>('/api/favorites', {
    preHandler: app.requireSession,
    schema: { querystring: { type: 'object', required: ['bankId'], additionalProperties: false, properties: { bankId: { type: 'string', minLength: 36, maxLength: 36 } } } },
  }, async request => listFavorites(app.db, request.authUser!.id, request.query.bankId));

  app.put<{ Params: { questionId: string }; Body: { bankId: string } }>('/api/favorites/:questionId', {
    preHandler: app.requireSession,
    schema: { params: questionIdParams, body: { type: 'object', required: ['bankId'], additionalProperties: false, properties: { bankId: { type: 'string', minLength: 36, maxLength: 36 } } } },
  }, async request => setFavorite(app.db, request.authUser!.id, request.body.bankId, request.params.questionId, true));

  app.delete<{ Params: { questionId: string }; Querystring: { bankId: string } }>('/api/favorites/:questionId', {
    preHandler: app.requireSession,
    schema: { params: questionIdParams, querystring: { type: 'object', required: ['bankId'], additionalProperties: false, properties: { bankId: { type: 'string', minLength: 36, maxLength: 36 } } } },
  }, async request => {
    const result = setFavorite(app.db, request.authUser!.id, request.query.bankId, request.params.questionId, false);
    if (result.favorite) throw new HttpError(409, 'FAVORITE_REMOVE_FAILED', '取消收藏没有完成。');
    return result;
  });

  app.get<{ Querystring: { bankId: string } }>('/api/progress', {
    preHandler: app.requireSession,
    schema: { querystring: { type: 'object', required: ['bankId'], additionalProperties: false, properties: { bankId: { type: 'string', minLength: 36, maxLength: 36 } } } },
  }, async request => getLearningProgress(app.db, request.authUser!.id, request.query.bankId));
}
