import { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { notify } from '../services/notify.js';

async function userIdByHandle(handle: string): Promise<string | null> {
  const clean = (handle || '').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
  if (clean.length < 2) return null;
  const res = await pool.query('SELECT id FROM users WHERE username = $1', [clean]);
  return res.rows[0]?.id || null;
}

export async function followRoutes(app: FastifyInstance) {
  const auth = [(app as any).authenticate];

  // Toggle follow on a maker.
  app.post('/:username', { preHandler: auth }, async (request, reply) => {
    const { id: me } = (request as any).user;
    const target = await userIdByHandle((request.params as any).username);
    if (!target) return reply.status(404).send({ error: 'Not found' });
    if (target === me) return reply.status(400).send({ error: 'You can’t follow yourself' });

    const existing = await pool.query(
      'SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2',
      [me, target]
    );
    if (existing.rows.length) {
      await pool.query('DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2', [me, target]);
      return { following: false };
    }
    await pool.query('INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2)', [me, target]);
    await notify({ userId: target, actorId: me, type: 'follow', refKind: 'maker' });
    return { following: true };
  });

  // The signed-in user's "Following" feed: builds + ideas from people they follow.
  app.get('/feed', { preHandler: auth }, async (request) => {
    const { id: me } = (request as any).user;
    const { kind } = request.query as any;

    const builds =
      kind === 'ideas'
        ? { rows: [] }
        : await pool.query(
            `SELECT p.*, COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) AS owner_name,
                    u.username AS owner_username, u.avatar_url AS owner_avatar_url,
                    (SELECT COUNT(*) FROM project_reviews r WHERE r.project_id = p.id)::int AS review_count,
                    (SELECT COALESCE(AVG(rating), 0) FROM project_reviews r WHERE r.project_id = p.id)::float AS avg_rating
             FROM projects p
             JOIN users u ON u.id = p.owner_id
             WHERE p.owner_id IN (SELECT followee_id FROM follows WHERE follower_id = $1)
             ORDER BY p.created_at DESC LIMIT 40`,
            [me]
          );

    const ideas =
      kind === 'builds'
        ? { rows: [] }
        : await pool.query(
            `SELECT i.*, COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) AS author,
                    u.username AS author_username, u.avatar_url AS author_avatar_url,
                    (SELECT COUNT(*) FROM idea_threads WHERE idea_id = i.id) AS thread_count
             FROM ideas i
             JOIN users u ON u.id = i.author_id
             WHERE i.author_id IN (SELECT followee_id FROM follows WHERE follower_id = $1)
             ORDER BY i.created_at DESC LIMIT 40`,
            [me]
          );

    return { builds: builds.rows, ideas: ideas.rows };
  });
}
