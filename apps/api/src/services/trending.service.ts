import { pool } from '../db/pool.js';

export const trendingService = {
  async computeTrending() {
    // Score = upvotes*2 + thread_count*3 + recency_bonus
    // Recency: ideas from last 24h get +10, last 7d get +5
    await pool.query(`DELETE FROM trending_ideas WHERE period = 'daily'`);

    await pool.query(`
      INSERT INTO trending_ideas (idea_id, score, period)
      SELECT
        i.id,
        (i.upvotes * 2) +
        (COALESCE(tc.thread_count, 0) * 3) +
        CASE
          WHEN i.created_at > NOW() - INTERVAL '24 hours' THEN 10
          WHEN i.created_at > NOW() - INTERVAL '7 days' THEN 5
          ELSE 0
        END AS score,
        'daily'
      FROM ideas i
      LEFT JOIN (
        SELECT idea_id, COUNT(*) as thread_count
        FROM idea_threads
        GROUP BY idea_id
      ) tc ON tc.idea_id = i.id
      ORDER BY score DESC
      LIMIT 50
    `);
  },

  async getTopTrending(limit: number = 10) {
    const res = await pool.query(
      `SELECT t.*, i.title, i.domain, i.tags, i.upvotes, u.username as author
       FROM trending_ideas t
       JOIN ideas i ON t.idea_id = i.id
       JOIN users u ON i.author_id = u.id
       WHERE t.period = 'daily'
       ORDER BY t.score DESC
       LIMIT $1`,
      [limit]
    );
    return res.rows;
  },
};
