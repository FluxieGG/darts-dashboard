import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const DEFAULT_CLIPS_DIR = 'C:\\Users\\callu\\Desktop\\Media\\darts-autoclipper';
const INDEX_FILENAME = 'clips-index.json';
const CAMERA_BOOT_REPORT_PATH = path.resolve(process.cwd(), 'data', 'camera-boot-report.json');

function fetchAutodartsCameraConfig(): Promise<{
  vidPids: string[];
  configuredCamCount: number;
  reachable: boolean;
}> {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:3180/api/config', { timeout: 1500 }, (upstreamRes) => {
      let raw = '';
      upstreamRes.on('data', (chunk) => {
        raw += chunk.toString();
      });
      upstreamRes.on('end', () => {
        try {
          const parsed = JSON.parse(raw) as { cam?: { cams?: string[] } };
          const cams = Array.isArray(parsed?.cam?.cams) ? parsed.cam.cams : [];
          const vidPids: string[] = [];
          for (const spec of cams) {
            const match = String(spec).match(/vid=([0-9a-f]{4})&pid=([0-9a-f]{4})/i);
            if (match) {
              const vp = `${match[1].toLowerCase()}:${match[2].toLowerCase()}`;
              if (!vidPids.includes(vp)) vidPids.push(vp);
            }
          }
          resolve({ vidPids, configuredCamCount: cams.length, reachable: true });
        } catch {
          resolve({ vidPids: [], configuredCamCount: 0, reachable: true });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ vidPids: [], configuredCamCount: 0, reachable: false });
    });
    req.on('error', () => {
      resolve({ vidPids: [], configuredCamCount: 0, reachable: false });
    });
  });
}

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

function sanitizeDisplayFilename(str: string): string {
  return str
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 96);
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
        dirty = true;
      }
    }
  } catch {
    // ignore
  }

  // Scan ALL 3 category subfolders on disk and auto-discover any clip files not yet in clips-index.json
  // so saved clips ALWAYS survive restarts, folder edits, or empty/corrupt index files!
  const knownPaths = new Set(organized.map((c) => (c.relativePath || '').toLowerCase()));

  for (const [catKey, subfolder] of Object.entries(CATEGORY_FOLDERS) as Array<[ClipCategory, string]>) {
    const folderFull = path.join(rootDir, subfolder);
    try {
      const entries = fs.readdirSync(folderFull, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !/\.(webm|mp4)$/i.test(entry.name)) continue;
        const targetRel = `${subfolder}/${entry.name}`;
        if (knownPaths.has(targetRel.toLowerCase())) continue;

        const targetFull = path.join(folderFull, entry.name);
        const stat = fs.statSync(targetFull);
        if (stat.size === 0) continue;

        // Parse clean human-readable metadata from filename
        const baseNoExt = entry.name.replace(/\.(webm|mp4)$/i, '');
        const cleanTitle = baseNoExt.replace(/\s*\(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\)$/, '').trim();
        let playerName = 'Player';
        let segmentName = 'CLIP';
        let reason = cleanTitle || entry.name;

        const winMatch = cleanTitle.match(/^(.+?)\s*-\s*Game Winning Shot\s*-\s*(.+)$/i);
        if (winMatch) {
          playerName = winMatch[2].trim();
          segmentName = 'WIN';
          reason = cleanTitle;
        } else {
          // Legacy timestamp format: YYYY-MM-DD_HH-MM-SS_Player_Segment_Tag...
          const parts = baseNoExt.split('_');
          if (parts.length >= 5 && /^\d{4}-\d{2}-\d{2}$/.test(parts[0])) {
            playerName = parts[2] || 'Player';
            segmentName = parts[3] || 'CLIP';
            reason =
              catKey === 'dev'
                ? `Dev Test (${segmentName})`
                : catKey === 'user'
                ? 'Manual Oche Clip'
                : parts[4] || 'Game Highlight';
          }
        }

        organized.push({
          id: `disk-${Math.round(stat.mtimeMs)}-${sanitizeFilenamePart(entry.name).slice(-8)}`,
          filename: entry.name,
          relativePath: targetRel,
          subfolder,
          category: catKey,
          filePath: targetFull,
          url: `/api/replays/file/${encodeUrlPath(targetRel)}`,
          playerName,
          segmentName,
          score: 0,
          reason,
          preSeconds: 5,
          postSeconds: 5,
          durationSec: 10,
          sizeBytes: stat.size,
          isDevTest: catKey === 'dev',
          isDualCamera: true,
          isSavedToDisk: true,
          createdAt: Math.round(stat.mtimeMs),
        });
        knownPaths.add(targetRel.toLowerCase());
        dirty = true;
      }
    } catch {
      // ignore folder read error
    }
  }

  // Keep newest clips first
  organized.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

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

    // 0. GET /api/replays/board-stream — Unbuffered live MJPEG relay from Autodarts Desktop (all 3 board cameras)
    if (req.method === 'GET' && pathname === '/api/replays/board-stream') {
      const upstreamQuery = url.searchParams.get('warp') === '1' ? '?warp=true' : '';
      const upstreamUrl = `http://127.0.0.1:3180/api/streams/live${upstreamQuery}`;

      const upstreamReq = http.get(upstreamUrl, (upstreamRes) => {
        if ((upstreamRes.statusCode || 500) >= 400) {
          res.statusCode = upstreamRes.statusCode || 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: `Autodarts stream HTTP ${upstreamRes.statusCode}` }));
          upstreamRes.resume();
          return;
        }

        res.statusCode = 200;
        res.setHeader(
          'Content-Type',
          upstreamRes.headers['content-type'] || 'multipart/x-mixed-replace; boundary=advisionmjpg'
        );
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();

        upstreamRes.pipe(res);

        upstreamRes.on('error', () => {
          if (!res.writableEnded) res.end();
        });
      });

      upstreamReq.on('error', (err) => {
        if (!res.headersSent) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: err.message }));
        } else if (!res.writableEnded) {
          res.end();
        }
      });

      req.on('close', () => {
        upstreamReq.destroy();
      });
      return;
    }

    // 0b. GET /api/replays/cameras — Live Autodarts board camera VID:PIDs + start-kiosk.ps1 boot camera report
    if (req.method === 'GET' && pathname === '/api/replays/cameras') {
      void fetchAutodartsCameraConfig().then((adInfo) => {
        let bootReport: unknown = null;
        try {
          if (fs.existsSync(CAMERA_BOOT_REPORT_PATH)) {
            const raw = fs.readFileSync(CAMERA_BOOT_REPORT_PATH, 'utf-8').replace(/^\uFEFF/, '');
            bootReport = JSON.parse(raw);
          }
        } catch {
          bootReport = null;
        }

        const reportVidPids = Array.isArray((bootReport as { autodartsVidPids?: unknown })?.autodartsVidPids)
          ? ((bootReport as { autodartsVidPids: string[] }).autodartsVidPids)
          : [];
        const mergedVidPids = Array.from(new Set([...adInfo.vidPids, ...reportVidPids]));

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(
          JSON.stringify({
            ok: true,
            autodartsReachable: adInfo.reachable,
            autodartsVidPids: mergedVidPids,
            autodartsConfiguredCamCount: adInfo.configuredCamCount,
            bootReport,
          })
        );
      });
      return;
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

          const customNameRaw = url.searchParams.get('customName') || '';
          const customNameClean = sanitizeDisplayFilename(customNameRaw);
          const tag =
            category === 'dev'
              ? 'DEVTEST'
              : category === 'user'
              ? 'USER'
              : sanitizeFilenamePart(reason);
          const layoutTag = isDualCamera ? '_SPLIT' : '';
          const filename = customNameClean
            ? `${customNameClean} (${stamp}).${ext}`
            : `${stamp}_${sanitizeFilenamePart(playerName)}_${sanitizeFilenamePart(segmentName)}_${tag}${layoutTag}.${ext}`;
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
