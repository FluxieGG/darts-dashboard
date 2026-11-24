import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import type { Plugin } from 'vite';

interface NetworkCandidate {
  address: string;
  interfaceName: string;
  priority: number;
}

interface RelayClient {
  id: string;
  role: 'kiosk' | 'remote' | 'dev_kiosk' | 'dev';
  res: ServerResponse;
}

/**
 * Detects local LAN IPv4 addresses sorted so real Wi-Fi / Ethernet LAN IPs
 * appear before virtual adapters (WSL, Hyper-V, Docker, VirtualBox, VPN).
 */
function detectLanCandidates(): NetworkCandidate[] {
  const nets = os.networkInterfaces();
  const candidates: NetworkCandidate[] = [];

  for (const [name, entries] of Object.entries(nets)) {
    if (!entries) continue;
    const lowerName = name.toLowerCase();
    const isVirtual =
      lowerName.includes('vethernet') ||
      lowerName.includes('wsl') ||
      lowerName.includes('docker') ||
      lowerName.includes('virtual') ||
      lowerName.includes('vmware') ||
      lowerName.includes('vbox') ||
      lowerName.includes('tailscale') ||
      lowerName.includes('loopback');

    for (const net of entries) {
      if (net.family !== 'IPv4' || net.internal) continue;
      if (net.address.startsWith('169.254.')) continue; // link-local fallback

      let priority = 50;
      if (!isVirtual) priority -= 30;
      if (net.address.startsWith('192.168.')) priority -= 15;
      else if (net.address.startsWith('10.')) priority -= 10;
      else if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(net.address)) priority -= 5;
      if (lowerName.includes('wi-fi') || lowerName.includes('wifi') || lowerName.includes('ethernet')) {
        priority -= 5;
      }

      candidates.push({
        address: net.address,
        interfaceName: name,
        priority,
      });
    }
  }

  return candidates.sort((a, b) => a.priority - b.priority);
}

function readJsonBody(req: IncomingMessage, maxBytes = 512_000): Promise<unknown> {
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

function attachRemoteRelayMiddleware(
  middlewares: { use: (handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void },
  defaultPort: number,
  httpServer?: { once: (event: 'close', listener: () => void) => unknown } | null
) {
  const clients = new Map<string, RelayClient>();
  let latestKioskState: unknown = null;
  let latestDevHealth: unknown = null;
  const devLogsBuffer: unknown[] = [];
  const MAX_DEV_LOGS = 250;
  let isBroadcastingPresence = false;

  const getCounts = () => {
    let connectedRemotes = 0;
    let connectedKiosks = 0;
    let connectedDevs = 0;
    for (const c of clients.values()) {
      if (c.role === 'remote') connectedRemotes++;
      else if (c.role === 'kiosk') connectedKiosks++;
      else if (c.role === 'dev') connectedDevs++;
    }
    return { connectedRemotes, connectedKiosks, connectedDevs };
  };

  const broadcastPresence = () => {
    if (isBroadcastingPresence) return;
    isBroadcastingPresence = true;
    let evicted = false;
    try {
      const counts = getCounts();
      const payload = `event: presence\ndata: ${JSON.stringify(counts)}\n\n`;
      for (const c of Array.from(clients.values())) {
        if (c.res.writableEnded || c.res.destroyed) {
          clients.delete(c.id);
          evicted = true;
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
        }
      }
    } finally {
      isBroadcastingPresence = false;
    }
    if (evicted && clients.size > 0) {
      broadcastPresence();
    }
  };

  const removeClient = (clientId: string): boolean => {
    if (!clients.delete(clientId)) return false;
    broadcastPresence();
    return true;
  };

  const sendSse = (client: RelayClient, eventName: string, data: unknown): boolean => {
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

  const registerSseLifecycle = (req: IncomingMessage, res: ServerResponse, clientId: string) => {
    let cleaned = false;
    const cleanupClient = () => {
      if (cleaned) return;
      cleaned = true;
      removeClient(clientId);
    };
    req.on('close', cleanupClient);
    req.on('error', cleanupClient);
    res.on('close', cleanupClient);
    res.on('error', cleanupClient);
  };

  // Heartbeat keeps mobile Safari/Chrome SSE connections alive while idle
  const heartbeat = setInterval(() => {
    let evicted = false;
    for (const c of Array.from(clients.values())) {
      if (c.res.writableEnded || c.res.destroyed) {
        clients.delete(c.id);
        evicted = true;
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
      }
    }
    if (evicted) {
      broadcastPresence();
    }
  }, 15_000);
  heartbeat.unref?.();
  httpServer?.once('close', () => clearInterval(heartbeat));

  middlewares.use((req, res, next) => {
    if (!req.url || (!req.url.startsWith('/api/remote/') && !req.url.startsWith('/api/dev/'))) {
      next();
      return;
    }

    let url: URL;
    try {
      url = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${defaultPort}`}`);
    } catch {
      sendJsonResponse(res, 400, { ok: false, error: 'Invalid request URL' });
      return;
    }
    const pathname = url.pathname;

    // =========================================================================
    // DEV CONSOLE RELAY ENDPOINTS (/api/dev/*)
    // =========================================================================
    if (pathname.startsWith('/api/dev/')) {
      // GET /api/dev/snapshot — Instant hydration of live health + last 250 logs
      if (req.method === 'GET' && pathname === '/api/dev/snapshot') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(
          JSON.stringify({
            ok: true,
            health: latestDevHealth,
            logs: devLogsBuffer,
            ...getCounts(),
          })
        );
        return;
      }

      // GET /api/dev/stream?role=kiosk|dev — Real-time SSE stream for Dev Console
      if (req.method === 'GET' && pathname === '/api/dev/stream') {
        const roleParam = url.searchParams.get('role');
        const role: 'dev_kiosk' | 'dev' = roleParam === 'kiosk' ? 'dev_kiosk' : 'dev';
        const clientId = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();

        const client: RelayClient = { id: clientId, role, res };
        clients.set(clientId, client);
        registerSseLifecycle(req, res, clientId);

        if (role === 'dev') {
          if (latestDevHealth) {
            sendSse(client, 'health', latestDevHealth);
          }
          sendSse(client, 'backlog', devLogsBuffer);
        }
        broadcastPresence();
        return;
      }

      // POST /api/dev/log — Kiosk pushes one or an array of structured DevLogEntry items
      if (req.method === 'POST' && pathname === '/api/dev/log') {
        readJsonBody(req)
          .then((body) => {
            const entries = Array.isArray(body) ? body : [body];
            for (const entry of entries) {
              devLogsBuffer.push(entry);
            }
            while (devLogsBuffer.length > MAX_DEV_LOGS) {
              devLogsBuffer.shift();
            }
            for (const c of Array.from(clients.values())) {
              if (c.role === 'dev') {
                sendSse(c, 'logs', entries);
              }
            }
            sendJsonResponse(res, 200, { ok: true, count: devLogsBuffer.length });
          })
          .catch(() => {
            sendJsonResponse(res, 400, { ok: false });
          });
        return;
      }

      // POST /api/dev/health — Kiosk pushes live listeners & subsystem health snapshot
      if (req.method === 'POST' && pathname === '/api/dev/health') {
        readJsonBody(req)
          .then((body) => {
            latestDevHealth = body;
            for (const c of Array.from(clients.values())) {
              if (c.role === 'dev') {
                sendSse(c, 'health', body);
              }
            }
            sendJsonResponse(res, 200, { ok: true });
          })
          .catch(() => {
            sendJsonResponse(res, 400, { ok: false });
          });
        return;
      }

      // POST /api/dev/command — Dev Console phone sends diagnostic command to Kiosk
      if (req.method === 'POST' && pathname === '/api/dev/command') {
        readJsonBody(req)
          .then((body) => {
            const cmd = body as { type?: string };
            if (cmd?.type === 'clear_logs') {
              devLogsBuffer.length = 0;
              for (const c of Array.from(clients.values())) {
                if (c.role === 'dev') {
                  sendSse(c, 'cleared', { ok: true });
                }
              }
            }
            let delivered = 0;
            for (const c of Array.from(clients.values())) {
              if (c.role === 'dev_kiosk') {
                if (sendSse(c, 'dev_command', body)) {
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

      next();
      return;
    }

    // 1. GET /api/remote/info — LAN IP candidates + paired counts
    if (req.method === 'GET' && pathname === '/api/remote/info') {
      const candidates = detectLanCandidates();
      const hostHeader = req.headers.host || '';
      const portFromHost = hostHeader.includes(':') ? parseInt(hostHeader.split(':')[1], 10) : NaN;
      const port = Number.isFinite(portFromHost) ? portFromHost : defaultPort;
      const counts = getCounts();

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(
        JSON.stringify({
          port,
          interfaces: candidates.map((c) => ({
            address: c.address,
            name: c.interfaceName,
            url: `http://${c.address}:${port}/?remote=1`,
            devUrl: `http://${c.address}:${port}/?dev=1`,
          })),
          fallbackUrl: `http://127.0.0.1:${port}/?remote=1`,
          fallbackDevUrl: `http://127.0.0.1:${port}/?dev=1`,
          ...counts,
        })
      );
      return;
    }

    // 2. GET /api/remote/stream?role=kiosk|remote — Real-time SSE stream
    if (req.method === 'GET' && pathname === '/api/remote/stream') {
      const roleParam = url.searchParams.get('role');
      const role: 'kiosk' | 'remote' = roleParam === 'kiosk' ? 'kiosk' : 'remote';
      const clientId = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      const client: RelayClient = { id: clientId, role, res };
      clients.set(clientId, client);
      registerSseLifecycle(req, res, clientId);

      // Hydrate newly connected remote immediately with cached kiosk state
      if (role === 'remote' && latestKioskState) {
        sendSse(client, 'state', latestKioskState);
      }
      broadcastPresence();
      return;
    }

    // 3a. GET /api/remote/state — Instant pull snapshot (used by iPad on wake/focus)
    if (req.method === 'GET' && pathname === '/api/remote/state') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(
        JSON.stringify({
          ok: true,
          state: latestKioskState,
          ...getCounts(),
        })
      );
      return;
    }

    // 3b. POST /api/remote/state — Kiosk pushes authoritative UI state to all paired phones/iPads
    if (req.method === 'POST' && pathname === '/api/remote/state') {
      readJsonBody(req)
        .then((body) => {
          latestKioskState = body;
          for (const c of Array.from(clients.values())) {
            if (c.role === 'remote') {
              sendSse(c, 'state', body);
            }
          }
          sendJsonResponse(res, 200, { ok: true, ...getCounts() });
        })
        .catch(() => {
          sendJsonResponse(res, 400, { ok: false });
        });
      return;
    }

    // 4. POST /api/remote/command — Phone dispatches a command to the Kiosk
    if (req.method === 'POST' && pathname === '/api/remote/command') {
      readJsonBody(req)
        .then((body) => {
          let delivered = 0;
          for (const c of Array.from(clients.values())) {
            if (c.role === 'kiosk') {
              if (sendSse(c, 'command', body)) {
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

    next();
  });
}

/**
 * Zero-dependency Vite plugin that embeds the Phone-at-the-Oche LAN Remote Relay
 * directly into both `npm run dev` and `npm run preview`.
 */
export function remoteRelayPlugin(): Plugin {
  return {
    name: 'autodarts-remote-relay',
    configureServer(server) {
      const port = server.config.server.port || 5173;
      attachRemoteRelayMiddleware(server.middlewares, port, server.httpServer);
    },
    configurePreviewServer(server) {
      const port = server.config.preview.port || 4173;
      attachRemoteRelayMiddleware(server.middlewares, port, server.httpServer);
    },
  };
}
