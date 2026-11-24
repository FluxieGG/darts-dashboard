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

function readJsonBody(req: IncomingMessage, maxBytes = 256_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    const finishResolve = (value: unknown) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const finishReject = (err: Error) => {
      if (settled) return;
      settled = true;
      chunks.length = 0;
      reject(err);
    };

    req.on('data', (chunk: Buffer | string) => {
      if (settled) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.length;
      if (totalBytes > maxBytes) {
        finishReject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });

    req.on('end', () => {
      if (settled) return;
      if (totalBytes === 0) {
        finishResolve({});
        return;
      }
      try {
        const raw = Buffer.concat(chunks, totalBytes).toString('utf-8');
        finishResolve(JSON.parse(raw));
      } catch (err) {
        finishReject(err instanceof Error ? err : new Error('Invalid JSON'));
      }
    });

    req.on('error', (err) => finishReject(err));
    req.on('aborted', () => finishReject(new Error('Request aborted')));
  });
}

function sendJsonResponse(res: ServerResponse, statusCode: number, payload: unknown): void {
  if (res.writableEnded || res.destroyed) return;
  if (!res.headersSent) {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  } else {
    res.end();
  }
}

function attachDartCounterMiddleware(
  middlewares: { use: (handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void },
  httpServer?: { once: (event: 'close', listener: () => void) => unknown } | null
): void {
  const clients = new Map<string, BridgeClient>();
  let latestMatchState: unknown = null;
  let latestSubmitResult: unknown = null;
  let latestControlResult: unknown = null;
  let bridgeConfig: { mode: 'auto' | 'confirm' | 'read-only'; submitOnTakeout: boolean } = {
    mode: 'confirm',
    submitOnTakeout: true,
  };
  let isBroadcastingPresence = false;

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
    if (isBroadcastingPresence) return;
    isBroadcastingPresence = true;
    let evicted = false;
    let evictedExtension = false;
    try {
      const counts = getCounts();
      const payload = `event: dc_presence\ndata: ${JSON.stringify(counts)}\n\n`;
      for (const c of Array.from(clients.values())) {
        if (c.res.writableEnded || c.res.destroyed) {
          clients.delete(c.id);
          evicted = true;
          if (c.role === 'extension') evictedExtension = true;
          continue;
        }
        try {
          c.res.write(payload);
        } catch {
          try {
            c.res.destroy();
          } catch {
            // ignore
          }
          clients.delete(c.id);
          evicted = true;
          if (c.role === 'extension') evictedExtension = true;
        }
      }
    } finally {
      isBroadcastingPresence = false;
    }

    if (evictedExtension && getCounts().connectedExtensions === 0 && latestMatchState) {
      handleAllExtensionsDisconnected();
    }
    if (evicted && clients.size > 0) {
      broadcastPresence();
    }
  };

  const handleAllExtensionsDisconnected = () => {
    if (!latestMatchState) return;
    latestMatchState = {
      ...(latestMatchState as Record<string, unknown>),
      isMatchActive: false,
      updatedAt: Date.now(),
    };
    for (const c of Array.from(clients.values())) {
      if (c.role === 'kiosk') {
        sendSse(c, 'dc_state', latestMatchState);
      }
    }
  };

  const removeClient = (clientId: string): boolean => {
    const existing = clients.get(clientId);
    if (!existing) return false;
    clients.delete(clientId);
    // Only revert match state when an extension client disconnects and no extensions remain
    if (existing.role === 'extension' && getCounts().connectedExtensions === 0 && latestMatchState) {
      handleAllExtensionsDisconnected();
    }
    broadcastPresence();
    return true;
  };

  const sendSse = (client: BridgeClient, eventName: string, data: unknown): boolean => {
    const { res } = client;
    if (res.writableEnded || res.destroyed) {
      removeClient(client.id);
      return false;
    }
    try {
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch {
      try {
        res.destroy();
      } catch {
        // ignore
      }
      removeClient(client.id);
      return false;
    }
  };

  const heartbeat = setInterval(() => {
    let evicted = false;
    let evictedExtension = false;
    for (const c of Array.from(clients.values())) {
      if (c.res.writableEnded || c.res.destroyed) {
        clients.delete(c.id);
        evicted = true;
        if (c.role === 'extension') evictedExtension = true;
        continue;
      }
      try {
        c.res.write(': ping\n\n');
      } catch {
        try {
          c.res.destroy();
        } catch {
          // ignore
        }
        clients.delete(c.id);
        evicted = true;
        if (c.role === 'extension') evictedExtension = true;
      }
    }
    if (evictedExtension && getCounts().connectedExtensions === 0 && latestMatchState) {
      handleAllExtensionsDisconnected();
    }
    if (evicted) {
      broadcastPresence();
    }
  }, 15_000);
  heartbeat.unref?.();
  httpServer?.once('close', () => clearInterval(heartbeat));

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

    let url: URL;
    try {
      url = new URL(req.url, 'http://127.0.0.1');
    } catch {
      sendJsonResponse(res, 400, { ok: false, error: 'Invalid request URL' });
      return;
    }
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
          lastControlResult: latestControlResult,
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

      const client: BridgeClient = { id: clientId, role, res };
      clients.set(clientId, client);

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        removeClient(clientId);
      };
      req.on('close', cleanup);
      req.on('error', cleanup);
      res.on('close', cleanup);
      res.on('error', cleanup);

      // Hydrate newly connected peer immediately
      sendSse(client, 'dc_config', bridgeConfig);
      if (role === 'kiosk' && latestMatchState) {
        sendSse(client, 'dc_state', latestMatchState);
      }
      broadcastPresence();
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
          for (const c of Array.from(clients.values())) {
            if (c.role === 'kiosk') {
              sendSse(c, 'dc_state', latestMatchState);
            }
          }
          sendJsonResponse(res, 200, { ok: true, ...getCounts() });
        })
        .catch(() => {
          sendJsonResponse(res, 400, { ok: false });
        });
      return;
    }

    // 4. POST /api/dartcounter/visit — Kiosk/iPad dispatches a visit score for the Extension to type into DartCounter
    if (req.method === 'POST' && pathname === '/api/dartcounter/visit') {
      readJsonBody(req)
        .then((body) => {
          let delivered = 0;
          for (const c of Array.from(clients.values())) {
            if (c.role === 'extension') {
              if (sendSse(c, 'dc_visit', body)) {
                delivered++;
              }
            }
          }
          sendJsonResponse(res, 200, { ok: true, delivered });
        })
        .catch(() => {
          sendJsonResponse(res, 400, { ok: false });
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
          for (const c of Array.from(clients.values())) {
            sendSse(c, 'dc_config', bridgeConfig);
          }
          sendJsonResponse(res, 200, { ok: true, config: bridgeConfig });
        })
        .catch(() => {
          sendJsonResponse(res, 400, { ok: false });
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
          for (const c of Array.from(clients.values())) {
            if (c.role === 'kiosk') {
              sendSse(c, 'dc_submit_result', latestSubmitResult);
            }
          }
          sendJsonResponse(res, 200, { ok: true });
        })
        .catch(() => {
          sendJsonResponse(res, 400, { ok: false });
        });
      return;
    }

    // 7. POST /api/dartcounter/control — iPad/Kiosk remote-controls Brave app.dartcounter.net (start game, accept invite, etc.)
    if (req.method === 'POST' && pathname === '/api/dartcounter/control') {
      readJsonBody(req)
        .then((body) => {
          let delivered = 0;
          for (const c of Array.from(clients.values())) {
            if (c.role === 'extension') {
              if (sendSse(c, 'dc_control', body)) {
                delivered++;
              }
            }
          }
          sendJsonResponse(res, 200, { ok: true, delivered });
        })
        .catch(() => {
          sendJsonResponse(res, 400, { ok: false });
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
          for (const c of Array.from(clients.values())) {
            if (c.role === 'kiosk') {
              sendSse(c, 'dc_control_result', latestControlResult);
            }
          }
          sendJsonResponse(res, 200, { ok: true, latestControlResult });
        })
        .catch(() => {
          sendJsonResponse(res, 400, { ok: false });
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
      attachDartCounterMiddleware(server.middlewares, server.httpServer);
    },
    configurePreviewServer(server) {
      attachDartCounterMiddleware(server.middlewares, server.httpServer);
    },
  };
}
