import { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { WebSocket } from 'ws';

async function getSessionUrl(sessionId: string): Promise<string | null> {
  const res = await pool.query("SELECT web_terminal_url FROM sessions WHERE id = $1 AND status = 'running'", [sessionId]);
  const url = res.rows[0]?.web_terminal_url || null;
  if (url && !url.match(/^https?:\/\/(localhost|127\.0\.0\.1):\d+/)) return null;
  return url;
}

async function verifySessionOwner(sessionId: string, userId: string): Promise<boolean> {
  const res = await pool.query("SELECT id FROM sessions WHERE id = $1 AND user_id = $2", [sessionId, userId]);
  return res.rows.length > 0;
}

function fixCSP(_value: string): string {
  // Allow everything the OpenCode UI needs inside the iframe
  return "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src * ws: wss: data: blob:;";
}

const SKIP_HEADERS = new Set(['transfer-encoding', 'content-encoding', 'content-length']);

export async function sessionProxyRoutes(app: FastifyInstance) {
  // WebSocket proxy for the terminal
  app.get('/session/:sessionId/ws', { websocket: true, preHandler: [(app as any).authenticate] }, (socket, request) => {
    const { sessionId } = request.params as any;
    const { id: userId } = (request as any).user;

    Promise.all([getSessionUrl(sessionId), verifySessionOwner(sessionId, userId)]).then(([baseUrl, isOwner]) => {
      if (!baseUrl || !isOwner) {
        socket.close();
        return;
      }

      const wsUrl = baseUrl.replace('http://', 'ws://') + '/ws';
      const upstream = new WebSocket(wsUrl);

      upstream.on('open', () => {});
      upstream.on('message', (data) => {
        if (socket.readyState === 1) socket.send(data.toString());
      });
      upstream.on('close', () => socket.close());
      upstream.on('error', () => socket.close());

      socket.on('message', (data) => {
        if (upstream.readyState === WebSocket.OPEN) upstream.send(data.toString());
      });
      socket.on('close', () => upstream.close());
    });
  });

  // HTTP proxy for all assets and pages
  app.all('/session/:sessionId/*', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { sessionId } = request.params as any;
    const { id: userId } = (request as any).user;
    const path = (request.params as any)['*'] || '';

    const [baseUrl, isOwner] = await Promise.all([getSessionUrl(sessionId), verifySessionOwner(sessionId, userId)]);
    if (!baseUrl) return reply.status(404).send({ error: 'Session not found' });
    if (!isOwner) return reply.status(403).send({ error: 'Not authorized' });

    const targetUrl = `${baseUrl}/${path}`;
    const headers: Record<string, string> = {};
    if (request.headers['accept']) headers['accept'] = request.headers['accept'] as string;
    if (request.headers['content-type']) headers['content-type'] = request.headers['content-type'] as string;

    try {
      const upstream = await fetch(targetUrl, {
        method: request.method,
        headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body as any : undefined,
      });

      for (const [key, value] of upstream.headers.entries()) {
        if (key.toLowerCase() === 'content-security-policy') {
          reply.header(key, fixCSP(value));
        } else if (!SKIP_HEADERS.has(key.toLowerCase())) {
          reply.header(key, value);
        }
      }

      reply.status(upstream.status);
      const body = Buffer.from(await upstream.arrayBuffer());
      return reply.send(body);
    } catch (err) {
      return reply.status(502).send({ error: 'Container not reachable' });
    }
  });

  // Handle root path (no wildcard match for trailing slash)
  app.get('/session/:sessionId', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { sessionId } = request.params as any;
    const { id: userId } = (request as any).user;
    const queryToken = (request.query as any)?.token || '';
    const [baseUrl, isOwner] = await Promise.all([getSessionUrl(sessionId), verifySessionOwner(sessionId, userId)]);
    if (!baseUrl) return reply.status(404).send({ error: 'Session not found' });
    if (!isOwner) return reply.status(403).send({ error: 'Not authorized' });

    try {
      const upstream = await fetch(baseUrl);

      for (const [key, value] of upstream.headers.entries()) {
        if (key.toLowerCase() === 'content-security-policy') {
          reply.header(key, fixCSP(value));
        } else if (!SKIP_HEADERS.has(key.toLowerCase())) {
          reply.header(key, value);
        }
      }

      reply.status(upstream.status);
      let html = await upstream.text();

      // Rewrite absolute paths like src="/assets/..." to go through proxy
      html = html.replace(/(src|href)="\//g, `$1="/api/proxy/session/${sessionId}/`);

      // Inject a fetch/WebSocket interceptor before any other scripts
      const interceptor = `<script>
(function() {
  var PROXY_BASE = "/api/proxy/session/${sessionId}/";
  var WS_PROXY = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/api/proxy/session/${sessionId}/ws?token=${queryToken}';

  // Patch fetch to route through proxy
  var origFetch = window.fetch;
  window.fetch = function(url, opts) {
    if (typeof url === 'string' && url.startsWith('/')) {
      url = PROXY_BASE + url.slice(1);
    }
    return origFetch.call(this, url, opts);
  };

  // Patch XMLHttpRequest
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    if (typeof url === 'string' && url.startsWith('/')) {
      url = PROXY_BASE + url.slice(1);
    }
    return origOpen.apply(this, [method, url, ...Array.from(arguments).slice(2)]);
  };

  // Patch WebSocket
  var OrigWS = window.WebSocket;
  window.WebSocket = function(url, protocols) {
    if (url && (url.startsWith('/') || url.includes('localhost'))) {
      url = WS_PROXY;
    }
    return new OrigWS(url, protocols);
  };
  window.WebSocket.prototype = OrigWS.prototype;
  window.WebSocket.CONNECTING = OrigWS.CONNECTING;
  window.WebSocket.OPEN = OrigWS.OPEN;
  window.WebSocket.CLOSING = OrigWS.CLOSING;
  window.WebSocket.CLOSED = OrigWS.CLOSED;
})();
</script>`;
      html = html.replace('<head>', '<head>' + interceptor);

      reply.header('content-type', 'text/html');
      return reply.send(html);
    } catch (err) {
      return reply.status(502).send({ error: 'Container not reachable' });
    }
  });
}
