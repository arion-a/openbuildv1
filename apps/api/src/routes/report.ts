import { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';

const KINDS = ['build', 'idea', 'maker', 'comment', 'message'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function reportRoutes(app: FastifyInstance) {
  app.post('/', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { id: me } = (request as any).user;
    const b = (request.body || {}) as Record<string, unknown>;
    const kind = typeof b.kind === 'string' ? b.kind : '';
    if (!KINDS.includes(kind)) return reply.status(400).send({ error: 'Unknown report kind' });

    const refId = typeof b.ref_id === 'string' && UUID_RE.test(b.ref_id) ? b.ref_id : null;
    const reason = typeof b.reason === 'string' ? b.reason.slice(0, 40) : null;
    const detail = typeof b.detail === 'string' ? b.detail.trim().slice(0, 2000) || null : null;

    const recent = await pool.query(
      "SELECT COUNT(*)::int AS n FROM reports WHERE reporter_id = $1 AND created_at > NOW() - INTERVAL '1 hour'",
      [me]
    );
    if (recent.rows[0].n >= 10) {
      return reply.status(429).send({ error: 'Too many reports just now. Try later.' });
    }

    await pool.query(
      `INSERT INTO reports (reporter_id, kind, ref_id, reason, detail) VALUES ($1, $2, $3, $4, $5)`,
      [me, kind, refId, reason, detail]
    );
    return { ok: true };
  });
}
