import type { FastifyInstance } from 'fastify';
import { listBanks } from '../services/import-service.js';

export async function registerBankRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/banks', { preHandler: app.requireSession }, async () => ({ items: listBanks(app.db, true) }));
}
