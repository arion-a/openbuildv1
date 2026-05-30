import { FastifyInstance } from 'fastify';
import { trendingService } from '../services/trending.service.js';
import { pool } from '../db/pool.js';

export async function trendingRoutes(app: FastifyInstance) {
  app.get('/', async (request) => {
    const { limit: rawLimit = 10 } = request.query as any;
    const limit = Math.min(Math.max(parseInt(rawLimit) || 10, 1), 100);
    return trendingService.getTopTrending(limit);
  });

  app.get('/domains', async () => {
    const res = await pool.query(`
      SELECT domain, COUNT(*) as idea_count,
        SUM((SELECT COUNT(*) FROM idea_threads WHERE idea_id = ideas.id)) as total_threads
      FROM ideas
      WHERE domain IS NOT NULL
      GROUP BY domain
      ORDER BY idea_count DESC
    `);
    return res.rows;
  });

  app.get('/achievements/:userId', async (request) => {
    const { userId } = request.params as any;
    const res = await pool.query(
      'SELECT * FROM achievements WHERE user_id = $1 ORDER BY earned_at DESC',
      [userId]
    );
    return res.rows;
  });
}
