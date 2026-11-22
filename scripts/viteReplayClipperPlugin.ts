import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const DEFAULT_CLIPS_DIR = 'C:\\Users\\callu\\Desktop\\Media\\darts-autoclipper';
const INDEX_FILENAME = 'clips-index.json';

type ClipCategory = 'game' | 'user' | 'dev';

const CATEGORY_FOLDERS: Record<ClipCategory, string> = {
  game: 'Game Highlights',
  user: 'User Triggered',
  dev: 'Dev Tests',
};

interface StoredClipMeta {
  id: string;
  filename: string;
  relativePath?: string;
  subfolder?: string;
  category?: ClipCategory;
  filePath: string;
  url: string;
  playerName: string;
  segmentName: string;
  score: number;
  reason: string;
  coords?: { x: number; y: number };
  preSeconds: number;
  postSeconds: number;
  durationSec: number;
  sizeBytes: number;
  isDevTest: boolean;
  isDualCamera?: boolean;
  isSavedToDisk?: boolean;
  createdAt: number;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function ensureCategoryFolders(rootDir: string): void {
  ensureDir(rootDir);
  for (const folder of Object.values(CATEGORY_FOLDERS)) {
    ensureDir(path.join(rootDir, folder));
  }
}

function inferCategory(item: {
  category?: string;
  isDevTest?: boolean;
  filename?: string;
  reason?: string;
}): ClipCategory {
  if (item.category === 'user' || item.category === 'dev' || item.category === 'game') {
    return item.category;
  }
  const upperName = (item.filename || '').toUpperCase();
  const upperReason = (item.reason || '').toUpperCase();
  if (item.isDevTest || upperName.includes('DEVTEST') || upperReason.includes('DEV TEST')) {
    return 'dev';
  }
  if (
    upperName.includes('MANUALOCHECLIP') ||
    upperName.includes('USERTRIGGERED') ||
    upperReason.includes('MANUAL') ||
    upperReason.includes('USER TRIGGERED')
  ) {
    return 'user';
  }
  return 'game';
}

function sanitizeFilenamePart(str: string): string {
  return str.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'clip';
}

/**
 * Safely resolves a clip relative path (e.g. "User Triggered/clip.webm" or "clip.webm")
 * strictly inside `rootDir` with path-traversal protection.
 */
function resolveSafeClipPath(rootDir: string, rawRelPath: string): { fullPath: string; normalizedRel: string } | null {
  const cleaned = rawRelPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!cleaned || cleaned.includes('..') || !/\.(webm|mp4)$/i.test(cleaned)) {
    return null;
  }
  const rootResolved = path.resolve(rootDir);
  const fullPath = path.resolve(rootResolved, cleaned);
  if (!fullPath.startsWith(rootResolved + path.sep)) {
    return null;
  }
  const normalizedRel = path.relative(rootResolved, fullPath).replace(/\\/g, '/');
  return { fullPath, normalizedRel };
}

function encodeUrlPath(relativePath: string): string {
  return relativePath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function writeIndex(dir: string, clips: StoredClipMeta[]): void {
  ensureDir(dir);
  const indexPath = path.join(dir, INDEX_FILENAME);
  const tmpPath = `${indexPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(clips, null, 2), 'utf-8');
  fs.renameSync(tmpPath, indexPath);
}

/**
 * Reads `clips-index.json`, automatically migrates any legacy root-level clips into
 * `Game Highlights`, `User Triggered`, or `Dev Tests`, and prunes missing files.
 */
function readAndOrganizeIndex(rootDir: string): StoredClipMeta[] {
  ensureCategoryFolders(rootDir);
  const indexPath = path.join(rootDir, INDEX_FILENAME);
  let rawClips: StoredClipMeta[] = [];

  try {
    if (fs.existsSync(indexPath)) {
      const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      if (Array.isArray(parsed)) {
        rawClips = parsed as StoredClipMeta[];
      }
    }
  } catch (err) {
    console.error('[ReplayClipper] Failed reading clips-index.json:', err);
  }

  let dirty = false;
  const organized: StoredClipMeta[] = [];

  for (const item of rawClips) {
    if (!item?.filename) continue;

    const category = inferCategory(item);
    const subfolder = CATEGORY_FOLDERS[category];
    const targetRel = `${subfolder}/${item.filename}`;
    const targetFull = path.join(rootDir, subfolder, item.filename);

    // Check if file already exists in target subfolder, else migrate from root or old relativePath
    if (!fs.existsSync(targetFull)) {
      const candidatePaths = [
        item.relativePath ? path.join(rootDir, item.relativePath) : '',
        path.join(rootDir, item.filename),
        item.filePath || '',
      ].filter(Boolean);

      const foundSrc = candidatePaths.find((p) => fs.existsSync(p));
      if (!foundSrc) {
        dirty = true;
        continue; // file deleted externally
      }

      if (path.resolve(foundSrc) !== path.resolve(targetFull)) {
        try {
          fs.renameSync(foundSrc, targetFull);
          dirty = true;
        } catch {
          // ignore move errors
        }
      }
    }

    const updatedUrl = `/api/replays/file/${encodeUrlPath(targetRel)}`;
    if (
      item.relativePath !== targetRel ||
      item.subfolder !== subfolder ||
      item.category !== category ||
      item.filePath !== targetFull ||
      item.url !== updatedUrl
    ) {
      dirty = true;
    }

    organized.push({
      ...item,
      category,
      subfolder,
      relativePath: targetRel,
      filePath: targetFull,
      url: updatedUrl,
      isDevTest: category === 'dev',
      isSavedToDisk: true,
    });
  }

  // Also migrate any untracked root-level .webm/.mp4 files into their category folder
  try {
    const rootEntries = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const entry of rootEntries) {
      if (!entry.isFile() || !/\.(webm|mp4)$/i.test(entry.name)) continue;
      const category = inferCategory({ filename: entry.name });
      const subfolder = CATEGORY_FOLDERS[category];
      const src = path.join(rootDir, entry.name);
      const dest = path.join(rootDir, subfolder, entry.name);
      if (!fs.existsSync(dest)) {
        fs.renameSync(src, dest);
      }
    }
  } catch {
    // ignore
  }

  if (dirty) {
    writeIndex(rootDir, organized);
  }

  return organized;
}

function readBinaryBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    const maxBytes = 80 * 1024 * 1024;

    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Clip exceeds 80MB limit'));
        return;
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function attachReplayMiddleware(
  middlewares: { use: (handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void }
) {
  let activeClipsDir = DEFAULT_CLIPS_DIR;

  middlewares.use((req, res, next) => {
    if (!req.url || !req.url.startsWith('/api/replays/')) {
      next();
      return;
    }

    const url = new URL(req.url, 'http://127.0.0.1');
    const pathname = url.pathname;

    const requestedDir = url.searchParams.get('dir');
    if (requestedDir && requestedDir.trim().length > 2) {
      activeClipsDir = path.resolve(requestedDir.trim());
    }

    // 1. GET /api/replays/list — Organize subfolders & return saved clips
    if (req.method === 'GET' && pathname === '/api/replays/list') {
      try {
        const clips = readAndOrganizeIndex(activeClipsDir);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(
          JSON.stringify({
            ok: true,
            saveDir: activeClipsDir,
            folders: CATEGORY_FOLDERS,
            clips,
          })
        );
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            ok: false,
            saveDir: activeClipsDir,
            clips: [],
            error: (err as Error).message,
          })
        );
      }
      return;
    }

    // 2. POST /api/replays/clip — Save clip directly into its category subfolder
    if (req.method === 'POST' && pathname === '/api/replays/clip') {
      readBinaryBody(req)
        .then((buffer) => {
          if (buffer.length === 0) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: 'Empty video buffer' }));
            return;
          }

          ensureCategoryFolders(activeClipsDir);

          const playerName = url.searchParams.get('player') || 'Player';
          const segmentName = url.searchParams.get('segment') || 'Dart';
          const score = Number(url.searchParams.get('score') || '0');
          const reason = url.searchParams.get('reason') || 'Action Replay';
          const preSeconds = Number(url.searchParams.get('pre') || '5');
          const postSeconds = Number(url.searchParams.get('post') || '5');
          const durationSec = Number(url.searchParams.get('duration') || String(preSeconds + postSeconds));
          const isDevTest = url.searchParams.get('devTest') === '1';
          const isDualCamera = url.searchParams.get('dualCam') === '1';
          const rawCategory = url.searchParams.get('category') || undefined;
          const category = inferCategory({ category: rawCategory, isDevTest, reason });
          const subfolder = CATEGORY_FOLDERS[category];

          const cx = url.searchParams.get('cx');
          const cy = url.searchParams.get('cy');
          const ext = (url.searchParams.get('ext') || 'webm').toLowerCase() === 'mp4' ? 'mp4' : 'webm';

          const now = new Date();
          const stamp = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0'),
          ].join('-') +
            '_' +
            [
              String(now.getHours()).padStart(2, '0'),
              String(now.getMinutes()).padStart(2, '0'),
              String(now.getSeconds()).padStart(2, '0'),
            ].join('-');

          const tag =
            category === 'dev'
              ? 'DEVTEST'
              : category === 'user'
              ? 'USER'
              : sanitizeFilenamePart(reason);
          const layoutTag = isDualCamera ? '_SPLIT' : '';
          const filename = `${stamp}_${sanitizeFilenamePart(playerName)}_${sanitizeFilenamePart(segmentName)}_${tag}${layoutTag}.${ext}`;
          const relativePath = `${subfolder}/${filename}`;
          const filePath = path.join(activeClipsDir, subfolder, filename);

          fs.writeFileSync(filePath, buffer);

          const record: StoredClipMeta = {
            id: `clip-${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
            filename,
            relativePath,
            subfolder,
            category,
            filePath,
            url: `/api/replays/file/${encodeUrlPath(relativePath)}`,
            playerName,
            segmentName,
            score,
            reason,
            coords:
              cx !== null && cy !== null && !Number.isNaN(Number(cx)) && !Number.isNaN(Number(cy))
                ? { x: Number(cx), y: Number(cy) }
                : undefined,
            preSeconds,
            postSeconds,
            durationSec,
            sizeBytes: buffer.length,
            isDevTest: category === 'dev',
            isDualCamera,
            isSavedToDisk: true,
            createdAt: now.getTime(),
          };

          const existing = readAndOrganizeIndex(activeClipsDir);
          const updated = [record, ...existing].slice(0, 200);
          writeIndex(activeClipsDir, updated);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, clip: record, saveDir: activeClipsDir }));
        })
        .catch((err) => {
          console.error('[ReplayClipper] Save error:', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: (err as Error).message }));
        });
      return;
    }

    // 3. GET /api/replays/file/<subfolder>/<filename> — Stream saved clip with HTTP Range support
    if (req.method === 'GET' && pathname.startsWith('/api/replays/file/')) {
      const rawRel = pathname
        .slice('/api/replays/file/'.length)
        .split('/')
        .map((seg) => decodeURIComponent(seg))
        .join('/');

      const resolved = resolveSafeClipPath(activeClipsDir, rawRel);
      if (!resolved || !fs.existsSync(resolved.fullPath)) {
        res.statusCode = 404;
        res.end('Clip not found');
        return;
      }

      const stat = fs.statSync(resolved.fullPath);
      const fileSize = stat.size;
      const contentType = resolved.fullPath.endsWith('.mp4') ? 'video/mp4' : 'video/webm';
      const range = req.headers.range;

      if (range) {
        const match = range.match(/bytes=(\d*)-(\d*)/);
        const start = match && match[1] ? parseInt(match[1], 10) : 0;
        const end = match && match[2] ? Math.min(parseInt(match[2], 10), fileSize - 1) : fileSize - 1;
        const chunkSize = end - start + 1;

        res.statusCode = 206;
        res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', chunkSize);
        res.setHeader('Content-Type', contentType);
        fs.createReadStream(resolved.fullPath, { start, end }).pipe(res);
      } else {
        res.statusCode = 200;
        res.setHeader('Content-Length', fileSize);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', contentType);
        fs.createReadStream(resolved.fullPath).pipe(res);
      }
      return;
    }

    // 4. DELETE /api/replays/file/<subfolder>/<filename> — Remove clip from disk & index
    if (req.method === 'DELETE' && pathname.startsWith('/api/replays/file/')) {
      const rawRel = pathname
        .slice('/api/replays/file/'.length)
        .split('/')
        .map((seg) => decodeURIComponent(seg))
        .join('/');

      const resolved = resolveSafeClipPath(activeClipsDir, rawRel);
      if (!resolved) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false }));
        return;
      }

      try {
        if (fs.existsSync(resolved.fullPath)) {
          fs.unlinkSync(resolved.fullPath);
        }
        const existing = readAndOrganizeIndex(activeClipsDir).filter(
          (c) => c.relativePath !== resolved.normalizedRel && c.filename !== path.basename(resolved.normalizedRel)
        );
        writeIndex(activeClipsDir, existing);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: (err as Error).message }));
      }
      return;
    }

    next();
  });
}

/**
 * Vite plugin saving and streaming Flight Club-style Oche-Cam Action Replay clips
 * neatly sorted into `Game Highlights`, `User Triggered`, and `Dev Tests` subfolders
 * inside C:\Users\callu\Desktop\Media\darts-autoclipper.
 */
export function replayClipperPlugin(): Plugin {
  return {
    name: 'autodarts-replay-clipper',
    configureServer(server) {
      attachReplayMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachReplayMiddleware(server.middlewares);
    },
  };
}
