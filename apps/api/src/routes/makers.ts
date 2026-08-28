import { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { firebaseAdmin } from '../config/firebase.js';

async function viewerId(app: FastifyInstance, request: any): Promise<string | null> {
  const h = request.headers.authorization;
  if (!h?.startsWith('Bearer ')) return null;
  const token = h.slice(7);
  try {
    return (app.jwt.verify(token) as any).id || null;
  } catch {
    /* not a local jwt */
  }
  try {
    const d = await firebaseAdmin.auth().verifyIdToken(token);
    const r = await pool.query('SELECT id FROM users WHERE firebase_uid = $1', [d.uid]);
    return r.rows[0]?.id || null;
  } catch {
    return null;
  }
}

export function publicMakerFields(u: any) {
  return {
    id: u.id,
    username: u.username,
    display_name: (typeof u.display_name === 'string' && u.display_name.trim()) ? u.display_name.trim() : u.username,
    avatar_url: u.avatar_url,
    bio: u.bio,
    github_username: u.github_username || null,
    github_url: u.github_url || null,
    lovable_url: u.lovable_url || null,
    replit_url: u.replit_url || null,
    bolt_url: u.bolt_url || null,
    created_at: u.created_at,
  };
}

function num(v: any) {
  return parseInt(String(v ?? 0), 10) || 0;
}

export async function makerRoutes(app: FastifyInstance) {
  app.get('/', async (request) => {
    const { sort: rawSort = 'newest', limit: rawLimit = 24 } = request.query as any;
    const sort = ['newest', 'starred', 'shipped'].includes(rawSort) ? rawSort : 'newest';
    const limit = Math.min(Math.max(parseInt(rawLimit) || 24, 1), 60);

    const order =
      sort === 'starred'
        ? 'stars_received DESC, build_count DESC, u.created_at DESC'
        : sort === 'shipped'
          ? 'shipped_this_week DESC, build_count DESC, u.created_at DESC'
          : 'u.created_at DESC';

    const res = await pool.query(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.bio, u.created_at,
              u.github_username, u.github_url, u.lovable_url, u.replit_url, u.bolt_url,
              COALESCE(bc.n, 0)::int AS build_count,
              COALESCE(ic.n, 0)::int AS idea_count,
              (COALESCE(ps.s, 0) + COALESCE(istars.s, 0))::int AS stars_received,
              COALESCE(rc.n, 0)::int AS reviews_received,
              COALESCE(bw.n, 0)::int AS shipped_this_week
       FROM users u
       LEFT JOIN (SELECT owner_id, COUNT(*) n FROM projects GROUP BY owner_id) bc ON bc.owner_id = u.id
       LEFT JOIN (SELECT author_id, COUNT(*) n FROM ideas GROUP BY author_id) ic ON ic.author_id = u.id
       LEFT JOIN (SELECT owner_id, COALESCE(SUM(upvotes), 0) s FROM projects GROUP BY owner_id) ps ON ps.owner_id = u.id
       LEFT JOIN (SELECT author_id, COALESCE(SUM(upvotes), 0) s FROM ideas GROUP BY author_id) istars ON istars.author_id = u.id
       LEFT JOIN (
         SELECT p.owner_id, COUNT(*) n
         FROM project_reviews r
         JOIN projects p ON p.id = r.project_id
         GROUP BY p.owner_id
       ) rc ON rc.owner_id = u.id
       LEFT JOIN (
         SELECT owner_id, COUNT(*) n
         FROM projects
         WHERE created_at > NOW() - INTERVAL '7 days'
         GROUP BY owner_id
       ) bw ON bw.owner_id = u.id
       WHERE COALESCE(bc.n, 0) > 0 OR COALESCE(ic.n, 0) > 0
       ORDER BY ${order}
       LIMIT $1`,
      [limit]
    );

    return res.rows.map((row) => ({
      ...publicMakerFields(row),
      stats: {
        builds: num(row.build_count),
        ideas: num(row.idea_count),
        stars_received: num(row.stars_received),
        reviews_received: num(row.reviews_received),
        shipped_this_week: num(row.shipped_this_week),
      },
    }));
  });

  app.get('/:username', async (request, reply) => {
    const { username } = request.params as { username: string };
    const handle = (username || '').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
    if (handle.length < 2) {
      return reply.status(400).send({ error: 'Invalid username' });
    }

    const userRes = await pool.query(
      `SELECT id, username, display_name, avatar_url, bio, github_username, github_url,
              lovable_url, replit_url, bolt_url, created_at
       FROM users WHERE username = $1`,
      [handle]
    );
    if (!userRes.rows[0]) {
      return reply.status(404).send({ error: 'Not found' });
    }
    const maker = userRes.rows[0];
    const makerId = maker.id;
    const viewer = await viewerId(app, request);

    const [projectsRes, ideasRes, starRes, reviewRes, activityRes, toolsRes, ratingRes, followRes] = await Promise.all([
      pool.query(
        `SELECT p.id, p.title, p.tagline, p.domain, p.tools_used, p.status, p.live_url, p.upvotes, p.created_at,
                (SELECT COUNT(*)::int FROM project_reviews r WHERE r.project_id = p.id) AS review_count
         FROM projects p
         WHERE p.owner_id = $1
         ORDER BY p.created_at DESC`,
        [makerId]
      ),
      pool.query(
        `SELECT i.id, i.title, i.body, i.domain, i.upvotes, i.created_at, i.build_id,
                p.title AS build_title,
                (SELECT COUNT(*)::int FROM idea_threads t WHERE t.idea_id = i.id) AS thread_count
         FROM ideas i
         LEFT JOIN projects p ON p.id = i.build_id
         WHERE i.author_id = $1
         ORDER BY i.created_at DESC`,
        [makerId]
      ),
      pool.query(
        `SELECT (
           COALESCE((SELECT SUM(upvotes) FROM projects WHERE owner_id = $1), 0)
           + COALESCE((SELECT SUM(upvotes) FROM ideas WHERE author_id = $1), 0)
         )::int AS stars_received`,
        [makerId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS reviews_received
         FROM project_reviews r
         JOIN projects p ON p.id = r.project_id
         WHERE p.owner_id = $1`,
        [makerId]
      ),
      pool.query(
        `SELECT kind, created_at, ref_id, title, extra FROM (
           SELECT 'star_build'::text AS kind, pu.created_at, p.id AS ref_id, p.title AS title, NULL::text AS extra
           FROM project_upvotes pu
           JOIN projects p ON p.id = pu.project_id
           WHERE pu.user_id = $1
           UNION ALL
           SELECT 'star_idea', iu.created_at, i.id, i.title, NULL
           FROM idea_upvotes iu
           JOIN ideas i ON i.id = iu.idea_id
           WHERE iu.user_id = $1
           UNION ALL
           SELECT 'review', r.created_at, p.id, p.title, r.rating::text
           FROM project_reviews r
           JOIN projects p ON p.id = r.project_id
           WHERE r.user_id = $1
           UNION ALL
           SELECT 'comment_build', t.created_at, p.id, p.title, LEFT(t.body, 160)
           FROM project_threads t
           JOIN projects p ON p.id = t.project_id
           WHERE t.author_id = $1
           UNION ALL
           SELECT 'comment_idea', t.created_at, i.id, i.title, LEFT(t.body, 160)
           FROM idea_threads t
           JOIN ideas i ON i.id = t.idea_id
           WHERE t.author_id = $1
         ) a
         ORDER BY created_at DESC
         LIMIT 40`,
        [makerId]
      ),
      pool.query(
        `SELECT DISTINCT unnest(tools_used) AS tool
         FROM projects
         WHERE owner_id = $1 AND tools_used IS NOT NULL AND cardinality(tools_used) > 0
         LIMIT 12`,
        [makerId]
      ),
      pool.query(
        `SELECT COALESCE(AVG(r.rating), 0)::float AS avg, COUNT(*)::int AS n
         FROM project_reviews r JOIN projects p ON p.id = r.project_id
         WHERE p.owner_id = $1`,
        [makerId]
      ),
      pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM follows WHERE followee_id = $1) AS followers,
           ($2::uuid IS NOT NULL AND EXISTS (
             SELECT 1 FROM follows WHERE follower_id = $2 AND followee_id = $1
           )) AS following`,
        [makerId, viewer]
      ),
    ]);

    const builds = projectsRes.rows;
    const topBuild = builds.slice().sort((a: any, b: any) => {
      const sa = (a.upvotes || 0) * 2 + (a.review_count || 0) * 4;
      const sb = (b.upvotes || 0) * 2 + (b.review_count || 0) * 4;
      if (sb !== sa) return sb - sa;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })[0] || null;

    const stars = num(starRes.rows[0]?.stars_received);
    const reviews = num(reviewRes.rows[0]?.reviews_received);
    const ratingCount = num(ratingRes.rows[0]?.n);
    const shippedThisWeek = builds.filter(
      (b: any) => Date.now() - new Date(b.created_at).getTime() < 7 * 864e5
    ).length;

    const badges: string[] = [];
    if (builds.length >= 1) badges.push('first_build');
    if (ideasRes.rows.length >= 1) badges.push('first_idea');
    if (builds.length >= 5) badges.push('five_builds');
    if (stars >= 5) badges.push('five_stars');
    if (stars >= 25) badges.push('twentyfive_stars');
    if (reviews >= 3) badges.push('reviewed_three');
    if (shippedThisWeek >= 2) badges.push('shipped_this_week');

    return {
      ...publicMakerFields(maker),
      tools: toolsRes.rows.map((r: any) => r.tool).filter(Boolean),
      is_self: !!viewer && viewer === makerId,
      following: !!followRes.rows[0]?.following,
      follower_count: num(followRes.rows[0]?.followers),
      badges,
      stats: {
        builds: builds.length,
        ideas: ideasRes.rows.length,
        stars_received: stars,
        reviews_received: reviews,
        avg_rating: Number(ratingRes.rows[0]?.avg || 0),
        rating_count: ratingCount,
      },
      top_build: topBuild,
      builds,
      ideas: ideasRes.rows,
      activity: activityRes.rows,
    };
  });
}
