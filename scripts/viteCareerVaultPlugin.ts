import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const VAULT_FILE = path.join(DATA_DIR, 'career-vault.json');
const DASHBOARD_STATE_FILE = path.join(DATA_DIR, 'dashboard-state.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJsonFileFromDisk(filePath: string, fallbackJson: string, label: string): string {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
  } catch (err) {
    console.error(`[${label}] Failed reading file:`, err);
  }
  return fallbackJson;
}

function writeJsonFileAtomically(filePath: string, rawJson: string): { bytes: number; savedAt: number } {
  ensureDataDir();
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, rawJson, 'utf-8');
  fs.renameSync(tempPath, filePath);
  return {
    bytes: Buffer.byteLength(rawJson, 'utf-8'),
    savedAt: Date.now(),
  };
}

function readVaultFromDisk(): string {
  return readJsonFileFromDisk(
    VAULT_FILE,
    JSON.stringify({ version: 1, players: {}, updatedAt: 0 }),
    'CareerVault'
  );
}

function writeVaultAtomically(rawJson: string): { bytes: number; savedAt: number } {
  return writeJsonFileAtomically(VAULT_FILE, rawJson);
}

function readDashboardStateFromDisk(): string {
  return readJsonFileFromDisk(
    DASHBOARD_STATE_FILE,
    JSON.stringify({ version: 1, updatedAt: 0 }),
    'DashboardState'
  );
}

function writeDashboardStateAtomically(rawJson: string): { bytes: number; savedAt: number } {
  return writeJsonFileAtomically(DASHBOARD_STATE_FILE, rawJson);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) {
        reject(new Error('Vault payload exceeded 20MB limit'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
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
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(content);
      return;
    }

    // POST /api/dashboard/state — Atomically persist dashboard layout & preferences to ./data/dashboard-state.json
    if (req.method === 'POST' && urlPath === '/api/dashboard/state') {
      readBody(req)
        .then((raw) => {
          const parsed = JSON.parse(raw);
          const pretty = JSON.stringify(parsed, null, 2);
          const result = writeDashboardStateAtomically(pretty);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, ...result, path: 'data/dashboard-state.json' }));
        })
        .catch((err) => {
          console.error('[DashboardState] Save failed:', err);
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON payload' }));
        });
      return;
    }

    // GET /api/career/vault — Load persisted career vault JSON from ./data/career-vault.json
    if (req.method === 'GET' && urlPath === '/api/career/vault') {
      const content = readVaultFromDisk();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(content);
      return;
    }

    // POST /api/career/vault — Atomically persist updated career vault JSON to disk
    if (req.method === 'POST' && urlPath === '/api/career/vault') {
      readBody(req)
        .then((raw) => {
          // Validate JSON before overwriting disk file
          const parsed = JSON.parse(raw);
          const pretty = JSON.stringify(parsed, null, 2);
          const result = writeVaultAtomically(pretty);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, ...result, path: 'data/career-vault.json' }));
        })
        .catch((err) => {
          console.error('[CareerVault] Save failed:', err);
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON payload' }));
        });
      return;
    }

    // GET /api/career/export — Download a timestamped backup JSON file
    if (req.method === 'GET' && urlPath === '/api/career/export') {
      const content = readVaultFromDisk();
      const today = new Date().toISOString().slice(0, 10);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="autodarts-career-${today}.json"`);
      res.end(content);
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
