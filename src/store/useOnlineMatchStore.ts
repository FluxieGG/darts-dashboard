import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DartThrow } from '../types/darts';
import { isDouble } from '../games/utils/dartHelpers';
import { usePlayerStore } from './usePlayerStore';

export type OnlineStartScore = 501 | 301 | 701;
export type OnlineOutRule = 'double' | 'straight';

interface OnlineMatchUndoSnapshot {
  remaining: number;
  turnStartRemaining: number;
  dartsInLeg: number;
  legPointsScored: number;
  playerLegs: number;
  opponentLegs: number;
  isBust: boolean;
}

export interface OnlineMatchStartOptions {
  startScore?: OnlineStartScore;
  outRule?: OnlineOutRule;
  legsToWin?: number;
  opponentName?: string;
}

export interface OnlineMatchDartOutcome {
  kind: 'scored' | 'bust' | 'leg_won' | 'match_won';
  score: number;
  remainingAfter: number;
  dartsInLeg: number;
  legThreeDartAvg: number;
}

interface OnlineMatchState {
  isActive: boolean;
  startScore: OnlineStartScore;
  outRule: OnlineOutRule;
  legsToWin: number;
  opponentName: string;
  playerLegs: number;
  opponentLegs: number;
  remaining: number;
  turnStartRemaining: number;
  dartsInLeg: number;
  legPointsScored: number;
  visitDartsCount: number;
  isBust: boolean;
  lastBanner: string | null;
  matchWinner: 'player' | 'opponent' | null;
  history: OnlineMatchUndoSnapshot[];

  // Actions
  startMatch: (opts?: OnlineMatchStartOptions) => void;
  stopMatch: () => void;
  applyDart: (dart: DartThrow) => OnlineMatchDartOutcome | null;
  replayVisitCorrection: (visitThrows: DartThrow[]) => void;
  commitVisitTakeout: () => void;
  setRemainingManual: (nextRemaining: number) => void;
  recordOpponentWonLeg: () => void;
  resetCurrentLeg: () => void;
  undoLastDart: () => void;
  clearBanner: () => void;
}

export const useOnlineMatchStore = create<OnlineMatchState>()(
  persist(
    (set, get) => ({
      isActive: false,
      startScore: 501,
      outRule: 'double',
      legsToWin: 3,
      opponentName: 'Online Opponent',
      playerLegs: 0,
      opponentLegs: 0,
      remaining: 501,
      turnStartRemaining: 501,
      dartsInLeg: 0,
      legPointsScored: 0,
      visitDartsCount: 0,
      isBust: false,
      lastBanner: null,
      matchWinner: null,
      history: [],

      startMatch: (opts) => {
        const startScore = opts?.startScore ?? get().startScore ?? 501;
        const outRule = opts?.outRule ?? get().outRule ?? 'double';
        const legsToWin = opts?.legsToWin ?? get().legsToWin ?? 3;
        const opponentName = opts?.opponentName?.trim() || 'Online Opponent';

        set({
          isActive: true,
          startScore,
          outRule,
          legsToWin,
          opponentName,
          playerLegs: 0,
          opponentLegs: 0,
          remaining: startScore,
          turnStartRemaining: startScore,
          dartsInLeg: 0,
          legPointsScored: 0,
          visitDartsCount: 0,
          isBust: false,
          lastBanner: null,
          matchWinner: null,
          history: [],
        });
      },

      stopMatch: () => {
        set({
          isActive: false,
          isBust: false,
          lastBanner: null,
          matchWinner: null,
          history: [],
        });
      },

      applyDart: (dart) => {
        const s = get();
        if (!s.isActive || s.matchWinner || s.isBust) return null;

        const snap: OnlineMatchUndoSnapshot = {
          remaining: s.remaining,
          turnStartRemaining: s.turnStartRemaining,
          dartsInLeg: s.dartsInLeg,
          legPointsScored: s.legPointsScored,
          playerLegs: s.playerLegs,
          opponentLegs: s.opponentLegs,
          isBust: s.isBust,
        };

        const pts = dart.bouncer ? 0 : dart.score;
        const after = s.remaining - pts;
        const nextDartsInLeg = s.dartsInLeg + 1;
        const nextVisitCount = s.visitDartsCount + 1;

        // 1. Check valid checkout
        const validOut = s.outRule === 'straight' ? true : isDouble(dart);
        if (after === 0 && validOut) {
          const totalLegPts = s.startScore;
          const legAvg = nextDartsInLeg > 0 ? (totalLegPts / nextDartsInLeg) * 3 : 0;
          const nextPlayerLegs = s.playerLegs + 1;
          const wonMatch = s.legsToWin > 0 && nextPlayerLegs >= s.legsToWin;

          set({
            playerLegs: nextPlayerLegs,
            remaining: wonMatch ? 0 : s.startScore,
            turnStartRemaining: wonMatch ? 0 : s.startScore,
            dartsInLeg: wonMatch ? nextDartsInLeg : 0,
            legPointsScored: wonMatch ? totalLegPts : 0,
            visitDartsCount: 0,
            isBust: false,
            matchWinner: wonMatch ? 'player' : null,
            lastBanner: wonMatch
              ? `GAME SHOT & MATCH! (${dart.segment.name} in ${nextDartsInLeg} darts)`
              : `LEG SHOT! ${dart.segment.name} (${nextDartsInLeg} darts • ${legAvg.toFixed(1)} 3DA)`,
            history: [...s.history.slice(-29), snap],
          });

          return {
            kind: wonMatch ? 'match_won' : 'leg_won',
            score: pts,
            remainingAfter: 0,
            dartsInLeg: nextDartsInLeg,
            legThreeDartAvg: legAvg,
          };
        }

        // 2. Check Bust
        const isBust =
          after < 0 || (s.outRule === 'double' && (after === 1 || after === 0));
        if (isBust) {
          set({
            remaining: s.turnStartRemaining,
            dartsInLeg: nextDartsInLeg,
            visitDartsCount: nextVisitCount,
            isBust: true,
            lastBanner: `BUST! Score remains ${s.turnStartRemaining}`,
            history: [...s.history.slice(-29), snap],
          });

          return {
            kind: 'bust',
            score: 0,
            remainingAfter: s.turnStartRemaining,
            dartsInLeg: nextDartsInLeg,
            legThreeDartAvg:
              nextDartsInLeg > 0 ? (s.legPointsScored / nextDartsInLeg) * 3 : 0,
          };
        }

        // 3. Normal score
        const nextPoints = s.legPointsScored + pts;
        set({
          remaining: after,
          dartsInLeg: nextDartsInLeg,
          legPointsScored: nextPoints,
          visitDartsCount: nextVisitCount,
          isBust: false,
          lastBanner: null,
          history: [...s.history.slice(-29), snap],
        });

        return {
          kind: 'scored',
          score: pts,
          remainingAfter: after,
          dartsInLeg: nextDartsInLeg,
          legThreeDartAvg: nextDartsInLeg > 0 ? (nextPoints / nextDartsInLeg) * 3 : 0,
        };
      },

      replayVisitCorrection: (visitThrows) => {
        const s = get();
        if (!s.isActive || s.matchWinner) return;

        let rem = s.turnStartRemaining;
        let busted = false;
        const baseDarts = Math.max(0, s.dartsInLeg - s.visitDartsCount);
        const basePts = s.startScore - s.turnStartRemaining;

        for (const dart of visitThrows) {
          if (busted) break;
          const pts = dart.bouncer ? 0 : dart.score;
          const after = rem - pts;
          const validOut = s.outRule === 'straight' ? true : isDouble(dart);
          if (after === 0 && validOut) {
            rem = 0;
            break;
          }
          if (after < 0 || (s.outRule === 'double' && (after === 1 || after === 0))) {
            rem = s.turnStartRemaining;
            busted = true;
            break;
          }
          rem = after;
        }

        set({
          remaining: rem,
          dartsInLeg: baseDarts + visitThrows.length,
          legPointsScored: busted ? basePts : s.startScore - rem,
          visitDartsCount: visitThrows.length,
          isBust: busted,
          lastBanner: busted ? `BUST! Score remains ${s.turnStartRemaining}` : null,
        });
      },

      commitVisitTakeout: () => {
        const s = get();
        if (!s.isActive || s.matchWinner) return;
        set({
          turnStartRemaining: s.remaining,
          visitDartsCount: 0,
          isBust: false,
        });
      },

      setRemainingManual: (nextRemaining) => {
        const s = get();
        if (!s.isActive) return;
        const clamped = Math.max(2, Math.min(s.startScore, Math.round(nextRemaining)));
        set({
          remaining: clamped,
          turnStartRemaining: clamped,
          legPointsScored: Math.max(0, s.startScore - clamped),
          visitDartsCount: 0,
          isBust: false,
          lastBanner: null,
        });
      },

      recordOpponentWonLeg: () => {
        const s = get();
        if (!s.isActive || s.matchWinner) return;
        const nextOpp = s.opponentLegs + 1;
        const oppWonMatch = s.legsToWin > 0 && nextOpp >= s.legsToWin;
        set({
          opponentLegs: nextOpp,
          remaining: s.startScore,
          turnStartRemaining: s.startScore,
          dartsInLeg: 0,
          legPointsScored: 0,
          visitDartsCount: 0,
          isBust: false,
          matchWinner: oppWonMatch ? 'opponent' : null,
          lastBanner: oppWonMatch
            ? `${s.opponentName} wins match ${nextOpp}–${s.playerLegs}`
            : `${s.opponentName} took the leg • New ${s.startScore} leg ready`,
        });
      },

      resetCurrentLeg: () => {
        const s = get();
        if (!s.isActive) return;
        set({
          remaining: s.startScore,
          turnStartRemaining: s.startScore,
          dartsInLeg: 0,
          legPointsScored: 0,
          visitDartsCount: 0,
          isBust: false,
          matchWinner: null,
          lastBanner: null,
        });
      },

      undoLastDart: () => {
        const s = get();
        if (!s.isActive || s.history.length === 0) return;
        const prev = s.history[s.history.length - 1];
        set({
          ...prev,
          visitDartsCount: Math.max(0, s.visitDartsCount - 1),
          matchWinner: null,
          lastBanner: null,
          history: s.history.slice(0, -1),
        });
      },

      clearBanner: () => set({ lastBanner: null }),
    }),
    {
      name: 'autodarts_online_match_v1',
      storage: createJSONStorage(() => ({
        getItem: (name) => localStorage.getItem(name),
        setItem: (name, value) => {
          // Never overwrite persisted online match state during Party Mode
          if (usePlayerStore.getState().isPartyMode) return;
          localStorage.setItem(name, value);
        },
        removeItem: (name) => localStorage.removeItem(name),
      })),
      partialize: (s) => ({
        isActive: s.isActive,
        startScore: s.startScore,
        outRule: s.outRule,
        legsToWin: s.legsToWin,
        opponentName: s.opponentName,
        playerLegs: s.playerLegs,
        opponentLegs: s.opponentLegs,
        remaining: s.remaining,
        turnStartRemaining: s.turnStartRemaining,
        dartsInLeg: s.dartsInLeg,
        legPointsScored: s.legPointsScored,
      }),
    }
  )
);
