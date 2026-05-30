import { pool } from '../db/pool.js';

const ACHIEVEMENT_RULES = [
  {
    type: 'first_idea',
    check: async (userId: string) => {
      const res = await pool.query('SELECT COUNT(*) as c FROM ideas WHERE author_id = $1', [userId]);
      return parseInt(res.rows[0].c) >= 1;
    },
  },
  {
    type: 'first_join',
    check: async (userId: string) => {
      const res = await pool.query(
        "SELECT COUNT(*) as c FROM project_contributors WHERE user_id = $1 AND role = 'contributor'",
        [userId]
      );
      return parseInt(res.rows[0].c) >= 1;
    },
  },
  {
    type: 'contributor_5x',
    check: async (userId: string) => {
      const res = await pool.query(
        "SELECT COUNT(*) as c FROM project_contributors WHERE user_id = $1 AND role = 'contributor'",
        [userId]
      );
      return parseInt(res.rows[0].c) >= 5;
    },
  },
  {
    type: 'idea_10x',
    check: async (userId: string) => {
      const res = await pool.query('SELECT COUNT(*) as c FROM ideas WHERE author_id = $1', [userId]);
      return parseInt(res.rows[0].c) >= 10;
    },
  },
];

export async function checkAchievements(userId: string) {
  for (const rule of ACHIEVEMENT_RULES) {
    const earned = await rule.check(userId);
    if (earned) {
      await pool.query(
        `INSERT INTO achievements (user_id, type) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, rule.type]
      );
    }
  }
}
