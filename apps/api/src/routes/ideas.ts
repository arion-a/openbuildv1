import { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { llmService } from '../services/llm.service.js';
import { firebaseAdmin } from '../config/firebase.js';

async function extractUserId(app: FastifyInstance, request: any): Promise<string | null> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];

  try {
    const decoded = app.jwt.verify(token) as any;
    return decoded.id || null;
  } catch {}

  try {
    const decoded = await firebaseAdmin.auth().verifyIdToken(token);
    const res = await pool.query('SELECT id FROM users WHERE firebase_uid = $1', [decoded.uid]);
    return res.rows[0]?.id || null;
  } catch {}

  return null;
}

export async function ideaRoutes(app: FastifyInstance) {
  // Feed
  app.get('/', async (request) => {
    const currentUserId = await extractUserId(app, request);

    const { domain, tags, limit: rawLimit = 20, offset: rawOffset = 0 } = request.query as any;
    const limit = Math.min(Math.max(parseInt(rawLimit) || 20, 1), 100);
    const offset = Math.max(parseInt(rawOffset) || 0, 0);
    let query = `
      SELECT i.*, COALESCE(u.display_name, u.username) as author, u.avatar_url as author_avatar_url,
        (SELECT COUNT(*) FROM idea_threads WHERE idea_id = i.id) as thread_count
      FROM ideas i
      JOIN users u ON i.author_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIdx = 1;

    if (domain) {
      query += ` AND i.domain = $${paramIdx++}`;
      params.push(domain);
    }
    if (tags) {
      query += ` AND i.tags && $${paramIdx++}`;
      params.push(tags.split(','));
    }

    query += ` ORDER BY i.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limit, offset);

    const res = await pool.query(query, params);
    const ideas = res.rows;

    if (ideas.length > 0) {
      const ideaIds = ideas.map((i: any) => i.id);
      const collabRes = await pool.query(
        `SELECT DISTINCT ON (t.idea_id, t.author_id)
           t.idea_id, COALESCE(u.display_name, u.username) as username, u.avatar_url
         FROM idea_threads t
         JOIN users u ON t.author_id = u.id
         WHERE t.idea_id = ANY($1)
         ORDER BY t.idea_id, t.author_id, t.created_at ASC`,
        [ideaIds]
      );
      const collabMap: Record<string, { username: string; avatar_url: string | null }[]> = {};
      for (const row of collabRes.rows) {
        if (!collabMap[row.idea_id]) collabMap[row.idea_id] = [];
        collabMap[row.idea_id].push({ username: row.username, avatar_url: row.avatar_url });
      }
      for (const idea of ideas) {
        (idea as any).collaborators = collabMap[idea.id] || [];
      }

      if (currentUserId) {
        const upvoteRes = await pool.query(
          'SELECT idea_id FROM idea_upvotes WHERE user_id = $1 AND idea_id = ANY($2)',
          [currentUserId, ideaIds]
        );
        const upvotedSet = new Set(upvoteRes.rows.map((r: any) => r.idea_id));
        for (const idea of ideas) {
          (idea as any).upvoted = upvotedSet.has(idea.id);
        }
      }
    }

    return ideas;
  });

  // Post idea
  app.post('/', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { id: userId } = (request as any).user;
    const { title, body, domain, tags } = request.body as any;

    if (!title || typeof title !== 'string' || title.length > 300) {
      return reply.status(400).send({ error: 'Title is required and must be under 300 characters' });
    }
    if (!body || typeof body !== 'string' || body.length > 50000) {
      return reply.status(400).send({ error: 'Body is required and must be under 50000 characters' });
    }
    if (tags && (!Array.isArray(tags) || tags.length > 20 || tags.some((t: any) => typeof t !== 'string' || t.length > 50))) {
      return reply.status(400).send({ error: 'Tags must be an array of up to 20 strings (max 50 chars each)' });
    }

    const res = await pool.query(
      `INSERT INTO ideas (author_id, title, body, domain, tags)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, title, body, domain || null, tags || []]
    );
    return res.rows[0];
  });

  // Discussion threads (Ask)
  app.get('/:id/threads', async (request) => {
    const { id } = request.params as any;
    const res = await pool.query(
      `SELECT t.*, COALESCE(u.display_name, u.username) as username, u.avatar_url FROM idea_threads t
       JOIN users u ON t.author_id = u.id
       WHERE t.idea_id = $1
       ORDER BY t.created_at ASC`,
      [id]
    );
    return res.rows;
  });

  // Post reply
  app.post('/:id/threads', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { id: ideaId } = request.params as any;
    const { id: userId } = (request as any).user;
    const { body, parent_id } = request.body as any;

    if (!body || typeof body !== 'string' || body.length > 50000) {
      return reply.status(400).send({ error: 'Body is required and must be under 50000 characters' });
    }

    const res = await pool.query(
      `INSERT INTO idea_threads (idea_id, author_id, body, parent_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [ideaId, userId, body, parent_id || null]
    );
    const thread = res.rows[0];
    const userRes = await pool.query('SELECT display_name, username, avatar_url FROM users WHERE id = $1', [userId]);
    const u = userRes.rows[0];
    return { ...thread, username: u?.display_name || u?.username, avatar_url: u?.avatar_url };
  });

  // Upvote (toggle)
  app.post('/:id/upvote', { preHandler: [(app as any).authenticate] }, async (request) => {
    const { id } = request.params as any;
    const { id: userId } = (request as any).user;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        'SELECT 1 FROM idea_upvotes WHERE idea_id = $1 AND user_id = $2 FOR UPDATE',
        [id, userId]
      );

      if (existing.rows.length > 0) {
        await client.query('DELETE FROM idea_upvotes WHERE idea_id = $1 AND user_id = $2', [id, userId]);
        await client.query('UPDATE ideas SET upvotes = GREATEST(upvotes - 1, 0) WHERE id = $1', [id]);
      } else {
        await client.query('INSERT INTO idea_upvotes (idea_id, user_id) VALUES ($1, $2)', [id, userId]);
        await client.query('UPDATE ideas SET upvotes = upvotes + 1 WHERE id = $1', [id]);
      }

      const res = await client.query('SELECT upvotes FROM ideas WHERE id = $1', [id]);
      await client.query('COMMIT');
      const upvoted = existing.rows.length === 0;
      return { upvotes: res.rows[0]?.upvotes, upvoted };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // Summarise (LLM)
  app.post('/:id/summarise', { preHandler: [(app as any).authenticate] }, async (request) => {
    const { id } = request.params as any;
    const result = await llmService.summariseDiscussion(id);
    return result;
  });
}
