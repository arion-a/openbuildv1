const URL = process.env.OPENBUILD_AUTH_EMULATOR || 'http://127.0.0.1:9099';
const TIMEOUT_MS = 60_000;
const INTERVAL_MS = 400;
const started = Date.now();

async function ping() {
  try {
    await fetch(URL, { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

while (Date.now() - started < TIMEOUT_MS) {
  if (await ping()) process.exit(0);
  await new Promise((r) => setTimeout(r, INTERVAL_MS));
}

console.error(`Firebase Auth emulator did not start at ${URL}.`);
process.exit(1);
