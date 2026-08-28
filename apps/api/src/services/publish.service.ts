import { pool } from '../db/pool.js';
import { gitService } from './git.service.js';
import { config, decrypt } from '../config/env.js';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PublishError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

export type PublishKind = 'build' | 'idea';

export type PublishInput = {
  kind: PublishKind;
  title?: string;
  body?: string;
  live_url?: string | null;
  how_to_replicate?: string | null;
  tools_used?: unknown;
  source_idea_id?: string | null;
  domain?: string | null;
  potential_applications?: unknown;
};

export function cleanHttpUrl(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

function asKind(raw: unknown): PublishKind {
  if (raw === 'build' || raw === 'idea') return raw;
  throw new PublishError(400, 'kind must be build or idea');
}

function asTitle(raw: unknown, required: boolean): string {
  const title = typeof raw === 'string' ? raw.trim() : '';
  if (required && !title) throw new PublishError(400, 'Title is required');
  if (title.length > 300) throw new PublishError(400, 'Title must be under 300 characters');
  return title;
}

function asBody(raw: unknown, required: boolean): string | null {
  const body = typeof raw === 'string' ? raw.trim() : '';
  if (required && !body) throw new PublishError(400, 'Body is required');
  if (body.length > 50000) throw new PublishError(400, 'Body must be under 50000 characters');
  return body || null;
}

function asTools(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((t) => typeof t === 'string').map((t) => t.trim()).filter(Boolean).slice(0, 30);
  }
  if (typeof raw === 'string') {
    return raw.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 30);
  }
  return [];
}

function asOptionalUuid(raw: unknown): string | null {
  if (!raw || typeof raw !== 'string') return null;
  if (!UUID_RE.test(raw)) return null;
  return raw;
}

function normalize(input: PublishInput, opts: { requireTitle: boolean; requireIdeaBody: boolean }) {
  const kind = asKind(input.kind);
  return {
    kind,
    title: asTitle(input.title, opts.requireTitle),
    body: asBody(input.body, opts.requireIdeaBody && kind === 'idea'),
    live_url: cleanHttpUrl(input.live_url),
    how_to_replicate: typeof input.how_to_replicate === 'string' ? input.how_to_replicate.trim() || null : null,
    tools_used: asTools(input.tools_used),
    source_idea_id: asOptionalUuid(input.source_idea_id),
    domain: typeof input.domain === 'string' ? input.domain.trim().slice(0, 100) || null : null,
    potential_applications: asTools(input.potential_applications),
  };
}

async function insertProject(userId: string, data: ReturnType<typeof normalize>) {
  const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  const user = userRes.rows[0];
  if (!user) throw new PublishError(401, 'User not found');

  const repoName = (data.title || 'build').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'build';
  if (config.gitea.autoProvision && user.gitea_token_encrypted) {
    try {
      await gitService.createUserRepo(decrypt(user.gitea_token_encrypted), repoName, data.body || data.title);
    } catch (err: any) {
      console.warn('[publish] Gitea repo create skipped:', err.message);
    }
  }

  const res = await pool.query(
    `INSERT INTO projects (owner_id, title, tagline, repo_name, domain, tools_used, potential_applications, live_url, how_to_replicate)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [userId, data.title, data.body, `${user.username}/${repoName}`, data.domain, data.tools_used, data.potential_applications, data.live_url, data.how_to_replicate]
  );

  await pool.query(
    `INSERT INTO project_contributors (project_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [res.rows[0].id, userId]
  );

  if (data.source_idea_id) {
    await pool.query(
      'UPDATE ideas SET build_id = $1 WHERE id = $2 AND build_id IS NULL',
      [res.rows[0].id, data.source_idea_id]
    );
  }

  return res.rows[0];
}

async function insertIdea(userId: string, data: ReturnType<typeof normalize>) {
  const res = await pool.query(
    `INSERT INTO ideas (author_id, title, body, domain, tags)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, data.title, data.body, data.domain, []]
  );
  const idea = res.rows[0];
  const u = await pool.query(
    'SELECT COALESCE(display_name, username) as author, username as author_username, avatar_url as author_avatar_url FROM users WHERE id = $1',
    [userId]
  );
  return { ...idea, ...u.rows[0], thread_count: 0, upvoted: false };
}

async function insertPublicationRow(userId: string, data: ReturnType<typeof normalize>, extra: {
  status: 'draft' | 'published';
  project_id?: string | null;
  idea_id?: string | null;
}) {
  const res = await pool.query(
    `INSERT INTO publications (
       author_id, kind, status, title, body, live_url, how_to_replicate, tools_used,
       source_idea_id, project_id, idea_id, published_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [
      userId,
      data.kind,
      extra.status,
      data.title,
      data.body,
      data.live_url,
      data.how_to_replicate,
      data.tools_used,
      data.source_idea_id,
      extra.project_id || null,
      extra.idea_id || null,
      extra.status === 'published' ? new Date() : null,
    ]
  );
  return res.rows[0];
}

export async function listMine(userId: string) {
  const res = await pool.query(
    `SELECT * FROM publications WHERE author_id = $1 ORDER BY updated_at DESC LIMIT 50`,
    [userId]
  );
  return res.rows;
}

export async function getOwned(userId: string, id: string) {
  if (!UUID_RE.test(id)) throw new PublishError(404, 'Not found');
  const res = await pool.query(
    'SELECT * FROM publications WHERE id = $1 AND author_id = $2',
    [id, userId]
  );
  if (!res.rows[0]) throw new PublishError(404, 'Not found');
  return res.rows[0];
}

export async function saveDraft(userId: string, input: PublishInput) {
  const data = normalize(input, { requireTitle: false, requireIdeaBody: false });
  return insertPublicationRow(userId, data, { status: 'draft' });
}

export async function updateDraft(userId: string, id: string, input: Partial<PublishInput> & { kind?: PublishKind }) {
  const existing = await getOwned(userId, id);
  if (existing.status !== 'draft') throw new PublishError(409, 'Already published');
  const data = normalize(
    {
      kind: (input.kind as PublishKind) || existing.kind,
      title: input.title !== undefined ? input.title : existing.title,
      body: input.body !== undefined ? input.body : existing.body,
      live_url: input.live_url !== undefined ? input.live_url : existing.live_url,
      how_to_replicate: input.how_to_replicate !== undefined ? input.how_to_replicate : existing.how_to_replicate,
      tools_used: input.tools_used !== undefined ? input.tools_used : existing.tools_used,
      source_idea_id: input.source_idea_id !== undefined ? input.source_idea_id : existing.source_idea_id,
      domain: existing.domain,
      potential_applications: existing.potential_applications,
    },
    { requireTitle: false, requireIdeaBody: false }
  );
  const res = await pool.query(
    `UPDATE publications SET
       kind = $1, title = $2, body = $3, live_url = $4, how_to_replicate = $5,
       tools_used = $6, source_idea_id = $7, updated_at = NOW()
     WHERE id = $8 AND author_id = $9 AND status = 'draft' RETURNING *`,
    [data.kind, data.title, data.body, data.live_url, data.how_to_replicate, data.tools_used, data.source_idea_id, id, userId]
  );
  if (!res.rows[0]) throw new PublishError(409, 'Already published');
  return res.rows[0];
}

export async function deleteDraft(userId: string, id: string) {
  const existing = await getOwned(userId, id);
  if (existing.status !== 'draft') throw new PublishError(409, 'Published records cannot be deleted here');
  await pool.query('DELETE FROM publications WHERE id = $1 AND author_id = $2 AND status = $3', [id, userId, 'draft']);
}

export async function createLive(userId: string, input: PublishInput) {
  const data = normalize(input, { requireTitle: true, requireIdeaBody: true });
  if (data.kind === 'build') {
    const project = await insertProject(userId, data);
    const publication = await insertPublicationRow(userId, data, { status: 'published', project_id: project.id });
    return { publication, project, idea: null };
  }
  const idea = await insertIdea(userId, data);
  const publication = await insertPublicationRow(userId, data, { status: 'published', idea_id: idea.id });
  return { publication, project: null, idea };
}

export async function publishDraft(userId: string, id: string) {
  const existing = await getOwned(userId, id);
  if (existing.status === 'published') {
    return { publication: existing, project: null, idea: null, already: true };
  }
  const data = normalize(existing, { requireTitle: true, requireIdeaBody: true });
  if (data.kind === 'build') {
    const project = await insertProject(userId, data);
    const res = await pool.query(
      `UPDATE publications SET status = 'published', project_id = $1, published_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND author_id = $3 RETURNING *`,
      [project.id, id, userId]
    );
    return { publication: res.rows[0], project, idea: null, already: false };
  }
  const idea = await insertIdea(userId, data);
  const res = await pool.query(
    `UPDATE publications SET status = 'published', idea_id = $1, published_at = NOW(), updated_at = NOW()
     WHERE id = $2 AND author_id = $3 RETURNING *`,
    [idea.id, id, userId]
  );
  return { publication: res.rows[0], project: null, idea, already: false };
}
