import { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { config, decrypt } from '../config/env.js';

async function giteaFetch(path: string, token: string, options: RequestInit = {}) {
  const url = `${config.gitea.url}/api/v1${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `token ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gitea API error ${res.status}: ${body}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

export async function pullRoutes(app: FastifyInstance) {
  // List PRs for a project (any authenticated user)
  app.get('/project/:projectId', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { projectId } = request.params as any;
    const { id: userId } = (request as any).user;

    const projectRes = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
    const project = projectRes.rows[0];
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const userRes = await pool.query('SELECT gitea_token_encrypted FROM users WHERE id = $1', [userId]);
    const token = decrypt(userRes.rows[0].gitea_token_encrypted);

    const [owner, repo] = project.repo_name.split('/');
    const pulls = await giteaFetch(`/repos/${owner}/${repo}/pulls?state=open&sort=newest`, token);

    return pulls.map((pr: any) => ({
      id: pr.id,
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      author: pr.user?.login,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      head: pr.head?.label,
      base: pr.base?.label,
      mergeable: pr.mergeable,
      html_url: pr.html_url || `${config.gitea.url.replace(/\/$/, '')}/${owner}/${repo}/pulls/${pr.number}`,
    }));
  });

  // Get PR diff (any authenticated user)
  app.get('/project/:projectId/:number/diff', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { projectId, number: rawNumber } = request.params as any;
    const prNumber = parseInt(rawNumber, 10);
    if (!Number.isInteger(prNumber) || prNumber <= 0) return reply.status(400).send({ error: 'Invalid PR number' });
    const { id: userId } = (request as any).user;

    const projectRes = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
    const project = projectRes.rows[0];
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const userRes = await pool.query('SELECT gitea_token_encrypted FROM users WHERE id = $1', [userId]);
    const token = decrypt(userRes.rows[0].gitea_token_encrypted);

    const [owner, repo] = project.repo_name.split('/');

    // Get PR files (diff)
    const files = await giteaFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/files`, token);

    return files.map((f: any) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
    }));
  });

  // Merge a PR
  app.post('/project/:projectId/:number/merge', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { projectId, number: rawNumber } = request.params as any;
    const prNumber = parseInt(rawNumber, 10);
    if (!Number.isInteger(prNumber) || prNumber <= 0) return reply.status(400).send({ error: 'Invalid PR number' });
    const { id: userId } = (request as any).user;

    // Verify the user owns this project
    const projectRes = await pool.query('SELECT * FROM projects WHERE id = $1 AND owner_id = $2', [projectId, userId]);
    const project = projectRes.rows[0];
    if (!project) return reply.status(403).send({ error: 'Not authorized or project not found' });

    const userRes = await pool.query('SELECT gitea_token_encrypted FROM users WHERE id = $1', [userId]);
    const token = decrypt(userRes.rows[0].gitea_token_encrypted);

    const [owner, repo] = project.repo_name.split('/');

    const result = await giteaFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/merge`, token, {
      method: 'POST',
      body: JSON.stringify({
        Do: 'squash',
        merge_message_field: `Merge contribution #${prNumber}`,
      }),
    });

    return { merged: true };
  });

  // Close a PR
  app.post('/project/:projectId/:number/close', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { projectId, number: rawNumber } = request.params as any;
    const prNumber = parseInt(rawNumber, 10);
    if (!Number.isInteger(prNumber) || prNumber <= 0) return reply.status(400).send({ error: 'Invalid PR number' });
    const { id: userId } = (request as any).user;

    const projectRes = await pool.query('SELECT * FROM projects WHERE id = $1 AND owner_id = $2', [projectId, userId]);
    const project = projectRes.rows[0];
    if (!project) return reply.status(403).send({ error: 'Not authorized or project not found' });

    const userRes = await pool.query('SELECT gitea_token_encrypted FROM users WHERE id = $1', [userId]);
    const token = decrypt(userRes.rows[0].gitea_token_encrypted);

    const [owner, repo] = project.repo_name.split('/');

    await giteaFetch(`/repos/${owner}/${repo}/pulls/${prNumber}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed' }),
    });

    return { closed: true };
  });
}
