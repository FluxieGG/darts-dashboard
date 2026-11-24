import crypto from 'node:crypto';
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
    let settled = false;
    const finish = (result: { vidPids: string[]; configuredCamCount: number; reachable: boolean }) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const req = http.get('http://127.0.0.1:3180/api/config', { timeout: 1500 }, (upstreamRes) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      upstreamRes.on('data', (chunk: Buffer | string) => {
        if (settled) return;
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buf.length;
        if (totalBytes > 2 * 1024 * 1024) {
          upstreamRes.destroy();
          finish({ vidPids: [], configuredCamCount: 0, reachable: true });
          return;
        }
        chunks.push(buf);
      });

      upstreamRes.on('error', () => {
        finish({ vidPids: [], configuredCamCount: 0, reachable: false });
      });

      upstreamRes.on('end', () => {
        try {
          const raw = Buffer.concat(chunks, totalBytes).toString('utf-8');
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
          finish({ vidPids, configuredCamCount: cams.length, reachable: true });
        } catch {
          finish({ vidPids: [], configuredCamCount: 0, reachable: true });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      finish({ vidPids: [], configuredCamCount: 0, reachable: false });
    });
    req.on('error', () => {
      finish({ vidPids: [], configuredCamCount: 0, reachable: false });
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

const indexWriteQueues = new Map<string, Promise<void>>();

function enqueueIndexWrite(dir: string, task: () => Promise<void>): Promise<void> {
  const key = path.resolve(dir).toLowerCase();
  const prev = indexWriteQueues.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(task);
  indexWriteQueues.set(key, next);
  next.finally(() => {
    if (indexWriteQueues.get(key) === next) {
      indexWriteQueues.delete(key);
    }
  });
  return next;
}

function writeIndex(dir: string, clips: StoredClipMeta[]): Promise<void> {
  return enqueueIndexWrite(dir, async () => {
    await fs.promises.mkdir(dir, { recursive: true });
    const indexPath = path.join(dir, INDEX_FILENAME);
    const tmpPath = `${indexPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    const serialized = JSON.stringify(clips, null, 2);
    let renamed = false;

    try {
      await fs.promises.writeFile(tmpPath, serialized, 'utf-8');
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await fs.promises.rename(tmpPath, indexPath);
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
    } finally {
      if (!renamed) {
        await fs.promises.unlink(tmpPath).catch(() => {
          // ignore temp cleanup errors
        });
      }
    }
  });
}

/**
 * Reads `clips-index.json`, automatically migrates any legacy root-level clips into
 * `Game Highlights`, `User Triggered`, or `Dev Tests`, and prunes missing files.
 */
async function readAndOrganizeIndex(rootDir: string): Promise<StoredClipMeta[]> {
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
  const seenRelPaths = new Set<string>();

  for (const item of rawClips) {
    if (!item?.filename) continue;

    const category = inferCategory(item);
    const subfolder = CATEGORY_FOLDERS[category];
    const targetRel = `${subfolder}/${item.filename}`;
    const targetRelKey = targetRel.toLowerCase();
    if (seenRelPaths.has(targetRelKey)) {
      dirty = true;
      continue;
    }

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

    seenRelPaths.add(targetRelKey);
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
  for (const [catKey, subfolder] of Object.entries(CATEGORY_FOLDERS) as Array<[ClipCategory, string]>) {
    const folderFull = path.join(rootDir, subfolder);
    try {
      const entries = fs.readdirSync(folderFull, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !/\.(webm|mp4)$/i.test(entry.name)) continue;
        const targetRel = `${subfolder}/${entry.name}`;
        if (seenRelPaths.has(targetRel.toLowerCase())) continue;

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
        seenRelPaths.add(targetRel.toLowerCase());
        dirty = true;
      }
    } catch {
      // ignore folder read error
    }
  }

  // Keep newest clips first
  organized.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  if (dirty) {
    await writeIndex(rootDir, organized);
  }

  return organized;
}

function readBinaryBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    let ended = false;
    const maxBytes = 80 * 1024 * 1024;

    const finishResolve = (buf: Buffer) => {
      if (settled) return;
      settled = true;
      resolve(buf);
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
      total += buf.length;
      if (total > maxBytes) {
        finishReject(new Error('Clip exceeds 80MB limit'));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });

    req.on('end', () => {
      ended = true;
      if (settled) return;
      finishResolve(Buffer.concat(chunks, total));
    });

    req.on('aborted', () => {
      finishReject(new Error('Upload aborted by client'));
    });

    req.on('close', () => {
      if (!ended && !settled) {
        finishReject(new Error('Upload stream closed before completion'));
      }
    });

    req.on('error', (err) => finishReject(err));
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

function attachReplayMiddleware(
  middlewares: { use: (handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void }
) {
  let activeClipsDir = DEFAULT_CLIPS_DIR;

  middlewares.use((req, res, next) => {
    if (!req.url || !req.url.startsWith('/api/replays/')) {
      next();
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

    const requestedDir = url.searchParams.get('dir');
    if (requestedDir && requestedDir.trim().length > 2) {
      try {
        activeClipsDir = path.resolve(requestedDir.trim());
      } catch {
        sendJsonResponse(res, 400, { ok: false, error: 'Invalid clips directory path' });
        return;
      }
    }

    // 0. GET /api/replays/board-stream — Unbuffered live MJPEG relay from Autodarts Desktop (all 3 board cameras)
    if (req.method === 'GET' && pathname === '/api/replays/board-stream') {
      const upstreamQuery = url.searchParams.get('warp') === '1' ? '?warp=true' : '';
      const upstreamUrl = `http://127.0.0.1:3180/api/streams/live${upstreamQuery}`;

      let cleaned = false;
      let upstreamResRef: IncomingMessage | null = null;

      const upstreamReq = http.get(upstreamUrl, { timeout: 15_000 }, (upstreamRes) => {
        if (cleaned || res.writableEnded || res.destroyed) {
          upstreamRes.destroy();
          return;
        }

        upstreamResRef = upstreamRes;

        if ((upstreamRes.statusCode || 500) >= 400) {
          const status = upstreamRes.statusCode || 502;
          upstreamRes.resume();
          cleanup();
          sendJsonResponse(res, status, {
            ok: false,
            error: `Autodarts stream HTTP ${upstreamRes.statusCode}`,
          });
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
          cleanup();
          if (!res.writableEnded && !res.destroyed) res.end();
        });

        upstreamRes.on('end', () => {
          cleanup();
          if (!res.writableEnded && !res.destroyed) res.end();
        });
      });

      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        if (upstreamResRef) {
          try {
            upstreamResRef.unpipe(res);
            upstreamResRef.destroy();
          } catch {
            // ignore
          }
          upstreamResRef = null;
        }
        if (!upstreamReq.destroyed) {
          upstreamReq.destroy();
        }
      };

      upstreamReq.on('timeout', () => {
        cleanup();
        sendJsonResponse(res, 504, { ok: false, error: 'Autodarts stream timed out' });
      });

      upstreamReq.on('error', (err) => {
        cleanup();
        sendJsonResponse(res, 502, { ok: false, error: err.message });
      });

      req.on('close', cleanup);
      req.on('error', cleanup);
      res.on('close', cleanup);
      res.on('error', cleanup);
      return;
    }

    // 0b. GET /api/replays/cameras — Live Autodarts board camera VID:PIDs + start-kiosk.ps1 boot camera report
    if (req.method === 'GET' && pathname === '/api/replays/cameras') {
      fetchAutodartsCameraConfig()
        .then((adInfo) => {
          if (res.writableEnded || res.destroyed) return;

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
            ? (bootReport as { autodartsVidPids: string[] }).autodartsVidPids
            : [];
          const mergedVidPids = Array.from(new Set([...adInfo.vidPids, ...reportVidPids]));

          if (!res.writableEnded && !res.destroyed) {
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
          }
        })
        .catch((err) => {
          sendJsonResponse(res, 500, {
            ok: false,
            error: err instanceof Error ? err.message : 'Camera probe failed',
          });
        });
      return;
    }

    // 1. GET /api/replays/list — Organize subfolders & return saved clips
    if (req.method === 'GET' && pathname === '/api/replays/list') {
      readAndOrganizeIndex(activeClipsDir)
        .then((clips) => {
          if (res.writableEnded || res.destroyed) return;
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
        })
        .catch((err) => {
          sendJsonResponse(res, 500, {
            ok: false,
            saveDir: activeClipsDir,
            clips: [],
            error: (err as Error).message,
          });
        });
      return;
    }

    // 2. POST /api/replays/clip — Save clip directly into its category subfolder
    if (req.method === 'POST' && pathname === '/api/replays/clip') {
      readBinaryBody(req)
        .then(async (buffer) => {
          if (buffer.length === 0) {
            sendJsonResponse(res, 400, { ok: false, error: 'Empty video buffer' });
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
          const stamp =
            [
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
          let filename = customNameClean
            ? `${customNameClean} (${stamp}).${ext}`
            : `${stamp}_${sanitizeFilenamePart(playerName)}_${sanitizeFilenamePart(segmentName)}_${tag}${layoutTag}.${ext}`;

          let filePath = path.join(activeClipsDir, subfolder, filename);
          if (fs.existsSync(filePath)) {
            const ms = String(now.getMilliseconds()).padStart(3, '0');
            const rand = Math.random().toString(36).slice(2, 5);
            const tieBreaker = `${ms}-${rand}`;
            filename = customNameClean
              ? `${customNameClean} (${stamp}_${tieBreaker}).${ext}`
              : `${stamp}_${tieBreaker}_${sanitizeFilenamePart(playerName)}_${sanitizeFilenamePart(segmentName)}_${tag}${layoutTag}.${ext}`;
            filePath = path.join(activeClipsDir, subfolder, filename);
          }

          const relativePath = `${subfolder}/${filename}`;

          await fs.promises.writeFile(filePath, buffer);

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

          const existing = await readAndOrganizeIndex(activeClipsDir);
          const normalizedRelLower = relativePath.toLowerCase();
          const dedupedExisting = existing.filter(
            (c) => (c.relativePath || `${c.subfolder || ''}/${c.filename}`).toLowerCase() !== normalizedRelLower
          );
          const updated = [record, ...dedupedExisting].slice(0, 200);
          await writeIndex(activeClipsDir, updated);

          sendJsonResponse(res, 200, { ok: true, clip: record, saveDir: activeClipsDir });
        })
        .catch((err) => {
          console.error('[ReplayClipper] Save error:', err);
          sendJsonResponse(res, 500, { ok: false, error: (err as Error).message });
        });
      return;
    }

    // 3. GET /api/replays/file/<subfolder>/<filename> — Stream saved clip with HTTP Range support
    if (req.method === 'GET' && pathname.startsWith('/api/replays/file/')) {
      let rawRel: string;
      try {
        rawRel = pathname
          .slice('/api/replays/file/'.length)
          .split('/')
          .map((seg) => decodeURIComponent(seg))
          .join('/');
      } catch {
        if (!res.writableEnded && !res.destroyed) {
          res.statusCode = 400;
          res.end('Malformed clip path');
        }
        return;
      }

      const resolved = resolveSafeClipPath(activeClipsDir, rawRel);
      if (!resolved) {
        if (!res.writableEnded && !res.destroyed) {
          res.statusCode = 404;
          res.end('Clip not found');
        }
        return;
      }

      let stat: fs.Stats;
      try {
        stat = fs.statSync(resolved.fullPath);
        if (!stat.isFile()) {
          res.statusCode = 404;
          res.end('Clip not found');
          return;
        }
      } catch {
        if (!res.writableEnded && !res.destroyed) {
          res.statusCode = 404;
          res.end('Clip not found');
        }
        return;
      }

      const fileSize = stat.size;
      const contentType = resolved.fullPath.endsWith('.mp4') ? 'video/mp4' : 'video/webm';
      const range = req.headers.range;

      let stream: fs.ReadStream;
      if (range) {
        const match = range.match(/^bytes=(\d*)-(\d*)$/);
        if (fileSize === 0 || !match || (match[1] === '' && match[2] === '')) {
          res.statusCode = 416;
          res.setHeader('Content-Range', `bytes */${fileSize}`);
          res.end();
          return;
        }

        let start: number;
        let end: number;
        if (match[1] === '') {
          const suffixLen = parseInt(match[2], 10);
          if (Number.isNaN(suffixLen) || suffixLen <= 0) {
            res.statusCode = 416;
            res.setHeader('Content-Range', `bytes */${fileSize}`);
            res.end();
            return;
          }
          start = Math.max(0, fileSize - suffixLen);
          end = fileSize - 1;
        } else {
          start = parseInt(match[1], 10);
          end = match[2] ? Math.min(parseInt(match[2], 10), fileSize - 1) : fileSize - 1;
        }

        if (
          fileSize === 0 ||
          Number.isNaN(start) ||
          Number.isNaN(end) ||
          start < 0 ||
          start >= fileSize ||
          start > end
        ) {
          res.statusCode = 416;
          res.setHeader('Content-Range', `bytes */${fileSize}`);
          res.end();
          return;
        }

        const chunkSize = end - start + 1;
        res.statusCode = 206;
        res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', chunkSize);
        res.setHeader('Content-Type', contentType);
        stream = fs.createReadStream(resolved.fullPath, { start, end });
      } else {
        res.statusCode = 200;
        res.setHeader('Content-Length', fileSize);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', contentType);
        stream = fs.createReadStream(resolved.fullPath);
      }

      const destroyStream = () => {
        if (!stream.destroyed) {
          stream.destroy();
        }
      };
      res.on('close', destroyStream);
      res.on('error', destroyStream);
      stream.on('error', (err) => {
        console.error('[ReplayClipper] Stream read error:', err);
        destroyStream();
        if (!res.headersSent && !res.writableEnded && !res.destroyed) {
          res.statusCode = 500;
          res.end('Stream error');
        } else if (!res.writableEnded && !res.destroyed) {
          res.end();
        }
      });

      stream.pipe(res);
      return;
    }

    // 4. DELETE /api/replays/file/<subfolder>/<filename> — Remove clip from disk & index
    if (req.method === 'DELETE' && pathname.startsWith('/api/replays/file/')) {
      let rawRel: string;
      try {
        rawRel = pathname
          .slice('/api/replays/file/'.length)
          .split('/')
          .map((seg) => decodeURIComponent(seg))
          .join('/');
      } catch {
        sendJsonResponse(res, 400, { ok: false, error: 'Malformed clip path' });
        return;
      }

      const resolved = resolveSafeClipPath(activeClipsDir, rawRel);
      if (!resolved) {
        sendJsonResponse(res, 400, { ok: false });
        return;
      }

      (async () => {
        if (fs.existsSync(resolved.fullPath)) {
          await fs.promises.unlink(resolved.fullPath);
        }
        const existing = (await readAndOrganizeIndex(activeClipsDir)).filter(
          (c) => c.relativePath !== resolved.normalizedRel && c.filename !== path.basename(resolved.normalizedRel)
        );
        await writeIndex(activeClipsDir, existing);
        sendJsonResponse(res, 200, { ok: true });
      })().catch((err) => {
        sendJsonResponse(res, 500, { ok: false, error: (err as Error).message });
      });
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
