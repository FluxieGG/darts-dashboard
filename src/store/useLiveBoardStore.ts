import { create } from 'zustand';
import { DartThrow, DartVisit } from '../types/darts';
import { SegmentAccuracyItem } from '../types/stats';
import { usePlayerStore } from './usePlayerStore';
import { useGameStore } from './useGameStore';
import { useCareerStore } from './useCareerStore';
import { gameEventBus } from '../services/gameEventBus';

interface LiveBoardState {
  // Authoritative live visit throws currently in the board (0 to 3 darts)
  currentVisitThrows: DartThrow[];
  visitScore: number;
  isBust: boolean;
  boardStatus: string; // e.g. 'throw', 'takeout', 'stopped', 'demo'
  boardEvent: string;
  totalVisitsInSession: number;
  lastDartLandedAt: number | null;
  lastCompletedVisit: DartVisit | null;
  // Prevents stale darts physically in the board during a Party Mode switch from committing
  suppressUntilBoardEmpty: boolean;

  // Authoritative sync from Autodarts Desktop (Local Board Manager)
  syncBoardThrows: (throws: DartThrow[], status?: string, event?: string) => void;

  // Demo mode actions
  addSimulatedDart: (dart: DartThrow) => void;
  clearCurrentVisit: () => void;

  // Cleanly clears active board display and discards any in-progress visit when toggling Party Mode
  resetBoardForModeSwitch: () => void;

  // Commit a finished visit into permanent player stats
  completeVisit: (explicitThrows?: DartThrow[]) => void;
}

/**
 * Update target precision accuracy counters based on real thrown darts
 */
function updateSegmentAccuracy(
  current: SegmentAccuracyItem[],
  newThrows: DartThrow[]
): SegmentAccuracyItem[] {
  const updated = current.map((item) => ({ ...item }));

  for (const dart of newThrows) {
    const segName = dart.segment.name.toUpperCase();
    const num = dart.segment.number;

    for (const item of updated) {
      const target = item.segment.toUpperCase();
      if (target === 'BULL') {
        if (segName === 'BULL' || segName === '25' || num === 25 || num === 50) {
          item.attempts += 1;
          if (segName === 'BULL' || dart.score === 50) {
            item.hits += 1;
          }
        }
      } else if (target.startsWith('T')) {
        const targetNum = parseInt(target.slice(1), 10);
        if (num === targetNum) {
          item.attempts += 1;
          if (dart.segment.multiplier === 3) {
            item.hits += 1;
          }
        }
      } else if (target.startsWith('D')) {
        const targetNum = parseInt(target.slice(1), 10);
        if (num === targetNum && dart.segment.multiplier === 2) {
          item.attempts += 1;
          item.hits += 1;
        } else if (num === targetNum && dart.segment.bed === 'SingleOuter') {
          item.attempts += 1;
        }
      }
      item.pct = item.attempts > 0 ? (item.hits / item.attempts) * 100 : 0;
    }
  }

  return updated;
}

export const useLiveBoardStore = create<LiveBoardState>((set, get) => ({
  currentVisitThrows: [],
  visitScore: 0,
  isBust: false,
  boardStatus: 'waiting',
  boardEvent: '',
  totalVisitsInSession: 0,
  lastDartLandedAt: null,
  lastCompletedVisit: null,
  suppressUntilBoardEmpty: false,

  /**
   * Authoritatively mirror the exact throws array reported by Autodarts Desktop.
   * Never auto-clears while darts are still in the board (e.g., during 'takeout').
   */
  syncBoardThrows: (throws: DartThrow[], status?: string, event?: string) => {
    // If we just toggled Party Mode while darts were sitting in the board,
    // wait until the board is cleared before tracking the next fresh visit.
    if (get().suppressUntilBoardEmpty) {
      if (throws.length === 0) {
        set({
          suppressUntilBoardEmpty: false,
          currentVisitThrows: [],
          visitScore: 0,
          boardStatus: status || 'waiting',
          boardEvent: event || '',
        });
        gameEventBus.resetVisitBuffer([]);
      }
      return;
    }

    const visitScore = throws.reduce((sum, d) => sum + d.score, 0);
    set({
      currentVisitThrows: throws,
      visitScore,
      boardStatus: status || (throws.length > 0 ? 'throw' : 'waiting'),
      boardEvent: event || '',
      lastDartLandedAt: throws.length > 0 ? Date.now() : get().lastDartLandedAt,
    });
    gameEventBus.processVisitSync(throws, status, event);
  },

  /**
   * Demo-mode only helper: appends one simulated dart and commits on dart 3
   */
  addSimulatedDart: (dart: DartThrow) => {
    if (get().suppressUntilBoardEmpty) {
      set({ suppressUntilBoardEmpty: false });
    }
    const current = get().currentVisitThrows;
    if (current.length >= 3) {
      get().completeVisit(current);
    }

    const updated = [...get().currentVisitThrows, dart];
    const visitScore = updated.reduce((sum, d) => sum + d.score, 0);
    const nextStatus = updated.length === 3 ? 'takeout' : 'throw';

    set({
      currentVisitThrows: updated,
      visitScore,
      boardStatus: nextStatus,
      lastDartLandedAt: Date.now(),
    });
    gameEventBus.processVisitSync(updated, nextStatus, 'demo_throw');

    if (updated.length === 3) {
      setTimeout(() => {
        const latest = get().currentVisitThrows;
        if (latest === updated) {
          get().completeVisit(updated);
        }
      }, 1200);
    }
  },

  clearCurrentVisit: () => {
    gameEventBus.resetVisitBuffer([]);
    set({
      currentVisitThrows: [],
      visitScore: 0,
      isBust: false,
    });
  },

  /**
   * Discards any current visit in the board and waits for the next fresh visit.
   * Used when entering or exiting Party Mode so zero throws leak across profiles.
   */
  resetBoardForModeSwitch: () => {
    const hadDartsInBoard = get().currentVisitThrows.length > 0;
    gameEventBus.resetVisitBuffer([]);
    set({
      currentVisitThrows: [],
      visitScore: 0,
      isBust: false,
      boardStatus: 'waiting',
      lastCompletedVisit: null,
      suppressUntilBoardEmpty: hadDartsInBoard,
    });
  },

  /**
   * Finalizes a completed visit (when darts are pulled from the board) and updates
   * active player stats from the exact authoritative throws.
   * Note: When an Arcade Game is actively playing, throws are forwarded to the game socket
   * without skewing personal practice 3DA stats.
   */
  completeVisit: (explicitThrows) => {
    // Discard stale visit if darts were already in the board when Party Mode was toggled
    if (get().suppressUntilBoardEmpty) {
      set({
        suppressUntilBoardEmpty: false,
        currentVisitThrows: [],
        visitScore: 0,
        isBust: false,
      });
      return;
    }

    const throwsToCommit = explicitThrows || get().currentVisitThrows;
    if (throwsToCommit.length === 0) return;

    const totalScore = throwsToCommit.reduce((sum, d) => sum + d.score, 0);
    const activePlayerId = usePlayerStore.getState().getActivePlayer().id;

    // Assign unique IDs for permanent session log storage
    const timestamp = Date.now();
    const committedThrows = throwsToCommit.map((d, i) => ({
      ...d,
      id: `${d.id}-${timestamp}-${i}`,
      timestamp,
    }));

    // Notify any mounted modular game that darts have been pulled (takeout finished)
    gameEventBus.processVisitCompleted(committedThrows);

    // If an arcade game is currently active, clear visit state without mutating practice 3DA stats
    const gameState = useGameStore.getState();
    if (gameState.activeView === 'game-active' && gameState.matchPhase === 'playing') {
      set({
        currentVisitThrows: [],
        visitScore: 0,
        isBust: false,
      });
      return;
    }

    const existingVisitsCount =
      usePlayerStore.getState().getActiveStats().tonBreakdown.totalVisits;
    const visitNumber = existingVisitsCount + 1;

    const visit: DartVisit = {
      id: `visit-${timestamp}`,
      visitNumber,
      playerId: activePlayerId,
      throws: committedThrows,
      totalScore,
      isCompleted: true,
      isBust: false,
      timestamp,
    };

    set({
      currentVisitThrows: [],
      visitScore: 0,
      isBust: false,
      totalVisitsInSession: visitNumber,
      lastCompletedVisit: visit,
    });

    // Update all player stats cleanly from real logged darts
    usePlayerStore.getState().updateActiveStats((prev) => {
      const allSessionThrows = [...committedThrows, ...prev.sessionThrows];
      const newTotalDarts = prev.totalDartsThrown + committedThrows.length;
      const totalPoints = allSessionThrows.reduce((acc, t) => acc + t.score, 0);

      const new3DA = newTotalDarts > 0 ? (totalPoints / newTotalDarts) * 3 : 0;

      // First 9 darts average (chronologically first 9 darts of the session are at the tail)
      const firstNineDarts = allSessionThrows.slice(-9);
      const firstNinePoints = firstNineDarts.reduce((acc, t) => acc + t.score, 0);
      const newFirstNineAvg =
        firstNineDarts.length > 0 ? (firstNinePoints / firstNineDarts.length) * 3 : 0;

      const newTonBreakdown = { ...prev.tonBreakdown };
      newTonBreakdown.totalVisits += 1;
      if (totalScore === 180) newTonBreakdown.ton180 += 1;
      else if (totalScore >= 140) newTonBreakdown.ton140Plus += 1;
      else if (totalScore >= 100) newTonBreakdown.ton100Plus += 1;
      else if (totalScore >= 60) newTonBreakdown.ton60Plus += 1;

      const highestVisit = Math.max(prev.highestVisit, totalScore);

      const updatedAccuracy = updateSegmentAccuracy(prev.segmentAccuracy, committedThrows);

      const newTrendPoint = {
        id: `trend-${timestamp}`,
        label: `Visit #${visitNumber}`,
        date: `V${visitNumber}`,
        threeDartAvg: parseFloat(new3DA.toFixed(2)),
        firstNineAvg: parseFloat(newFirstNineAvg.toFixed(2)),
        visitCount: visitNumber,
      };
      const updatedTrend = [...prev.trendHistory, newTrendPoint].slice(-25);

      const updatedRecentVisits = [visit, ...(prev.recentVisits || [])].slice(0, 30);

      return {
        ...prev,
        threeDartAvg: parseFloat(new3DA.toFixed(2)),
        allTimeAvg: prev.allTimeAvg > 0 ? prev.allTimeAvg : parseFloat(new3DA.toFixed(2)),
        firstNineAvg: parseFloat(newFirstNineAvg.toFixed(2)),
        highestVisit,
        tonBreakdown: newTonBreakdown,
        segmentAccuracy: updatedAccuracy,
        trendHistory: updatedTrend,
        recentVisits: updatedRecentVisits,
        sessionThrows: allSessionThrows,
        totalDartsThrown: newTotalDarts,
      };
    });

    // Persist visit to Local Career Vault (automatically skips Party Mode & unsaved guests)
    useCareerStore.getState().recordVisitForActivePlayer(committedThrows);
  },
}));
