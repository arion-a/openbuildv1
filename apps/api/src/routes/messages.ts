import { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { notify } from '../services/notify.js';

const PUBLIC_USER = `
  id, username,
  COALESCE(NULLIF(TRIM(display_name), ''), username) AS display_name,
  avatar_url
`;

async function userByHandle(handle: string) {
  const clean = (handle || '').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
  if (clean.length < 2) return null;
  const res = await pool.query(`SELECT ${PUBLIC_USER} FROM users WHERE username = $1`, [clean]);
  return res.rows[0] || null;
}

export async function messageRoutes(app: FastifyInstance) {
  const auth = [(app as any).authenticate];

  // Unread total for the header badge.
  app.get('/unread-count', { preHandler: auth }, async (request) => {
    const { id: me } = (request as any).user;
    const res = await pool.query(
      'SELECT COUNT(*)::int AS n FROM messages WHERE to_user = $1 AND read_at IS NULL',
      [me]
    );
    return { count: res.rows[0].n };
  });

  // Conversation list: newest message per counterpart + unread count.
  app.get('/', { preHandler: auth }, async (request) => {
    const { id: me } = (request as any).user;
    const res = await pool.query(
      `SELECT DISTINCT ON (partner)
              partner,
              pu.username, COALESCE(NULLIF(TRIM(pu.display_name), ''), pu.username) AS display_name,
              pu.avatar_url,
              m.body, m.created_at, (m.from_user = $1) AS mine,
              (SELECT COUNT(*)::int FROM messages x
               WHERE x.to_user = $1 AND x.from_user = partner AND x.read_at IS NULL) AS unread
       FROM (
         SELECT *, CASE WHEN from_user = $1 THEN to_user ELSE from_user END AS partner
         FROM messages
         WHERE from_user = $1 OR to_user = $1
       ) m
       JOIN users pu ON pu.id = m.partner
       ORDER BY partner, m.created_at DESC`,
      [me]
    );
    return res.rows
      .map((r) => ({
        username: r.username,
        display_name: r.display_name,
        avatar_url: r.avatar_url,
        last: { body: r.body, created_at: r.created_at, mine: r.mine },
        unread: r.unread,
      }))
      .sort((a, b) => +new Date(b.last.created_at) - +new Date(a.last.created_at));
  });

  // Full thread with one user; marks their messages to me as read.
  app.get('/:username', { preHandler: auth }, async (request, reply) => {
    const { id: me } = (request as any).user;
    const other = await userByHandle((request.params as any).username);
    if (!other) return reply.status(404).send({ error: 'Not found' });

    await pool.query(
      'UPDATE messages SET read_at = NOW() WHERE to_user = $1 AND from_user = $2 AND read_at IS NULL',
      [me, other.id]
    );
    const res = await pool.query(
      `SELECT id, body, created_at, (from_user = $1) AS mine
       FROM messages
       WHERE (from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1)
       ORDER BY created_at ASC
       LIMIT 300`,
      [me, other.id]
    );
    return { with: other, messages: res.rows };
  });

  // Send a message.
  app.post('/:username', { preHandler: auth }, async (request, reply) => {
    const { id: me } = (request as any).user;
    const body = String((request.body as any)?.body ?? '').trim();
    if (!body) return reply.status(400).send({ error: 'Message is empty' });
    if (body.length > 5000) return reply.status(400).send({ error: 'Message is too long (5000 max)' });

    const other = await userByHandle((request.params as any).username);
    if (!other) return reply.status(404).send({ error: 'Recipient not found' });
    if (other.id === me) return reply.status(400).send({ error: 'You can’t message yourself' });

    const recent = await pool.query(
      "SELECT COUNT(*)::int AS n FROM messages WHERE from_user = $1 AND created_at > NOW() - INTERVAL '1 minute'",
      [me]
    );
    if (recent.rows[0].n >= 10) {
      return reply.status(429).send({ error: 'Slow down — too many messages just now.' });
    }

    const res = await pool.query(
      `INSERT INTO messages (from_user, to_user, body) VALUES ($1, $2, $3)
       RETURNING id, body, created_at, TRUE AS mine`,
      [me, other.id, body]
    );
    await notify({ userId: other.id, actorId: me, type: 'message', refKind: 'maker' });
    return res.rows[0];
  });
}
