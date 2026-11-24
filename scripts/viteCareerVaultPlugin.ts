import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const VAULT_FILE = path.join(DATA_DIR, 'career-vault.json');
const DASHBOARD_STATE_FILE = path.join(DATA_DIR, 'dashboard-state.json');

const writeQueues = new Map<string, Promise<unknown>>();

function enqueueFileWrite<T>(filePath: string, task: () => Promise<T>): Promise<T> {
  const prev = writeQueues.get(filePath) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(task);
  writeQueues.set(filePath, next);
  next.finally(() => {
    if (writeQueues.get(filePath) === next) {
      writeQueues.delete(filePath);
    }
  });
  return next;
}

function readJsonFileFromDisk(filePath: string, fallbackJson: string, label: string): string {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      try {
        JSON.parse(content);
        return content;
      } catch (parseErr) {
        const backupPath = `${filePath}.corrupt.${Date.now()}.bak`;
        console.error(`[${label}] Corrupted JSON detected; backing up to ${backupPath}:`, parseErr);
        try {
          fs.renameSync(filePath, backupPath);
        } catch (renameErr) {
          console.error(`[${label}] Failed backing up corrupted file:`, renameErr);
        }
        return fallbackJson;
      }
    }
  } catch (err) {
    console.error(`[${label}] Failed reading file:`, err);
  }
  return fallbackJson;
}

function writeJsonFileAtomically(
  filePath: string,
  rawJson: string
): Promise<{ bytes: number; savedAt: number }> {
  return enqueueFileWrite(filePath, async () => {
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    let renamed = false;

    try {
      await fs.promises.writeFile(tempPath, rawJson, 'utf-8');
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await fs.promises.rename(tempPath, filePath);
          renamed = true;
          break;
        } catch (err) {
          const code = (err as NodeJS.ErrnoException)?.code;
          if ((code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') && attempt < 4) {
            await new Promise((r) => setTimeout(r, 30 * (attempt + 1)));
            continue;
          }
          throw err;
        }
      }
      return {
        bytes: Buffer.byteLength(rawJson, 'utf-8'),
        savedAt: Date.now(),
      };
    } finally {
      if (!renamed) {
        await fs.promises.unlink(tempPath).catch(() => {
          // ignore cleanup errors
        });
      }
    }
  });
}

function readVaultFromDisk(): string {
  return readJsonFileFromDisk(
    VAULT_FILE,
    JSON.stringify({ version: 1, players: {}, updatedAt: 0 }),
    'CareerVault'
  );
}

function writeVaultAtomically(rawJson: string): Promise<{ bytes: number; savedAt: number }> {
  return writeJsonFileAtomically(VAULT_FILE, rawJson);
}

function readDashboardStateFromDisk(): string {
  return readJsonFileFromDisk(
    DASHBOARD_STATE_FILE,
    JSON.stringify({ version: 1, updatedAt: 0 }),
    'DashboardState'
  );
}

function writeDashboardStateAtomically(
  rawJson: string
): Promise<{ bytes: number; savedAt: number }> {
  return writeJsonFileAtomically(DASHBOARD_STATE_FILE, rawJson);
}

function readBody(req: IncomingMessage, maxBytes = 20 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    const finishResolve = (value: string) => {
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
        finishReject(new Error('Vault payload exceeded 20MB limit'));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });

    req.on('end', () => {
      if (settled) return;
      finishResolve(Buffer.concat(chunks, totalBytes).toString('utf-8'));
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

function attachCareerVaultMiddleware(
  middlewares: { use: (handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void }
) {
  middlewares.use((req, res, next) => {
    if (!req.url || (!req.url.startsWith('/api/career/') && !req.url.startsWith('/api/dashboard/'))) {
      next();
      return;
    }

    const urlPath = req.url.split('?')[0];

    // GET /api/dashboard/state — Load persisted layout, hidden widgets, settings, saved players & replay config
    if (req.method === 'GET' && urlPath === '/api/dashboard/state') {
      const content = readDashboardStateFromDisk();
      if (!res.writableEnded && !res.destroyed) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(content);
      }
      return;
    }

    // POST /api/dashboard/state — Atomically persist compact dashboard state to ./data/dashboard-state.json
    if (req.method === 'POST' && urlPath === '/api/dashboard/state') {
      readBody(req)
        .then(async (raw) => {
          const parsed = JSON.parse(raw);
          const compact = JSON.stringify(parsed);
          const result = await writeDashboardStateAtomically(compact);
          sendJsonResponse(res, 200, { ok: true, ...result, path: 'data/dashboard-state.json' });
        })
        .catch((err) => {
          console.error('[DashboardState] Save failed:', err);
          sendJsonResponse(res, 400, { ok: false, error: 'Invalid JSON payload' });
        });
      return;
    }

    // GET /api/career/vault — Load persisted career vault JSON from ./data/career-vault.json
    if (req.method === 'GET' && urlPath === '/api/career/vault') {
      const content = readVaultFromDisk();
      if (!res.writableEnded && !res.destroyed) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(content);
      }
      return;
    }

    // POST /api/career/vault — Atomically persist updated career vault JSON to disk
    if (req.method === 'POST' && urlPath === '/api/career/vault') {
      readBody(req)
        .then(async (raw) => {
          // Validate JSON before overwriting disk file
          const parsed = JSON.parse(raw);
          const pretty = JSON.stringify(parsed, null, 2);
          const result = await writeVaultAtomically(pretty);
          sendJsonResponse(res, 200, { ok: true, ...result, path: 'data/career-vault.json' });
        })
        .catch((err) => {
          console.error('[CareerVault] Save failed:', err);
          sendJsonResponse(res, 400, { ok: false, error: 'Invalid JSON payload' });
        });
      return;
    }

    // GET /api/career/export — Download a timestamped backup JSON file
    if (req.method === 'GET' && urlPath === '/api/career/export') {
      const content = readVaultFromDisk();
      const today = new Date().toISOString().slice(0, 10);
      if (!res.writableEnded && !res.destroyed) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="autodarts-career-${today}.json"`);
        res.end(content);
      }
      return;
    }

    next();
  });
}

/**
 * Zero-dependency Vite plugin storing the Local Career Vault permanently
 * at `./data/career-vault.json` during both `npm run dev` and `npm run preview`.
 */
export function careerVaultPlugin(): Plugin {
  return {
    name: 'autodarts-career-vault',
    configureServer(server) {
      attachCareerVaultMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachCareerVaultMiddleware(server.middlewares);
    },
  };
}
