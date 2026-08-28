import { FastifyInstance } from 'fastify';
import {
  PublishError,
  UUID_RE,
  createLive,
  deleteDraft,
  getOwned,
  listMine,
  publishDraft,
  saveDraft,
  updateDraft,
} from '../services/publish.service.js';

function sendErr(reply: any, err: unknown) {
  if (err instanceof PublishError) {
    return reply.status(err.statusCode).send({ error: err.message, message: err.message });
  }
  throw err;
}

export async function publicationRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [(app as any).authenticate] }, async (request) => {
    const { id: userId } = (request as any).user;
    return listMine(userId);
  });

  app.get('/:id', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    try {
      const { id: userId } = (request as any).user;
      return await getOwned(userId, (request.params as any).id);
    } catch (err) {
      return sendErr(reply, err);
    }
  });

  app.post('/', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    try {
      const { id: userId } = (request as any).user;
      const body = request.body as any;
      if (body?.publish === true) return await createLive(userId, body);
      return await saveDraft(userId, body);
    } catch (err) {
      return sendErr(reply, err);
    }
  });

  app.put('/:id', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    try {
      const { id: userId } = (request as any).user;
      return await updateDraft(userId, (request.params as any).id, request.body as any);
    } catch (err) {
      return sendErr(reply, err);
    }
  });

  app.post('/:id/publish', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as any;
      if (!UUID_RE.test(id)) return reply.status(404).send({ error: 'Not found', message: 'Not found' });
      const { id: userId } = (request as any).user;
      return await publishDraft(userId, id);
    } catch (err) {
      return sendErr(reply, err);
    }
  });

  app.delete('/:id', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    try {
      const { id: userId } = (request as any).user;
      await deleteDraft(userId, (request.params as any).id);
      return { ok: true };
    } catch (err) {
      return sendErr(reply, err);
    }
  });
}
