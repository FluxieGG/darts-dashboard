import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LocalBoardManagerService,
  parseAutodartsThrow,
  resolveBoardHttpUrl,
  resolveBoardWsUrl,
} from '../services/localBoardManager';
import { gameEventBus } from '../services/gameEventBus';
import {
  BoardManagerRawThrow,
  BoardManagerStatePayload,
  DartThrow,
} from '../types/darts';
import { GameBoardEvent } from '../types/games';

function makeThrow(
  name: string,
  number: number,
  multiplier: number,
  score: number,
  bed: DartThrow['segment']['bed'] = 'Single',
  visitDartIndex = 0
): DartThrow {
  return {
    id: `test-${visitDartIndex}-${name}`,
    visitDartIndex,
    segment: { name, number, bed, multiplier },
    score,
    timestamp: 1_700_000_000_000,
  };
}

describe('parseAutodartsThrow', () => {
  it('parses normal flat and nested throws accurately', () => {
    const t20 = parseAutodartsThrow(
      {
        segmentName: 'T20',
        segmentNumber: 20,
        multiplier: 3,
        bed: 'Triple',
        coordsX: 0.01,
        coordsY: 0.62,
      },
      0
    );
    expect(t20.score).toBe(60);
    expect(t20.segment).toEqual({
      name: 'T20',
      number: 20,
      bed: 'Triple',
      multiplier: 3,
    });
    expect(t20.coords).toEqual({ x: 0.01, y: 0.62 });
    expect(t20.visitDartIndex).toBe(0);

    const d16 = parseAutodartsThrow(
      {
        segment: { name: 'D16', number: 16, multiplier: 2, bed: 'Double' },
        coords: { x: -0.75, y: -0.55 },
      },
      1
    );
    expect(d16.score).toBe(32);
    expect(d16.segment.bed).toBe('Double');
    expect(d16.segment.multiplier).toBe(2);
    expect(d16.coords).toEqual({ x: -0.75, y: -0.55 });

    const s5 = parseAutodartsThrow({ segmentName: 'S5' }, 2);
    expect(s5.score).toBe(5);
    expect(s5.segment).toEqual({
      name: 'S5',
      number: 5,
      bed: 'Single',
      multiplier: 1,
    });
  });

  it('parses Bull (50) and Outer Bull (25) and guards against double-multiplying 50', () => {
    const bullFromName = parseAutodartsThrow({ segmentName: 'Bull' }, 0);
    expect(bullFromName.score).toBe(50);
    expect(bullFromName.segment.name).toBe('Bull');
    expect(bullFromName.segment.number).toBe(25);
    expect(bullFromName.segment.multiplier).toBe(2);

    const bullFrom25x2 = parseAutodartsThrow(
      { segmentName: 'Bull', segmentNumber: 25, multiplier: 2, bed: 'InnerBull' },
      0
    );
    expect(bullFrom25x2.score).toBe(50);
    expect(bullFrom25x2.segment.bed).toBe('InnerBull');

    // Guard: API sends number=50 & multiplier=2 -> must STILL score 50, never 100
    const bullFrom50x2 = parseAutodartsThrow(
      { segmentName: 'Bull', segmentNumber: 50, multiplier: 2, bed: 'Bull' },
      0
    );
    expect(bullFrom50x2.score).toBe(50);
    expect(bullFrom50x2.segment.name).toBe('Bull');

    const outerBull = parseAutodartsThrow(
      { segmentName: '25', segmentNumber: 25, multiplier: 1, bed: 'Bull' },
      1
    );
    expect(outerBull.score).toBe(25);
    expect(outerBull.segment.name).toBe('25');
    expect(outerBull.segment.number).toBe(25);
    expect(outerBull.segment.multiplier).toBe(1);
    expect(outerBull.segment.bed).toBe('Bull');
  });

  it('parses Miss, M0, Outside, and bouncer throws as 0 score', () => {
    const miss = parseAutodartsThrow({ segmentName: 'Miss' }, 0);
    expect(miss.score).toBe(0);
    expect(miss.segment.multiplier).toBe(0);
    expect(miss.segment.bed).toBe('Outside');

    const m0 = parseAutodartsThrow({ segmentName: 'M0' }, 1);
    expect(m0.score).toBe(0);
    expect(m0.segment.multiplier).toBe(0);
    expect(m0.segment.bed).toBe('Outside');

    const outside = parseAutodartsThrow(
      { segmentName: 'S20', segmentNumber: 20, multiplier: 1, bed: 'Outside' },
      2
    );
    expect(outside.score).toBe(0);
    expect(outside.segment.multiplier).toBe(0);
    expect(outside.segment.bed).toBe('Outside');

    const bouncer = parseAutodartsThrow(
      {
        segmentName: 'T20',
        segmentNumber: 20,
        multiplier: 3,
        bed: 'Triple',
        coordsX: 0.02,
        coordsY: 0.6,
        bouncer: true,
      },
      0
    );
    expect(bouncer.score).toBe(0);
    expect(bouncer.bouncer).toBe(true);
    expect(bouncer.coords).toBeUndefined();
    expect(bouncer.segment).toEqual({
      name: 'Bouncer',
      number: 0,
      bed: 'Outside',
      multiplier: 0,
    });
  });

  it('sanitizes empty, null, NaN, Infinity, negative, and out-of-range malformed inputs', () => {
    const empty = parseAutodartsThrow({}, 0);
    expect(empty.score).toBe(0);
    expect(empty.segment.bed).toBe('Outside');
    expect(empty.segment.multiplier).toBe(0);
    expect(empty.segment.number).toBe(0);

    const nullRaw = parseAutodartsThrow(null as unknown as BoardManagerRawThrow, 1);
    expect(nullRaw.score).toBe(0);
    expect(nullRaw.segment.bed).toBe('Outside');
    expect(nullRaw.segment.multiplier).toBe(0);

    const nanRaw = parseAutodartsThrow(
      { segmentNumber: Number.NaN, multiplier: Number.NaN },
      0
    );
    expect(nanRaw.score).toBe(0);
    expect(Number.isNaN(nanRaw.score)).toBe(false);
    expect(nanRaw.segment.multiplier).toBe(0);
    expect(nanRaw.segment.bed).toBe('Outside');

    const infCoords = parseAutodartsThrow(
      {
        segmentName: 'T20',
        segmentNumber: 20,
        multiplier: 3,
        coordsX: Number.POSITIVE_INFINITY,
        coordsY: Number.NEGATIVE_INFINITY,
      },
      0
    );
    expect(infCoords.score).toBe(60);
    expect(infCoords.coords).toBeUndefined();

    const negativeRaw = parseAutodartsThrow(
      { segmentNumber: -5, multiplier: -2 },
      0
    );
    expect(negativeRaw.score).toBe(0);
    expect(negativeRaw.segment.number).toBe(0);
    expect(negativeRaw.segment.multiplier).toBe(0);
    expect(negativeRaw.segment.bed).toBe('Outside');

    const outOfRangeName = parseAutodartsThrow({ segmentName: '99999' }, 2);
    expect(outOfRangeName.score).toBe(0);
    expect(outOfRangeName.segment.number).toBe(0);
    expect(outOfRangeName.segment.multiplier).toBe(0);
    expect(outOfRangeName.segment.bed).toBe('Outside');
  });
});

describe('LocalBoardManagerService.handleStateSnapshot', () => {
  it('deduplicates 100 identical snapshots so onVisitSync is called only once', () => {
    const onVisitSync = vi.fn();
    const onStateUpdate = vi.fn();
    const svc = new LocalBoardManagerService({ onVisitSync, onStateUpdate });

    const snapshot: BoardManagerStatePayload = {
      connected: true,
      running: true,
      status: 'throw',
      event: 'dart_detected',
      throws: [{ segmentName: 'T20', segmentNumber: 20, multiplier: 3, bed: 'Triple' }],
    };

    for (let i = 0; i < 100; i++) {
      svc.handleStateSnapshot(snapshot);
    }

    expect(onVisitSync).toHaveBeenCalledTimes(1);
    expect(onStateUpdate).toHaveBeenCalledTimes(1);
    expect(onVisitSync.mock.calls[0][0]).toHaveLength(1);
    expect(onVisitSync.mock.calls[0][0][0].score).toBe(60);
  });

  it('applies mid-visit dart corrections accurately and commits corrected throws on takeout', () => {
    const onVisitSync = vi.fn();
    const onVisitCompleted = vi.fn();
    const svc = new LocalBoardManagerService({ onVisitSync, onVisitCompleted });

    // Initial Dart 1 detected as S20
    svc.handleStateSnapshot({
      connected: true,
      running: true,
      status: 'throw',
      throws: [{ segmentName: 'S20', segmentNumber: 20, multiplier: 1 }],
    });
    expect(onVisitSync).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ score: 20 })]),
      'throw',
      undefined
    );

    // Camera corrects Dart 1 to T20 and adds Dart 2 D16
    svc.handleStateSnapshot({
      connected: true,
      running: true,
      status: 'throw',
      throws: [
        { segmentName: 'T20', segmentNumber: 20, multiplier: 3 },
        { segmentName: 'D16', segmentNumber: 16, multiplier: 2 },
      ],
    });
    const latestSyncThrows = onVisitSync.mock.calls[onVisitSync.mock.calls.length - 1][0] as DartThrow[];
    expect(latestSyncThrows).toHaveLength(2);
    expect(latestSyncThrows[0].segment.name).toBe('T20');
    expect(latestSyncThrows[0].score).toBe(60);
    expect(latestSyncThrows[1].segment.name).toBe('D16');
    expect(latestSyncThrows[1].score).toBe(32);

    // Pull darts -> commits corrected throws
    svc.handleStateSnapshot({
      connected: true,
      running: true,
      status: 'throw',
      event: 'takeoutFinished',
      throws: [],
    });
    expect(onVisitCompleted).toHaveBeenCalledTimes(1);
    const committed = onVisitCompleted.mock.calls[0][0] as DartThrow[];
    expect(committed.map((d) => d.score)).toEqual([60, 32]);
  });

  it('commits onVisitCompleted exactly once across repeated empty takeout snapshots', () => {
    const onVisitCompleted = vi.fn();
    const svc = new LocalBoardManagerService({ onVisitCompleted });

    svc.handleStateSnapshot({
      connected: true,
      running: true,
      status: 'takeout',
      throws: [
        { segmentName: 'T20', segmentNumber: 20, multiplier: 3 },
        { segmentName: 'T20', segmentNumber: 20, multiplier: 3 },
        { segmentName: 'T20', segmentNumber: 20, multiplier: 3 },
      ],
    });

    // Multiple varying empty snapshots after pullout
    svc.handleStateSnapshot({
      connected: true,
      running: true,
      status: 'takeout',
      event: 'takeoutFinished',
      throws: [],
    });
    svc.handleStateSnapshot({
      connected: true,
      running: true,
      status: 'throw',
      event: 'ready',
      throws: [],
    });
    svc.handleStateSnapshot({
      connected: true,
      running: true,
      status: 'waiting',
      event: 'idle',
      throws: [],
    });

    expect(onVisitCompleted).toHaveBeenCalledTimes(1);
    expect((onVisitCompleted.mock.calls[0][0] as DartThrow[]).reduce((s, d) => s + d.score, 0)).toBe(180);
  });

  it('never throws on null snapshots or null entries inside throws', () => {
    const onVisitSync = vi.fn();
    const svc = new LocalBoardManagerService({ onVisitSync });

    expect(() =>
      svc.handleStateSnapshot(null as unknown as BoardManagerStatePayload)
    ).not.toThrow();

    expect(() =>
      svc.handleStateSnapshot({
        connected: true,
        running: true,
        status: 'throw',
        throws: [null as unknown as BoardManagerRawThrow],
      })
    ).not.toThrow();

    expect(onVisitSync).toHaveBeenCalledTimes(1);
    expect(onVisitSync.mock.calls[0][0]).toEqual([]);
  });
});

describe('resolveBoardHttpUrl & resolveBoardWsUrl', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      Object.defineProperty(globalThis, 'window', {
        value: originalWindow,
        configurable: true,
        writable: true,
      });
    }
  });

  it('rewrites local port 3180 HTTP URLs to same-origin /api/board paths', () => {
    expect(resolveBoardHttpUrl()).toBe('/api/board/api/state');
    expect(resolveBoardHttpUrl('http://127.0.0.1:3180/api/state')).toBe('/api/board/api/state');
    expect(resolveBoardHttpUrl('http://localhost:3180/api/state?raw=1')).toBe(
      '/api/board/api/state?raw=1'
    );
    expect(resolveBoardHttpUrl('/api/board/api/custom')).toBe('/api/board/api/custom');
    expect(resolveBoardHttpUrl('http://192.168.1.50:3180/api/state')).toBe(
      'http://192.168.1.50:3180/api/state'
    );
  });

  it('rewrites local port 3180 WS URLs to same-origin /api/board WebSocket URLs', () => {
    // Node fallback (window undefined)
    delete (globalThis as { window?: unknown }).window;
    expect(resolveBoardWsUrl('ws://127.0.0.1:3180/api/events')).toBe(
      'ws://127.0.0.1:5173/api/board/api/events'
    );
    expect(resolveBoardWsUrl('ws://localhost:3180/api/events?v=2')).toBe(
      'ws://127.0.0.1:5173/api/board/api/events?v=2'
    );

    // Browser HTTPS same-origin resolution
    Object.defineProperty(globalThis, 'window', {
      value: { location: { protocol: 'https:', host: 'kiosk.local:5173' } },
      configurable: true,
      writable: true,
    });
    expect(resolveBoardWsUrl('ws://127.0.0.1:3180/api/events')).toBe(
      'wss://kiosk.local:5173/api/board/api/events'
    );
    expect(resolveBoardWsUrl('/api/board/api/events')).toBe(
      'wss://kiosk.local:5173/api/board/api/events'
    );
    expect(resolveBoardWsUrl('ws://10.0.0.25:3180/api/events')).toBe(
      'ws://10.0.0.25:3180/api/events'
    );
  });
});

describe('gameEventBus.processVisitSync & processVisitCompleted', () => {
  afterEach(() => {
    gameEventBus.resetVisitBuffer([]);
  });

  it('emits dart_thrown for Dart 1, Dart 2, Dart 3, dart_corrected on mid-visit removal, and visit_completed on takeout', () => {
    const events: GameBoardEvent[] = [];
    const unsubscribe = gameEventBus.subscribe((ev) => events.push(ev));

    try {
      gameEventBus.resetVisitBuffer([]);
      const d1 = makeThrow('T20', 20, 3, 60, 'Triple', 0);
      const d2 = makeThrow('D16', 16, 2, 32, 'Double', 1);
      const d3 = makeThrow('S5', 5, 1, 5, 'Single', 2);

      // Dart 1
      gameEventBus.processVisitSync([d1], 'throw');
      // Dart 2
      gameEventBus.processVisitSync([d1, d2], 'throw');
      // Mid-visit dart removal: [D1, D2] -> [D1]
      gameEventBus.processVisitSync([d1], 'throw');
      // Re-throw Dart 2 and Dart 3
      gameEventBus.processVisitSync([d1, d2], 'throw');
      gameEventBus.processVisitSync([d1, d2, d3], 'takeout');

      // Takeout completes visit
      gameEventBus.processVisitCompleted([d1, d2, d3]);
      gameEventBus.processVisitSync([], 'throw', 'takeoutFinished');

      const dartThrown = events.filter((e) => e.type === 'dart_thrown');
      expect(dartThrown).toHaveLength(4);
      expect(dartThrown.map((e) => e.dartIndex)).toEqual([0, 1, 1, 2]);
      expect(dartThrown[0].dart.segment.name).toBe('T20');
      expect(dartThrown[1].dart.segment.name).toBe('D16');
      expect(dartThrown[3].dart.segment.name).toBe('S5');

      const dartCorrected = events.filter((e) => e.type === 'dart_corrected');
      expect(dartCorrected).toHaveLength(1);
      expect(dartCorrected[0].visitThrows).toHaveLength(1);
      expect(dartCorrected[0].visitThrows[0].segment.name).toBe('T20');
      expect(dartCorrected[0].previousDart.segment.name).toBe('D16');

      const visitCompleted = events.filter((e) => e.type === 'visit_completed');
      expect(visitCompleted).toHaveLength(1);
      expect(visitCompleted[0].throws).toHaveLength(3);
      expect(visitCompleted[0].totalScore).toBe(97);
    } finally {
      unsubscribe();
    }
  });
});
