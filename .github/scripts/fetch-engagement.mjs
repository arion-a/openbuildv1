// Pulls recent-tweet public metrics for one X (Twitter) account and prints a
// JSON snapshot to stdout. Run by .github/workflows/engagement-tracking.yml.
//
// Requires:
//   X_BEARER_TOKEN  — repo secret (Settings > Secrets and variables > Actions > Secrets)
//   X_USERNAME      — repo variable, no leading @ (Settings > Secrets and variables > Actions > Variables)

const TOKEN = process.env.X_BEARER_TOKEN;
const USERNAME = process.env.X_USERNAME;

if (!TOKEN) {
  console.error('Missing X_BEARER_TOKEN. Add it as a repo secret before this workflow can run.');
  process.exit(1);
}
if (!USERNAME) {
  console.error('Missing X_USERNAME. Add it as a repo variable (no leading @) before this workflow can run.');
  process.exit(1);
}

async function xFetch(path) {
  const res = await fetch(`https://api.x.com/2${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`X API ${path} failed: ${res.status} ${body}`);
  }
  return res.json();
}

const user = await xFetch(`/users/by/username/${encodeURIComponent(USERNAME)}`);
const userId = user.data?.id;
if (!userId) {
  throw new Error(`Could not resolve an X user id for @${USERNAME} — check the X_USERNAME variable.`);
}

const tweets = await xFetch(
  `/users/${userId}/tweets?max_results=20&tweet.fields=created_at,public_metrics`
);

const snapshot = {
  captured_at: new Date().toISOString(),
  username: USERNAME,
  tweets: (tweets.data || []).map((t) => ({
    id: t.id,
    created_at: t.created_at,
    text: (t.text || '').slice(0, 140),
    metrics: t.public_metrics,
  })),
};

console.log(JSON.stringify(snapshot, null, 2));
