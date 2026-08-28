import { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';

export async function waitlistRoutes(app: FastifyInstance) {
  app.post('/', async (request, reply) => {
    const body = (request.body || {}) as { email?: string };
    const email = String(body.email || '').trim().toLowerCase();
    if (!email || !email.includes('@') || email.length > 255) {
      return reply.status(400).send({ message: 'Need a real email' });
    }

    try {
      await pool.query(
        `INSERT INTO waitlist (email) VALUES ($1) ON CONFLICT (email) DO NOTHING`,
        [email]
      );
      return { ok: true };
    } catch (err: any) {
      request.log.warn({ err }, 'waitlist insert failed');
      return reply.status(503).send({ message: 'Couldn’t save that right now. Try again in a bit.' });
    }
  });
}
