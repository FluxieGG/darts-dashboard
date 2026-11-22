import {
  BoardManagerRawThrow,
  BoardManagerStatePayload,
  DartBedType,
  DartThrow,
} from '../types/darts';

export type BoardStateCallback = (payload: BoardManagerStatePayload) => void;
export type VisitSyncCallback = (throws: DartThrow[], status?: string, event?: string) => void;
export type VisitCompletedCallback = (throws: DartThrow[]) => void;

interface LocalBoardManagerOptions {
  wsUrl?: string;
  httpUrl?: string;
  pollIntervalMs?: number;
  onStateUpdate?: BoardStateCallback;
  onVisitSync?: VisitSyncCallback;
  onVisitCompleted?: VisitCompletedCallback;
  onConnectionChange?: (connected: boolean) => void;
}

/**
 * Normalize a raw bed string from Autodarts into our DartBedType
 */
function normalizeBed(rawBed?: string, multiplier?: number, segName?: string): DartBedType {
  if (rawBed) {
    const lower = rawBed.toLowerCase();
    if (lower === 'triple' || lower === 'treble') return 'Triple';
    if (lower === 'double') return 'Double';
    if (lower === 'singleinner') return 'SingleInner';
    if (lower === 'singleouter') return 'SingleOuter';
    if (lower === 'single') return 'Single';
    if (lower === 'outside' || lower === 'miss') return 'Outside';
    if (lower === 'bull' || lower === 'doublebull' || lower === 'innerbull') {
      return multiplier === 2 || segName?.toLowerCase() === 'bull' ? 'InnerBull' : 'Bull';
    }
  }
  if (multiplier === 3) return 'Triple';
  if (multiplier === 2) return 'Double';
  if (multiplier === 0) return 'Outside';
  return 'Single';
}

/**
 * Parse a single throw object directly from Autodarts Desktop's authoritative output.
 * Handles both modern flat payloads (`segmentName`, `segmentNumber`, `multiplier`, `coordsX`, `coordsY`)
 * and legacy nested payloads (`segment: { ... }`, `coords: { x, y }`).
 */
export function parseAutodartsThrow(raw: BoardManagerRawThrow, idx: number): DartThrow {
  const isBouncer = Boolean(raw.bouncer);
  const isFailed = Boolean(raw.failed);

  const rawName = raw.segmentName ?? raw.segment?.name;
  const rawNumber = raw.segmentNumber ?? raw.segment?.number;
  const rawMultiplier = raw.multiplier ?? raw.segment?.multiplier;
  const rawBed = raw.bed ?? raw.segment?.bed;

  const isOutside =
    isBouncer ||
    rawBed?.toLowerCase() === 'outside' ||
    rawName?.toUpperCase() === 'MISS' ||
    rawName?.toUpperCase() === 'M0' ||
    rawName?.toUpperCase().startsWith('M') ||
    rawNumber === 0 ||
    rawMultiplier === 0;

  let number = typeof rawNumber === 'number' ? rawNumber : 0;
  let multiplier = typeof rawMultiplier === 'number' ? rawMultiplier : isOutside ? 0 : 1;
  let segName = rawName || (isBouncer ? 'Bouncer' : 'Miss');

  // Fallback parsing from segmentName if numeric fields were omitted
  if (rawName && (rawNumber === undefined || rawMultiplier === undefined)) {
    const upper = rawName.toUpperCase().trim();
    if (upper === 'BULL' || upper === 'DBULL' || upper === 'D25' || upper === '50') {
      number = 25;
      multiplier = 2;
    } else if (upper === '25' || upper === 'SBULL' || upper === 'S25' || upper === 'OBULL') {
      number = 25;
      multiplier = 1;
    } else if (/^T(\d+)$/.test(upper)) {
      number = parseInt(upper.slice(1), 10);
      multiplier = 3;
    } else if (/^D(\d+)$/.test(upper)) {
      number = parseInt(upper.slice(1), 10);
      multiplier = 2;
    } else if (/^S(\d+)$/.test(upper)) {
      number = parseInt(upper.slice(1), 10);
      multiplier = 1;
    } else if (/^M\d*$/.test(upper) || upper === 'MISS') {
      number = 0;
      multiplier = 0;
    } else if (/^\d+$/.test(upper)) {
      number = parseInt(upper, 10);
      multiplier = 1;
    }
  }

  // Compute exact score directly from Autodarts segment number & multiplier
  // Guard against double-multiplying if an API sends number=50 & multiplier=2 for Bullseye
  let score = 0;
  if (!isBouncer && !isOutside) {
    if (number === 50) {
      score = 50;
    } else {
      score = number * multiplier;
    }
  }

  // Format display name cleanly
  if (isBouncer) {
    segName = 'Bouncer';
  } else if (isOutside) {
    segName = rawName && rawName.toUpperCase().startsWith('M') ? rawName : 'Miss';
  } else if (score === 50) {
    segName = 'Bull';
  } else if (score === 25 && number === 25) {
    segName = '25';
  }

  const bed = normalizeBed(rawBed, multiplier, segName);

  // Extract coordinates from either flat (`coordsX`, `coordsY`) or nested (`coords.x`, `coords.y`)
  const cx = typeof raw.coordsX === 'number' ? raw.coordsX : raw.coords?.x;
  const cy = typeof raw.coordsY === 'number' ? raw.coordsY : raw.coords?.y;
  const hasCoords =
    !isBouncer && typeof cx === 'number' && typeof cy === 'number' && !isNaN(cx) && !isNaN(cy);

  return {
    id: `ad-dart-${idx}-${segName}-${hasCoords ? `${cx.toFixed(4)}_${cy.toFixed(4)}` : 'nc'}`,
    visitDartIndex: idx,
    segment: {
      name: segName,
      number,
      bed,
      multiplier: isOutside || isBouncer ? 0 : multiplier,
    },
    score,
    coords: hasCoords ? { x: cx, y: cy } : undefined,
    bouncer: isBouncer,
    failed: isFailed,
    method: raw.method,
    timestamp: Date.now(),
  };
}

export class LocalBoardManagerService {
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private httpUrl: string;
  private pollIntervalMs: number;
  private reconnectTimeout: number | null = null;
  private pollInterval: number | null = null;
  private retryDelayMs = 1500;
  private maxRetryDelayMs = 10000;
  private isIntentionalClose = false;
  private wsConnected = false;
  private httpConnected = false;
  private lastReportedConnected = false;

  // Authoritative Snapshot Diffing State
  private lastFingerprint = '';
  private activeVisitThrows: DartThrow[] = [];
  private visitCommitted = false;

  private onStateUpdate?: BoardStateCallback;
  private onVisitSync?: VisitSyncCallback;
  private onVisitCompleted?: VisitCompletedCallback;
  private onConnectionChange?: (connected: boolean) => void;

  constructor(options: LocalBoardManagerOptions = {}) {
    this.wsUrl = options.wsUrl || 'ws://127.0.0.1:3180/api/events';
    this.httpUrl = options.httpUrl || 'http://127.0.0.1:3180/api/state';
    this.pollIntervalMs = options.pollIntervalMs ?? 500;
    this.onStateUpdate = options.onStateUpdate;
    this.onVisitSync = options.onVisitSync;
    this.onVisitCompleted = options.onVisitCompleted;
    this.onConnectionChange = options.onConnectionChange;
  }

  public connect(): void {
    this.isIntentionalClose = false;
    this.cleanupSocket();
    this.stopPolling();

    // 1. Immediately hydrate from /api/state so darts already in the board show up right away
    this.pollStateOnce();

    // 2. Start reliable HTTP sync polling alongside WebSocket
    this.pollInterval = window.setInterval(() => {
      this.pollStateOnce();
    }, this.pollIntervalMs);

    // 3. Connect to WebSocket for sub-50ms push updates
    this.connectWebSocket();
  }

  private connectWebSocket(): void {
    if (this.isIntentionalClose) return;
    this.cleanupSocket();

    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        this.wsConnected = true;
        this.retryDelayMs = 1500;
        this.emitConnectionState();
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const candidate = payload?.data ? payload.data : payload;
          // If the WS payload contains a throws array, apply it directly;
          // otherwise trigger an immediate HTTP /api/state read for the full state
          if (candidate && Array.isArray(candidate.throws)) {
            this.handleStateSnapshot(candidate as BoardManagerStatePayload);
          } else {
            this.pollStateOnce();
          }
        } catch {
          // Ignore non-JSON frames
        }
      };

      this.ws.onclose = () => {
        this.wsConnected = false;
        this.emitConnectionState();
        if (!this.isIntentionalClose) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        // Error triggers onclose
      };
    } catch {
      this.wsConnected = false;
      this.emitConnectionState();
      if (!this.isIntentionalClose) {
        this.scheduleReconnect();
      }
    }
  }

  public disconnect(): void {
    this.isIntentionalClose = true;
    this.cleanupSocket();
    this.stopPolling();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.wsConnected = false;
    this.httpConnected = false;
    this.emitConnectionState();
  }

  private cleanupSocket(): void {
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private emitConnectionState(): void {
    const isNowConnected = this.wsConnected || this.httpConnected;
    if (isNowConnected !== this.lastReportedConnected) {
      this.lastReportedConnected = isNowConnected;
      this.onConnectionChange?.(isNowConnected);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) return;
    this.reconnectTimeout = window.setTimeout(() => {
      this.reconnectTimeout = null;
      this.retryDelayMs = Math.min(this.retryDelayMs * 1.5, this.maxRetryDelayMs);
      this.connectWebSocket();
    }, this.retryDelayMs);
  }

  private async pollStateOnce(): Promise<void> {
    const snapshot = await this.fetchStatePoll();
    if (snapshot) {
      this.httpConnected = true;
      this.emitConnectionState();
      this.handleStateSnapshot(snapshot);
    } else {
      this.httpConnected = false;
      this.emitConnectionState();
    }
  }

  /**
   * Authoritatively syncs state from Autodarts Desktop:
   * - Deduplicates identical snapshots from WS + HTTP poll
   * - Keeps current visit throws visible during 'throw' and 'takeout'
   * - Applies any mid-visit corrections from Autodarts immediately
   * - Commits the completed visit ONCE when darts are pulled (throws returns to [])
   */
  public handleStateSnapshot(snapshot: BoardManagerStatePayload): void {
    const rawThrows = Array.isArray(snapshot.throws) ? snapshot.throws : [];

    // Deduplicate identical snapshots
    const fingerprint = JSON.stringify({
      status: snapshot.status,
      event: snapshot.event,
      throws: rawThrows.map((t) => [
        t.segmentName ?? t.segment?.name,
        t.segmentNumber ?? t.segment?.number,
        t.multiplier ?? t.segment?.multiplier,
        t.bed ?? t.segment?.bed,
        t.bouncer,
        t.coordsX ?? t.coords?.x,
        t.coordsY ?? t.coords?.y,
      ]),
    });

    if (fingerprint === this.lastFingerprint) {
      return;
    }
    this.lastFingerprint = fingerprint;

    this.onStateUpdate?.(snapshot);

    const typedThrows = rawThrows.map((raw, idx) => parseAutodartsThrow(raw, idx));
    const prevCount = this.activeVisitThrows.length;
    const currCount = typedThrows.length;

    if (prevCount > 0 && currCount === 0) {
      // Darts have been pulled from the board (takeoutFinished / next turn) -> commit the visit ONCE
      if (!this.visitCommitted) {
        this.visitCommitted = true;
        this.onVisitCompleted?.(this.activeVisitThrows);
      }
      this.activeVisitThrows = [];
      this.onVisitSync?.([], snapshot.status, snapshot.event);
    } else if (currCount > 0) {
      // Active darts in the board (1, 2, or 3) - sync authoritatively from Autodarts
      this.visitCommitted = false;
      this.activeVisitThrows = typedThrows;
      this.onVisitSync?.(typedThrows, snapshot.status, snapshot.event);
    } else {
      // Board is empty and waiting for throws
      this.activeVisitThrows = [];
      this.onVisitSync?.([], snapshot.status, snapshot.event);
    }
  }

  /**
   * Fetch current board state from local Autodarts HTTP API
   */
  public async fetchStatePoll(): Promise<BoardManagerStatePayload | null> {
    try {
      const res = await fetch(this.httpUrl, { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      return (data.data ? data.data : data) as BoardManagerStatePayload;
    } catch {
      return null;
    }
  }

  public getConnected(): boolean {
    return this.wsConnected || this.httpConnected;
  }
}
