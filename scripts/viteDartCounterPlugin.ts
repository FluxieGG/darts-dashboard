import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

interface BridgeClient {
  id: string;
  role: 'kiosk' | 'extension';
  res: ServerResponse;
}

function setCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  // Required by Chromium Private Network Access when https://app.dartcounter.net calls http://127.0.0.1:5173
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 256_000) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendSse(res: ServerResponse, eventName: string, data: unknown): void {
  try {
    res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // client disconnected
  }
}

function attachDartCounterMiddleware(
  middlewares: { use: (handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void }
): void {
  const clients = new Map<string, BridgeClient>();
  let latestMatchState: unknown = null;
  let latestSubmitResult: unknown = null;
  let latestControlResult: unknown = null;
  let bridgeConfig: { mode: 'auto' | 'confirm' | 'read-only'; submitOnTakeout: boolean } = {
    mode: 'auto',
    submitOnTakeout: true,
  };

  const getCounts = () => {
    let connectedExtensions = 0;
    let connectedKiosks = 0;
    for (const c of clients.values()) {
      if (c.role === 'extension') connectedExtensions++;
      else connectedKiosks++;
    }
    return { connectedExtensions, connectedKiosks };
  };

  const broadcastPresence = () => {
    const counts = getCounts();
    for (const c of clients.values()) {
      sendSse(c.res, 'dc_presence', counts);
    }
  };

  const heartbeat = setInterval(() => {
    for (const c of clients.values()) {
      try {
        c.res.write(': ping\n\n');
      } catch {
        clients.delete(c.id);
      }
    }
  }, 15_000);
  heartbeat.unref?.();

  middlewares.use((req, res, next) => {
    if (!req.url || !req.url.startsWith('/api/dartcounter/')) {
      next();
      return;
    }

    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const url = new URL(req.url, 'http://127.0.0.1');
    const pathname = url.pathname;

    // 1. GET /api/dartcounter/status — Instant status snapshot for Kiosk, iPad & Extension Popup
    if (req.method === 'GET' && pathname === '/api/dartcounter/status') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(
        JSON.stringify({
          ok: true,
          ...getCounts(),
          config: bridgeConfig,
          matchState: latestMatchState,
          lastSubmitResult: latestSubmitResult,
        })
      );
      return;
    }

    // 2. GET /api/dartcounter/stream?role=kiosk|extension — Real-time bidirectional SSE stream
    if (req.method === 'GET' && pathname === '/api/dartcounter/stream') {
      const roleParam = url.searchParams.get('role');
      const role: 'kiosk' | 'extension' = roleParam === 'extension' ? 'extension' : 'kiosk';
      const clientId = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      clients.set(clientId, { id: clientId, role, res });

      // Hydrate newly connected peer immediately
      sendSse(res, 'dc_config', bridgeConfig);
      if (role === 'kiosk' && latestMatchState) {
        sendSse(res, 'dc_state', latestMatchState);
      }
      broadcastPresence();

      req.on('close', () => {
        clients.delete(clientId);
        // If all extension tabs closed, immediately revert Kiosk back to normal Track Online Match standby
        if (getCounts().connectedExtensions === 0 && latestMatchState) {
          latestMatchState = {
            ...(latestMatchState as Record<string, unknown>),
            isMatchActive: false,
            updatedAt: Date.now(),
          };
          for (const c of clients.values()) {
            if (c.role === 'kiosk') {
              sendSse(c.res, 'dc_state', latestMatchState);
            }
          }
        }
        broadcastPresence();
      });
      return;
    }

    // 3. POST /api/dartcounter/state — Chrome/Edge Extension pushes live match state from app.dartcounter.net
    if (req.method === 'POST' && pathname === '/api/dartcounter/state') {
      readJsonBody(req)
        .then((body) => {
          latestMatchState = {
            ...(body as Record<string, unknown>),
            updatedAt: Date.now(),
          };
          for (const c of clients.values()) {
            if (c.role === 'kiosk') {
              sendSse(c.res, 'dc_state', latestMatchState);
            }
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, ...getCounts() }));
        })
        .catch(() => {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false }));
        });
      return;
    }

    // 4. POST /api/dartcounter/visit — Kiosk/iPad dispatches a visit score for the Extension to type into DartCounter
    if (req.method === 'POST' && pathname === '/api/dartcounter/visit') {
      readJsonBody(req)
        .then((body) => {
          let delivered = 0;
          for (const c of clients.values()) {
            if (c.role === 'extension') {
              sendSse(c.res, 'dc_visit', body);
              delivered++;
            }
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, delivered }));
        })
        .catch(() => {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false }));
        });
      return;
    }

    // 5. POST /api/dartcounter/config — Kiosk/iPad or Extension updates Auto-Score mode
    if (req.method === 'POST' && pathname === '/api/dartcounter/config') {
      readJsonBody(req)
        .then((body) => {
          const parsed = body as Partial<typeof bridgeConfig>;
          if (
            parsed.mode === 'auto' ||
            parsed.mode === 'confirm' ||
            parsed.mode === 'read-only'
          ) {
            bridgeConfig = {
              ...bridgeConfig,
              mode: parsed.mode,
            };
          }
          if (typeof parsed.submitOnTakeout === 'boolean') {
            bridgeConfig = {
              ...bridgeConfig,
              submitOnTakeout: parsed.submitOnTakeout,
            };
          }
          for (const c of clients.values()) {
            sendSse(c.res, 'dc_config', bridgeConfig);
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, config: bridgeConfig }));
        })
        .catch(() => {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false }));
        });
      return;
    }

    // 6. POST /api/dartcounter/submit-result — Extension confirms score entry outcome back to Kiosk & iPad
    if (req.method === 'POST' && pathname === '/api/dartcounter/submit-result') {
      readJsonBody(req)
        .then((body) => {
          latestSubmitResult = {
            ...(body as Record<string, unknown>),
            timestamp: Date.now(),
          };
          for (const c of clients.values()) {
            if (c.role === 'kiosk') {
              sendSse(c.res, 'dc_submit_result', latestSubmitResult);
            }
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true }));
        })
        .catch(() => {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false }));
        });
      return;
    }

    // 7. POST /api/dartcounter/control — iPad/Kiosk remote-controls Brave app.dartcounter.net (start game, accept invite, etc.)
    if (req.method === 'POST' && pathname === '/api/dartcounter/control') {
      readJsonBody(req)
        .then((body) => {
          let delivered = 0;
          for (const c of clients.values()) {
            if (c.role === 'extension') {
              sendSse(c.res, 'dc_control', body);
              delivered++;
            }
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, delivered }));
        })
        .catch(() => {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false }));
        });
      return;
    }

    // 8. POST /api/dartcounter/control-result — Brave extension confirms remote control command outcome
    if (req.method === 'POST' && pathname === '/api/dartcounter/control-result') {
      readJsonBody(req)
        .then((body) => {
          latestControlResult = {
            ...(body as Record<string, unknown>),
            timestamp: Date.now(),
          };
          for (const c of clients.values()) {
            if (c.role === 'kiosk') {
              sendSse(c.res, 'dc_control_result', latestControlResult);
            }
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, latestControlResult }));
        })
        .catch(() => {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false }));
        });
      return;
    }

    next();
  });
}

/**
 * Embedded Vite plugin providing a local bidirectional SSE/HTTP relay between
 * the Autodarts Kiosk Dashboard and the Target DartCounter Chrome/Edge Extension (`app.dartcounter.net`).
 */
export function dartCounterBridgePlugin(): Plugin {
  return {
    name: 'autodarts-dartcounter-bridge',
    configureServer(server) {
      attachDartCounterMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachDartCounterMiddleware(server.middlewares);
    },
  };
}
