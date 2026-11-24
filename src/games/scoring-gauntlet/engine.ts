import { DartThrow } from '../../types/darts';
import { GameMatchConfig, GamePlayer, GameResult } from '../../types/games';
import { isInnerBull } from '../utils/dartHelpers';

export type GauntletFocus = 'T20' | 'T19' | 'Bull' | 'free';

export interface GauntletState {
  player: GamePlayer;
  targetDarts: number; // 30, 60, or 99
  focus: GauntletFocus;
  totalPoints: number;
  totalDartsThrown: number;
  targetHits: number;
  ton60Plus: number;
  ton100Plus: number;
  ton140Plus: number;
  ton180s: number;
  highestVisit: number;
  visitDarts: DartThrow[];
  visitScore: number;
  recentVisits: number[];
  turnComplete: boolean;
  isFinished: boolean;
}

export interface GauntletFeedback {
  sound: 'dartHit' | 'bonusHit' | 'jackpot' | 'hazard';
  title?: string;
  subtitle?: string;
  accent?: 'emerald' | 'amber' | 'rose' | 'sky' | 'purple';
}

export function createInitialGauntletState(
  players: GamePlayer[],
  config: GameMatchConfig
): GauntletState {
  const player: GamePlayer = players[0] || {
    id: 'solo',
    name: 'Player',
    colorHex: '#F59E0B',
    colorIndex: 2,
    avatarInitial: 'P',
  };
  const targetDarts = Number(config.dartCount) || 99;
  const focus = (config.focus as GauntletFocus) || 'T20';

  return {
    player,
    targetDarts,
    focus,
    totalPoints: 0,
    totalDartsThrown: 0,
    targetHits: 0,
    ton60Plus: 0,
    ton100Plus: 0,
    ton140Plus: 0,
    ton180s: 0,
    highestVisit: 0,
    visitDarts: [],
    visitScore: 0,
    recentVisits: [],
    turnComplete: false,
    isFinished: false,
  };
}

export function isGauntletFocusHit(dart: DartThrow, focus: GauntletFocus): boolean {
  if (dart.bouncer || dart.score === 0) return false;
  if (focus === 'T20') return dart.segment.number === 20 && dart.segment.multiplier === 3;
  if (focus === 'T19') return dart.segment.number === 19 && dart.segment.multiplier === 3;
  if (focus === 'Bull') return isInnerBull(dart);
  return dart.score >= 20;
}

export function applyDartToGauntlet(
  state: GauntletState,
  dart: DartThrow
): { nextState: GauntletState; feedback: GauntletFeedback } {
  if (state.isFinished || state.turnComplete || state.visitDarts.length >= 3) {
    return { nextState: state, feedback: { sound: 'dartHit' } };
  }

  const pts = dart.bouncer ? 0 : dart.score;
  const hitFocus = isGauntletFocusHit(dart, state.focus);
  const nextVisitDarts = [...state.visitDarts, dart];
  const nextVisitScore = state.visitScore + pts;
  const nextTotalDarts = state.totalDartsThrown + 1;
  const nextTotalPoints = state.totalPoints + pts;
  const nextTargetHits = state.targetHits + (hitFocus ? 1 : 0);

  const isThird = nextVisitDarts.length >= 3;
  const reachedCap = nextTotalDarts >= state.targetDarts;
  const visitDone = isThird || reachedCap;

  let ton60Plus = state.ton60Plus;
  let ton100Plus = state.ton100Plus;
  let ton140Plus = state.ton140Plus;
  let ton180s = state.ton180s;
  let highestVisit = state.highestVisit;
  let recentVisits = state.recentVisits;
  let feedback: GauntletFeedback = {
    sound: hitFocus ? 'bonusHit' : 'dartHit',
  };

  if (visitDone) {
    highestVisit = Math.max(highestVisit, nextVisitScore);
    recentVisits = [nextVisitScore, ...recentVisits].slice(0, 12);
    if (nextVisitScore === 180) {
      ton180s += 1;
      feedback = {
        sound: 'jackpot',
        title: 'ONE HUNDRED AND EIGHTY!',
        subtitle: 'Maximum visit!',
        accent: 'amber',
      };
    } else if (nextVisitScore >= 140) {
      ton140Plus += 1;
      feedback = {
        sound: 'jackpot',
        title: `TON-40+ (${nextVisitScore})`,
        accent: 'amber',
      };
    } else if (nextVisitScore >= 100) {
      ton100Plus += 1;
      feedback = {
        sound: 'bonusHit',
        title: `TON+ (${nextVisitScore})`,
        accent: 'emerald',
      };
    } else if (nextVisitScore >= 60) {
      ton60Plus += 1;
    }
  }

  return {
    nextState: {
      ...state,
      totalPoints: nextTotalPoints,
      totalDartsThrown: nextTotalDarts,
      targetHits: nextTargetHits,
      ton60Plus,
      ton100Plus,
      ton140Plus,
      ton180s,
      highestVisit,
      visitDarts: nextVisitDarts,
      visitScore: nextVisitScore,
      recentVisits,
      turnComplete: visitDone,
      isFinished: reachedCap,
    },
    feedback,
  };
}

export function advanceGauntletVisit(state: GauntletState): GauntletState {
  if (state.isFinished) return state;

  let highestVisit = state.highestVisit;
  let recentVisits = state.recentVisits;
  let ton60Plus = state.ton60Plus;
  let ton100Plus = state.ton100Plus;

  if (!state.turnComplete && state.visitDarts.length > 0) {
    highestVisit = Math.max(highestVisit, state.visitScore);
    recentVisits = [state.visitScore, ...recentVisits].slice(0, 12);
    if (state.visitScore >= 100) {
      ton100Plus += 1;
    } else if (state.visitScore >= 60) {
      ton60Plus += 1;
    }
  }

  return {
    ...state,
    highestVisit,
    recentVisits,
    ton60Plus,
    ton100Plus,
    visitDarts: [],
    visitScore: 0,
    turnComplete: false,
  };
}

export function buildGauntletResult(state: GauntletState, startedAt: number): GameResult {
  const avg =
    state.totalDartsThrown > 0 ? ((state.totalPoints / state.totalDartsThrown) * 3).toFixed(1) : '0.0';
  const hitPct =
    state.totalDartsThrown > 0
      ? ((state.targetHits / state.totalDartsThrown) * 100).toFixed(1)
      : '0.0';

  return {
    gameId: 'scoring-gauntlet',
    winnerId: state.player.id,
    winnerName: state.player.name,
    headline: `${state.player.name} averaged ${avg} over ${state.totalDartsThrown} darts!`,
    standings: [
      {
        playerId: state.player.id,
        playerName: state.player.name,
        colorHex: state.player.colorHex,
        rank: 1,
        primaryStatLabel: '3-Dart Avg',
        primaryStatValue: avg,
        secondaryStat: `${state.totalPoints} total pts • High Visit ${state.highestVisit} • ${state.focus} ${hitPct}%`,
      },
    ],
    totalDartsThrown: state.totalDartsThrown,
    durationMs: Date.now() - startedAt,
    highlights: [
      `Total Score: ${state.totalPoints}`,
      `Highest Visit: ${state.highestVisit}`,
      `100+ Visits: ${state.ton100Plus + state.ton140Plus + state.ton180s}`,
    ],
    completedAt: Date.now(),
  };
}
