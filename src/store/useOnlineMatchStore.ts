import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DartThrow } from '../types/darts';
import {
  DartCounterBridgeMode,
  DartCounterLiveMatchState,
  DartCounterPendingInvite,
  DartCounterPendingVisit,
} from '../types/dartCounter';
import { isDouble } from '../games/utils/dartHelpers';
import { usePlayerStore } from './usePlayerStore';

export type OnlineStartScore = 501 | 301 | 701;
export type OnlineOutRule = 'double' | 'straight';
export type OnlineMatchSource = 'manual' | 'dartcounter';

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
  source: OnlineMatchSource;
  startScore: OnlineStartScore;
  outRule: OnlineOutRule;
  legsToWin: number;
  opponentName: string;
  opponentRemaining: number | null;
  opponentAvg: number | null;
  isPlayerTurn: boolean;
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

  // Target DartCounter Chrome/Edge Extension Bridge State
  dcConnected: boolean;
  dcMode: DartCounterBridgeMode;
  dcPendingVisit: DartCounterPendingVisit | null;
  dcLastSubmitStatus: string | null;
  dcLastControlStatus: string | null;
  dcPendingInvites: DartCounterPendingInvite[];
  /** Dedicated full-screen Demolition-style 501 broadcast arena on the vertical Kiosk TV */
  isFullscreenKiosk: boolean;

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
  setFullscreenKiosk: (enabled: boolean) => void;
  toggleFullscreenKiosk: () => void;

  // DartCounter Bridge Actions
  setDartCounterConnected: (connected: boolean) => void;
  setDartCounterMode: (mode: DartCounterBridgeMode) => void;
  setDartCounterPendingVisit: (visit: DartCounterPendingVisit | null) => void;
  setDartCounterLastSubmit: (msg: string | null) => void;
  setDartCounterControlStatus: (msg: string | null) => void;
  syncFromDartCounter: (dc: DartCounterLiveMatchState) => void;
}

export const useOnlineMatchStore = create<OnlineMatchState>()(
  persist(
    (set, get) => ({
      isActive: false,
      source: 'manual',
      startScore: 501,
      outRule: 'double',
      legsToWin: 3,
      opponentName: 'Online Opponent',
      opponentRemaining: null,
      opponentAvg: null,
      isPlayerTurn: true,
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

      dcConnected: false,
      dcMode: 'auto',
      dcPendingVisit: null,
      dcLastSubmitStatus: null,
      dcLastControlStatus: null,
      dcPendingInvites: [],
      isFullscreenKiosk: false,

      startMatch: (opts) => {
        const startScore = opts?.startScore ?? get().startScore ?? 501;
        const outRule = opts?.outRule ?? get().outRule ?? 'double';
        const legsToWin = opts?.legsToWin ?? get().legsToWin ?? 3;
        const opponentName = opts?.opponentName?.trim() || 'Online Opponent';

        set({
          isActive: true,
          source: 'manual',
          startScore,
          outRule,
          legsToWin,
          opponentName,
          opponentRemaining: null,
          opponentAvg: null,
          isPlayerTurn: true,
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
          dcPendingVisit: null,
        });
      },

      stopMatch: () => {
        set({
          isActive: false,
          source: 'manual',
          opponentRemaining: null,
          opponentAvg: null,
          isPlayerTurn: true,
          isBust: false,
          lastBanner: null,
          matchWinner: null,
          history: [],
          dcPendingVisit: null,
          isFullscreenKiosk: false,
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

      setFullscreenKiosk: (isFullscreenKiosk) =>
        set((s) => ({
          isFullscreenKiosk: s.isActive ? isFullscreenKiosk : false,
        })),

      toggleFullscreenKiosk: () =>
        set((s) => ({
          isFullscreenKiosk: s.isActive ? !s.isFullscreenKiosk : false,
        })),

      setDartCounterConnected: (dcConnected) => set({ dcConnected }),

      setDartCounterMode: (dcMode) => set({ dcMode }),

      setDartCounterPendingVisit: (dcPendingVisit) => set({ dcPendingVisit }),

      setDartCounterLastSubmit: (dcLastSubmitStatus) => set({ dcLastSubmitStatus }),

      setDartCounterControlStatus: (dcLastControlStatus) => set({ dcLastControlStatus }),

      syncFromDartCounter: (dc) => {
        const s = get();
        const incomingInvites = Array.isArray(dc.pendingInvites)
          ? dc.pendingInvites
          : s.dcPendingInvites;

        if (!dc.isMatchActive) {
          // Always keep pending friend invites synced even when on the DartCounter lobby!
          if (s.isActive && s.source === 'dartcounter') {
            set({
              isActive: false,
              source: 'manual',
              opponentRemaining: null,
              opponentAvg: null,
              isPlayerTurn: true,
              dcPendingVisit: null,
              dcLastSubmitStatus: null,
              dcPendingInvites: incomingInvites,
              isFullscreenKiosk: false,
              lastBanner: null,
              matchWinner: null,
            });
          } else if (Array.isArray(dc.pendingInvites)) {
            set({ dcPendingInvites: incomingInvites });
          }
          return;
        }

        const startScore: OnlineStartScore =
          dc.startScore === 301 || dc.startScore === 701 ? dc.startScore : 501;
        const outRule: OnlineOutRule = dc.outRule === 'straight' ? 'straight' : 'double';
        const rawOpp = (dc.opponentName || '').trim();
        const isJunkName = /^(3[-\s]?dart\s*avg\.?|avg\.?|average|best\s*of|first\s*to|legs?|sets?)$/i.test(rawOpp);
        const opponentName =
          rawOpp && !isJunkName
            ? rawOpp
            : s.opponentName && s.opponentName !== 'Online Opponent'
            ? s.opponentName
            : 'DartCounter Opponent';
        const playerLegs = Math.max(0, Math.round(dc.playerLegs || 0));
        const opponentLegs = Math.max(0, Math.round(dc.opponentLegs || 0));
        const legsToWin = Math.max(0, Math.round(dc.legsToWin || 0));
        const rawDcPlayerRem = Math.max(0, Math.min(startScore, Math.round(dc.playerRemaining)));
        const rawDcOppRem =
          typeof dc.opponentRemaining === 'number'
            ? Math.max(0, Math.min(startScore, Math.round(dc.opponentRemaining)))
            : null;

        // If the scraper briefly reports 0 / 0 before scores populate (or on an older extension tab),
        // STILL activate the match immediately with startScore (501) so the iPad shows Connected & Play on Kiosk!
        const isZeroPlaceholder =
          rawDcPlayerRem === 0 &&
          (rawDcOppRem === 0 || rawDcOppRem === null) &&
          playerLegs === 0 &&
          opponentLegs === 0 &&
          (!s.isActive || s.remaining > 170);

        const dcPlayerRem = isZeroPlaceholder
          ? s.isActive && s.source === 'dartcounter'
            ? s.remaining
            : startScore
          : rawDcPlayerRem;
        const dcOppRem = isZeroPlaceholder
          ? s.isActive && s.source === 'dartcounter' && s.opponentRemaining !== null
            ? s.opponentRemaining
            : startScore
          : rawDcOppRem;

        const isNewLeg =
          s.source === 'dartcounter' &&
          s.isActive &&
          (playerLegs !== s.playerLegs || opponentLegs !== s.opponentLegs);

        const matchWinner: 'player' | 'opponent' | null =
          legsToWin > 0 && playerLegs >= legsToWin
            ? 'player'
            : legsToWin > 0 && opponentLegs >= legsToWin
            ? 'opponent'
            : null;

        // If the user is mid-visit throwing darts on Autodarts (visitDartsCount > 0) and DartCounter
        // hasn't changed its turnStartRemaining yet, keep our live dart-by-dart countdown intact so
        // checkout routes update after Dart 1 and Dart 2 before takeout!
        const keepLocalMidVisit =
          !isNewLeg &&
          s.isActive &&
          s.source === 'dartcounter' &&
          s.visitDartsCount > 0 &&
          dcPlayerRem === s.turnStartRemaining;

        const nextRemaining = keepLocalMidVisit ? s.remaining : dcPlayerRem;
        const nextTurnStart = keepLocalMidVisit ? s.turnStartRemaining : dcPlayerRem;
        const nextPoints = Math.max(0, startScore - nextRemaining);

        set({
          isActive: true,
          source: 'dartcounter',
          dcConnected: true,
          dcPendingInvites: incomingInvites,
          startScore,
          outRule,
          legsToWin: legsToWin || s.legsToWin || 3,
          opponentName,
          opponentRemaining: dcOppRem,
          opponentAvg: typeof dc.opponentAvg === 'number' ? dc.opponentAvg : s.opponentAvg,
          isPlayerTurn: Boolean(dc.isPlayerTurn),
          playerLegs,
          opponentLegs,
          remaining: nextRemaining,
          turnStartRemaining: nextTurnStart,
          legPointsScored: isNewLeg ? Math.max(0, startScore - dcPlayerRem) : nextPoints,
          dartsInLeg: isNewLeg ? 0 : s.dartsInLeg,
          visitDartsCount: isNewLeg ? 0 : keepLocalMidVisit ? s.visitDartsCount : 0,
          isBust: isNewLeg ? false : keepLocalMidVisit ? s.isBust : false,
          matchWinner,
          lastBanner:
            matchWinner === 'player'
              ? `GAME SHOT & MATCH vs ${opponentName}! (${playerLegs}–${opponentLegs})`
              : matchWinner === 'opponent'
              ? `${opponentName} wins match ${opponentLegs}–${playerLegs}`
              : isNewLeg
              ? opponentLegs > s.opponentLegs
                ? `${opponentName} took the leg • New ${startScore} leg live`
                : `LEG WON! (${playerLegs}–${opponentLegs})`
              : s.lastBanner,
        });
      },
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
        source: s.source,
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
        dcMode: s.dcMode,
      }),
    }
  )
);
