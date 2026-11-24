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

function isValidDartNumber(n: number): boolean {
  return Number.isFinite(n) && Number.isInteger(n) && ((n >= 0 && n <= 20) || n === 25 || n === 50);
}

function isValidDartMultiplier(m: number): boolean {
  return Number.isFinite(m) && Number.isInteger(m) && m >= 0 && m <= 3;
}

function createMissThrow(idx: number, bouncer = false, failed = false, method?: string): DartThrow {
  const segName = bouncer ? 'Bouncer' : 'Miss';
  return {
    id: `ad-dart-${idx}-${segName}-nc`,
    visitDartIndex: idx,
    segment: {
      name: segName,
      number: 0,
      bed: 'Outside',
      multiplier: 0,
    },
    score: 0,
    coords: undefined,
    bouncer,
    failed,
    method,
    timestamp: Date.now(),
  };
}

/**
 * Parse a single throw object directly from Autodarts Desktop's authoritative output.
 * Handles both modern flat payloads (`segmentName`, `segmentNumber`, `multiplier`, `coordsX`, `coordsY`)
 * and legacy nested payloads (`segment: { ... }`, `coords: { x, y }`).
 */
export function parseAutodartsThrow(raw: BoardManagerRawThrow, idx: number): DartThrow {
  if (!raw || typeof raw !== 'object') {
    return createMissThrow(idx);
  }

  const isBouncer = Boolean(raw.bouncer);
  const isFailed = Boolean(raw.failed);
  const seg = raw.segment && typeof raw.segment === 'object' ? raw.segment : undefined;

  const rawNameCandidate = raw.segmentName ?? seg?.name;
  const rawName =
    typeof rawNameCandidate === 'string' && rawNameCandidate.trim().length > 0
      ? rawNameCandidate.trim()
      : undefined;
  const rawNumber = raw.segmentNumber ?? seg?.number;
  const rawMultiplier = raw.multiplier ?? seg?.multiplier;
  const rawBedCandidate = raw.bed ?? seg?.bed;
  const rawBed =
    typeof rawBedCandidate === 'string' && rawBedCandidate.trim().length > 0
      ? rawBedCandidate.trim()
      : undefined;

  const allSegmentFieldsMissing =
    rawName === undefined &&
    rawNumber === undefined &&
    rawMultiplier === undefined &&
    rawBed === undefined;

  const hasFiniteNumber = typeof rawNumber === 'number' && Number.isFinite(rawNumber);
  const hasFiniteMultiplier = typeof rawMultiplier === 'number' && Number.isFinite(rawMultiplier);

  let isOutside =
    isBouncer ||
    allSegmentFieldsMissing ||
    rawBed?.toLowerCase() === 'outside' ||
    rawBed?.toLowerCase() === 'miss' ||
    rawName?.toUpperCase() === 'MISS' ||
    rawName?.toUpperCase() === 'M0' ||
    Boolean(rawName && rawName.toUpperCase().startsWith('M')) ||
    (hasFiniteNumber && rawNumber === 0) ||
    (hasFiniteMultiplier && rawMultiplier === 0);

  let number = hasFiniteNumber ? rawNumber : 0;
  let multiplier = hasFiniteMultiplier
    ? rawMultiplier
    : rawMultiplier !== undefined
    ? 0
    : isOutside
    ? 0
    : 1;
  let segName = rawName || (isBouncer ? 'Bouncer' : 'Miss');

  // Fallback parsing from segmentName if numeric fields were omitted or non-finite
  if (rawName && (!hasFiniteNumber || !hasFiniteMultiplier)) {
    const upper = rawName.toUpperCase();
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
      isOutside = true;
    } else if (/^\d+$/.test(upper)) {
      number = parseInt(upper, 10);
      multiplier = 1;
    }
  }

  // Strictly validate dart number (0..20, 25, or 50) and multiplier (0..3)
  if (!isValidDartNumber(number) || !isValidDartMultiplier(multiplier)) {
    number = 0;
    multiplier = 0;
    isOutside = true;
  }

  if (number === 0 || multiplier === 0) {
    number = 0;
    multiplier = 0;
    isOutside = true;
  }

  // Compute exact score directly from validated segment number & multiplier
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
  } else if (!rawName && number > 0) {
    segName = multiplier === 3 ? `T${number}` : multiplier === 2 ? `D${number}` : `S${number}`;
  }

  const finalMultiplier = isOutside || isBouncer ? 0 : multiplier;
  const bed: DartBedType =
    isOutside || isBouncer ? 'Outside' : normalizeBed(rawBed, finalMultiplier, segName);

  // Extract coordinates from either flat (`coordsX`, `coordsY`) or nested (`coords.x`, `coords.y`)
  const nestedCoords = raw.coords && typeof raw.coords === 'object' ? raw.coords : undefined;
  const cx = raw.coordsX !== undefined ? raw.coordsX : nestedCoords?.x;
  const cy = raw.coordsY !== undefined ? raw.coordsY : nestedCoords?.y;
  const hasCoords =
    !isBouncer &&
    typeof cx === 'number' &&
    typeof cy === 'number' &&
    Number.isFinite(cx) &&
    Number.isFinite(cy);

  return {
    id: `ad-dart-${idx}-${segName}-${hasCoords ? `${cx.toFixed(4)}_${cy.toFixed(4)}` : 'nc'}`,
    visitDartIndex: idx,
    segment: {
      name: segName,
      number: isOutside || isBouncer ? 0 : number,
      bed,
      multiplier: finalMultiplier,
    },
    score,
    coords: hasCoords ? { x: cx, y: cy } : undefined,
    bouncer: isBouncer,
    failed: isFailed,
    method: typeof raw.method === 'string' ? raw.method : undefined,
    timestamp: Date.now(),
  };
}

/**
 * Resolves Autodarts Board Manager HTTP URLs through the same-origin `/api/board` Vite proxy
 * when targeting local port 3180 (or relative `/api/board/...` paths). This prevents Chromium/Edge
 * Local Network Access ("Allow localhost") prompts on startup.
 */
export function resolveBoardHttpUrl(rawUrl?: string): string {
  const input = (rawUrl || '/api/board/api/state').trim();
  if (input.startsWith('/')) {
    return input;
  }
  try {
    const parsed = new URL(input);
    if (
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
      parsed.port === '3180'
    ) {
      return `/api/board${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // Keep custom URL as-is
  }
  return input;
}

/**
 * Resolves Autodarts Board Manager WebSocket URLs through the same-origin `/api/board` Vite proxy
 * when targeting local port 3180 (or relative `/api/board/...` paths).
 */
export function resolveBoardWsUrl(rawUrl?: string): string {
  const input = (rawUrl || '/api/board/api/events').trim();
  const buildSameOriginWs = (pathWithQuery: string) => {
    if (typeof window === 'undefined') {
      return `ws://127.0.0.1:5173${pathWithQuery}`;
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}${pathWithQuery}`;
  };

  if (input.startsWith('/')) {
    return buildSameOriginWs(input);
  }
  try {
    const parsed = new URL(input);
    if (
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
      parsed.port === '3180'
    ) {
      return buildSameOriginWs(`/api/board${parsed.pathname}${parsed.search}`);
    }
  } catch {
    // Keep custom URL as-is
  }
  return input;
}

export class LocalBoardManagerService {
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private httpUrl: string;
  private pollIntervalMs: number;
  private reconnectTimeout: number | null = null;
  private pollTimeout: number | null = null;
  private pollInFlight = false;
  private pollAbortController: AbortController | null = null;
  private consecutivePollFailures = 0;
  private readonly maxPollBackoffMs = 5000;
  private readonly pollRequestTimeoutMs = 1500;
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
    this.wsUrl = resolveBoardWsUrl(options.wsUrl);
    this.httpUrl = resolveBoardHttpUrl(options.httpUrl);
    this.pollIntervalMs = options.pollIntervalMs ?? 500;
    this.onStateUpdate = options.onStateUpdate;
    this.onVisitSync = options.onVisitSync;
    this.onVisitCompleted = options.onVisitCompleted;
    this.onConnectionChange = options.onConnectionChange;
  }

  public connect(): void {
    this.isIntentionalClose = false;
    this.consecutivePollFailures = 0;
    this.cleanupSocket();
    this.stopPolling();

    // 1. Immediately hydrate & kick off non-overlapping self-scheduling HTTP sync loop
    void this.pollStateOnce();

    // 2. Connect to WebSocket for sub-50ms push updates
    this.connectWebSocket();
  }

  private connectWebSocket(): void {
    if (this.isIntentionalClose) return;
    this.cleanupSocket();

    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        if (this.isIntentionalClose) return;
        this.wsConnected = true;
        this.retryDelayMs = 1500;
        this.consecutivePollFailures = 0;
        this.emitConnectionState();
        // Immediately resume fast polling interval & sync state upon WS reconnect
        if (!this.pollInFlight) {
          void this.pollStateOnce();
        }
      };

      this.ws.onmessage = (event) => {
        if (this.isIntentionalClose) return;
        try {
          const payload = JSON.parse(event.data);
          const candidate = payload?.data ? payload.data : payload;
          this.consecutivePollFailures = 0;
          // If the WS payload contains a throws array, apply it directly;
          // otherwise trigger an immediate HTTP /api/state read for the full state
          if (candidate && Array.isArray(candidate.throws)) {
            this.handleStateSnapshot(candidate as BoardManagerStatePayload);
          } else {
            void this.pollStateOnce();
          }
        } catch {
          // Ignore non-JSON frames
        }
      };

      this.ws.onclose = () => {
        if (this.isIntentionalClose) return;
        this.wsConnected = false;
        this.emitConnectionState();
        this.scheduleReconnect();
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
    if (this.reconnectTimeout !== null) {
      window.clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.consecutivePollFailures = 0;
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
    if (this.pollTimeout !== null) {
      window.clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
    if (this.pollAbortController) {
      try {
        this.pollAbortController.abort();
      } catch {
        // ignore
      }
      this.pollAbortController = null;
    }
  }

  private getNextPollDelayMs(): number {
    if (this.consecutivePollFailures <= 0) {
      return this.pollIntervalMs;
    }
    // Exponential offline backoff: 1000ms -> 2000ms -> 4000ms -> 5000ms (capped at 5s)
    return Math.min(1000 * Math.pow(2, this.consecutivePollFailures - 1), this.maxPollBackoffMs);
  }

  private scheduleNextPoll(delayMs?: number): void {
    if (this.isIntentionalClose) return;
    if (this.pollTimeout !== null) {
      window.clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
    const waitMs = delayMs ?? this.getNextPollDelayMs();
    this.pollTimeout = window.setTimeout(() => {
      this.pollTimeout = null;
      void this.pollStateOnce();
    }, waitMs);
  }

  private emitConnectionState(): void {
    const isNowConnected = this.wsConnected || this.httpConnected;
    if (isNowConnected !== this.lastReportedConnected) {
      this.lastReportedConnected = isNowConnected;
      this.onConnectionChange?.(isNowConnected);
    }
  }

  private scheduleReconnect(): void {
    if (this.isIntentionalClose || this.reconnectTimeout !== null) return;
    this.reconnectTimeout = window.setTimeout(() => {
      this.reconnectTimeout = null;
      if (this.isIntentionalClose) return;
      this.retryDelayMs = Math.min(this.retryDelayMs * 1.5, this.maxRetryDelayMs);
      this.connectWebSocket();
    }, this.retryDelayMs);
  }

  private async pollStateOnce(): Promise<void> {
    if (this.isIntentionalClose || this.pollInFlight) return;
    if (this.pollTimeout !== null) {
      window.clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }

    this.pollInFlight = true;
    try {
      const snapshot = await this.fetchStatePoll();
      if (this.isIntentionalClose) return;

      if (snapshot) {
        this.consecutivePollFailures = 0;
        this.httpConnected = true;
        this.emitConnectionState();
        this.handleStateSnapshot(snapshot);
      } else {
        this.consecutivePollFailures += 1;
        this.httpConnected = false;
        this.emitConnectionState();
      }
    } finally {
      this.pollInFlight = false;
      if (!this.isIntentionalClose) {
        this.scheduleNextPoll();
      }
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
    if (this.isIntentionalClose) return;
    if (!snapshot || typeof snapshot !== 'object') return;
    const rawThrows = Array.isArray(snapshot.throws)
      ? snapshot.throws.filter((t): t is BoardManagerRawThrow => Boolean(t && typeof t === 'object'))
      : [];

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
   * Fetch current board state from local Autodarts HTTP API with a 1500ms timeout
   */
  public async fetchStatePoll(): Promise<BoardManagerStatePayload | null> {
    if (this.isIntentionalClose) return null;

    const controller = new AbortController();
    this.pollAbortController = controller;
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, this.pollRequestTimeoutMs);

    try {
      const res = await fetch(this.httpUrl, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (this.isIntentionalClose || !res.ok) return null;
      const data = await res.json();
      if (this.isIntentionalClose) return null;
      return (data.data ? data.data : data) as BoardManagerStatePayload;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeoutId);
      if (this.pollAbortController === controller) {
        this.pollAbortController = null;
      }
    }
  }

  public getConnected(): boolean {
    return this.wsConnected || this.httpConnected;
  }
}
