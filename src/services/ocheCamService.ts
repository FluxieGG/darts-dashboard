import {
  BoardCameraMode,
  CameraDeviceInfo,
  CaptureClipMetadata,
  RecordedClipBundle,
  ReplayClipRecord,
} from '../types/replay';

interface RollingSlot {
  id: number;
  recorder: MediaRecorder;
  chunks: Blob[];
  startedAt: number;
  pinned: boolean;
}

export interface StartOcheCamOptions {
  ocheDeviceId?: string;
  includeAudio?: boolean;
  boardCameraMode?: BoardCameraMode;
  boardDeviceId?: string;
  autodartsCamIndex?: number;
  autodartsCamCustomUrl?: string;
}

/**
 * Draws a video or image element into a target rectangle using `object-fit: cover` math
 * so neither camera is ever stretched or letterboxed awkwardly.
 */
function drawCover(
  ctx: CanvasRenderingContext2D,
  source: HTMLVideoElement | HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number
): boolean {
  const sw =
    source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const sh =
    source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;

  if (!sw || !sh) return false;

  const targetRatio = dw / dh;
  const sourceRatio = sw / sh;

  let sx = 0;
  let sy = 0;
  let sWidth = sw;
  let sHeight = sh;

  if (sourceRatio > targetRatio) {
    // Source is wider than slot -> crop left/right
    sWidth = sh * targetRatio;
    sx = (sw - sWidth) / 2;
  } else {
    // Source is taller than slot -> crop top/bottom
    sHeight = sw / targetRatio;
    sy = (sh - sHeight) / 2;
  }

  ctx.drawImage(source, sx, sy, sWidth, sHeight, dx, dy, dw, dh);
  return true;
}

function drawCornerLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  dotColor: string
): void {
  ctx.save();
  ctx.font = '800 18px "JetBrains Mono", monospace';
  const metrics = ctx.measureText(text);
  const padX = 14;
  const boxW = metrics.width + padX * 2 + 16;
  const boxH = 34;

  ctx.fillStyle = 'rgba(11, 15, 23, 0.78)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 1.5;

  const r = 10;
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

  // Status dot
  ctx.fillStyle = dotColor;
  ctx.beginPath();
  ctx.arc(x + padX + 4, y + boxH / 2, 5, 0, Math.PI * 2);
  ctx.fill();

  // Label text
  ctx.fillStyle = '#F8FAFC';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padX + 16, y + boxH / 2 + 1);
  ctx.restore();
}

/**
 * Flight Club-style Dual-Camera Side-by-Side Compositor & 10-Second Ring Buffer.
 *
 * Stitches:
 *   LEFT  (800×720): Oche / Player Reaction Camera
 *   RIGHT (800×720): Dartboard Close-Up Camera (USB webcam OR Autodarts port 3180 proxy stream)
 * into a single real-time 1600×720 broadcast split-screen stream recorded into
 * staggered overlapping MediaRecorder slots (~5s pre-roll + ~5s reaction = ~10s valid WebM).
 */
class OcheCamService {
  private ocheStream: MediaStream | null = null;
  private boardStream: MediaStream | null = null;
  private compositeStream: MediaStream | null = null;

  private ocheVideoEl: HTMLVideoElement | null = null;
  private boardVideoEl: HTMLVideoElement | null = null;
  private boardImgEl: HTMLImageElement | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private renderInterval: number | null = null;

  private isDualMode = false;
  private boardFeedActive = false;
  private boardFeedError: string | null = null;

  private slots: RollingSlot[] = [];
  private rotationTimer: number | null = null;
  private slotCounter = 0;
  private mimeType = 'video/webm';
  private isCapturing = false;
  private captureListeners = new Set<(capturing: boolean, countdownSec?: number) => void>();

  private readonly PRE_TARGET_SEC = 5;
  private readonly POST_TARGET_SEC = 5;
  private readonly SLOT_SPAWN_INTERVAL_MS = 2500;
  private readonly SLOT_MAX_AGE_MS = 10500;

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

  public async listCameras(): Promise<CameraDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, idx) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${idx + 1}`,
      }));
  }

  /** Returns the live stream for Settings Preview (composited side-by-side when dual-cam is on!) */
  public getStream(): MediaStream | null {
    return this.compositeStream || this.ocheStream;
  }

  public getOcheStream(): MediaStream | null {
    return this.ocheStream;
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

  private emitCaptureState(capturing: boolean, countdownSec?: number): void {
    this.captureListeners.forEach((cb) => cb(capturing, countdownSec));
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

  public async start(options: StartOcheCamOptions = {}): Promise<MediaStream> {
    this.stop();

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera API (getUserMedia) is not available in this browser context.');
    }

    const {
      ocheDeviceId,
      includeAudio = false,
      boardCameraMode = 'none',
      boardDeviceId,
      autodartsCamIndex = 0,
      autodartsCamCustomUrl,
    } = options;

    // 1. Open primary Oche / Player Reaction camera
    const ocheVideoConstraints: MediaTrackConstraints = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    };
    if (ocheDeviceId) {
      ocheVideoConstraints.deviceId = { exact: ocheDeviceId };
    }

    const ocheStream = await navigator.mediaDevices.getUserMedia({
      video: ocheVideoConstraints,
      audio: includeAudio,
    });
    this.ocheStream = ocheStream;
    this.ocheVideoEl = this.createHiddenVideo(ocheStream);

    // 2. Open secondary Dartboard camera (USB webcam OR Autodarts local stream proxy)
    this.isDualMode = boardCameraMode !== 'none';
    this.boardFeedActive = false;
    this.boardFeedError = null;

    if (boardCameraMode === 'usb') {
      if (boardDeviceId && boardDeviceId !== ocheDeviceId) {
        try {
          const boardStream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: boardDeviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 30 },
            },
            audio: false,
          });
          this.boardStream = boardStream;
          this.boardVideoEl = this.createHiddenVideo(boardStream);
          this.boardFeedActive = true;
        } catch (err) {
          this.boardFeedError =
            (err as Error).message ||
            'Board USB camera busy (if Autodarts Desktop owns it, switch Board Cam Source to Autodarts Local Stream).';
        }
      } else {
        this.boardFeedError = 'Select a different USB camera for the Dartboard feed.';
      }
    } else if (boardCameraMode === 'autodarts') {
      // Load via same-origin Vite proxy `/api/board/...` so canvas drawing is 100% CORS-safe!
      const rawUrl = autodartsCamCustomUrl?.trim();
      const streamUrl = rawUrl
        ? rawUrl.startsWith('http://127.0.0.1:3180')
          ? `/api/board${rawUrl.slice('http://127.0.0.1:3180'.length)}`
          : rawUrl
        : `/api/board/api/streams/live?cam=${autodartsCamIndex}&warp=true`;

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.boardFeedActive = true;
        this.boardFeedError = null;
      };
      img.onerror = () => {
        this.boardFeedActive = false;
        this.boardFeedError = `Could not reach Autodarts camera stream (${streamUrl}). Verify Autodarts Desktop is running.`;
      };
      img.src = streamUrl;
      this.boardImgEl = img;
    }

    // 3. Create real-time Broadcast Canvas Compositor
    const canvas = document.createElement('canvas');
    if (this.isDualMode) {
      // Side-by-side wide split screen: 800×720 Left (Oche) + 800×720 Right (Dartboard)
      canvas.width = 1600;
      canvas.height = 720;
    } else {
      canvas.width = 1280;
      canvas.height = 720;
    }
    this.canvasEl = canvas;
    const ctx = canvas.getContext('2d');

    const drawFrame = () => {
      if (!ctx || !this.canvasEl) return;
      const W = this.canvasEl.width;
      const H = this.canvasEl.height;

      ctx.fillStyle = '#0B0F17';
      ctx.fillRect(0, 0, W, H);

      if (this.isDualMode) {
        const halfW = W / 2;

        // LEFT HALF: Oche / Player Reaction Camera
        if (this.ocheVideoEl) {
          drawCover(ctx, this.ocheVideoEl, 0, 0, halfW, H);
        }
        drawCornerLabel(ctx, 'OCHE CAM', 18, 18, '#F43F5E');

        // RIGHT HALF: Dartboard Camera (USB video OR Autodarts MJPEG img)
        let drewBoard = false;
        if (this.boardVideoEl) {
          drewBoard = drawCover(ctx, this.boardVideoEl, halfW, 0, halfW, H);
        } else if (this.boardImgEl && this.boardImgEl.complete && this.boardImgEl.naturalWidth > 0) {
          try {
            drewBoard = drawCover(ctx, this.boardImgEl, halfW, 0, halfW, H);
            this.boardFeedActive = true;
          } catch {
            // Ignore cross-origin taint if a custom external URL lacks CORS headers
            this.boardFeedActive = false;
          }
        }

        if (!drewBoard) {
          ctx.fillStyle = '#111827';
          ctx.fillRect(halfW, 0, halfW, H);
          ctx.fillStyle = '#94A3B8';
          ctx.font = '700 24px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('BOARD CAM WAITING...', halfW + halfW / 2, H / 2 - 14);
          ctx.font = '500 15px "JetBrains Mono", monospace';
          ctx.fillStyle = '#64748B';
          ctx.fillText(
            this.boardFeedError ? 'Check camera source in Settings' : 'Connecting feed...',
            halfW + halfW / 2,
            H / 2 + 20
          );
          ctx.textAlign = 'left';
        }
        drawCornerLabel(ctx, 'BOARD CAM', halfW + 18, 18, drewBoard ? '#10B981' : '#F59E0B');

        // Crisp glowing vertical center divider
        ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.fillRect(halfW - 2, 0, 4, H);
      } else {
        // Single-camera full-frame mode
        if (this.ocheVideoEl) {
          drawCover(ctx, this.ocheVideoEl, 0, 0, W, H);
        }
        drawCornerLabel(ctx, 'OCHE CAM', 18, 18, '#F43F5E');
      }
    };

    // Initial paint + steady 30fps compositor loop (setInterval keeps running even if unfocused)
    drawFrame();
    this.renderInterval = window.setInterval(drawFrame, 33);

    // 4. Capture composited video stream (+ mic audio tracks if requested)
    const canvasStream = canvas.captureStream(30);
    if (includeAudio) {
      for (const audioTrack of ocheStream.getAudioTracks()) {
        canvasStream.addTrack(audioTrack);
      }
    }
    this.compositeStream = canvasStream;
    this.mimeType = this.pickSupportedMimeType();

    // 5. Start overlapping MediaRecorder ring buffer on the composited stream
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
    if (this.boardVideoEl) {
      this.boardVideoEl.srcObject = null;
      this.boardVideoEl = null;
    }
    if (this.boardImgEl) {
      this.boardImgEl.src = '';
      this.boardImgEl = null;
    }
    this.canvasEl = null;

    if (this.ocheStream) {
      this.ocheStream.getTracks().forEach((t) => t.stop());
      this.ocheStream = null;
    }
    if (this.boardStream) {
      this.boardStream.getTracks().forEach((t) => t.stop());
      this.boardStream = null;
    }
    if (this.compositeStream) {
      this.compositeStream.getTracks().forEach((t) => t.stop());
      this.compositeStream = null;
    }

    this.boardFeedActive = false;
    this.boardFeedError = null;
    this.isCapturing = false;
    this.emitCaptureState(false);
  }

  private spawnSlot(): void {
    if (!this.compositeStream || !this.compositeStream.active) return;

    try {
      const bitrate = this.isDualMode ? 3_800_000 : 2_500_000;
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

  /**
   * Captures a ~10-second WebM Blob from the rolling ring buffer (~5s pre-roll + ~5s reaction)
   * without writing to disk yet so callers can either auto-save or hold for iPad Save confirmation.
   */
  public async recordTenSecondClip(meta: CaptureClipMetadata): Promise<RecordedClipBundle | null> {
    if (!this.compositeStream || !this.compositeStream.active) return null;
    if (this.isCapturing) return null;

    const now = Date.now();
    const activeSlots = this.slots.filter(
      (s) => !s.pinned && s.recorder.state === 'recording'
    );
    if (activeSlots.length === 0) return null;

    const idealStart = now - this.PRE_TARGET_SEC * 1000;
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

    const actualPreSec = Math.max(0.5, Number(((now - bestSlot.startedAt) / 1000).toFixed(1)));
    const postSec = this.POST_TARGET_SEC;
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

    this.slots = this.slots.filter((s) => s.id !== bestSlot.id);
    this.isCapturing = false;
    this.emitCaptureState(false);

    if (blob.size === 0) return null;

    const totalDuration = Number((actualPreSec + postSec).toFixed(1));
    return {
      blob,
      meta,
      preSeconds: actualPreSec,
      postSeconds: postSec,
      durationSec: totalDuration,
      isDualCamera: this.isDualMode,
      createdAt: Date.now(),
    };
  }

  /**
   * Uploads a previously recorded 10-second WebM bundle to disk via `/api/replays/clip`.
   */
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
}

export const ocheCamService = new OcheCamService();
