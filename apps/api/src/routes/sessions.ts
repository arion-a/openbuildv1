import { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { sessionService } from '../services/session.service.js';
import { sessionProcessService } from '../services/session-process.service.js';
import { config, decrypt } from '../config/env.js';

const sessions = config.sessions.mode === 'process' ? sessionProcessService : sessionService;

export async function sessionRoutes(app: FastifyInstance) {
  // Join a project — creates fork + container
  app.post('/join/:projectId', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { projectId } = request.params as any;
    const { id: userId } = (request as any).user;

    // Check for existing running session
    const existing = await pool.query(
      "SELECT * FROM sessions WHERE user_id = $1 AND project_id = $2 AND status = 'running'",
      [userId, projectId]
    );
    if (existing.rows.length > 0) {
      return { session_id: existing.rows[0].id, terminal_url: existing.rows[0].web_terminal_url, status: 'running' };
    }

    const userRes = await pool.query('SELECT gitea_token_encrypted FROM users WHERE id = $1', [userId]);
    const giteaToken = decrypt(userRes.rows[0].gitea_token_encrypted);

    const session = await sessions.createSession(userId, projectId, giteaToken);
    return {
      session_id: session.id,
      terminal_url: session.web_terminal_url,
      status: session.status,
    };
  });

  // Get session status
  app.get('/:id', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { id } = request.params as any;
    const { id: userId } = (request as any).user;
    const session = await sessions.getSession(id);
    if (!session) return reply.status(404).send({ error: 'Session not found' });
    if (session.user_id !== userId) return reply.status(403).send({ error: 'Not authorized' });
    return session;
  });

  // Complete session — push + create PR + cleanup
  app.post('/:id/complete', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { id } = request.params as any;
    const { id: userId } = (request as any).user;

    const sessionCheck = await pool.query('SELECT user_id FROM sessions WHERE id = $1', [id]);
    if (!sessionCheck.rows[0]) return reply.status(404).send({ error: 'Session not found' });
    if (sessionCheck.rows[0].user_id !== userId) return reply.status(403).send({ error: 'Not authorized' });

    const userRes = await pool.query('SELECT gitea_token_encrypted FROM users WHERE id = $1', [userId]);
    const giteaToken = decrypt(userRes.rows[0].gitea_token_encrypted);

    const result = await sessions.completeSession(id, giteaToken);
    return result;
  });

  // Abandon session — destroy container
  app.delete('/:id', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { id } = request.params as any;
    const { id: userId } = (request as any).user;

    const sessionCheck = await pool.query('SELECT user_id FROM sessions WHERE id = $1', [id]);
    if (!sessionCheck.rows[0]) return reply.status(404).send({ error: 'Session not found' });
    if (sessionCheck.rows[0].user_id !== userId) return reply.status(403).send({ error: 'Not authorized' });

    await sessions.destroySession(id);
    return { status: 'destroyed' };
  });
}
