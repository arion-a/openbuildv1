import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/env.js';
import { authRoutes } from './routes/auth.js';
import { projectRoutes } from './routes/projects.js';
import { sessionRoutes } from './routes/sessions.js';
import { ideaRoutes } from './routes/ideas.js';
import { trendingRoutes } from './routes/trending.js';
import { settingsRoutes } from './routes/settings.js';
import { wsRoutes } from './routes/ws.js';
import { pullRoutes } from './routes/pulls.js';
import { sessionProxyRoutes } from './routes/session-proxy.js';
import { sessionSubdomainRoutes } from './routes/session-subdomain.js';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { firebaseAdmin } from './config/firebase.js';
import { pool, ensureMakerColumns, ensureBuildColumns, ensureDiscussionColumns, ensurePublishTables, ensureReviewTables, ensureWaitlistTable, ensureShowcaseColumns, ensureSearchColumns, ensureSocialTables, ensureModerationTables } from './db/pool.js';
import { makerRoutes } from './routes/makers.js';
import { publicationRoutes } from './routes/publications.js';
import { waitlistRoutes } from './routes/waitlist.js';
import { registerMetaRoutes } from './routes/meta.js';
import { searchRoutes } from './routes/search.js';
import { messageRoutes } from './routes/messages.js';
import { notificationRoutes } from './routes/notifications.js';
import { followRoutes } from './routes/follows.js';
import { reportRoutes } from './routes/report.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = Fastify({
  logger: true,
  // In production the SPA and the API are one Fastify instance on one origin, and
  // the browser calls /api/*. (Dev has a Vite proxy that strips the prefix.)
  // Strip /api here — before routing — so /api/waitlist reaches the /waitlist route
  // instead of falling through to index.html.
  rewriteUrl(req) {
    const url = req.url || '/';
    if (url === '/api' || url === '/api/') return '/';
    if (url.startsWith('/api/')) return url.slice(4);
    return url;
  },
});

await app.register(cors, {
  origin: (origin, cb) => {
    if (
      !origin ||
      origin === 'https://openbuild.world' ||
      (origin.endsWith('.openbuild.world') && !origin.match(/^https?:\/\/s-[0-9a-f-]+\.openbuild\.world$/)) ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    ) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
  credentials: true,
});
await app.register(jwt, { secret: config.jwt.secret });
await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
await app.register(websocket);
await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

app.decorate('authenticate', async (request: any, reply: any) => {
  const authHeader = request.headers.authorization;
  const isWebSocket = request.headers.upgrade?.toLowerCase() === 'websocket';
  const queryToken = isWebSocket ? (request.query as any)?.token : null;
  const rawToken = authHeader?.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : queryToken;

  if (!rawToken) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const token = rawToken;

  // Try local JWT first
  try {
    await request.jwtVerify();
    return;
  } catch {}

  // Fall back to Firebase ID token verification
  try {
    const decoded = await firebaseAdmin.auth().verifyIdToken(token);
    const res = await pool.query('SELECT id, username FROM users WHERE firebase_uid = $1', [decoded.uid]);
    if (res.rows.length === 0) {
      return reply.status(401).send({ error: 'User not provisioned' });
    }
    request.user = { id: res.rows[0].id, username: res.rows[0].username };
  } catch (err) {
    request.log.error({ err: (err as Error)?.message }, 'verifyIdToken failed (authenticate)');
    return reply.status(401).send({ error: 'Unauthorized' });
  }
});

await ensureMakerColumns().catch((err) => {
  app.log.warn({ err }, 'ensureMakerColumns failed');
});
await ensureBuildColumns().catch((err) => {
  app.log.warn({ err }, 'ensureBuildColumns failed');
});
await ensureDiscussionColumns().catch((err) => {
  app.log.warn({ err }, 'ensureDiscussionColumns failed');
});
await ensurePublishTables().catch((err) => {
  app.log.warn({ err }, 'ensurePublishTables failed');
});
await ensureReviewTables().catch((err) => {
  app.log.warn({ err }, 'ensureReviewTables failed');
});
await ensureWaitlistTable().catch((err) => {
  app.log.warn({ err }, 'ensureWaitlistTable failed');
});
await ensureShowcaseColumns().catch((err) => {
  app.log.warn({ err }, 'ensureShowcaseColumns failed');
});
await ensureSearchColumns().catch((err) => {
  app.log.warn({ err }, 'ensureSearchColumns failed');
});
await ensureSocialTables().catch((err) => {
  app.log.warn({ err }, 'ensureSocialTables failed');
});
await ensureModerationTables().catch((err) => {
  app.log.warn({ err }, 'ensureModerationTables failed');
});

await app.register(authRoutes, { prefix: '/auth' });
await app.register(waitlistRoutes, { prefix: '/waitlist' });
await app.register(makerRoutes, { prefix: '/makers' });
await app.register(projectRoutes, { prefix: '/projects' });
await app.register(sessionRoutes, { prefix: '/sessions' });
await app.register(ideaRoutes, { prefix: '/ideas' });
await app.register(publicationRoutes, { prefix: '/publications' });
await app.register(searchRoutes, { prefix: '/search' });
await app.register(messageRoutes, { prefix: '/messages' });
await app.register(notificationRoutes, { prefix: '/notifications' });
await app.register(followRoutes, { prefix: '/follows' });
await app.register(reportRoutes, { prefix: '/report' });
await app.register(trendingRoutes, { prefix: '/trending' });
await app.register(settingsRoutes, { prefix: '/settings' });
await app.register(wsRoutes, { prefix: '/ws' });
await app.register(pullRoutes, { prefix: '/pulls' });
await app.register(sessionProxyRoutes, { prefix: '/proxy' });
await app.register(sessionSubdomainRoutes);

app.get('/health', async () => ({ status: 'ok' }));

// Serve frontend static files in production
const webDist = join(__dirname, '../../web/dist');
if (existsSync(webDist)) {
  // Per-page OG tags for shared build/idea/maker links — must be registered
  // before the static wildcard so these parametric routes win.
  registerMetaRoutes(app, webDist);
  await app.register(fastifyStatic, { root: webDist, wildcard: true, prefix: '/' });
  app.setNotFoundHandler((request, reply) => {
        if (request.url.startsWith('/auth') || request.url.startsWith('/waitlist') || request.url.startsWith('/makers') || request.url.startsWith('/projects') ||
        request.url.startsWith('/sessions') || request.url.startsWith('/ideas') ||
        request.url.startsWith('/trending') || request.url.startsWith('/settings') ||
        request.url.startsWith('/publications') || request.url.startsWith('/search') ||
        request.url.startsWith('/messages') || request.url.startsWith('/notifications') ||
        request.url.startsWith('/follows') || request.url.startsWith('/report') ||
        request.url.startsWith('/ws') || request.url.startsWith('/pulls') ||
        request.url.startsWith('/proxy') || request.url.startsWith('/health')) {
      reply.status(404).send({ error: 'Not found' });
    } else {
      (reply as any).sendFile('index.html');
    }
  });
}

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
