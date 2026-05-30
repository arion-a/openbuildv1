import { WebSocketServer } from 'ws';
import { spawn } from 'child_process';
import { readdir } from 'fs/promises';
import { join } from 'path';

const PORT = 7681;
const OPENCODE_PORT = 4096;
const WORKSPACE = '/workspace';

const wss = new WebSocketServer({ port: PORT });

console.log(`Session relay listening on ws://0.0.0.0:${PORT}`);
console.log(`Waiting for OpenCode server on port ${OPENCODE_PORT}...`);

let opencodeReady = false;
let activeSessionId = null;

// Returns a promise that resolves when OpenCode is ready
function waitForOpenCode(maxRetries = 60) {
  return new Promise((resolve) => {
    let attempts = 0;
    const check = async () => {
      attempts++;
      try {
        const res = await fetch(`http://127.0.0.1:${OPENCODE_PORT}/doc`);
        if (res.ok) {
          console.log(`OpenCode server ready after ${attempts} attempts`);
          opencodeReady = true;
          resolve(true);
          return;
        }
      } catch {}
      if (attempts >= maxRetries) {
        console.error('OpenCode server failed to start after 60 attempts');
        resolve(false);
        return;
      }
      setTimeout(check, 1000);
    };
    check();
  });
}

// Start waiting immediately
const opencodeReadyPromise = waitForOpenCode();

// Wait for OpenCode with a per-request timeout
async function ensureReady(timeoutMs = 30000) {
  if (opencodeReady) return true;
  const timeout = new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs));
  return Promise.race([opencodeReadyPromise, timeout]);
}

async function ensureSession() {
  if (activeSessionId) return activeSessionId;

  // Try creating a session — OpenCode may use different API patterns
  // Try /session first, then /sessions
  for (const path of ['/session', '/sessions']) {
    try {
      const res = await fetch(`http://127.0.0.1:${OPENCODE_PORT}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        activeSessionId = data.id || data.session_id;
        console.log(`Created OpenCode session: ${activeSessionId}`);
        return activeSessionId;
      }
    } catch {}
  }

  // If session creation doesn't work, try listing existing sessions
  try {
    const res = await fetch(`http://127.0.0.1:${OPENCODE_PORT}/session`);
    if (res.ok) {
      const data = await res.json();
      const sessions = Array.isArray(data) ? data : data.sessions || [];
      if (sessions.length > 0) {
        activeSessionId = sessions[0].id || sessions[0].session_id;
        console.log(`Reusing existing OpenCode session: ${activeSessionId}`);
        return activeSessionId;
      }
    }
  } catch {}

  return null;
}

// Subscribe to session events (SSE) for real-time streaming
async function subscribeToEvents(ws) {
  // Try common SSE event endpoint patterns
  const eventPaths = activeSessionId
    ? [`/session/${activeSessionId}/events`, `/events`, `/session/${activeSessionId}/stream`]
    : ['/events'];

  for (const path of eventPaths) {
    try {
      const res = await fetch(`http://127.0.0.1:${OPENCODE_PORT}${path}`, {
        headers: { 'Accept': 'text/event-stream' },
      });
      if (res.ok && res.headers.get('content-type')?.includes('text/event-stream')) {
        console.log(`Subscribed to events at ${path}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        (async () => {
          let buffer = '';
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (!line.trim() || line.startsWith(':')) continue;
                if (line.startsWith('data: ')) {
                  const data = line.slice(6);
                  try {
                    const event = JSON.parse(data);
                    if (ws.readyState === 1) {
                      ws.send(JSON.stringify({ type: 'event', event }));
                    }
                  } catch {
                    if (ws.readyState === 1) {
                      ws.send(JSON.stringify({ type: 'event', event: { text: data } }));
                    }
                  }
                }
              }
            }
          } catch {}
        })();
        return;
      }
    } catch {}
  }
  console.log('No SSE events endpoint found — will rely on message response streaming');
}

// Send a message and stream the response
async function sendPrompt(ws, text) {
  const sessionId = await ensureSession();

  // Try different message endpoint patterns
  const messagePaths = sessionId
    ? [`/session/${sessionId}/message`, `/session/${sessionId}/chat`, `/sessions/${sessionId}/message`]
    : ['/chat', '/message'];

  let response = null;

  for (const path of messagePaths) {
    try {
      const res = await fetch(`http://127.0.0.1:${OPENCODE_PORT}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, message: text, prompt: text }),
      });
      if (res.ok) {
        response = res;
        console.log(`Message sent via ${path}`);
        break;
      }
    } catch {}
  }

  if (!response) {
    // Fallback: use CLI directly
    console.log('API message endpoints not available, falling back to CLI');
    await sendPromptViaCLI(ws, text);
    return;
  }

  // Stream the response body
  const contentType = response.headers.get('content-type') || '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const event = JSON.parse(data);
          forwardEvent(ws, event);
        } catch {
          ws.send(JSON.stringify({ type: 'text', content: data }));
        }
      } else if (line.startsWith('event: ')) {
        // SSE event type line — next data line will have the payload
      } else {
        try {
          const parsed = JSON.parse(line);
          forwardEvent(ws, parsed);
        } catch {
          ws.send(JSON.stringify({ type: 'text', content: line }));
        }
      }
    }
  }

  if (buffer.trim()) {
    try {
      const parsed = JSON.parse(buffer);
      forwardEvent(ws, parsed);
    } catch {
      if (buffer.startsWith('data: ')) {
        ws.send(JSON.stringify({ type: 'text', content: buffer.slice(6) }));
      } else {
        ws.send(JSON.stringify({ type: 'text', content: buffer }));
      }
    }
  }

  ws.send(JSON.stringify({ type: 'done' }));
}

// Forward an event from OpenCode to the WebSocket client with structured types
function forwardEvent(ws, event) {
  if (ws.readyState !== 1) return;

  // Detect event type and forward with structured info
  if (event.type === 'tool_call' || event.tool_call || event.name) {
    ws.send(JSON.stringify({
      type: 'tool_call',
      tool: event.name || event.tool_call?.name || event.tool || 'unknown',
      input: event.input || event.tool_call?.input || event.arguments || event.params,
    }));
  } else if (event.type === 'tool_result' || event.tool_result) {
    ws.send(JSON.stringify({
      type: 'tool_result',
      tool: event.name || event.tool || 'unknown',
      output: event.output || event.tool_result?.output || event.result || event.content,
    }));
  } else if (event.type === 'thinking' || event.thinking) {
    ws.send(JSON.stringify({
      type: 'thinking',
      content: event.thinking || event.content || event.text,
    }));
  } else if (event.type === 'text' || event.response || event.content || event.text) {
    ws.send(JSON.stringify({
      type: 'text',
      content: event.response || event.content || event.text || JSON.stringify(event),
    }));
  } else {
    ws.send(JSON.stringify({ type: 'stream', event }));
  }
}

// Fallback: spawn opencode CLI for a single prompt
function sendPromptViaCLI(ws, text) {
  return new Promise((resolve) => {
    const proc = spawn('opencode', ['-p', text, '-f', 'json'], {
      cwd: WORKSPACE,
      env: { ...process.env, HOME: '/home/builder' },
    });

    proc.stdout.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          forwardEvent(ws, event);
        } catch {
          ws.send(JSON.stringify({ type: 'text', content: line }));
        }
      }
    });

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      if (text.includes('WARN') || text.includes('spinner') || text.includes('TTY')) return;
      ws.send(JSON.stringify({ type: 'error', content: text }));
    });

    proc.on('close', () => {
      ws.send(JSON.stringify({ type: 'done' }));
      resolve();
    });
  });
}

wss.on('connection', (ws) => {
  console.log('Client connected');

  // Try subscribing to events stream
  if (opencodeReady) {
    subscribeToEvents(ws);
  } else {
    opencodeReadyPromise.then((ready) => {
      if (ready) subscribeToEvents(ws);
    });
  }

  ws.on('message', async (raw) => {
    const msg = JSON.parse(raw.toString());

    switch (msg.type) {
      case 'prompt': {
        // Wait for OpenCode to be ready (up to 30s) rather than immediately rejecting
        ws.send(JSON.stringify({ type: 'status', content: 'Waiting for OpenCode...' }));
        const ready = await ensureReady(30000);
        if (!ready) {
          ws.send(JSON.stringify({ type: 'error', content: 'OpenCode server failed to start. Please try again.' }));
          return;
        }

        try {
          await sendPrompt(ws, msg.text);
        } catch (err) {
          console.error('Prompt error:', err.message);
          ws.send(JSON.stringify({ type: 'error', content: err.message }));
          ws.send(JSON.stringify({ type: 'done' }));
        }
        break;
      }

      case 'abort': {
        if (activeSessionId) {
          // Try cancel endpoint
          for (const path of [`/session/${activeSessionId}/cancel`, `/session/${activeSessionId}/abort`]) {
            try {
              await fetch(`http://127.0.0.1:${OPENCODE_PORT}${path}`, { method: 'POST' });
              break;
            } catch {}
          }
        }
        ws.send(JSON.stringify({ type: 'aborted' }));
        break;
      }

      case 'files': {
        const tree = await getFileTree(WORKSPACE);
        ws.send(JSON.stringify({ type: 'file_tree', tree }));
        break;
      }

      case 'git_status': {
        const git = spawn('git', ['status', '--porcelain'], { cwd: WORKSPACE });
        let output = '';
        git.stdout.on('data', (d) => output += d.toString());
        git.on('close', () => {
          ws.send(JSON.stringify({ type: 'git_status', files: output.trim().split('\n').filter(Boolean) }));
        });
        break;
      }

      case 'git_diff': {
        const diff = spawn('git', ['diff'], { cwd: WORKSPACE });
        let diffOutput = '';
        diff.stdout.on('data', (d) => diffOutput += d.toString());
        diff.on('close', () => {
          ws.send(JSON.stringify({ type: 'git_diff', diff: diffOutput }));
        });
        break;
      }
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

async function getFileTree(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const tree = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      tree.push({ name: entry.name, path, type: 'dir', children: await getFileTree(join(dir, entry.name), path) });
    } else {
      tree.push({ name: entry.name, path, type: 'file' });
    }
  }
  return tree;
}
