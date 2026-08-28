import { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { llmService } from '../services/llm.service.js';
import { firebaseAdmin } from '../config/firebase.js';
import { createLive, PublishError } from '../services/publish.service.js';
import { notify } from '../services/notify.js';

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

    const { domain, tags, sort: rawSort, limit: rawLimit = 20, offset: rawOffset = 0 } = request.query as any;
    const limit = Math.min(Math.max(parseInt(rawLimit) || 20, 1), 100);
    const offset = Math.max(parseInt(rawOffset) || 0, 0);
    const sort = ['new', 'top', 'discussed', 'trending'].includes(rawSort) ? rawSort : 'new';
    let query = `
      SELECT i.*, COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) as author, u.username as author_username, u.avatar_url as author_avatar_url,
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

    const orderBy =
      sort === 'top'
        ? 'i.upvotes DESC, i.created_at DESC'
        : sort === 'discussed'
          ? 'thread_count DESC, i.created_at DESC'
          : sort === 'trending'
            ? `(i.upvotes * 2
                + (SELECT COUNT(*) FROM idea_threads WHERE idea_id = i.id) * 3
                + CASE WHEN i.created_at > NOW() - INTERVAL '3 days' THEN 12
                       WHEN i.created_at > NOW() - INTERVAL '14 days' THEN 6
                       ELSE 0 END) DESC, i.created_at DESC`
            : 'i.created_at DESC';
    query += ` ORDER BY ${orderBy} LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limit, offset);

    const res = await pool.query(query, params);
    const ideas = res.rows;

    if (currentUserId && ideas.length > 0) {
      const ideaIds = ideas.map((i: any) => i.id);
      const upvoteRes = await pool.query(
        'SELECT idea_id FROM idea_upvotes WHERE user_id = $1 AND idea_id = ANY($2)',
        [currentUserId, ideaIds]
      );
      const upvotedSet = new Set(upvoteRes.rows.map((r: any) => r.idea_id));
      for (const idea of ideas) {
        (idea as any).upvoted = upvotedSet.has(idea.id);
      }
    }

    return ideas;
  });

  // Post idea
  app.post('/', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { id: userId } = (request as any).user;
    const body = request.body as any;
    try {
      const { idea } = await createLive(userId, {
        kind: 'idea',
        title: body.title,
        body: body.body,
        media: body.media,
        domain: body.domain,
      });
      return idea;
    } catch (err) {
      if (err instanceof PublishError) {
        return reply.status(err.statusCode).send({ error: err.message, message: err.message });
      }
      throw err;
    }
  });

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as any;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return reply.status(404).send({ error: 'Not found' });
    }
    const currentUserId = await extractUserId(app, request);
    const res = await pool.query(
      `SELECT i.*, COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) as author, u.username as author_username,
              u.avatar_url as author_avatar_url,
              p.id as linked_build_id, p.title as linked_build_title
       FROM ideas i
       JOIN users u ON i.author_id = u.id
       LEFT JOIN projects p ON p.id = i.build_id
       WHERE i.id = $1`,
      [id]
    );
    if (!res.rows[0]) return reply.status(404).send({ error: 'Not found' });
    const idea = res.rows[0];
    if (currentUserId) {
      const v = await pool.query(
        'SELECT 1 FROM idea_upvotes WHERE idea_id = $1 AND user_id = $2',
        [id, currentUserId]
      );
      idea.upvoted = v.rows.length > 0;
    }
    idea.build = idea.linked_build_id
      ? { id: idea.linked_build_id, title: idea.linked_build_title }
      : null;
    delete idea.linked_build_id;
    delete idea.linked_build_title;
    return idea;
  });

  // Discussion threads (Ask)
  app.get('/:id/threads', async (request) => {
    const { id } = request.params as any;
    const res = await pool.query(
      `SELECT t.*, COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) as username, u.username as handle, u.avatar_url FROM idea_threads t
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
    const ideaOwner = await pool.query('SELECT author_id FROM ideas WHERE id = $1', [ideaId]);
    if (ideaOwner.rows[0]) {
      await notify({ userId: ideaOwner.rows[0].author_id, actorId: userId, type: 'comment_idea', refKind: 'idea', refId: ideaId });
    }
    const userRes = await pool.query('SELECT display_name, username, avatar_url FROM users WHERE id = $1', [userId]);
    const u = userRes.rows[0];
    return { ...thread, username: (u?.display_name && String(u.display_name).trim()) || u?.username, handle: u?.username, avatar_url: u?.avatar_url };
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

      const res = await client.query('SELECT upvotes, author_id FROM ideas WHERE id = $1', [id]);
      await client.query('COMMIT');
      const upvoted = existing.rows.length === 0;
      if (upvoted && res.rows[0]) {
        await notify({ userId: res.rows[0].author_id, actorId: userId, type: 'star_idea', refKind: 'idea', refId: id });
      }
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
