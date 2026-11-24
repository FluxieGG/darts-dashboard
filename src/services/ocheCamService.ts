import {
  BoardCameraMode,
  CameraDeviceInfo,
  CaptureClipMetadata,
  RecordedClipBundle,
  ReplayClipRecord,
} from '../types/replay';
import { DartCoords } from '../types/darts';
import {
  BOARD_CAMERAS,
  BoardCameraIndex,
  selectClosestBoardCamera,
  VirtualBoardCamera,
} from './virtualBoardCam';

interface RollingSlot {
  id: number;
  recorder: MediaRecorder;
  chunks: Blob[];
  startedAt: number;
  pinned: boolean;
}

export interface StartOcheCamOptions {
  ocheDeviceId?: string;
  /** When true, strictly prefer `ocheDeviceId` first (user manually picked it); still falls back if busy/missing */
  strictSelection?: boolean;
  /** When true, ignore saved deviceId and scan all non-Autodarts cameras fresh */
  autoDetect?: boolean;
  includeAudio?: boolean;
  /** Kept for interface compatibility — Board Cam is always locked to Autodarts' 3 board cameras */
  boardCameraMode?: BoardCameraMode;
  boardDeviceId?: string;
  autodartsCamIndex?: number;
  autodartsCamCustomUrl?: string;
}

function isAutodartsBoardLabel(label: string, autodartsVidPids: string[]): boolean {
  const lower = (label || '').toLowerCase();
  if (!lower) return false;
  for (const vp of autodartsVidPids) {
    if (vp && lower.includes(vp.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * Scores a camera candidate so dedicated Oche / throwing webcams (e.g. "USB Live camera", Logitech, etc.)
 * are tried BEFORE generic/board cameras when auto-detecting.
 */
function scoreOcheCameraCandidate(cam: CameraDeviceInfo, autodartsVidPids: string[]): number {
  const label = (cam.label || '').toLowerCase();
  let score = 0;
  if (isAutodartsBoardLabel(label, autodartsVidPids)) {
    score -= 1000;
  }
  if (
    label.includes('live') ||
    label.includes('oche') ||
    label.includes('logitech') ||
    label.includes('brio') ||
    label.includes('c920') ||
    label.includes('c922') ||
    label.includes('hd pro') ||
    label.includes('webcam')
  ) {
    score += 50;
  }
  if (label && !label.startsWith('camera ')) {
    score += 10;
  }
  return score;
}

/**
 * Draws a video or ImageBitmap into a target rectangle using `object-fit: cover` math
 * so cameras are never stretched awkwardly.
 */
function drawCover(
  ctx: CanvasRenderingContext2D,
  source: HTMLVideoElement | ImageBitmap,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  srcRect?: { sx: number; sy: number; sw: number; sh: number }
): boolean {
  const fullW = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const fullH = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  if (!fullW || !fullH) return false;

  const baseX = srcRect ? srcRect.sx : 0;
  const baseY = srcRect ? srcRect.sy : 0;
  const sw = srcRect ? srcRect.sw : fullW;
  const sh = srcRect ? srcRect.sh : fullH;
  if (!sw || !sh) return false;

  const targetRatio = dw / dh;
  const sourceRatio = sw / sh;

  let sx = baseX;
  let sy = baseY;
  let sWidth = sw;
  let sHeight = sh;

  if (sourceRatio > targetRatio) {
    sWidth = sh * targetRatio;
    sx = baseX + (sw - sWidth) / 2;
  } else {
    sHeight = sw / targetRatio;
    sy = baseY + (sh - sHeight) / 2;
  }

  ctx.drawImage(source, sx, sy, sWidth, sHeight, dx, dy, dw, dh);
  return true;
}

function drawCornerLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  dotColor: string,
  compact = false
): void {
  ctx.save();
  ctx.font = compact
    ? '800 13px "JetBrains Mono", monospace'
    : '800 18px "JetBrains Mono", monospace';
  const metrics = ctx.measureText(text);
  const padX = compact ? 10 : 14;
  const boxW = metrics.width + padX * 2 + (compact ? 12 : 16);
  const boxH = compact ? 24 : 34;

  ctx.fillStyle = 'rgba(11, 15, 23, 0.8)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 1.5;

  const r = compact ? 7 : 10;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + boxW - r, y);
  ctx.quadraticCurveTo(x + boxW, y, x + boxW, y + r);
  ctx.lineTo(x + boxW, y + boxH - r);
  ctx.quadraticCurveTo(x + boxW, y + boxH, x + boxW - r, y + boxH);
  ctx.lineTo(x + r, y + boxH);
  ctx.quadraticCurveTo(x, y + boxH, x, y + boxH - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = dotColor;
  ctx.beginPath();
  ctx.arc(x + padX + (compact ? 3 : 4), y + boxH / 2, compact ? 3.5 : 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#F8FAFC';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padX + (compact ? 11 : 16), y + boxH / 2 + 0.5);
  ctx.restore();
}

/**
 * Finds the index of a 2-byte JPEG marker (`a`, `b`) inside a Uint8Array starting at `from` up to `limit`.
 */
function findMarker(
  buf: Uint8Array,
  a: number,
  b: number,
  from = 0,
  limit = buf.length
): number {
  const end = Math.min(limit, buf.length) - 1;
  for (let i = from; i < end; i++) {
    if (buf[i] === a && buf[i + 1] === b) return i;
  }
  return -1;
}

/**
 * Flight Club-style Broadcast Compositor & Per-Camera Rolling Ring Buffers.
 *
 * Layout (1280×720 16:9 broadcast frame — 3 synchronized single-camera channels):
 *   LEFT  (560×720): Oche / Throwing Camera (USB webcam via getUserMedia)
 *   RIGHT (720×720): ONE single crisp straight-on Autodarts Board Camera
 *                    (Cam 0 TOP: 9..4 | Cam 1 RIGHT: 13..3 | Cam 2 LEFT: 19..14)
 *
 * Each of the 3 board cameras runs its own synchronized rolling ring buffer so that
 * when a dart lands in ANY segment, the ENTIRE clip (both pre-roll AND post-roll!)
 * is pulled exclusively from the single closest camera with ZERO triple-cam blur
 * and ZERO mid-clip camera jump.
 */
class OcheCamService {
  private ocheStream: MediaStream | null = null;
  private compositeStreams: Array<MediaStream | null> = [null, null, null];

  private ocheVideoEl: HTMLVideoElement | null = null;
  private boardFrameBitmap: ImageBitmap | null = null;
  /** Dedicated GPU WebGL Single-Camera Straight-On Board Atlas (2160×720 = 3 crisp 720×720 views, clips only!) */
  private virtualBoardCam: VirtualBoardCamera | null = null;
  private virtualBoardReady = false;
  private boardStreamAbort: AbortController | null = null;
  private boardAttemptAbort: AbortController | null = null;
  private boardAttemptStartedAt = 0;
  private boardReconnectTimer: number | null = null;
  private boardFrameCount = 0;

  private canvasEls: Array<HTMLCanvasElement | null> = [null, null, null];
  private renderTimer: number | null = null;

  private lifecycleEpoch = 0;
  private captureEpoch = 0;
  private capturePostRollTimer: number | null = null;
  private cancelActiveCapture: (() => void) | null = null;

  private isDualMode = true;
  private boardFeedActive = false;
  private boardFeedError: string | null = null;
  private boardLastFrameAt = 0;
  private boardWatchdogTimer: number | null = null;
  private activeOcheCameraLabel: string | null = null;
  private activeOcheDeviceId: string | null = null;
  private autodartsVidPids: string[] = [];
  /** Remembers the closest board camera to the most recently thrown dart (for manual clips & preview) */
  private lastDartCamIndex: BoardCameraIndex = 0;

  private slotsByCam: [RollingSlot[], RollingSlot[], RollingSlot[]] = [[], [], []];
  private rotationTimer: number | null = null;
  private slotCounter = 0;
  private mimeType = 'video/webm';
  private isCapturing = false;
  private activeCaptureMeta: CaptureClipMetadata | null = null;
  private captureListeners = new Set<(capturing: boolean, countdownSec?: number) => void>();
  private boardStatusListeners = new Set<(status: { active: boolean; error: string | null }) => void>();
  private ocheStatusListeners = new Set<
    (status: { active: boolean; error: string | null; label: string | null }) => void
  >();

  private readonly DEFAULT_PRE_TARGET_SEC = 5;
  private readonly MANUAL_PRE_TARGET_SEC = 15;
  private readonly DEFAULT_POST_TARGET_SEC = 5;
  private readonly SLOT_SPAWN_INTERVAL_MS = 10000;
  private readonly SLOT_MAX_AGE_MS = 18000;
  private readonly MAX_SLOTS_PER_CAM = 2;

  private pickSupportedMimeType(): string {
    // Prefer video-only VP8 first (kiosk has no audio — avoids audio encoder overhead)
    const candidates = [
      'video/webm;codecs=vp8',
      'video/webm;codecs=vp9',
      'video/webm',
    ];
    for (const mime of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    }
    return '';
  }

  /**
   * Records which board camera was closest to the most recently thrown dart so that
   * even manual "Clip (20s)" triggers after pulling darts select the right angle.
   */
  public noteLastDartImpact(coords?: DartCoords, segmentName?: string): BoardCameraIndex {
    const choice = selectClosestBoardCamera(coords, segmentName, this.lastDartCamIndex);
    this.lastDartCamIndex = choice.camIndex;
    return choice.camIndex;
  }

  public getLastDartCamIndex(): BoardCameraIndex {
    return this.lastDartCamIndex;
  }

  /**
   * Queries Vite's `/api/replays/cameras` (and falls back to `/api/board/api/config`)
   * to discover which USB VID:PIDs belong to Autodarts Desktop's 3 board cameras so
   * Split-Cam never tries to open a camera that Autodarts Desktop has exclusively locked.
   */
  public async fetchAutodartsCamVidPids(): Promise<string[]> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 1800);
    try {
      const res = await fetch('/api/replays/cameras', {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (res.ok) {
        const data = (await res.json()) as { autodartsVidPids?: string[] };
        if (Array.isArray(data.autodartsVidPids) && data.autodartsVidPids.length > 0) {
          this.autodartsVidPids = data.autodartsVidPids.map((v) => String(v).toLowerCase());
          return this.autodartsVidPids;
        }
      }
    } catch {
      // fall through to direct proxied Autodarts config
    } finally {
      window.clearTimeout(timer);
    }

    const fallbackCtrl = new AbortController();
    const fallbackTimer = window.setTimeout(() => fallbackCtrl.abort(), 1500);
    try {
      const res = await fetch('/api/board/api/config', {
        cache: 'no-store',
        signal: fallbackCtrl.signal,
      });
      if (res.ok) {
        const cfg = (await res.json()) as { cam?: { cams?: string[] } };
        const cams = Array.isArray(cfg?.cam?.cams) ? cfg.cam.cams : [];
        const vidPids: string[] = [];
        for (const spec of cams) {
          const m = String(spec).match(/vid=([0-9a-f]{4})&pid=([0-9a-f]{4})/i);
          if (m) {
            const vp = `${m[1].toLowerCase()}:${m[2].toLowerCase()}`;
            if (!vidPids.includes(vp)) vidPids.push(vp);
          }
        }
        if (vidPids.length > 0) {
          this.autodartsVidPids = vidPids;
        }
      }
    } catch {
      // ignore if Autodarts is offline
    } finally {
      window.clearTimeout(fallbackTimer);
    }

    return this.autodartsVidPids;
  }

  public async listCameras(): Promise<CameraDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const [devices, vidPids] = await Promise.all([
      navigator.mediaDevices.enumerateDevices(),
      this.autodartsVidPids.length > 0
        ? Promise.resolve(this.autodartsVidPids)
        : this.fetchAutodartsCamVidPids(),
    ]);
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, idx) => {
        const label = d.label || `Camera ${idx + 1}`;
        return {
          deviceId: d.deviceId,
          label,
          isAutodartsBoardCam: isAutodartsBoardLabel(label, vidPids),
        };
      });
  }

  public getStream(): MediaStream | null {
    return (
      this.compositeStreams[this.lastDartCamIndex] ||
      this.compositeStreams[0] ||
      this.ocheStream
    );
  }

  public getOcheStream(): MediaStream | null {
    return this.ocheStream;
  }

  public getActiveCameraInfo(): { deviceId: string | null; label: string | null } {
    return {
      deviceId: this.activeOcheDeviceId,
      label: this.activeOcheCameraLabel,
    };
  }

  public isDualCameraActive(): boolean {
    return this.isDualMode;
  }

  public getBoardFeedStatus(): { active: boolean; error: string | null } {
    return { active: this.boardFeedActive, error: this.boardFeedError };
  }

  public isRunning(): boolean {
    return Boolean(this.ocheStream && this.ocheStream.active && this.compositeStreams[0]);
  }

  public onCaptureStateChange(cb: (capturing: boolean, countdownSec?: number) => void): () => void {
    this.captureListeners.add(cb);
    return () => this.captureListeners.delete(cb);
  }

  public onBoardFeedStatusChange(
    cb: (status: { active: boolean; error: string | null }) => void
  ): () => void {
    this.boardStatusListeners.add(cb);
    return () => this.boardStatusListeners.delete(cb);
  }

  public onOcheStatusChange(
    cb: (status: { active: boolean; error: string | null; label: string | null }) => void
  ): () => void {
    this.ocheStatusListeners.add(cb);
    return () => this.ocheStatusListeners.delete(cb);
  }

  private emitCaptureState(capturing: boolean, countdownSec?: number): void {
    this.captureListeners.forEach((cb) => cb(capturing, countdownSec));
  }

  private emitOcheStatus(active: boolean, error: string | null): void {
    this.ocheStatusListeners.forEach((cb) =>
      cb({ active, error, label: this.activeOcheCameraLabel })
    );
  }

  private setBoardFeedStatus(active: boolean, error: string | null): void {
    const changed = this.boardFeedActive !== active || this.boardFeedError !== error;
    this.boardFeedActive = active;
    this.boardFeedError = error;
    if (changed) {
      this.boardStatusListeners.forEach((cb) => cb({ active, error }));
    }
  }

  private createHiddenVideo(stream: MediaStream): HTMLVideoElement {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    void video.play().catch(() => {});
    return video;
  }

  /**
   * Opens a direct streaming MJPEG reader against `/api/replays/board-stream`
   * (Autodarts Desktop's live 3-camera `3840×720` feed) and decodes each frame
   * into an off-thread `ImageBitmap` for silky 30fps canvas compositing.
   */
  private startAutodartsThreeCamReader(): void {
    this.stopAutodartsThreeCamReader();

    const abort = new AbortController();
    this.boardStreamAbort = abort;
    this.boardLastFrameAt = 0;
    this.boardAttemptStartedAt = Date.now();
    this.virtualBoardCam = new VirtualBoardCamera(720);
    this.virtualBoardReady = false;

    // Watchdog: if an attempt receives no frames within 15s (initial hang) or stalls > 45s mid-stream,
    // abort the current per-attempt controller so connectLoop tears down the reader and reconnects.
    const startedAt = Date.now();
    this.boardWatchdogTimer = window.setInterval(() => {
      if (abort.signal.aborted) return;
      const now = Date.now();
      const attemptStart = this.boardAttemptStartedAt || startedAt;
      const attemptGotFrame = this.boardLastFrameAt >= attemptStart && this.boardLastFrameAt > 0;

      if (!attemptGotFrame && now - attemptStart > 15000) {
        this.setBoardFeedStatus(
          false,
          'Autodarts 3-camera board stream not sending frames — reconnecting...'
        );
        if (this.boardAttemptAbort && !this.boardAttemptAbort.signal.aborted) {
          this.boardAttemptAbort.abort();
        }
      } else if (attemptGotFrame && now - this.boardLastFrameAt > 45000) {
        this.setBoardFeedStatus(
          false,
          'Autodarts 3-camera board stream stalled — reconnecting...'
        );
        if (this.boardAttemptAbort && !this.boardAttemptAbort.signal.aborted) {
          this.boardAttemptAbort.abort();
        }
      } else if (this.boardLastFrameAt === 0 && now - startedAt > 12000 && !this.boardFeedError) {
        this.setBoardFeedStatus(
          false,
          'Autodarts 3-camera board stream not sending frames (check Autodarts Desktop on port 3180)'
        );
      }
    }, 5000);

    const INITIAL_BUF_SIZE = 512 * 1024;
    const MAX_BUF_SIZE = 4 * 1024 * 1024;

    const connectLoop = async () => {
      if (abort.signal.aborted) return;

      const attemptAbort = new AbortController();
      this.boardAttemptAbort = attemptAbort;
      this.boardAttemptStartedAt = Date.now();
      const onOuterAbort = () => attemptAbort.abort();
      abort.signal.addEventListener('abort', onOuterAbort, { once: true });

      try {
        // Use Autodarts Desktop's original lightweight RAW 3-cam stream (NO ?warp=true!)
        // so Autodarts Desktop CPU & auto-scoring stay 100% untouched and fast!
        const res = await fetch('/api/replays/board-stream', {
          cache: 'no-store',
          signal: attemptAbort.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Autodarts 3-cam stream unavailable (HTTP ${res.status})`);
        }

        const reader = res.body.getReader();
        let buf = new Uint8Array(INITIAL_BUF_SIZE);
        let len = 0;
        let decoding = false;

        try {
          while (!abort.signal.aborted && !attemptAbort.signal.aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value || value.length === 0) continue;

            // Append into reusable staging buffer (grow up to 4MB cap, reset on overflow)
            if (len + value.length > MAX_BUF_SIZE) {
              len = 0;
              if (value.length > MAX_BUF_SIZE) {
                continue;
              }
            }
            if (len + value.length > buf.length) {
              const nextCap = Math.min(MAX_BUF_SIZE, Math.max(buf.length * 2, len + value.length));
              const nextBuf = new Uint8Array(nextCap);
              if (len > 0) {
                nextBuf.set(buf.subarray(0, len), 0);
              }
              buf = nextBuf;
            }
            buf.set(value, len);
            len += value.length;

            // Scan for the final complete JPEG frame (FF D8 ... FF D9) without slicing intermediate frames
            let latestStart = -1;
            let latestEnd = -1;
            let searchOffset = 0;
            let compactFrom = 0;

            while (searchOffset < len) {
              const soi = findMarker(buf, 0xff, 0xd8, searchOffset, len);
              if (soi === -1) {
                // Keep trailing 0xFF byte in case FF D8 splits across chunks
                compactFrom = len > 0 && buf[len - 1] === 0xff ? len - 1 : len;
                break;
              }
              const eoi = findMarker(buf, 0xff, 0xd9, soi + 2, len);
              if (eoi === -1) {
                // Incomplete frame — compact so SOI moves to index 0
                compactFrom = soi;
                break;
              }
              latestStart = soi;
              latestEnd = eoi + 2;
              searchOffset = latestEnd;
              compactFrom = latestEnd;
            }

            // Only copy & decode the final complete JPEG frame in the buffer when idle
            if (latestStart !== -1 && latestEnd > latestStart && !decoding) {
              decoding = true;
              const jpegCopy = buf.slice(latestStart, latestEnd);
              const blob = new Blob([jpegCopy as BlobPart], { type: 'image/jpeg' });
              createImageBitmap(blob)
                .then((bitmap) => {
                  if (abort.signal.aborted || attemptAbort.signal.aborted) {
                    bitmap.close();
                    return;
                  }
                  const prev = this.boardFrameBitmap;
                  this.boardFrameBitmap = bitmap;
                  if (prev) prev.close();
                  // Render into our dedicated GPU WebGL Virtual Straight-On Board Camera (clips only!)
                  if (this.virtualBoardCam && this.virtualBoardCam.render(bitmap)) {
                    this.virtualBoardReady = true;
                  } else {
                    this.virtualBoardReady = false;
                  }
                  this.boardFrameCount += 1;
                  this.boardLastFrameAt = Date.now();
                  this.setBoardFeedStatus(true, null);
                })
                .catch(() => {
                  // Skip malformed partial frame and continue
                })
                .finally(() => {
                  decoding = false;
                });
            }

            // Compact staging buffer in-place (zero allocation)
            if (compactFrom > 0) {
              if (compactFrom < len) {
                buf.copyWithin(0, compactFrom, len);
                len -= compactFrom;
              } else {
                len = 0;
              }
            }
          }
        } finally {
          await reader.cancel().catch(() => {});
          try {
            reader.releaseLock();
          } catch {
            // ignore
          }
        }

        if (!abort.signal.aborted) {
          throw new Error(
            attemptAbort.signal.aborted
              ? 'Autodarts 3-cam stream stalled — reconnecting...'
              : 'Autodarts 3-cam stream ended'
          );
        }
      } catch (err) {
        if (abort.signal.aborted) return;
        const message =
          attemptAbort.signal.aborted && this.boardFeedError
            ? this.boardFeedError
            : (err as Error).message ||
              'Waiting for Autodarts Desktop 3-camera stream on port 3180...';
        this.setBoardFeedStatus(false, message);
        // Auto-retry every 2 seconds while running
        this.boardReconnectTimer = window.setTimeout(() => {
          this.boardReconnectTimer = null;
          void connectLoop();
        }, 2000);
      } finally {
        abort.signal.removeEventListener('abort', onOuterAbort);
        if (this.boardAttemptAbort === attemptAbort) {
          this.boardAttemptAbort = null;
        }
      }
    };

    void connectLoop();
  }

  private stopAutodartsThreeCamReader(): void {
    if (this.boardWatchdogTimer !== null) {
      window.clearInterval(this.boardWatchdogTimer);
      this.boardWatchdogTimer = null;
    }
    if (this.boardReconnectTimer !== null) {
      window.clearTimeout(this.boardReconnectTimer);
      this.boardReconnectTimer = null;
    }
    if (this.boardAttemptAbort) {
      this.boardAttemptAbort.abort();
      this.boardAttemptAbort = null;
    }
    if (this.boardStreamAbort) {
      this.boardStreamAbort.abort();
      this.boardStreamAbort = null;
    }
    if (this.boardFrameBitmap) {
      this.boardFrameBitmap.close();
      this.boardFrameBitmap = null;
    }
    if (this.virtualBoardCam) {
      this.virtualBoardCam.dispose();
      this.virtualBoardCam = null;
    }
    this.virtualBoardReady = false;
    this.boardFrameCount = 0;
    this.boardLastFrameAt = 0;
    this.boardAttemptStartedAt = 0;
  }

  /**
   * Opens the best available Oche / Throwing webcam by:
   * 1. Discovering Autodarts Desktop's 3 board camera VID:PIDs (so we skip busy Autodarts cams!)
   * 2. Ordering all detected USB cameras with dedicated non-Autodarts webcams first
   * 3. Automatically falling back across non-board cameras if a saved deviceId is stale or busy
   */
  private async openBestOcheCamera(
    options: StartOcheCamOptions,
    epoch: number
  ): Promise<MediaStream | null> {
    const { ocheDeviceId, strictSelection = false, autoDetect = false } = options;

    const vidPids = await this.fetchAutodartsCamVidPids();
    if (epoch !== this.lifecycleEpoch) return null;

    const allCams = await this.listCameras();
    if (epoch !== this.lifecycleEpoch) return null;

    const orderedCandidates: CameraDeviceInfo[] = [];
    const pushUnique = (cam: CameraDeviceInfo | undefined) => {
      if (!cam || !cam.deviceId) return;
      if (!orderedCandidates.some((c) => c.deviceId === cam.deviceId)) {
        orderedCandidates.push(cam);
      }
    };

    const nonBoardCams = allCams
      .filter((c) => !isAutodartsBoardLabel(c.label, vidPids))
      .sort((a, b) => scoreOcheCameraCandidate(b, vidPids) - scoreOcheCameraCandidate(a, vidPids));
    const boardCams = allCams.filter((c) => isAutodartsBoardLabel(c.label, vidPids));

    const savedCam = !autoDetect && ocheDeviceId
      ? allCams.find((c) => c.deviceId === ocheDeviceId)
      : undefined;

    if (strictSelection && savedCam) {
      // User explicitly picked this exact camera — try it first, then fall back to non-board cams
      pushUnique(savedCam);
      nonBoardCams.forEach(pushUnique);
    } else if (autoDetect) {
      // Auto-detect: ONLY probe non-Autodarts cameras — never touch Autodarts' locked board cameras
      nonBoardCams.forEach(pushUnique);
    } else {
      // Auto-boot:
      // Prefer saved camera ONLY if it is NOT an Autodarts Desktop board camera!
      if (savedCam && !isAutodartsBoardLabel(savedCam.label, vidPids)) {
        pushUnique(savedCam);
      }
      // Next try all dedicated non-Autodarts cameras (e.g. "USB Live camera")
      nonBoardCams.forEach(pushUnique);
    }

    const attemptErrors: string[] = [];

    const tryOpenDevice = async (deviceId?: string): Promise<MediaStream> => {
      const idealConstraints: MediaTrackConstraints = {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      };
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: idealConstraints,
          audio: false,
        });
      } catch (err) {
        const name = (err as DOMException)?.name || '';
        // If 720p@30fps was rejected by the webcam driver, retry with relaxed video constraints
        if (name === 'OverconstrainedError') {
          return await navigator.mediaDevices.getUserMedia({
            video: deviceId ? { deviceId: { exact: deviceId } } : true,
            audio: false,
          });
        }
        throw err;
      }
    };

    for (const candidate of orderedCandidates) {
      if (epoch !== this.lifecycleEpoch) return null;
      try {
        const stream = await tryOpenDevice(candidate.deviceId);
        if (epoch !== this.lifecycleEpoch) {
          stream.getTracks().forEach((t) => t.stop());
          return null;
        }
        const track = stream.getVideoTracks()[0];
        this.activeOcheDeviceId = track?.getSettings()?.deviceId || candidate.deviceId;
        this.activeOcheCameraLabel = track?.label || candidate.label || 'Oche Webcam';
        return stream;
      } catch (err) {
        if (epoch !== this.lifecycleEpoch) return null;
        const domErr = err as DOMException;
        const name = domErr?.name || 'Error';
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          throw new Error('Camera permission denied in browser. Allow camera access on localhost:5173.');
        }
        attemptErrors.push(`${candidate.label}: ${domErr?.message || name}`);
      }
    }

    if (epoch !== this.lifecycleEpoch) return null;

    // Never probe generic default getUserMedia if we already know only locked Autodarts board cameras exist
    if (nonBoardCams.length === 0 && boardCams.length > 0 && !(strictSelection && savedCam)) {
      throw new Error(
        `Only ${boardCams.length} Autodarts board camera(s) detected — Oche webcam not found. Check USB cable.`
      );
    }

    // Last resort: only when enumerateDevices returned 0 usable labeled devices (e.g. before permission grant)
    const shouldTryGenericDefault =
      !autoDetect || (allCams.length === 0 || allCams.every((c) => !c.deviceId));
    if (shouldTryGenericDefault && boardCams.length === 0) {
      try {
        const stream = await tryOpenDevice(undefined);
        if (epoch !== this.lifecycleEpoch) {
          stream.getTracks().forEach((t) => t.stop());
          return null;
        }
        const track = stream.getVideoTracks()[0];
        this.activeOcheDeviceId = track?.getSettings()?.deviceId || null;
        this.activeOcheCameraLabel = track?.label || 'Oche Webcam';
        return stream;
      } catch (err) {
        if (epoch !== this.lifecycleEpoch) return null;
        const domErr = err as DOMException;
        const name = domErr?.name || 'Error';
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          throw new Error('Camera permission denied in browser. Allow camera access on localhost:5173.');
        }
        attemptErrors.push(domErr?.message || name);
      }
    }

    if (allCams.length === 0) {
      throw new Error('No cameras detected on this PC. Check USB connections.');
    }
    const detail = attemptErrors[0] || 'Could not start video source';
    throw new Error(`Unable to open Oche webcam (${detail})`);
  }

  public async start(options: StartOcheCamOptions = {}): Promise<MediaStream | null> {
    this.stop();
    const epoch = ++this.lifecycleEpoch;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera API (getUserMedia) is not available in this browser context.');
    }

    // 1. Auto-detect & open the best available Oche / Throwing camera (skipping locked Autodarts board cams)
    const ocheStream = await this.openBestOcheCamera(options, epoch);
    if (!ocheStream || epoch !== this.lifecycleEpoch) {
      if (ocheStream) {
        ocheStream.getTracks().forEach((t) => t.stop());
      }
      return null;
    }

    try {
      this.ocheStream = ocheStream;
      this.ocheVideoEl = this.createHiddenVideo(ocheStream);

      // Watch for live USB webcam unplug / driver drop mid-session
      const videoTrack = ocheStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.addEventListener('ended', () => {
          if (this.ocheStream === ocheStream && epoch === this.lifecycleEpoch) {
            this.stop();
            this.emitOcheStatus(false, 'Oche webcam disconnected — check USB cable');
          }
        });
      }
      this.emitOcheStatus(true, null);

      // 2. Always lock Board Cam to Autodarts Desktop's 3-camera live stream (port 3180)
      this.isDualMode = true;
      this.setBoardFeedStatus(false, null);
      this.startAutodartsThreeCamReader();

      // 3. Create 3 Synchronized 1280×720 16:9 Broadcast Canvas Compositors (one per single board cam!)
      //    LEFT  (560×720): Oche / Throwing Reaction Webcam
      //    RIGHT (720×720): ONE single crisp straight-on Board Cam (Cam 0 TOP | Cam 1 RIGHT | Cam 2 LEFT)
      const canvases: HTMLCanvasElement[] = [];
      const ctxs: Array<CanvasRenderingContext2D | null> = [];
      for (let i = 0; i < 3; i++) {
        const c = document.createElement('canvas');
        c.width = 1280;
        c.height = 720;
        canvases.push(c);
        ctxs.push(c.getContext('2d'));
      }
      this.canvasEls = canvases;

      const drawFrame = () => {
        const baseCanvas = this.canvasEls[0];
        const baseCtx = ctxs[0];
        if (!baseCanvas || !baseCtx) return;

        const W = baseCanvas.width;
        const H = baseCanvas.height;
        if (!W || !H) return;
        const rightW = H; // 720 — exact 1:1 square for the single straight-on circular dartboard!
        const leftW = W - rightW; // 560
        const rightX = leftW;

        // Render Oche Cam ONCE onto canvas 0 (left side), then fast-blit to canvases 1 & 2
        baseCtx.fillStyle = '#0B0F17';
        baseCtx.fillRect(0, 0, leftW, H);
        if (this.ocheVideoEl) {
          drawCover(baseCtx, this.ocheVideoEl, 0, 0, leftW, H);
        }
        drawCornerLabel(baseCtx, 'OCHE CAM', 18, 18, '#F43F5E');

        const virtualAtlas = this.virtualBoardReady ? this.virtualBoardCam?.getCanvas() : null;
        const panelSize = this.virtualBoardCam?.getPanelSize() ?? 720;
        const hasRawStrip = Boolean(this.boardFrameBitmap && this.boardFrameBitmap.width > 0);

        for (let camIdx = 0; camIdx < 3; camIdx++) {
          const ctx = ctxs[camIdx];
          if (!ctx) continue;

          if (camIdx > 0) {
            ctx.drawImage(baseCanvas, 0, 0, leftW, H, 0, 0, leftW, H);
          }

          const camInfo = BOARD_CAMERAS[camIdx as BoardCameraIndex];

          if (virtualAtlas) {
            // Slice ONLY this single crisp straight-on board camera from the WebGL atlas
            ctx.drawImage(
              virtualAtlas,
              camIdx * panelSize,
              0,
              panelSize,
              panelSize,
              rightX,
              0,
              rightW,
              H
            );
            drawCornerLabel(ctx, camInfo.badgeText, rightX + 18, 18, '#10B981');
          } else if (hasRawStrip && this.boardFrameBitmap) {
            // WebGL-unavailable fallback: crop ONLY this single camera's 1/3rd raw slice
            const sliceW = this.boardFrameBitmap.width / 3;
            drawCover(ctx, this.boardFrameBitmap, rightX, 0, rightW, H, {
              sx: camIdx * sliceW,
              sy: 0,
              sw: sliceW,
              sh: this.boardFrameBitmap.height,
            });
            drawCornerLabel(ctx, camInfo.badgeText, rightX + 18, 18, '#10B981');
          } else {
            ctx.fillStyle = '#111827';
            ctx.fillRect(rightX, 0, rightW, H);
            ctx.fillStyle = '#94A3B8';
            ctx.font = '700 24px "Plus Jakarta Sans", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('BOARD CAM CONNECTING...', rightX + rightW / 2, H / 2 - 14);
            ctx.font = '500 14px "JetBrains Mono", monospace';
            ctx.fillStyle = '#64748B';
            ctx.fillText(
              this.boardFeedError
                ? 'Start Autodarts Desktop (port 3180)'
                : 'Linking Autodarts 3-cam feed into single-cam views...',
              rightX + rightW / 2,
              H / 2 + 20
            );
            ctx.textAlign = 'left';
            drawCornerLabel(ctx, camInfo.badgeText, rightX + 18, 18, '#F59E0B', true);
          }

          // Crisp vertical divider separating Oche Cam & Single Straight-On Board Cam
          ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
          ctx.fillRect(leftW - 2, 0, 4, H);
        }
      };

      // Self-scheduling 24fps compositor loop (zero overlap, try/catch with rate-limited error logs)
      let lastDrawErrLogAt = 0;
      const scheduleNextFrame = () => {
        if (epoch !== this.lifecycleEpoch) return;
        this.renderTimer = window.setTimeout(() => {
          this.renderTimer = null;
          if (epoch !== this.lifecycleEpoch) return;
          try {
            drawFrame();
          } catch (err) {
            const now = Date.now();
            if (now - lastDrawErrLogAt > 5000) {
              lastDrawErrLogAt = now;
              console.warn('[OcheCam] Compositor frame error:', err);
            }
          }
          scheduleNextFrame();
        }, 42);
      };

      try {
        drawFrame();
      } catch (err) {
        lastDrawErrLogAt = Date.now();
        console.warn('[OcheCam] Initial compositor frame error:', err);
      }
      scheduleNextFrame();

      // 4. Capture 3 synchronized video-only single-camera broadcast streams (kiosk has no audio)
      const streams: MediaStream[] = canvases.map((c) => c.captureStream(24));
      this.compositeStreams = streams;
      this.mimeType = this.pickSupportedMimeType();

      // 5. Start overlapping MediaRecorder ring buffers for all 3 single-camera angles (max 2 slots/cam = 6 total)
      this.spawnAllCamSlots();
      this.rotationTimer = window.setInterval(() => {
        if (epoch !== this.lifecycleEpoch) return;
        if (!this.ocheStream || !this.ocheStream.active) {
          this.stop();
          this.emitOcheStatus(false, 'Oche camera stream stopped');
          return;
        }
        this.pruneOldSlots();
        this.spawnAllCamSlots();
      }, this.SLOT_SPAWN_INTERVAL_MS);

      return streams[0];
    } catch (err) {
      this.stop();
      throw err;
    }
  }

  private destroySlot(slot: RollingSlot): void {
    slot.recorder.ondataavailable = null;
    slot.recorder.onstop = null;
    slot.recorder.onerror = null;
    try {
      if (slot.recorder.state !== 'inactive') {
        slot.recorder.stop();
      }
    } catch {
      // ignore
    }
    slot.chunks.length = 0;
  }

  public stop(): void {
    this.lifecycleEpoch += 1;
    this.captureEpoch += 1;

    if (this.capturePostRollTimer !== null) {
      window.clearTimeout(this.capturePostRollTimer);
      this.capturePostRollTimer = null;
    }
    if (this.cancelActiveCapture) {
      const cancel = this.cancelActiveCapture;
      this.cancelActiveCapture = null;
      cancel();
    }

    if (this.rotationTimer !== null) {
      window.clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
    if (this.renderTimer !== null) {
      window.clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }

    this.stopAutodartsThreeCamReader();

    for (const camSlots of this.slotsByCam) {
      for (const slot of camSlots) {
        this.destroySlot(slot);
      }
    }
    this.slotsByCam = [[], [], []];

    if (this.ocheVideoEl) {
      try {
        this.ocheVideoEl.pause();
        this.ocheVideoEl.srcObject = null;
        this.ocheVideoEl.load();
      } catch {
        // ignore
      }
      this.ocheVideoEl = null;
    }
    for (const c of this.canvasEls) {
      if (c) {
        c.width = 0;
        c.height = 0;
      }
    }
    this.canvasEls = [null, null, null];

    if (this.ocheStream) {
      this.ocheStream.getTracks().forEach((t) => t.stop());
      this.ocheStream = null;
    }
    for (let i = 0; i < this.compositeStreams.length; i++) {
      const s = this.compositeStreams[i];
      if (s) {
        s.getTracks().forEach((t) => t.stop());
        this.compositeStreams[i] = null;
      }
    }

    this.activeOcheCameraLabel = null;
    this.activeOcheDeviceId = null;
    this.activeCaptureMeta = null;
    this.setBoardFeedStatus(false, null);
    this.isCapturing = false;
    this.emitCaptureState(false);
  }

  private spawnAllCamSlots(): void {
    for (let camIdx = 0; camIdx < 3; camIdx++) {
      this.spawnSlotForCam(camIdx as BoardCameraIndex);
    }
  }

  private spawnSlotForCam(camIdx: BoardCameraIndex): void {
    const stream = this.compositeStreams[camIdx];
    if (!stream || !stream.active) return;

    // Hard-cap each camera to at most MAX_SLOTS_PER_CAM (2) active slots (max 6 encoders total).
    // If 2 unpinned slots exist (e.g. minor timer jitter before SLOT_MAX_AGE_MS), retire the oldest first.
    const camSlots = this.slotsByCam[camIdx];
    if (camSlots.length >= this.MAX_SLOTS_PER_CAM) {
      const oldestUnpinnedIdx = camSlots.findIndex((s) => !s.pinned);
      const hasPinned = camSlots.some((s) => s.pinned);
      if (!hasPinned && oldestUnpinnedIdx !== -1) {
        const [removed] = camSlots.splice(oldestUnpinnedIdx, 1);
        if (removed) {
          this.destroySlot(removed);
        }
      }
    }
    if (this.slotsByCam[camIdx].length >= this.MAX_SLOTS_PER_CAM) {
      return;
    }

    try {
      const bitrate = 1_800_000;
      const options: MediaRecorderOptions = this.mimeType
        ? { mimeType: this.mimeType, videoBitsPerSecond: bitrate }
        : { videoBitsPerSecond: bitrate };

      const recorder = new MediaRecorder(stream, options);
      const slot: RollingSlot = {
        id: ++this.slotCounter,
        recorder,
        chunks: [],
        startedAt: Date.now(),
        pinned: false,
      };

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          slot.chunks.push(ev.data);
        }
      };

      recorder.onerror = (ev) => {
        console.warn(`[OcheCam] MediaRecorder error on cam ${camIdx} slot ${slot.id}:`, ev);
        this.destroySlot(slot);
        this.slotsByCam[camIdx] = this.slotsByCam[camIdx].filter((s) => s.id !== slot.id);
      };

      recorder.start(500);
      this.slotsByCam[camIdx].push(slot);
    } catch (err) {
      console.error(`[OcheCam] Failed to spawn MediaRecorder slot for cam ${camIdx}:`, err);
    }
  }

  private pruneOldSlots(): void {
    const now = Date.now();
    for (let camIdx = 0; camIdx < 3; camIdx++) {
      const camSlots = this.slotsByCam[camIdx];
      const keep: RollingSlot[] = [];

      for (const slot of camSlots) {
        const age = now - slot.startedAt;
        const isBroken = slot.recorder.state === 'inactive';
        if (!slot.pinned && (isBroken || age > this.SLOT_MAX_AGE_MS)) {
          this.destroySlot(slot);
        } else {
          keep.push(slot);
        }
      }

      // Enforce hard cap of at most MAX_SLOTS_PER_CAM active slots per camera
      while (keep.length > this.MAX_SLOTS_PER_CAM) {
        const oldestUnpinnedIdx = keep.findIndex((s) => !s.pinned);
        if (oldestUnpinnedIdx === -1) break;
        const [removed] = keep.splice(oldestUnpinnedIdx, 1);
        if (removed) {
          this.destroySlot(removed);
        }
      }

      this.slotsByCam[camIdx] = keep;
    }
  }

  public async recordTenSecondClip(meta: CaptureClipMetadata): Promise<RecordedClipBundle | null> {
    if (!this.compositeStreams[0] || !this.compositeStreams[0].active) return null;
    if (this.isCapturing) return null;

    // Pick the single board camera closest to the dart that triggered this clip!
    const chosenCam = selectClosestBoardCamera(
      meta.coords,
      meta.segmentName,
      this.lastDartCamIndex
    );
    const camIdx = chosenCam.camIndex;
    this.lastDartCamIndex = camIdx;

    const now = Date.now();
    const activeSlots = this.slotsByCam[camIdx].filter(
      (s) => !s.pinned && s.recorder.state === 'recording'
    );
    if (activeSlots.length === 0) return null;

    const preTargetSec =
      meta.preSeconds ??
      (meta.category === 'user' ? this.MANUAL_PRE_TARGET_SEC : this.DEFAULT_PRE_TARGET_SEC);
    const postSec = meta.postSeconds ?? this.DEFAULT_POST_TARGET_SEC;

    // Prefer a slot with at least 75% of the requested pre-roll so the throw is never cut short
    const minDesiredAgeMs = preTargetSec * 750;
    const eligibleSlots = activeSlots.filter((s) => now - s.startedAt >= minDesiredAgeMs);
    const pool = eligibleSlots.length > 0 ? eligibleSlots : activeSlots;

    const idealStart = now - preTargetSec * 1000;
    let bestSlot = pool[0];
    let bestDiff = Math.abs(bestSlot.startedAt - idealStart);

    for (const slot of pool) {
      const diff = Math.abs(slot.startedAt - idealStart);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestSlot = slot;
      }
    }

    const capEpoch = ++this.captureEpoch;
    bestSlot.pinned = true;
    this.isCapturing = true;
    this.activeCaptureMeta = meta;

    try {
      console.info(
        `[OcheCam] Recording clip using ${chosenCam.badgeText} (cam ${camIdx}) for segment="${meta.segmentName}"`
      );

      const actualPreSec = Math.max(0.5, Number(((now - bestSlot.startedAt) / 1000).toFixed(1)));
      this.emitCaptureState(true, postSec);

      const postRollCompleted = await new Promise<boolean>((resolve) => {
        let settled = false;
        const finishWait = (ok: boolean) => {
          if (settled) return;
          settled = true;
          if (this.capturePostRollTimer !== null) {
            window.clearTimeout(this.capturePostRollTimer);
            this.capturePostRollTimer = null;
          }
          if (this.cancelActiveCapture === abortFn) {
            this.cancelActiveCapture = null;
          }
          resolve(ok);
        };
        const abortFn = () => finishWait(false);
        this.cancelActiveCapture = abortFn;
        this.capturePostRollTimer = window.setTimeout(() => {
          this.capturePostRollTimer = null;
          finishWait(true);
        }, postSec * 1000);
      });

      if (!postRollCompleted || capEpoch !== this.captureEpoch) {
        return null;
      }

      const blob = await new Promise<Blob | null>((resolve) => {
        const rec = bestSlot.recorder;
        let settled = false;
        let safetyTimer: number | null = null;

        const finish = (cancelled: boolean) => {
          if (settled) return;
          settled = true;
          if (safetyTimer !== null) {
            window.clearTimeout(safetyTimer);
            safetyTimer = null;
          }
          if (this.cancelActiveCapture === abortStop) {
            this.cancelActiveCapture = null;
          }
          if (cancelled) {
            resolve(null);
            return;
          }
          resolve(new Blob(bestSlot.chunks, { type: rec.mimeType || 'video/webm' }));
        };

        const abortStop = () => finish(true);
        this.cancelActiveCapture = abortStop;

        if (rec.state === 'inactive') {
          finish(false);
          return;
        }

        // Hard 4s safety timeout so a stalled MediaRecorder.stop() can NEVER hang "Clipping..." forever!
        safetyTimer = window.setTimeout(() => {
          safetyTimer = null;
          console.warn('[OcheCam] MediaRecorder.stop() timed out — finalizing buffered chunks.');
          finish(false);
        }, 4000);

        const prevOnStop = rec.onstop;
        rec.onstop = (ev) => {
          if (typeof prevOnStop === 'function') {
            prevOnStop.call(rec, ev);
          }
          finish(false);
        };

        try {
          rec.stop();
        } catch {
          finish(false);
        }
      });

      if (!blob || capEpoch !== this.captureEpoch) {
        return null;
      }

      const finalMeta = this.activeCaptureMeta || meta;
      if (blob.size === 0) return null;

      const totalDuration = Number((actualPreSec + postSec).toFixed(1));
      return {
        blob,
        meta: finalMeta,
        preSeconds: actualPreSec,
        postSeconds: postSec,
        durationSec: totalDuration,
        isDualCamera: true,
        createdAt: Date.now(),
      };
    } finally {
      this.destroySlot(bestSlot);
      this.slotsByCam[camIdx] = this.slotsByCam[camIdx].filter((s) => s.id !== bestSlot.id);
      if (capEpoch === this.captureEpoch) {
        this.activeCaptureMeta = null;
        this.cancelActiveCapture = null;
        this.isCapturing = false;
        this.emitCaptureState(false);
      }
    }
  }

  /**
   * Upgrades metadata on an already-in-flight capture (e.g. if a Bullseye or T20
   * triggered capture before a 180 / 140+ visit finished or a winning checkout landed).
   */
  public upgradeActiveCaptureMeta(meta: CaptureClipMetadata): boolean {
    if (!this.isCapturing) return false;
    // Never downgrade a Game Winning Shot capture with a lower-priority non-winning trigger
    if (this.activeCaptureMeta?.forceAutoSave && !meta.forceAutoSave) {
      return false;
    }
    this.activeCaptureMeta = {
      ...(this.activeCaptureMeta || {}),
      ...meta,
    };
    return true;
  }

  public async uploadRecordedClip(
    bundle: RecordedClipBundle,
    saveDir: string
  ): Promise<ReplayClipRecord> {
    const { blob, meta, preSeconds, postSeconds, durationSec, isDualCamera } = bundle;
    const resolvedCategory = meta.isDevTest ? 'dev' : meta.category || 'game';
    const params = new URLSearchParams({
      player: meta.playerName,
      segment: meta.segmentName,
      score: String(meta.score),
      reason: meta.reason,
      pre: String(preSeconds),
      post: String(postSeconds),
      duration: String(durationSec),
      devTest: meta.isDevTest ? '1' : '0',
      category: resolvedCategory,
      dualCam: isDualCamera ? '1' : '0',
      ext: 'webm',
      dir: saveDir,
    });

    if (meta.customFileName) {
      params.set('customName', meta.customFileName);
    }

    if (meta.coords) {
      params.set('cx', meta.coords.x.toFixed(4));
      params.set('cy', meta.coords.y.toFixed(4));
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch(`/api/replays/clip?${params.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'video/webm' },
        body: blob,
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Failed to save clip (${res.status})`);
      }

      const data = await res.json();
      if (!data?.ok || !data?.clip) {
        throw new Error(data?.error || 'Clip save returned error');
      }

      return {
        ...(data.clip as ReplayClipRecord),
        isSavedToDisk: true,
      };
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') {
        throw new Error('Clip upload timed out after 25s');
      }
      throw err;
    } finally {
      window.clearTimeout(timer);
    }
  }

  public getBoardFrameCount(): number {
    return this.boardFrameCount;
  }
}

export const ocheCamService = new OcheCamService();
