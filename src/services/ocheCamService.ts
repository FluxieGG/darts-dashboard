import {
  BoardCameraMode,
  CameraDeviceInfo,
  CaptureClipMetadata,
  RecordedClipBundle,
  ReplayClipRecord,
} from '../types/replay';
import { VirtualBoardCamera } from './virtualBoardCam';

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
 * Finds the index of a 2-byte JPEG marker (`a`, `b`) inside a Uint8Array starting at `from`.
 */
function findMarker(buf: Uint8Array, a: number, b: number, from = 0): number {
  for (let i = from; i < buf.length - 1; i++) {
    if (buf[i] === a && buf[i + 1] === b) return i;
  }
  return -1;
}

/**
 * Flight Club-style Broadcast Compositor & 10-Second Ring Buffer.
 *
 * Layout (1600×900 16:9 broadcast frame):
 *   LEFT  (1066×900): Oche / Throwing Camera (unchanged USB webcam via getUserMedia)
 *   RIGHT  (534×900): ALL 3 Autodarts Desktop Board Cameras stacked vertically
 *                     (each 534×300 = exact 16:9 slice from Autodarts' live 3840×720 MJPEG stream!)
 *
 * Uses a direct fetch() + ReadableStream + createImageBitmap() MJPEG decoder over
 * `/api/replays/board-stream` so it is 100% immune to Chromium detached-<img> MJPEG stalls
 * and auto-reconnects if Autodarts Desktop restarts.
 */
class OcheCamService {
  private ocheStream: MediaStream | null = null;
  private compositeStream: MediaStream | null = null;

  private ocheVideoEl: HTMLVideoElement | null = null;
  private boardFrameBitmap: ImageBitmap | null = null;
  /** Dedicated GPU WebGL Virtual Straight-On Board Camera (clips only — zero load on Autodarts scoring!) */
  private virtualBoardCam: VirtualBoardCamera | null = null;
  private virtualBoardReady = false;
  private boardStreamAbort: AbortController | null = null;
  private boardReconnectTimer: number | null = null;
  private boardFrameCount = 0;

  private canvasEl: HTMLCanvasElement | null = null;
  private renderInterval: number | null = null;

  private isDualMode = true;
  private boardFeedActive = false;
  private boardFeedError: string | null = null;
  private boardLastFrameAt = 0;
  private boardWatchdogTimer: number | null = null;
  private activeOcheCameraLabel: string | null = null;
  private activeOcheDeviceId: string | null = null;
  private autodartsVidPids: string[] = [];

  private slots: RollingSlot[] = [];
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
  private readonly SLOT_SPAWN_INTERVAL_MS = 3000;
  private readonly SLOT_MAX_AGE_MS = 20000;

  private pickSupportedMimeType(): string {
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
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
    return this.compositeStream || this.ocheStream;
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
    return Boolean(this.ocheStream && this.ocheStream.active && this.compositeStream);
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
    this.virtualBoardCam = new VirtualBoardCamera(900);
    this.virtualBoardReady = false;

    // Watchdog: if Autodarts 3-cam feed fails to deliver frames within 12s on boot (or stalls > 45s), surface a warning
    // (Autodarts Desktop naturally slows MJPEG output during idle/standby, so keep stall tolerance generous.)
    const startedAt = Date.now();
    this.boardWatchdogTimer = window.setInterval(() => {
      if (abort.signal.aborted) return;
      const now = Date.now();
      if (this.boardLastFrameAt === 0 && now - startedAt > 12000) {
        if (!this.boardFeedError) {
          this.setBoardFeedStatus(
            false,
            'Autodarts 3-camera board stream not sending frames (check Autodarts Desktop on port 3180)'
          );
        }
      } else if (this.boardLastFrameAt > 0 && now - this.boardLastFrameAt > 45000) {
        this.setBoardFeedStatus(
          false,
          'Autodarts 3-camera board stream stalled — reconnecting...'
        );
      }
    }, 5000);

    const connectLoop = async () => {
      if (abort.signal.aborted) return;

      try {
        // Use Autodarts Desktop's original lightweight RAW 3-cam stream (NO ?warp=true!)
        // so Autodarts Desktop CPU & auto-scoring stay 100% untouched and fast!
        const res = await fetch('/api/replays/board-stream', {
          cache: 'no-store',
          signal: abort.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Autodarts 3-cam stream unavailable (HTTP ${res.status})`);
        }

        const reader = res.body.getReader();
        let acc = new Uint8Array(0);
        let decoding = false;

        while (!abort.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value || value.length === 0) continue;

          // Append incoming bytes (cap accumulator at 4MB so memory never grows if stream glitches)
          if (acc.length > 4 * 1024 * 1024) {
            acc = new Uint8Array(value);
          } else {
            const next = new Uint8Array(acc.length + value.length);
            next.set(acc, 0);
            next.set(value, acc.length);
            acc = next;
          }

          // Extract the latest complete JPEG frame (FF D8 ... FF D9) in buffer
          let latestJpeg: Uint8Array | null = null;
          let searchOffset = 0;

          while (true) {
            const soi = findMarker(acc, 0xff, 0xd8, searchOffset);
            if (soi === -1) {
              // Keep last 2 bytes in case FF D8 split across chunks
              if (acc.length > 2) {
                acc = acc.slice(acc.length - 2);
              }
              break;
            }
            const eoi = findMarker(acc, 0xff, 0xd9, soi + 2);
            if (eoi === -1) {
              // Incomplete frame — drop bytes before SOI and wait for more chunks
              if (soi > 0) {
                acc = acc.slice(soi);
              }
              break;
            }
            const frameEnd = eoi + 2;
            latestJpeg = acc.slice(soi, frameEnd);
            searchOffset = frameEnd;
          }

          if (searchOffset > 0 && searchOffset <= acc.length) {
            acc = acc.slice(searchOffset);
          }

          if (latestJpeg && !decoding) {
            decoding = true;
            const blob = new Blob([latestJpeg as BlobPart], { type: 'image/jpeg' });
            createImageBitmap(blob)
              .then((bitmap) => {
                if (abort.signal.aborted) {
                  bitmap.close();
                  return;
                }
                const prev = this.boardFrameBitmap;
                this.boardFrameBitmap = bitmap;
                if (prev) prev.close();
                // Render into our dedicated GPU WebGL Virtual Straight-On Board Camera (clips only!)
                if (this.virtualBoardCam && this.virtualBoardCam.render(bitmap)) {
                  this.virtualBoardReady = true;
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
        }

        if (!abort.signal.aborted) {
          throw new Error('Autodarts 3-cam stream ended');
        }
      } catch (err) {
        if (abort.signal.aborted) return;
        this.setBoardFeedStatus(
          false,
          (err as Error).message || 'Waiting for Autodarts Desktop 3-camera stream on port 3180...'
        );
        // Auto-retry every 2 seconds while running
        this.boardReconnectTimer = window.setTimeout(() => {
          this.boardReconnectTimer = null;
          void connectLoop();
        }, 2000);
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
  }

  /**
   * Opens the best available Oche / Throwing webcam by:
   * 1. Discovering Autodarts Desktop's 3 board camera VID:PIDs (so we skip busy Autodarts cams!)
   * 2. Ordering all detected USB cameras with dedicated non-Autodarts webcams first
   * 3. Automatically falling back across every detected camera if a saved deviceId is stale or busy
   */
  private async openBestOcheCamera(options: StartOcheCamOptions): Promise<MediaStream> {
    const { ocheDeviceId, strictSelection = false, autoDetect = false, includeAudio = false } = options;

    const vidPids = await this.fetchAutodartsCamVidPids();
    const allCams = await this.listCameras();

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
      boardCams.forEach(pushUnique);
    } else {
      // Auto-boot / Auto-detect:
      // Prefer saved camera ONLY if it is NOT an Autodarts Desktop board camera!
      if (savedCam && !isAutodartsBoardLabel(savedCam.label, vidPids)) {
        pushUnique(savedCam);
      }
      // Next try all dedicated non-Autodarts cameras (e.g. "USB  Live camera")
      nonBoardCams.forEach(pushUnique);
      // Finally fall back to remaining cameras only if nothing else opened
      if (savedCam) pushUnique(savedCam);
      boardCams.forEach(pushUnique);
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
          audio: includeAudio,
        });
      } catch (err) {
        const name = (err as DOMException)?.name || '';
        // If 720p@30fps was rejected by the webcam driver, retry with relaxed video constraints
        if (name === 'OverconstrainedError') {
          return await navigator.mediaDevices.getUserMedia({
            video: deviceId ? { deviceId: { exact: deviceId } } : true,
            audio: includeAudio,
          });
        }
        throw err;
      }
    };

    for (const candidate of orderedCandidates) {
      try {
        const stream = await tryOpenDevice(candidate.deviceId);
        const track = stream.getVideoTracks()[0];
        this.activeOcheDeviceId = track?.getSettings()?.deviceId || candidate.deviceId;
        this.activeOcheCameraLabel = track?.label || candidate.label || 'Oche Webcam';
        return stream;
      } catch (err) {
        const domErr = err as DOMException;
        const name = domErr?.name || 'Error';
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          throw new Error('Camera permission denied in browser. Allow camera access on localhost:5173.');
        }
        attemptErrors.push(`${candidate.label}: ${domErr?.message || name}`);
      }
    }

    // Last resort: if enumerateDevices returned 0 labeled devices (e.g. before permission grant), try generic default
    try {
      const stream = await tryOpenDevice(undefined);
      const track = stream.getVideoTracks()[0];
      this.activeOcheDeviceId = track?.getSettings()?.deviceId || null;
      this.activeOcheCameraLabel = track?.label || 'Oche Webcam';
      return stream;
    } catch (err) {
      const domErr = err as DOMException;
      const name = domErr?.name || 'Error';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        throw new Error('Camera permission denied in browser. Allow camera access on localhost:5173.');
      }
      if (allCams.length === 0) {
        throw new Error('No cameras detected on this PC. Check USB connections.');
      }
      if (nonBoardCams.length === 0 && boardCams.length > 0) {
        throw new Error(
          `Only ${boardCams.length} Autodarts board camera(s) detected — Oche webcam not found. Check USB cable.`
        );
      }
      const detail = attemptErrors[0] || domErr?.message || 'Could not start video source';
      throw new Error(`Unable to open Oche webcam (${detail})`);
    }
  }

  public async start(options: StartOcheCamOptions = {}): Promise<MediaStream> {
    this.stop();

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera API (getUserMedia) is not available in this browser context.');
    }

    const { includeAudio = false } = options;

    // 1. Auto-detect & open the best available Oche / Throwing camera (skipping locked Autodarts board cams)
    const ocheStream = await this.openBestOcheCamera(options);
    this.ocheStream = ocheStream;
    this.ocheVideoEl = this.createHiddenVideo(ocheStream);

    // Watch for live USB webcam unplug / driver drop mid-session
    const videoTrack = ocheStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.addEventListener('ended', () => {
        if (this.ocheStream === ocheStream) {
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

    // 3. Create 1600×900 16:9 Broadcast Canvas Compositor
    //    LEFT  (700×900): Oche / Throwing Reaction Webcam
    //    RIGHT (900×900): Single Consolidated Straight-On 3-in-1 Board Cam (exact 1:1 square!)
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 900;
    this.canvasEl = canvas;
    const ctx = canvas.getContext('2d');

    const drawFrame = () => {
      if (!ctx || !this.canvasEl) return;
      const W = this.canvasEl.width;
      const H = this.canvasEl.height;
      const rightW = H; // 900 — exact 1:1 square for the full straight-on circular dartboard!
      const leftW = W - rightW; // 700
      const rightX = leftW;

      ctx.fillStyle = '#0B0F17';
      ctx.fillRect(0, 0, W, H);

      // LEFT: Oche / Throwing Camera
      if (this.ocheVideoEl) {
        drawCover(ctx, this.ocheVideoEl, 0, 0, leftW, H);
      }
      drawCornerLabel(ctx, 'OCHE CAM', 18, 18, '#F43F5E');

      // RIGHT: Dedicated GPU WebGL Virtual Straight-On Board Camera (Clips Only!)
      const virtualCanvas = this.virtualBoardReady ? this.virtualBoardCam?.getCanvas() : null;
      if (virtualCanvas) {
        ctx.drawImage(virtualCanvas, rightX, 0, rightW, H);
        drawCornerLabel(ctx, 'VIRTUAL BOARD CAM', rightX + 18, 18, '#10B981');
      } else if (this.boardFrameBitmap && this.boardFrameBitmap.width > 0) {
        // Fallback if WebGL is unavailable on a device
        drawCover(ctx, this.boardFrameBitmap, rightX, 0, rightW, H);
        drawCornerLabel(ctx, 'BOARD CAM', rightX + 18, 18, '#10B981');
      } else {
        // Waiting placeholder for the virtual straight-on board camera
        ctx.fillStyle = '#111827';
        ctx.fillRect(rightX, 0, rightW, H);
        ctx.fillStyle = '#94A3B8';
        ctx.font = '700 24px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('VIRTUAL BOARD CAM CONNECTING...', rightX + rightW / 2, H / 2 - 14);
        ctx.font = '500 14px "JetBrains Mono", monospace';
        ctx.fillStyle = '#64748B';
        ctx.fillText(
          this.boardFeedError
            ? 'Start Autodarts Desktop (port 3180)'
            : 'Linking raw 3-cam feed into GPU virtual camera...',
          rightX + rightW / 2,
          H / 2 + 20
        );
        ctx.textAlign = 'left';
        drawCornerLabel(ctx, 'VIRTUAL BOARD CAM', rightX + 18, 18, '#F59E0B', true);
      }

      // Crisp vertical divider separating Oche Cam & Consolidated Straight-On Board Cam
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.fillRect(leftW - 2, 0, 4, H);
    };

    // Steady 30fps compositor loop
    drawFrame();
    this.renderInterval = window.setInterval(drawFrame, 33);

    // 4. Capture composited broadcast stream
    const canvasStream = canvas.captureStream(30);
    if (includeAudio) {
      for (const audioTrack of ocheStream.getAudioTracks()) {
        canvasStream.addTrack(audioTrack);
      }
    }
    this.compositeStream = canvasStream;
    this.mimeType = this.pickSupportedMimeType();

    // 5. Start overlapping MediaRecorder ring buffer
    this.spawnSlot();
    this.rotationTimer = window.setInterval(() => {
      if (!this.ocheStream || !this.ocheStream.active) {
        this.stop();
        return;
      }
      this.spawnSlot();
      this.pruneOldSlots();
    }, this.SLOT_SPAWN_INTERVAL_MS);

    return canvasStream;
  }

  public stop(): void {
    if (this.rotationTimer !== null) {
      window.clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
    if (this.renderInterval !== null) {
      window.clearInterval(this.renderInterval);
      this.renderInterval = null;
    }

    this.stopAutodartsThreeCamReader();

    for (const slot of this.slots) {
      try {
        if (slot.recorder.state !== 'inactive') {
          slot.recorder.stop();
        }
      } catch {
        // ignore
      }
    }
    this.slots = [];

    if (this.ocheVideoEl) {
      this.ocheVideoEl.srcObject = null;
      this.ocheVideoEl = null;
    }
    this.canvasEl = null;

    if (this.ocheStream) {
      this.ocheStream.getTracks().forEach((t) => t.stop());
      this.ocheStream = null;
    }
    if (this.compositeStream) {
      this.compositeStream.getTracks().forEach((t) => t.stop());
      this.compositeStream = null;
    }

    this.activeOcheCameraLabel = null;
    this.activeOcheDeviceId = null;
    this.setBoardFeedStatus(false, null);
    this.isCapturing = false;
    this.emitCaptureState(false);
  }

  private spawnSlot(): void {
    if (!this.compositeStream || !this.compositeStream.active) return;

    try {
      const bitrate = 4_200_000;
      const options: MediaRecorderOptions = this.mimeType
        ? { mimeType: this.mimeType, videoBitsPerSecond: bitrate }
        : { videoBitsPerSecond: bitrate };

      const recorder = new MediaRecorder(this.compositeStream, options);
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

      recorder.start(500);
      this.slots.push(slot);
    } catch (err) {
      console.error('[OcheCam] Failed to spawn MediaRecorder slot:', err);
    }
  }

  private pruneOldSlots(): void {
    const now = Date.now();
    const keep: RollingSlot[] = [];

    for (const slot of this.slots) {
      const age = now - slot.startedAt;
      if (!slot.pinned && age > this.SLOT_MAX_AGE_MS && this.slots.length > 2) {
        try {
          if (slot.recorder.state !== 'inactive') {
            slot.recorder.stop();
          }
        } catch {
          // ignore
        }
      } else {
        keep.push(slot);
      }
    }

    this.slots = keep;
  }

  public async recordTenSecondClip(meta: CaptureClipMetadata): Promise<RecordedClipBundle | null> {
    if (!this.compositeStream || !this.compositeStream.active) return null;
    if (this.isCapturing) return null;

    const now = Date.now();
    const activeSlots = this.slots.filter(
      (s) => !s.pinned && s.recorder.state === 'recording'
    );
    if (activeSlots.length === 0) return null;

    const preTargetSec =
      meta.preSeconds ??
      (meta.category === 'user' ? this.MANUAL_PRE_TARGET_SEC : this.DEFAULT_PRE_TARGET_SEC);
    const postSec = meta.postSeconds ?? this.DEFAULT_POST_TARGET_SEC;

    const idealStart = now - preTargetSec * 1000;
    let bestSlot = activeSlots[0];
    let bestDiff = Math.abs(bestSlot.startedAt - idealStart);

    for (const slot of activeSlots) {
      const diff = Math.abs(slot.startedAt - idealStart);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestSlot = slot;
      }
    }

    bestSlot.pinned = true;
    this.isCapturing = true;
    this.activeCaptureMeta = meta;

    const actualPreSec = Math.max(0.5, Number(((now - bestSlot.startedAt) / 1000).toFixed(1)));
    this.emitCaptureState(true, postSec);

    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, postSec * 1000);
    });

    const blob = await new Promise<Blob>((resolve) => {
      const rec = bestSlot.recorder;
      const finish = () => {
        resolve(new Blob(bestSlot.chunks, { type: rec.mimeType || 'video/webm' }));
      };

      if (rec.state === 'inactive') {
        finish();
        return;
      }

      const prevOnStop = rec.onstop;
      rec.onstop = (ev) => {
        if (typeof prevOnStop === 'function') {
          prevOnStop.call(rec, ev);
        }
        finish();
      };

      try {
        rec.stop();
      } catch {
        finish();
      }
    });

    const finalMeta = this.activeCaptureMeta || meta;
    this.activeCaptureMeta = null;
    this.slots = this.slots.filter((s) => s.id !== bestSlot.id);
    this.isCapturing = false;
    this.emitCaptureState(false);

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
  }

  /**
   * Upgrades metadata on an already-in-flight capture (e.g. if a Bullseye or Ton+
   * triggered capture milliseconds before the game detected the winning checkout).
   */
  public upgradeActiveCaptureMeta(meta: CaptureClipMetadata): boolean {
    if (!this.isCapturing) return false;
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

    const res = await fetch(`/api/replays/clip?${params.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'video/webm' },
      body: blob,
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
  }

  public getBoardFrameCount(): number {
    return this.boardFrameCount;
  }
}

export const ocheCamService = new OcheCamService();
