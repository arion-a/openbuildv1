import { pool } from '../db/pool.js';
import { sessionService } from '../services/session.service.js';
import { config } from '../config/env.js';

async function run() {
  const timeout = config.docker.sessionTimeoutHours;
  console.log(`Cleaning sessions older than ${timeout}h...`);

  const res = await pool.query(
    `SELECT id FROM sessions
     WHERE status = 'running'
     AND started_at < NOW() - make_interval(hours => $1)`,
    [timeout]
  );

  for (const row of res.rows) {
    console.log(`Destroying stale session ${row.id}`);
    await sessionService.destroySession(row.id);
  }

  console.log(`Cleaned ${res.rows.length} sessions.`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
