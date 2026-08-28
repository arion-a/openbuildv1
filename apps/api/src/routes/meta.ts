import { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pool } from '../db/pool.js';

// Inject per-page <title> + Open Graph tags into the built index.html so shared
// links to a build, idea or maker unfurl. Everyone gets the same enriched HTML;
// the SPA still boots normally on top of it.

const SITE = process.env.PUBLIC_SITE_URL || 'https://openbuild.world';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clip(s: unknown, n = 200): string {
  const t = String(s ?? '').trim().replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

type PageMeta = { title: string; description?: string; image?: string; url: string };

function render(html: string, meta: PageMeta): string {
  const tags = [
    `<title>${esc(meta.title)}</title>`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="OpenBuild" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    meta.description && `<meta property="og:description" content="${esc(meta.description)}" />`,
    meta.image && `<meta property="og:image" content="${esc(meta.image)}" />`,
    `<meta property="og:url" content="${esc(meta.url)}" />`,
    `<meta name="twitter:card" content="${meta.image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
    meta.description && `<meta name="twitter:description" content="${esc(meta.description)}" />`,
    meta.image && `<meta name="twitter:image" content="${esc(meta.image)}" />`,
  ]
    .filter(Boolean)
    .join('\n    ');
  return html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace('</head>', `    ${tags}\n  </head>`);
}

export function registerMetaRoutes(app: FastifyInstance, webDist: string) {
  let indexHtml = '';
  try {
    indexHtml = readFileSync(join(webDist, 'index.html'), 'utf8');
  } catch {
    app.log.warn('registerMetaRoutes: index.html not found, skipping OG injection');
    return;
  }

  const html = (reply: any, meta: PageMeta) => reply.type('text/html').send(render(indexHtml, meta));

  app.get('/buildlive/:id', async (request, reply) => {
    const { id } = request.params as any;
    const res = await pool
      .query(`SELECT title, tagline, description, media FROM projects WHERE id = $1`, [id])
      .catch(() => null);
    const p = res?.rows[0];
    if (!p) return html(reply, { title: 'OpenBuild', url: `${SITE}/buildlive/${id}` });
    const media = Array.isArray(p.media) ? p.media : [];
    return html(reply, {
      title: `${p.title} — OpenBuild`,
      description: clip(p.tagline || p.description),
      image: media[0],
      url: `${SITE}/buildlive/${id}`,
    });
  });

  app.get('/ideastream/:id', async (request, reply) => {
    const { id } = request.params as any;
    const res = await pool
      .query(`SELECT title, body, media FROM ideas WHERE id = $1`, [id])
      .catch(() => null);
    const i = res?.rows[0];
    if (!i) return html(reply, { title: 'OpenBuild', url: `${SITE}/ideastream/${id}` });
    const media = Array.isArray(i.media) ? i.media : [];
    return html(reply, {
      title: `${i.title} — OpenBuild`,
      description: clip(i.body),
      image: media[0],
      url: `${SITE}/ideastream/${id}`,
    });
  });

  app.get('/u/:username', async (request, reply) => {
    const { username } = request.params as any;
    const handle = String(username || '').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
    const res = await pool
      .query(
        `SELECT COALESCE(NULLIF(TRIM(display_name), ''), username) AS name, bio, avatar_url
         FROM users WHERE username = $1`,
        [handle]
      )
      .catch(() => null);
    const u = res?.rows[0];
    if (!u) return html(reply, { title: 'OpenBuild', url: `${SITE}/u/${handle}` });
    return html(reply, {
      title: `${u.name} — OpenBuild`,
      description: clip(u.bio) || `${u.name} builds on OpenBuild.`,
      image: u.avatar_url || undefined,
      url: `${SITE}/u/${handle}`,
    });
  });
}
