import { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { gitService } from '../services/git.service.js';
import { decrypt } from '../config/env.js';
import { readFileSync, createWriteStream } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { pipeline } from 'stream/promises';
import { execSync } from 'child_process';

export async function projectRoutes(app: FastifyInstance) {
  app.get('/', async (request) => {
    const { domain, status, limit: rawLimit = 20, offset: rawOffset = 0 } = request.query as any;
    const limit = Math.min(Math.max(parseInt(rawLimit) || 20, 1), 100);
    const offset = Math.max(parseInt(rawOffset) || 0, 0);
    let query = `
      SELECT p.*, COALESCE(u.display_name, u.username) as owner_name, u.avatar_url as owner_avatar_url,
        (SELECT COUNT(*) FROM project_contributors WHERE project_id = p.id) as contributor_count
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

    query += ` ORDER BY p.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limit, offset);

    const res = await pool.query(query, params);
    return res.rows;
  });

  app.get('/:id', async (request) => {
    const { id } = request.params as any;
    const projectRes = await pool.query(
      `SELECT p.*, COALESCE(u.display_name, u.username) as owner_name, u.avatar_url as owner_avatar_url FROM projects p
       JOIN users u ON p.owner_id = u.id WHERE p.id = $1`,
      [id]
    );
    if (!projectRes.rows[0]) return { error: 'Not found' };

    const contributors = await pool.query(
      `SELECT pc.*, COALESCE(u.display_name, u.username) as username, u.avatar_url FROM project_contributors pc
       JOIN users u ON pc.user_id = u.id WHERE pc.project_id = $1`,
      [id]
    );

    return { ...projectRes.rows[0], contributors: contributors.rows };
  });

  app.post('/', { preHandler: [(app as any).authenticate] }, async (request) => {
    const { id: userId } = (request as any).user;
    const { title, tagline, domain, tools_used, potential_applications } = request.body as any;

    // Get user's gitea token
    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userRes.rows[0];

    const repoName = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await gitService.createUserRepo(decrypt(user.gitea_token_encrypted), repoName, tagline || title);

    const res = await pool.query(
      `INSERT INTO projects (owner_id, title, tagline, repo_name, domain, tools_used, potential_applications)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [userId, title, tagline, `${user.username}/${repoName}`, domain, tools_used || [], potential_applications || []]
    );

    // Add owner as contributor
    await pool.query(
      `INSERT INTO project_contributors (project_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [res.rows[0].id, userId]
    );

    return res.rows[0];
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
      execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: 'pipe' });

      // Find the actual root (some zips have a single top-level folder)
      const entries = execSync(`ls "${extractDir}"`, { encoding: 'utf8' }).trim().split('\n');
      let baseDir = extractDir;
      if (entries.length === 1) {
        const stat = execSync(`file "${join(extractDir, entries[0])}"`, { encoding: 'utf8' });
        if (stat.includes('directory')) {
          baseDir = join(extractDir, entries[0]);
        }
      }

      // Get all files recursively (cap at 1000 to prevent abuse)
      const files = execSync(`find "${baseDir}" -type f`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
      if (files.length > 1000) {
        return reply.status(400).send({ error: 'ZIP contains too many files (max 1000)' });
      }

      let uploaded = 0;
      for (const filePath of files) {
        const resolved = resolve(filePath);
        if (!resolved.startsWith(resolve(baseDir))) continue; // path traversal protection
        const relativePath = filePath.slice(baseDir.length + 1);
        if (relativePath.startsWith('.git/') || relativePath === '.git') continue;

        const content = readFileSync(filePath, 'utf8');
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
    const { title, tagline, domain, tools_used, potential_applications, status, stage } = request.body as any;

    const res = await pool.query(
      `UPDATE projects SET
        title = COALESCE($2, title),
        tagline = COALESCE($3, tagline),
        domain = COALESCE($4, domain),
        tools_used = COALESCE($5, tools_used),
        potential_applications = COALESCE($6, potential_applications),
        status = COALESCE($7, status),
        stage = COALESCE($8, stage)
       WHERE id = $1 AND owner_id = $9
       RETURNING *`,
      [id, title || null, tagline || null, domain || null, tools_used || null, potential_applications || null, status || null, stage || null, userId]
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
}
