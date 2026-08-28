import { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';

// GET /search?q=&type=all|builds|ideas|makers&limit=
// Full-text over builds + ideas via the generated search_tsv columns; makers by
// ILIKE (small table). websearch_to_tsquery tolerates quotes / OR / bare words.

export async function searchRoutes(app: FastifyInstance) {
  app.get('/', async (request) => {
    const { q: rawQ, type: rawType, limit: rawLimit } = request.query as Record<string, string>;
    const q = (rawQ || '').trim();
    const type = ['all', 'builds', 'ideas', 'makers'].includes(rawType) ? rawType : 'all';
    const limit = Math.min(Math.max(parseInt(rawLimit) || 10, 1), 30);

    if (q.length < 2) return { q, builds: [], ideas: [], makers: [] };

    const wants = (t: string) => type === 'all' || type === t;
    const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;

    const [builds, ideas, makers] = await Promise.all([
      wants('builds')
        ? pool.query(
            `SELECT p.id, p.title, p.tagline, p.domain, p.media,
                    COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) AS owner_name,
                    u.username AS owner_username,
                    ts_rank(p.search_tsv, query) AS rank
             FROM projects p
             JOIN users u ON u.id = p.owner_id,
                  websearch_to_tsquery('english', $1) query
             WHERE p.search_tsv @@ query
             ORDER BY rank DESC, p.created_at DESC
             LIMIT $2`,
            [q, limit]
          )
        : Promise.resolve({ rows: [] }),
      wants('ideas')
        ? pool.query(
            `SELECT i.id, i.title, i.body, i.domain, i.media,
                    COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) AS author,
                    u.username AS author_username,
                    ts_rank(i.search_tsv, query) AS rank
             FROM ideas i
             JOIN users u ON u.id = i.author_id,
                  websearch_to_tsquery('english', $1) query
             WHERE i.search_tsv @@ query
             ORDER BY rank DESC, i.created_at DESC
             LIMIT $2`,
            [q, limit]
          )
        : Promise.resolve({ rows: [] }),
      wants('makers')
        ? pool.query(
            `SELECT username, COALESCE(NULLIF(TRIM(display_name), ''), username) AS display_name,
                    avatar_url, bio
             FROM users
             WHERE username ILIKE $1 OR display_name ILIKE $1 OR bio ILIKE $1
             ORDER BY (username ILIKE $1) DESC, created_at DESC
             LIMIT $2`,
            [like, limit]
          )
        : Promise.resolve({ rows: [] }),
    ]);

    return { q, builds: builds.rows, ideas: ideas.rows, makers: makers.rows };
  });
}
