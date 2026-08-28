const URL = process.env.OPENBUILD_API_HEALTH || 'http://127.0.0.1:41935/health';
const TIMEOUT_MS = 60_000;
const INTERVAL_MS = 500;

const started = Date.now();

async function ping() {
  try {
    const res = await fetch(URL, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

while (Date.now() - started < TIMEOUT_MS) {
  if (await ping()) {
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, INTERVAL_MS));
}

console.error(`
API did not become ready at ${URL} within ${TIMEOUT_MS / 1000}s.

Do this, in order:
  1. Start Docker Desktop
  2. From the repo root:  npm run infra
  3. Then:                npm run dev

If [api] logs an error, fix that first (usually Postgres is not running).
`);
process.exit(1);
