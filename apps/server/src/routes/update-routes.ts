import { createReadStream, statSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { requireSession } from '../auth.js';
import { readCachedUpdate, verifyCachedApk } from '../services/update-service.js';
import { HttpError } from '../errors.js';

async function getVerifiedUpdate(app: FastifyInstance) {
  let update;
  try { update = readCachedUpdate(app.config.updateCacheDirectory); }
  catch { throw new HttpError(503, 'UPDATE_CACHE_INVALID', '服务器更新缓存无效，请联系本机维护者。'); }
  if (!update) throw new HttpError(404, 'UPDATE_NOT_AVAILABLE', '当前没有可用更新。');
  if (!await verifyCachedApk(update.apkPath, update.manifest.apkSha256)) {
    throw new HttpError(503, 'UPDATE_INTEGRITY_FAILED', '更新包完整性校验失败，已拒绝提供下载。');
  }
  return update;
}

export async function registerUpdateRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/updates/latest', { preHandler: requireSession }, async appRequest => {
    const update = await getVerifiedUpdate(appRequest.server);
    return { ...update.manifest };
  });

  app.get('/api/updates/apk', { preHandler: requireSession }, async (_request, reply) => {
    const update = await getVerifiedUpdate(app);
    return reply.header('content-type', 'application/vnd.android.package-archive')
      .header('content-disposition', 'attachment; filename="theory-exam.apk"')
      .header('content-length', String(statSync(update.apkPath).size))
      .header('cache-control', 'private, no-store')
      .send(createReadStream(update.apkPath));
  });
}
