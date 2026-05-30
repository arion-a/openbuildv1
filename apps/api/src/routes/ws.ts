import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { pool } from '../db/pool.js';

export async function wsRoutes(app: FastifyInstance) {
  app.get('/session/:sessionId', { websocket: true, preHandler: [(app as any).authenticate] }, (socket, request) => {
    const { sessionId } = request.params as any;
    const { id: userId } = (request as any).user;

    let containerSocket: WebSocket | null = null;

    pool.query("SELECT * FROM sessions WHERE id = $1 AND status = 'running'", [sessionId])
      .then((res) => {
        const session = res.rows[0];
        if (!session) {
          socket.send(JSON.stringify({ type: 'error', content: 'Session not found or not running' }));
          socket.close();
          return;
        }

        const isOwner = session.user_id === userId;
        if (!isOwner) {
          socket.send(JSON.stringify({ type: 'error', content: 'Not authorized to access this session' }));
          socket.close();
          return;
        }
        const containerWsUrl = session.web_terminal_url.replace('http://', 'ws://');

        const connect = (retries: number) => {
          containerSocket = new WebSocket(containerWsUrl);

          containerSocket.on('error', () => {
            if (retries > 0 && socket.readyState === WebSocket.OPEN) {
              setTimeout(() => connect(retries - 1), 2000);
            } else if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'error', content: 'Container relay not ready. Try refreshing.' }));
              socket.close();
            }
          });

          containerSocket.on('open', () => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'connected', sessionId, isOwner }));
            }
          });

          containerSocket.on('message', (data) => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(data.toString());
            }
          });

          containerSocket.on('close', () => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'session_ended' }));
              socket.close();
            }
          });
        };

        connect(15);

        socket.on('message', (raw) => {
          if (!isOwner) {
            socket.send(JSON.stringify({ type: 'error', content: 'Spectators cannot send commands' }));
            return;
          }
          if (containerSocket?.readyState === WebSocket.OPEN) {
            containerSocket.send(raw.toString());
          }
        });
      })
      .catch(() => {
        socket.send(JSON.stringify({ type: 'error', content: 'Internal error' }));
        socket.close();
      });

    socket.on('close', () => {
      containerSocket?.close();
    });
  });
}
