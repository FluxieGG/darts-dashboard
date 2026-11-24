import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_PLAYER_STATS, usePlayerStore } from '../store/usePlayerStore';
import { useLiveBoardStore } from '../store/useLiveBoardStore';
import { EMPTY_PLAYER_VAULT, useCareerStore } from '../store/useCareerStore';
import { useGameStore } from '../store/useGameStore';
import { safeLocalStorage } from '../lib/storage';
import { DartThrow } from '../types/darts';

interface MockStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

function createMemoryStorage(): MockStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
  };
}

function installMockWindow(storage: MockStorage = createMemoryStorage()): void {
  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: storage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    configurable: true,
    writable: true,
  });
}

function makeDart(score: number, name: string, number: number, multiplier: number, idx: number): DartThrow {
  const bed: DartThrow['segment']['bed'] =
    multiplier === 3 ? 'Triple' : multiplier === 2 ? 'Double' : multiplier === 0 ? 'Outside' : 'Single';
  return {
    id: `store-dart-${idx}-${name}`,
    visitDartIndex: idx,
    segment: { name, number, bed, multiplier },
    score,
    timestamp: 1_700_000_000_000,
  };
}

describe('stores and persistence regression suite', () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    installMockWindow();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, savedAt: Date.now() }),
    }) as unknown as typeof fetch;

    // Reset stores cleanly
    useGameStore.setState({ activeView: 'dashboard', matchPhase: 'setup' });
    usePlayerStore.getState().stopPartyMode();
    usePlayerStore.setState({
      activePlayerId: 'player-callum',
      players: [
        {
          id: 'player-callum',
          name: 'Callum',
          isPrimary: true,
          isSaved: true,
          dartColor: '#10B981',
          dartColorName: 'Emerald',
        },
      ],
      playerStats: {},
    });
    usePlayerStore.getState().updateActiveStats((prev) => prev);
    usePlayerStore.getState().resetSessionStats('player-callum');
    useLiveBoardStore.getState().clearCurrentVisit();
    useCareerStore.setState({
      vault: { version: 1, players: {}, updatedAt: 0 },
      partyVaults: {},
      partyLeaderboards: {},
      recentlyCompletedObjective: null,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
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

  describe('usePlayerStore', () => {
    it('returns referentially identical EMPTY_PLAYER_STATS when active player stats entry is missing', () => {
      usePlayerStore.setState({
        activePlayerId: 'missing-stats-player',
        playerStats: {},
      });

      const first = usePlayerStore.getState().getActiveStats();
      const second = usePlayerStore.getState().getActiveStats();

      expect(Object.is(first, EMPTY_PLAYER_STATS)).toBe(true);
      expect(Object.is(first, second)).toBe(true);
      expect(Object.isFrozen(EMPTY_PLAYER_STATS)).toBe(true);
    });

    it('returns valid PRIMARY_PLAYER fallback from getActivePlayer even when players is empty', () => {
      usePlayerStore.setState({
        activePlayerId: 'non-existent',
        players: [],
      });

      const fallback = usePlayerStore.getState().getActivePlayer();
      expect(fallback).toBeDefined();
      expect(fallback.id).toBe('player-callum');
      expect(fallback.name).toBe('Callum');
      expect(fallback.isPrimary).toBe(true);
    });
  });

  describe('useLiveBoardStore', () => {
    it('caps sessionThrows at 200 across 250 darts while keeping totalDartsThrown, totalPointsScored, 3DA, and First 9 Avg mathematically exact', () => {
      const liveStore = useLiveBoardStore.getState();

      // First 3 visits (9 darts): 3 x T20 (180), 3 x S20 (60), 3 x D16 (96) -> 336 pts in first 9 darts -> 112.00 First 9 Avg
      const firstThreeVisits: DartThrow[][] = [
        [makeDart(60, 'T20', 20, 3, 0), makeDart(60, 'T20', 20, 3, 1), makeDart(60, 'T20', 20, 3, 2)],
        [makeDart(20, 'S20', 20, 1, 0), makeDart(20, 'S20', 20, 1, 1), makeDart(20, 'S20', 20, 1, 2)],
        [makeDart(32, 'D16', 16, 2, 0), makeDart(32, 'D16', 16, 2, 1), makeDart(32, 'D16', 16, 2, 2)],
      ];

      let expectedTotalPoints = 0;
      let expectedTotalDarts = 0;
      let expectedFirstNinePoints = 0;

      for (const visit of firstThreeVisits) {
        liveStore.completeVisit(visit);
        const pts = visit.reduce((sum, d) => sum + d.score, 0);
        expectedTotalPoints += pts;
        expectedFirstNinePoints += pts;
        expectedTotalDarts += visit.length;
      }

      // Next 80 visits of 3 darts (240 darts) with lower scores (S5 + S10 + S15 = 30 per visit)
      for (let v = 0; v < 80; v++) {
        const visit = [
          makeDart(5, 'S5', 5, 1, 0),
          makeDart(10, 'S10', 10, 1, 1),
          makeDart(15, 'S15', 15, 1, 2),
        ];
        liveStore.completeVisit(visit);
        expectedTotalPoints += 30;
        expectedTotalDarts += 3;
      }

      // Final 84th visit of 1 dart (S19 = 19 pts) -> exactly 250 total darts!
      liveStore.completeVisit([makeDart(19, 'S19', 19, 1, 0)]);
      expectedTotalPoints += 19;
      expectedTotalDarts += 1;

      expect(expectedTotalDarts).toBe(250);

      const stats = usePlayerStore.getState().getActiveStats();
      expect(stats.sessionThrows).toHaveLength(200);
      expect(stats.totalDartsThrown).toBe(250);
      expect(stats.totalPointsScored).toBe(expectedTotalPoints);
      expect(stats.firstNineDartsCount).toBe(9);
      expect(stats.firstNinePoints).toBe(expectedFirstNinePoints);

      const expected3DA = parseFloat(((expectedTotalPoints / 250) * 3).toFixed(2));
      const expectedFirst9Avg = parseFloat(((expectedFirstNinePoints / 9) * 3).toFixed(2));

      expect(stats.threeDartAvg).toBe(expected3DA);
      expect(stats.firstNineAvg).toBe(expectedFirst9Avg);
    });
  });

  describe('useCareerStore', () => {
    it('returns referentially identical frozen EMPTY_PLAYER_VAULT for non-existent player IDs', () => {
      const v1 = useCareerStore.getState().getPlayerVault('non-existent-id');
      const v2 = useCareerStore.getState().getPlayerVault('non-existent-id');

      expect(Object.is(v1, EMPTY_PLAYER_VAULT)).toBe(true);
      expect(Object.is(v1, v2)).toBe(true);
      expect(Object.isFrozen(EMPTY_PLAYER_VAULT)).toBe(true);
      expect(Object.isFrozen(EMPTY_PLAYER_VAULT.records)).toBe(true);

      // Also verify stability in Party Mode
      usePlayerStore.getState().startPartyMode();
      const pv1 = useCareerStore.getState().getPlayerVault('non-existent-party-id');
      const pv2 = useCareerStore.getState().getPlayerVault('non-existent-party-id');
      expect(Object.is(pv1, EMPTY_PLAYER_VAULT)).toBe(true);
      expect(Object.is(pv1, pv2)).toBe(true);
    });
  });

  describe('safeLocalStorage', () => {
    it('catches QuotaExceededError on setItem and security/read errors on getItem without throwing', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const quotaErr = new Error('Storage quota exceeded');
      quotaErr.name = 'QuotaExceededError';

      installMockWindow({
        getItem: () => {
          throw new Error('SecurityError: storage blocked');
        },
        setItem: () => {
          throw quotaErr;
        },
        removeItem: () => {
          throw new Error('Remove blocked');
        },
        clear: () => {},
      });

      expect(() => safeLocalStorage.setItem('test_key', 'payload')).not.toThrow();
      expect(() => safeLocalStorage.getItem('test_key')).not.toThrow();
      expect(safeLocalStorage.getItem('test_key')).toBeNull();
      expect(() => safeLocalStorage.removeItem('test_key')).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();
    });

    it('reads, writes, and removes normally when storage is available and returns null when window is undefined', () => {
      installMockWindow(createMemoryStorage());
      safeLocalStorage.setItem('k', 'v');
      expect(safeLocalStorage.getItem('k')).toBe('v');
      safeLocalStorage.removeItem('k');
      expect(safeLocalStorage.getItem('k')).toBeNull();

      delete (globalThis as { window?: unknown }).window;
      expect(safeLocalStorage.getItem('k')).toBeNull();
      expect(() => safeLocalStorage.setItem('k', 'v')).not.toThrow();
      expect(() => safeLocalStorage.removeItem('k')).not.toThrow();
    });
  });
});
