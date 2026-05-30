import { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { WebSocket } from 'ws';
import fp from 'fastify-plugin';
import http from 'http';
import admin from 'firebase-admin';
import { createHmac } from 'crypto';
import { config } from '../config/env.js';

const SESSION_HOST_REGEX = /^s-([0-9a-f-]{36})\./;
const SESSION_COOKIE_MAX_AGE = 4 * 60 * 60; // 4 hours

async function getSessionUrl(sessionId: string): Promise<string | null> {
  const res = await pool.query(
    "SELECT web_terminal_url FROM sessions WHERE id = $1 AND status = 'running'",
    [sessionId]
  );
  const url = res.rows[0]?.web_terminal_url || null;
  if (url && !url.match(/^https?:\/\/(localhost|127\.0\.0\.1):\d+/)) return null;
  return url;
}

async function getSessionOwner(sessionId: string): Promise<string | null> {
  const res = await pool.query("SELECT user_id FROM sessions WHERE id = $1", [sessionId]);
  return res.rows[0]?.user_id || null;
}

async function verifyFirebaseToken(token: string): Promise<string | null> {
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const userRes = await pool.query("SELECT id FROM users WHERE firebase_uid = $1", [decoded.uid]);
    return userRes.rows[0]?.id || null;
  } catch {
    return null;
  }
}

// Lightweight signed session cookie: userId:sessionId:expiry:signature
function mintSessionCookie(userId: string, sessionId: string): string {
  const expiry = Math.floor(Date.now() / 1000) + SESSION_COOKIE_MAX_AGE;
  const payload = `${userId}:${sessionId}:${expiry}`;
  const sig = createHmac('sha256', config.jwt.secret).update(payload).digest('hex').slice(0, 32);
  return `${payload}:${sig}`;
}

function verifySessionCookie(cookie: string, sessionId: string): string | null {
  const parts = cookie.split(':');
  if (parts.length !== 4) return null;
  const [userId, cookieSessionId, expiryStr, sig] = parts;
  if (cookieSessionId !== sessionId) return null;
  const expiry = parseInt(expiryStr, 10);
  if (Date.now() / 1000 > expiry) return null;
  const expectedSig = createHmac('sha256', config.jwt.secret).update(`${userId}:${cookieSessionId}:${expiryStr}`).digest('hex').slice(0, 32);
  if (sig !== expectedSig) return null;
  return userId;
}

function collectBody(raw: http.IncomingMessage): Promise<Buffer | undefined> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    raw.on('data', (chunk: Buffer) => chunks.push(chunk));
    raw.on('end', () => resolve(chunks.length > 0 ? Buffer.concat(chunks) : undefined));
    raw.on('error', () => resolve(undefined));
  });
}

async function sessionSubdomainPlugin(app: FastifyInstance) {
  app.addHook('onRequest', async (request, reply) => {
    const host = request.headers.host || '';
    const match = host.match(SESSION_HOST_REGEX);
    if (!match) return;

    const sessionId = match[1];

    // Auth: check session cookie first (fast path), then Firebase token from query/header
    const url = new URL(request.url, `http://${host}`);
    const queryToken = url.searchParams.get('token');
    const authHeader = request.headers.authorization;
    const cookieValue = request.headers.cookie?.match(/__ob_session=([^;]+)/)?.[1] || null;

    let userId: string | null = null;

    // Try the signed session cookie first (doesn't hit Firebase)
    if (cookieValue) {
      userId = verifySessionCookie(cookieValue, sessionId);
    }

    // Fall back to Firebase token (from query param or Authorization header)
    if (!userId) {
      const firebaseToken = queryToken || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);
      if (firebaseToken) {
        userId = await verifyFirebaseToken(firebaseToken);
      }
    }

    if (!userId) {
      reply.status(401).send({ error: 'Authentication required. Please access this session from OpenBuild.' });
      return;
    }

    const ownerId = await getSessionOwner(sessionId);
    if (ownerId !== userId) {
      reply.status(403).send({ error: 'Not authorized to access this session' });
      return;
    }

    // If this was a Firebase token auth (not cookie), mint a session cookie and redirect
    if (!cookieValue || !verifySessionCookie(cookieValue, sessionId)) {
      const cookie = mintSessionCookie(userId, sessionId);
      reply.header('set-cookie', `__ob_session=${cookie}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_COOKIE_MAX_AGE}`);
      if (queryToken) {
        url.searchParams.delete('token');
        reply.redirect(url.pathname + url.search);
        return;
      }
    }

    const baseUrl = await getSessionUrl(sessionId);

    if (!baseUrl) {
      reply.status(404).send({ error: 'Session not found or not running' });
      return;
    }

    if (request.headers.upgrade?.toLowerCase() === 'websocket') {
      (request as any).__sessionBaseUrl = baseUrl;
      (request as any).__sessionId = sessionId;
      return;
    }

    const path = url.pathname === '/' ? '' : url.pathname.slice(1);
    const targetUrl = `${baseUrl}/${path}${url.search}`;

    const headers: Record<string, string> = {};
    if (request.headers['accept']) headers['accept'] = request.headers['accept'] as string;
    if (request.headers['content-type']) headers['content-type'] = request.headers['content-type'] as string;
    if (request.headers['range']) headers['range'] = request.headers['range'] as string;

    let reqBody: Buffer | undefined;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      reqBody = await collectBody(request.raw);
    }

    try {
      const upstream = await fetch(targetUrl, {
        method: request.method,
        headers,
        body: reqBody as any,
      });

      const contentType = upstream.headers.get('content-type') || '';
      const isStream = contentType.includes('text/event-stream');

      const skipHeaders = new Set(['transfer-encoding', 'content-encoding', 'content-length']);
      for (const [key, value] of upstream.headers.entries()) {
        if (key.toLowerCase() === 'content-security-policy') {
          reply.header(key, "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src * ws: wss: data: blob:;");
        } else if (key.toLowerCase() === 'x-frame-options') {
          // Skip — allow iframe embedding
        } else if (!skipHeaders.has(key.toLowerCase())) {
          reply.header(key, value);
        }
      }

      reply.status(upstream.status);

      if (isStream && upstream.body) {
        reply.raw.writeHead(upstream.status, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          'connection': 'keep-alive',
        });
        const reader = upstream.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            reply.raw.write(value);
          }
        } catch {}
        reply.raw.end();
        return reply;
      }

      const resBody = Buffer.from(await upstream.arrayBuffer());
      reply.send(resBody);
    } catch (err: any) {
      console.error('[session-proxy] Error proxying to', targetUrl, err?.message || err);
      reply.status(502).send({ error: 'Container not reachable' });
    }
  });
}

export const sessionSubdomainRoutes = fp(sessionSubdomainPlugin);
