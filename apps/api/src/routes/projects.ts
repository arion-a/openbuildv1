import { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { gitService } from '../services/git.service.js';
import { decrypt, giteaWebBase } from '../config/env.js';
import { firebaseAdmin } from '../config/firebase.js';
import { cleanHttpUrl, createLive, sanitizeMedia, PublishError } from '../services/publish.service.js';
import { readFileSync, createWriteStream, mkdirSync, readdirSync, statSync } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import { pipeline } from 'stream/promises';
import { execFileSync } from 'child_process';

function withGitUrl(row: any) {
  const base = giteaWebBase();
  return { ...row, git_url: row.repo_name && base ? `${base}/${row.repo_name}` : null };
}

function extractZip(zipPath: string, extractDir: string) {
  mkdirSync(extractDir, { recursive: true });
  try {
    execFileSync('tar', ['-xf', zipPath, '-C', extractDir], { stdio: 'pipe' });
    return;
  } catch {}
  try {
    execFileSync('unzip', ['-o', zipPath, '-d', extractDir], { stdio: 'pipe' });
    return;
  } catch {}
  execFileSync(
    'powershell',
    ['-NoProfile', '-Command', `Expand-Archive -LiteralPath ${JSON.stringify(zipPath)} -DestinationPath ${JSON.stringify(extractDir)} -Force`],
    { stdio: 'pipe' }
  );
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...listFiles(p));
    else if (st.isFile()) out.push(p);
  }
  return out;
}

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

export async function projectRoutes(app: FastifyInstance) {
  app.get('/', async (request) => {
    const { domain, status, tool, sort: rawSort, limit: rawLimit = 20, offset: rawOffset = 0 } = request.query as any;
    const limit = Math.min(Math.max(parseInt(rawLimit) || 20, 1), 100);
    const offset = Math.max(parseInt(rawOffset) || 0, 0);
    const sort = ['new', 'top', 'stars'].includes(rawSort) ? rawSort : 'new';
    let query = `
      SELECT p.*, COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) as owner_name, u.username as owner_username, u.avatar_url as owner_avatar_url,
        (SELECT COUNT(*) FROM project_contributors WHERE project_id = p.id) as contributor_count,
        (SELECT COUNT(*) FROM project_reviews WHERE project_id = p.id)::int as review_count,
        (SELECT COALESCE(AVG(rating), 0) FROM project_reviews WHERE project_id = p.id)::float as avg_rating
      FROM projects p
      JOIN users u ON p.owner_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIdx = 1;

    if (domain) {
      query += ` AND p.domain = $${paramIdx++}`;
      params.push(domain);
    }
    if (status) {
      query += ` AND p.status = $${paramIdx++}`;
      params.push(status);
    }
    if (tool) {
      query += ` AND $${paramIdx++} = ANY(p.tools_used)`;
      params.push(tool);
    }

    const orderBy =
      sort === 'top'
        ? 'avg_rating DESC, review_count DESC, p.created_at DESC'
        : sort === 'stars'
          ? 'p.upvotes DESC, p.created_at DESC'
          : 'p.created_at DESC';
    query += ` ORDER BY ${orderBy} LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limit, offset);

    const currentUserId = await extractUserId(app, request);
    const res = await pool.query(query, params);
    const rows = res.rows;
    if (currentUserId && rows.length > 0) {
      const ids = rows.map((r: any) => r.id);
      const voted = await pool.query(
        'SELECT project_id FROM project_upvotes WHERE user_id = $1 AND project_id = ANY($2)',
        [currentUserId, ids]
      );
      const set = new Set(voted.rows.map((r: any) => r.project_id));
      for (const row of rows) (row as any).upvoted = set.has(row.id);
    }
    return rows.map(withGitUrl);
  });

  app.get('/:id', async (request) => {
    const { id } = request.params as any;
    const projectRes = await pool.query(
      `SELECT p.*, COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) as owner_name, u.username as owner_username, u.avatar_url as owner_avatar_url FROM projects p
       JOIN users u ON p.owner_id = u.id WHERE p.id = $1`,
      [id]
    );
    if (!projectRes.rows[0]) return { error: 'Not found' };

    const currentUserId = await extractUserId(app, request);
    const contributors = await pool.query(
      `SELECT pc.*, COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) as username, u.username as handle, u.avatar_url FROM project_contributors pc
       JOIN users u ON pc.user_id = u.id WHERE pc.project_id = $1`,
      [id]
    );

    let upvoted = false;
    if (currentUserId) {
      const v = await pool.query(
        'SELECT 1 FROM project_upvotes WHERE project_id = $1 AND user_id = $2',
        [id, currentUserId]
      );
      upvoted = v.rows.length > 0;
    }

    const reviewAgg = await pool.query(
      `SELECT COUNT(*)::int AS review_count, COALESCE(AVG(rating), 0)::float AS avg_rating
       FROM project_reviews WHERE project_id = $1`,
      [id]
    );
    let myReview = null;
    if (currentUserId) {
      const mine = await pool.query(
        `SELECT id, rating, body, created_at FROM project_reviews WHERE project_id = $1 AND user_id = $2`,
        [id, currentUserId]
      );
      myReview = mine.rows[0] || null;
    }

    return withGitUrl({
      ...projectRes.rows[0],
      contributors: contributors.rows,
      upvoted,
      review_count: reviewAgg.rows[0]?.review_count || 0,
      avg_rating: Number(reviewAgg.rows[0]?.avg_rating || 0),
      my_review: myReview,
    });
  });

  app.post('/', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { id: userId } = (request as any).user;
    const body = request.body as any;
    try {
      const { project } = await createLive(userId, {
        kind: 'build',
        title: body.title,
        body: body.tagline,
        description: body.description,
        media: body.media,
        live_url: body.live_url,
        how_to_replicate: body.how_to_replicate,
        tools_used: body.tools_used,
        source_idea_id: body.idea_id,
        domain: body.domain,
        potential_applications: body.potential_applications,
      });
      return project;
    } catch (err) {
      if (err instanceof PublishError) {
        return reply.status(err.statusCode).send({ error: err.message, message: err.message });
      }
      throw err;
    }
  });

  // Upload ZIP to populate project repo
  app.post('/:id/upload', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { id } = request.params as any;
    const { id: userId } = (request as any).user;

    const projectRes = await pool.query('SELECT * FROM projects WHERE id = $1 AND owner_id = $2', [id, userId]);
    const project = projectRes.rows[0];
    if (!project) return reply.status(403).send({ error: 'Not authorized' });

    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userRes.rows[0];
    const token = decrypt(user.gitea_token_encrypted);
    const [owner, repo] = project.repo_name.split('/');

    const data = await (request as any).file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded' });

    const tmpDir = await mkdtemp(join(tmpdir(), 'ob-upload-'));
    const zipPath = join(tmpDir, 'upload.zip');
    const extractDir = join(tmpDir, 'extracted');

    try {
      await pipeline(data.file, createWriteStream(zipPath));
      extractZip(zipPath, extractDir);

      const top = readdirSync(extractDir);
      let baseDir = extractDir;
      if (top.length === 1 && statSync(join(extractDir, top[0])).isDirectory()) {
        baseDir = join(extractDir, top[0]);
      }

      const files = listFiles(baseDir);
      if (files.length > 1000) {
        return reply.status(400).send({ error: 'ZIP contains too many files (max 1000)' });
      }

      let uploaded = 0;
      for (const filePath of files) {
        const relativePath = relative(baseDir, filePath).replace(/\\/g, '/');
        if (!relativePath || relativePath.startsWith('..') || relativePath.startsWith('.git/') || relativePath === '.git') continue;

        const content = readFileSync(filePath);
        try {
          await gitService.createFile(token, owner, repo, relativePath, content, `Add ${relativePath}`);
          uploaded++;
        } catch (err: any) {
          console.warn(`[upload] Failed to push ${relativePath}:`, err.message);
        }
      }

      return { uploaded, total: files.length };
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  // Update project info (owner only)
  app.put('/:id', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { id } = request.params as any;
    const { id: userId } = (request as any).user;
    const { title, tagline, description, media, domain, tools_used, potential_applications, status, stage, live_url, how_to_replicate } = request.body as any;

    const res = await pool.query(
      `UPDATE projects SET
        title = COALESCE($2, title),
        tagline = COALESCE($3, tagline),
        description = COALESCE($4, description),
        media = COALESCE($5, media),
        domain = COALESCE($6, domain),
        tools_used = COALESCE($7, tools_used),
        potential_applications = COALESCE($8, potential_applications),
        status = COALESCE($9, status),
        stage = COALESCE($10, stage),
        live_url = COALESCE($11, live_url),
        how_to_replicate = COALESCE($12, how_to_replicate)
       WHERE id = $1 AND owner_id = $13
       RETURNING *`,
      [
        id,
        title || null,
        tagline || null,
        description !== undefined ? (description || null) : null,
        media !== undefined ? JSON.stringify(sanitizeMedia(media)) : null,
        domain || null,
        tools_used || null,
        potential_applications || null,
        status || null,
        stage || null,
        live_url !== undefined ? cleanHttpUrl(live_url) : null,
        how_to_replicate !== undefined ? (how_to_replicate || null) : null,
        userId,
      ]
    );
    if (!res.rows[0]) return reply.status(403).send({ error: 'Not authorized' });
    return res.rows[0];
  });

  app.delete('/:id', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { id } = request.params as any;
    const { id: userId } = (request as any).user;

    const res = await pool.query('DELETE FROM projects WHERE id = $1 AND owner_id = $2 RETURNING id', [id, userId]);
    if (!res.rows[0]) return reply.status(403).send({ error: 'Not authorized' });
    return { deleted: true };
  });

  app.post('/:id/upvote', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { id } = request.params as any;
    const { id: userId } = (request as any).user;
    const exists = await pool.query('SELECT id FROM projects WHERE id = $1', [id]);
    if (!exists.rows[0]) return reply.status(404).send({ error: 'Not found' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        'SELECT 1 FROM project_upvotes WHERE project_id = $1 AND user_id = $2 FOR UPDATE',
        [id, userId]
      );
      if (existing.rows.length > 0) {
        await client.query('DELETE FROM project_upvotes WHERE project_id = $1 AND user_id = $2', [id, userId]);
        await client.query('UPDATE projects SET upvotes = GREATEST(upvotes - 1, 0) WHERE id = $1', [id]);
      } else {
        await client.query('INSERT INTO project_upvotes (project_id, user_id) VALUES ($1, $2)', [id, userId]);
        await client.query('UPDATE projects SET upvotes = COALESCE(upvotes, 0) + 1 WHERE id = $1', [id]);
      }
      const res = await client.query('SELECT upvotes FROM projects WHERE id = $1', [id]);
      await client.query('COMMIT');
      return { upvotes: res.rows[0]?.upvotes || 0, upvoted: existing.rows.length === 0 };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  app.get('/:id/threads', async (request) => {
    const { id } = request.params as any;
    const res = await pool.query(
      `SELECT t.*, COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) as username, u.username as handle, u.avatar_url
       FROM project_threads t
       JOIN users u ON t.author_id = u.id
       WHERE t.project_id = $1
       ORDER BY t.created_at ASC`,
      [id]
    );
    return res.rows;
  });

  app.post('/:id/threads', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { id } = request.params as any;
    const { id: userId } = (request as any).user;
    const { body } = request.body as any;
    if (!body || typeof body !== 'string' || body.length > 50000) {
      return reply.status(400).send({ error: 'Body is required and must be under 50000 characters' });
    }
    const project = await pool.query('SELECT id FROM projects WHERE id = $1', [id]);
    if (!project.rows[0]) return reply.status(404).send({ error: 'Not found' });

    const res = await pool.query(
      `INSERT INTO project_threads (project_id, author_id, body) VALUES ($1, $2, $3) RETURNING *`,
      [id, userId, body]
    );
    const userRes = await pool.query('SELECT display_name, username, avatar_url FROM users WHERE id = $1', [userId]);
    const u = userRes.rows[0];
    return { ...res.rows[0], username: (u?.display_name && String(u.display_name).trim()) || u?.username, handle: u?.username, avatar_url: u?.avatar_url };
  });

  app.get('/:id/reviews', async (request, reply) => {
    const { id } = request.params as any;
    const exists = await pool.query('SELECT id FROM projects WHERE id = $1', [id]);
    if (!exists.rows[0]) return reply.status(404).send({ error: 'Not found' });
    const res = await pool.query(
      `SELECT r.id, r.rating, r.body, r.created_at,
              COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) AS username,
              u.username AS handle, u.avatar_url
       FROM project_reviews r
       JOIN users u ON r.user_id = u.id
       WHERE r.project_id = $1
       ORDER BY r.created_at DESC`,
      [id]
    );
    return res.rows;
  });

  app.post('/:id/reviews', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { id } = request.params as any;
    const { id: userId } = (request as any).user;
    const body = request.body as any;
    const rating = parseInt(body?.rating, 10);
    const text = typeof body?.body === 'string' ? body.body.trim() : '';
    if (rating < 1 || rating > 5) {
      return reply.status(400).send({ error: 'Rating must be 1 to 5' });
    }
    if (text.length > 2000) {
      return reply.status(400).send({ error: 'Review must be under 2000 characters' });
    }
    const project = await pool.query('SELECT id, owner_id FROM projects WHERE id = $1', [id]);
    if (!project.rows[0]) return reply.status(404).send({ error: 'Not found' });
    if (project.rows[0].owner_id === userId) {
      return reply.status(400).send({ error: 'You can’t review your own build' });
    }

    const res = await pool.query(
      `INSERT INTO project_reviews (project_id, user_id, rating, body)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, user_id)
       DO UPDATE SET rating = EXCLUDED.rating, body = EXCLUDED.body, created_at = NOW()
       RETURNING *`,
      [id, userId, rating, text || null]
    );
    const userRes = await pool.query('SELECT display_name, username, avatar_url FROM users WHERE id = $1', [userId]);
    const u = userRes.rows[0];
    return {
      ...res.rows[0],
      username: (u?.display_name && String(u.display_name).trim()) || u?.username,
      handle: u?.username,
      avatar_url: u?.avatar_url,
    };
  });
}
