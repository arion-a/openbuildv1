// Local demo data: a spread of builders, their builds and ideas, and some
// cross-engagement so trending / ratings / feeds have real signal.
//
//   node scripts/seed-dev.mjs           # reset demo rows + reseed
//   API=http://127.0.0.1:41935 node scripts/seed-dev.mjs
//
// "Reset" only touches accounts whose email ends in @demo.local (plus the two
// legacy @dev.local demo users). Real accounts are never touched.

import pg from 'pg';

const API = process.env.API || 'http://127.0.0.1:41935';
const DB = process.env.DATABASE_URL || 'postgres://openbuild:password@localhost:5432/openbuild';
const PASSWORD = 'Testpass1!';
const img = (seed) => `https://picsum.photos/seed/ob-${seed}/1280/860`;

const pool = new pg.Pool({ connectionString: DB });
const q = (sql, params) => pool.query(sql, params);

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  // Only set a JSON content-type when there's actually a body — Fastify rejects
  // an empty body when content-type is application/json (upvote / follow toggles).
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  return data;
}

// ---------------------------------------------------------------- people
const PEOPLE = [
  {
    email: 'priya@demo.local',
    name: 'Priya Nair',
    bio: 'Ops → building the tools I kept wishing I had. Lovable + Claude, mostly.',
    github_url: 'https://github.com/priyanair',
    lovable_url: 'https://lovable.dev/@priya',
  },
  {
    email: 'marcus@demo.local',
    name: 'Marcus Bell',
    bio: 'Ex-agency dev. Small sharp tools, shipped the same week.',
    github_url: 'https://github.com/marcusbell',
  },
  {
    email: 'lena@demo.local',
    name: 'Lena Fischer',
    bio: 'Designer who started shipping. Bolt for the front, Supabase for the rest.',
    bolt_url: 'https://bolt.new/~/lena',
  },
  {
    email: 'dev@demo.local',
    name: 'Dev Okafor',
    bio: 'Backend brain — APIs, cron jobs, and things that quietly work.',
    github_url: 'https://github.com/devokafor',
    replit_url: 'https://replit.com/@devokafor',
  },
  {
    email: 'yuki@demo.local',
    name: 'Yuki Tanaka',
    bio: 'Indie hacker. One weekend, one build, repeat.',
    github_url: 'https://github.com/yukitanaka',
  },
  {
    email: 'sam@demo.local',
    name: 'Sam Kestrel',
    bio: 'I write about what I build, and occasionally build what I write about.',
    github_url: 'https://github.com/samkestrel',
  },
  {
    email: 'aria@demo.local',
    name: 'Aria Nova',
    bio: 'No-code refugee. Now I read the errors myself.',
  },
];

// ---------------------------------------------------------------- builds
const BUILDS = {
  'priya@demo.local': [
    {
      title: 'Mealplan',
      tagline: 'Snap a photo of your fridge, get a week of dinners and a short shopping list.',
      description:
        'I kept rebuilding the same meal spreadsheet, so I made it a real thing.\n\nYou photograph what’s in the fridge, it reads the ingredients and proposes seven dinners plus a shopping list for the gaps. Weekend build — Lovable front end, one Supabase table, Claude for the vision and planning steps.\n\nMy go-to for the "what do I cook tonight" spiral.',
      domain: 'productivity',
      live_url: 'https://mealplan.demo.openbuild.world',
      tools_used: ['Lovable', 'Supabase', 'Claude'],
      how_to_replicate:
        'Lovable "CRUD + auth" template. Supabase `pantry` and `plan` tables. One edge function: image in → vision model for an ingredient list → second call to plan meals. Render the plan as a checklist.',
      potential_applications: ['meal prep', 'grocery budgeting', 'cutting food waste'],
      media: [img('mealplan-1'), img('mealplan-2'), img('mealplan-3')],
    },
    {
      title: 'Standup Bot',
      tagline: 'Collects updates in a Slack thread through the day, posts one clean digest at 5pm.',
      description:
        'Nobody read our standup channel. This buffers each person’s messages and posts a single formatted digest in the evening — no database, it just reads the thread.',
      domain: 'productivity',
      live_url: 'https://standup.demo.openbuild.world',
      tools_used: ['Replit', 'Slack API'],
      how_to_replicate: 'Slack bot on one channel, buffer messages by user, format a digest, post on a schedule.',
      potential_applications: ['remote teams', 'weekly reports'],
      media: [img('standup-1'), img('standup-2')],
    },
    {
      title: 'Focus Fence',
      tagline: 'Blocks the sites you named for the block of time you named. That’s the whole app.',
      description:
        'Every focus app wants to be a productivity suite. This one has a text box and a timer. Cursor + a tiny browser extension.',
      domain: 'productivity',
      live_url: 'https://focusfence.demo.openbuild.world',
      tools_used: ['Cursor'],
      how_to_replicate: 'MV3 extension, declarativeNetRequest rules generated from a list, a countdown that clears them.',
      potential_applications: ['deep work', 'exam prep'],
      media: [img('focusfence-1')],
    },
  ],
  'marcus@demo.local': [
    {
      title: 'PricePeek',
      tagline: 'Watches competitor pricing pages and pings Slack when a number moves.',
      description:
        'A daily cron that snapshots a list of pricing pages, diffs the rendered prices, and posts to Slack on a change. Bolt for the dashboard, a Playwright worker on a schedule.',
      domain: 'marketing',
      live_url: 'https://pricepeek.demo.openbuild.world',
      tools_used: ['Bolt', 'Playwright', 'Vercel'],
      how_to_replicate: 'List of URLs + CSS selectors. Headless render daily, store the number, diff, notify.',
      potential_applications: ['competitive intel', 'MAP monitoring'],
      media: [img('pricepeek-1'), img('pricepeek-2')],
    },
    {
      title: 'Cronjail',
      tagline: 'Your scheduled jobs, one page, red when they miss their window.',
      description:
        'Each job pings a URL when it finishes. If a ping is late, the row goes red and I get a text. Replaced a spreadsheet and a lot of "did the export run?" messages.',
      domain: 'devtools',
      live_url: 'https://cronjail.demo.openbuild.world',
      tools_used: ['Cursor', 'Postgres'],
      how_to_replicate: 'A `checks` table with an expected interval, a heartbeat endpoint, a sweeper that flags overdue rows.',
      potential_applications: ['ETL monitoring', 'backup verification'],
      media: [img('cronjail-1')],
    },
  ],
  'lena@demo.local': [
    {
      title: 'Palette Lift',
      tagline: 'Paste a screenshot, get an accessible colour system that keeps the vibe.',
      description:
        'Drop in a UI screenshot. It pulls the palette, checks every pairing for contrast, and nudges the failing ones the smallest amount that passes AA. Exports as CSS variables or Tailwind config.',
      domain: 'design',
      live_url: 'https://palettelift.demo.openbuild.world',
      tools_used: ['Bolt', 'Supabase'],
      how_to_replicate: 'Quantise the image to ~8 colours, build the pairing matrix, solve each failing pair in LCH for the nearest passing lightness.',
      potential_applications: ['design systems', 'accessibility audits'],
      media: [img('palettelift-1'), img('palettelift-2'), img('palettelift-3')],
    },
    {
      title: 'Mocktopus',
      tagline: 'Turns a rough wireframe photo into a clickable prototype you can share.',
      description:
        'Photograph a napkin sketch, get a real HTML prototype with the boxes wired to each other. For pitching an idea before anyone commits a sprint to it.',
      domain: 'design',
      live_url: 'https://mocktopus.demo.openbuild.world',
      tools_used: ['v0', 'Cursor'],
      how_to_replicate: 'Vision model to a layout JSON, render to flexbox, infer links from arrows in the sketch.',
      potential_applications: ['pitching', 'user testing'],
      media: [img('mocktopus-1')],
    },
  ],
  'dev@demo.local': [
    {
      title: 'Webhook Relay',
      tagline: 'A stable URL that fans one webhook out to many, with retries and a replay button.',
      description:
        'Stripe only lets you point at one endpoint per environment. This sits in front, delivers to all of them, retries the failures with backoff, and keeps 7 days of payloads you can replay from the dashboard.',
      domain: 'devtools',
      live_url: 'https://relay.demo.openbuild.world',
      tools_used: ['Replit', 'Redis', 'Postgres'],
      how_to_replicate: 'Ingest → append to a log table → a worker per destination with exponential backoff → a replay endpoint that re-enqueues by id.',
      potential_applications: ['multi-env testing', 'integration debugging'],
      media: [img('relay-1'), img('relay-2')],
    },
    {
      title: 'Backfill',
      tagline: 'Describe the old data shape and the new one; it writes and runs the migration in batches.',
      description:
        'For the migrations that are too fiddly for a one-liner and too boring to hand-write. You give it the before/after and a batch size, it generates the script, dry-runs it, shows you the diff, then runs for real with a progress bar.',
      domain: 'devtools',
      live_url: 'https://backfill.demo.openbuild.world',
      tools_used: ['Cursor', 'Claude', 'Postgres'],
      how_to_replicate: 'Schema in, schema out, sample rows → model writes an UPDATE...FROM in a keyset-paginated loop.',
      potential_applications: ['schema changes', 'data cleanup'],
      media: [img('backfill-1')],
    },
  ],
  'yuki@demo.local': [
    {
      title: 'Runway',
      tagline: 'Connect your bank, see the one number: months of runway left at current burn.',
      description:
        'Every finance app buries the number that matters. This shows months of runway, updates when a transaction lands, and tells you which category moved it. Read-only bank connection, nothing stored beyond the totals.',
      domain: 'finance',
      live_url: 'https://runway.demo.openbuild.world',
      tools_used: ['v0', 'Supabase', 'Plaid'],
      how_to_replicate: 'Plaid transactions → rolling 3-month burn → cash / burn. Cache totals, drop the line items.',
      potential_applications: ['solo founders', 'freelancers'],
      media: [img('runway-1'), img('runway-2')],
    },
    {
      title: 'SplitEasy',
      tagline: 'Shared-house expenses without the app everyone forgets to open.',
      description:
        'Text a photo of the receipt to a number. It splits it by the rules you set once and posts the running balance to the group chat. No accounts, no reminders.',
      domain: 'finance',
      live_url: 'https://spliteasy.demo.openbuild.world',
      tools_used: ['Bolt', 'Twilio'],
      how_to_replicate: 'MMS in → OCR the total → apply a split table → reply with balances.',
      potential_applications: ['housemates', 'trips'],
      media: [img('spliteasy-1')],
    },
  ],
  'sam@demo.local': [
    {
      title: 'InboxZero AI',
      tagline: 'Drafts replies in your voice and files the rest. You still hit send.',
      description:
        'It watches a Gmail label, drafts a reply in a tone learned from ~20 of my sent messages, and auto-archives newsletters and receipts. Two weeks of my inbox, gone. Cursor + the Gmail API + a small classifier.',
      domain: 'productivity',
      live_url: 'https://inboxzero.demo.openbuild.world',
      tools_used: ['Cursor', 'Claude', 'Gmail API'],
      how_to_replicate: 'OAuth into Gmail, poll a label, few-shot the draft with your sent replies, classify the rest with a cheap model.',
      potential_applications: ['support triage', 'sales follow-ups'],
      media: [img('inboxzero-1'), img('inboxzero-2')],
    },
  ],
  'aria@demo.local': [
    {
      title: 'Flashfeed',
      tagline: 'Paste any article, get a small deck of flashcards you actually keep.',
      description:
        'Reading things once and forgetting them was my whole problem. Paste a URL, it pulls the claims worth remembering into cards and schedules the reviews. Framer front, Cursor for the scheduler.',
      domain: 'education',
      live_url: 'https://flashfeed.demo.openbuild.world',
      tools_used: ['Framer', 'Cursor', 'Supabase'],
      how_to_replicate: 'Readability extract → model pulls Q/A pairs → SM-2 scheduling in a `cards` table.',
      potential_applications: ['studying', 'onboarding docs'],
      media: [img('flashfeed-1'), img('flashfeed-2')],
    },
    {
      title: 'Rubric',
      tagline: 'Grades short written answers against a rubric you write in plain English.',
      description:
        'Built it for a tutoring side gig. You describe what a good answer covers, it scores each submission against that with a one-line reason, and flags the borderline ones for you to check.',
      domain: 'education',
      live_url: 'https://rubric.demo.openbuild.world',
      tools_used: ['Cursor', 'Claude'],
      how_to_replicate: 'Rubric text + answer → model returns {score, reasons[], confidence}. Sort the low-confidence ones to the top.',
      potential_applications: ['tutoring', 'application review'],
      media: [img('rubric-1')],
    },
  ],
};

// ---------------------------------------------------------------- ideas
const IDEAS = {
  'priya@demo.local': [
    {
      title: 'A CRM that’s just a really good text file',
      body: 'Every CRM wants me to live in it. I want the opposite — plain text, one line per person, and an agent that keeps it tidy and nudges me on who I’ve gone quiet on.',
      domain: 'productivity',
    },
    {
      title: 'A meeting-cost meter that lives in the calendar',
      body: 'Show the fully-loaded cost of a meeting next to the invite, updating as people accept. Not to shame anyone — just to make the trade-off visible before it’s booked.',
      domain: 'productivity',
    },
  ],
  'marcus@demo.local': [
    {
      title: 'Local-first habit tracker, no account, no cloud',
      body: 'Everything syncs and nags. I want a grid on my machine that a model fills in from my git commits and calendar, and never phones home.',
      domain: 'productivity',
    },
    {
      title: 'Grep for your screenshots',
      body: 'I have 4,000 screenshots and no way to find the one with the error message. OCR them all once, then let me search the text.',
      domain: 'devtools',
    },
  ],
  'lena@demo.local': [
    {
      title: 'Turn a Loom into a doc',
      body: 'Drop a screen-recording link, get a written walkthrough with screenshots at the right moments. For onboarding docs nobody wants to write.',
      domain: 'design',
    },
  ],
  'dev@demo.local': [
    {
      title: 'A status page that writes its own incident notes',
      body: 'When the checks go red, draft the "we’re investigating" post from the logs and the last deploy, and let me approve it in one tap.',
      domain: 'devtools',
    },
  ],
  'yuki@demo.local': [
    {
      title: 'Subscription autopsy',
      body: 'When I cancel something, ask me one question and file the answer. After a year I’d know why I actually churn — price, forgot it existed, found better.',
      domain: 'finance',
    },
  ],
  'sam@demo.local': [
    {
      title: 'Changelog that reads itself out on a call',
      body: 'Paste the week’s merged PRs, get a 90-second spoken summary for the standup, in plain language, no jargon.',
      domain: 'marketing',
    },
  ],
  'aria@demo.local': [
    {
      title: 'Spaced repetition for the docs you keep forgetting',
      body: 'The three CLI flags I look up every single time. Let me save them and quiz me until they stick.',
      domain: 'education',
    },
  ],
};

// ---------------------------------------------------------------- run
async function resetDemo() {
  const { rows } = await q(
    `SELECT id FROM users WHERE email LIKE '%@demo.local' OR email IN ('maker@dev.local','critic@dev.local')`
  );
  const ids = rows.map((r) => r.id);
  if (!ids.length) return console.log('reset: no demo users');
  for (const sql of [
    `DELETE FROM messages WHERE from_user = ANY($1) OR to_user = ANY($1)`,
    `DELETE FROM notifications WHERE user_id = ANY($1) OR actor_id = ANY($1)`,
    `DELETE FROM follows WHERE follower_id = ANY($1) OR followee_id = ANY($1)`,
    `DELETE FROM reports WHERE reporter_id = ANY($1)`,
    `DELETE FROM project_reviews WHERE user_id = ANY($1)`,
    `DELETE FROM project_upvotes WHERE user_id = ANY($1)`,
    `DELETE FROM project_threads WHERE author_id = ANY($1)`,
    `DELETE FROM project_contributors WHERE user_id = ANY($1)`,
    `DELETE FROM idea_upvotes WHERE user_id = ANY($1)`,
    `DELETE FROM idea_threads WHERE author_id = ANY($1)`,
    `DELETE FROM achievements WHERE user_id = ANY($1)`,
    `DELETE FROM user_settings WHERE user_id = ANY($1)`,
    `DELETE FROM publications WHERE author_id = ANY($1)`,
    `DELETE FROM projects WHERE owner_id = ANY($1)`,
    `DELETE FROM ideas WHERE author_id = ANY($1)`,
    `DELETE FROM users WHERE id = ANY($1)`,
  ]) {
    await q(sql, [ids]);
  }
  console.log(`reset: removed ${ids.length} demo users and their content`);
}

async function main() {
  await resetDemo();

  const tokens = {};
  for (const p of PEOPLE) {
    const { token } = await api('/auth/local', {
      method: 'POST',
      body: { email: p.email, password: PASSWORD, display_name: p.name, mode: 'signup' },
    });
    tokens[p.email] = token;
    await api('/auth/profile', {
      method: 'PUT',
      token,
      body: {
        bio: p.bio,
        github_url: p.github_url,
        lovable_url: p.lovable_url,
        replit_url: p.replit_url,
        bolt_url: p.bolt_url,
      },
    });
    console.log('user   ', p.name);
  }

  const buildIds = [];
  for (const [email, list] of Object.entries(BUILDS)) {
    for (const b of list) {
      // The publish API takes the one-liner as `body` (it lands in projects.tagline).
      const { tagline, ...rest } = b;
      const r = await api('/publications', {
        method: 'POST',
        token: tokens[email],
        body: { kind: 'build', publish: true, body: tagline, ...rest },
      });
      buildIds.push((r.project && r.project.id) || r.id);
      console.log('build  ', b.title);
    }
  }
  for (const [email, list] of Object.entries(IDEAS)) {
    for (const i of list) {
      await api('/publications', { method: 'POST', token: tokens[email], body: { kind: 'idea', publish: true, ...i } });
      console.log('idea   ', i.title);
    }
  }

  // Cross-engagement: everyone reacts to a few builds that aren't theirs.
  const projects = await api('/projects?limit=50');
  const REVIEWS = [
    'Been using this for two weeks. It does the one thing and gets out of the way.',
    'Saved me a spreadsheet I keep rebuilding. Small feature request sent your way.',
    'Clean. The empty state actually tells you what to do next, which is rare.',
    'Works. Wish it had a dark mode but that’s me being picky.',
    'Exactly the scope I wanted — no account, no upsell.',
  ];
  const COMMENTS = [
    'How are you handling rate limits on the upstream API?',
    'This is close to something I sketched last month. Following.',
    'Would pay for a hosted version of this.',
    'The replay button is the whole product, honestly.',
  ];
  const emails = PEOPLE.map((p) => p.email);
  for (let e = 0; e < emails.length; e++) {
    const token = tokens[emails[e]];
    const mine = new Set(
      projects.filter((p) => p.owner_username && p.owner_name === PEOPLE[e].name).map((p) => p.id)
    );
    const others = projects.filter((p) => !mine.has(p.id));
    // star 3, review 1, comment 1, spread by index
    for (let k = 0; k < others.length; k++) {
      if ((k + e) % 3 === 0) await api(`/projects/${others[k].id}/upvote`, { method: 'POST', token }).catch(() => {});
    }
    const rv = others[(e * 2) % others.length];
    if (rv) await api(`/projects/${rv.id}/reviews`, { method: 'POST', token, body: { rating: 4 + (e % 2), body: REVIEWS[e % REVIEWS.length] } }).catch(() => {});
    const cm = others[(e * 3 + 1) % others.length];
    if (cm) await api(`/projects/${cm.id}/threads`, { method: 'POST', token, body: { body: COMMENTS[e % COMMENTS.length] } }).catch(() => {});
    // follow the next two builders
    for (let f = 1; f <= 2; f++) {
      const target = PEOPLE[(e + f) % PEOPLE.length];
      const handle = (await q('SELECT username FROM users WHERE email = $1', [target.email])).rows[0]?.username;
      if (handle) await api(`/follows/${handle}`, { method: 'POST', token }).catch(() => {});
    }
  }

  const p = await api('/projects?limit=50');
  const i = await api('/ideas?limit=50');
  console.log(`\ndone — ${p.length} builds, ${i.length} ideas, ${PEOPLE.length} builders`);
  await pool.end();
}

main().catch(async (e) => {
  console.error('SEED FAILED:', e.message);
  await pool.end();
  process.exit(1);
});
