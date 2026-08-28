import { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';

export async function notificationRoutes(app: FastifyInstance) {
  const auth = [(app as any).authenticate];

  app.get('/unread-count', { preHandler: auth }, async (request) => {
    const { id: me } = (request as any).user;
    const res = await pool.query(
      'SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [me]
    );
    return { count: res.rows[0].n };
  });

  app.get('/', { preHandler: auth }, async (request) => {
    const { id: me } = (request as any).user;
    const res = await pool.query(
      `SELECT n.id, n.type, n.ref_kind, n.ref_id, n.read_at, n.created_at,
              au.username AS actor_username,
              COALESCE(NULLIF(TRIM(au.display_name), ''), au.username) AS actor_name,
              au.avatar_url AS actor_avatar_url,
              CASE
                WHEN n.ref_kind = 'build' THEN (SELECT title FROM projects WHERE id = n.ref_id)
                WHEN n.ref_kind = 'idea'  THEN (SELECT title FROM ideas    WHERE id = n.ref_id)
                ELSE NULL
              END AS ref_title
       FROM notifications n
       LEFT JOIN users au ON au.id = n.actor_id
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [me]
    );
    return res.rows;
  });

  // Mark all (or a subset) read.
  app.post('/read', { preHandler: auth }, async (request) => {
    const { id: me } = (request as any).user;
    const ids = (request.body as any)?.ids;
    if (Array.isArray(ids) && ids.length) {
      await pool.query(
        'UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND id = ANY($2) AND read_at IS NULL',
        [me, ids]
      );
    } else {
      await pool.query(
        'UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL',
        [me]
      );
    }
    return { ok: true };
  });
}
