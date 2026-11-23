import { DartThrow } from '../../types/darts';
import { GameMatchConfig, GamePlayer, GameResult } from '../../types/games';
import { isInnerBull, isMiss } from '../utils/dartHelpers';

export type SniperCircuit = 'trebles' | 'doubles' | 'power';

export interface SniperTarget {
  index: number;
  label: string; // e.g. 'T20', 'D16', 'Bull'
  overlayKey: string; // exact SvgDartboard key ('T20', 'D16', 'Bull')
  number: number; // 1..20 or 25
  ring: 'treble' | 'double' | 'bull';
}

export interface SniperCompletedTarget {
  targetIndex: number;
  label: string;
  hits: number;
  dartsTaken: number;
}

export interface SniperVisitOutcome {
  hit: boolean;
  tone: 'emerald' | 'amber' | 'rose';
  label: string;
}

export interface PrecisionSniperState {
  player: GamePlayer;
  circuit: SniperCircuit;
  hitsPerTarget: 1 | 2 | 3;
  targets: SniperTarget[];
  targetIndex: number;
  currentTargetHits: number;
  currentTargetDarts: number;
  completedTargets: SniperCompletedTarget[];
  visitDarts: DartThrow[];
  visitOutcomes: SniperVisitOutcome[];
  turnComplete: boolean;
  totalDartsThrown: number;
  totalHits: number;
  currentStreak: number;
  bestStreak: number;
  isFinished: boolean;
}

export interface PrecisionSniperFeedback {
  sound: 'dartHit' | 'bonusHit' | 'jackpot' | 'hazard';
  title?: string;
  subtitle?: string;
  accent?: 'emerald' | 'amber' | 'rose' | 'sky' | 'purple';
}

const CIRCUIT_LISTS: Record<SniperCircuit, string[]> = {
  trebles: ['T20', 'T19', 'T18', 'T17', 'T16', 'T15', 'T14', 'T13', 'T12', 'T11', 'T10'],
  doubles: ['D20', 'D16', 'D8', 'D4', 'D10', 'D12', 'D18', 'Bull'],
  power: ['T20', 'T19', 'T18', 'Bull'],
};

export function buildSniperTargets(circuit: SniperCircuit): SniperTarget[] {
  const labels = CIRCUIT_LISTS[circuit] || CIRCUIT_LISTS.trebles;
  return labels.map((label, index) => {
    if (label === 'Bull') {
      return {
        index,
        label: 'Bull',
        overlayKey: 'Bull',
        number: 25,
        ring: 'bull',
      };
    }
    const prefix = label[0];
    const num = Number(label.slice(1));
    return {
      index,
      label,
      overlayKey: label,
      number: num,
      ring: prefix === 'T' ? 'treble' : 'double',
    };
  });
}

export function createInitialPrecisionSniperState(
  players: GamePlayer[],
  config: GameMatchConfig
): PrecisionSniperState {
  const player: GamePlayer = players[0] || {
    id: 'solo',
    name: 'Player',
    colorHex: '#A855F7',
    colorIndex: 4,
    avatarInitial: 'P',
  };

  const rawCircuit = String(config.circuit || 'trebles');
  const circuit: SniperCircuit =
    rawCircuit === 'doubles' || rawCircuit === 'power' ? rawCircuit : 'trebles';

  const rawHits = Number(config.hitsPerTarget);
  const hitsPerTarget: 1 | 2 | 3 = rawHits === 1 ? 1 : rawHits === 3 ? 3 : 2;

  return {
    player,
    circuit,
    hitsPerTarget,
    targets: buildSniperTargets(circuit),
    targetIndex: 0,
    currentTargetHits: 0,
    currentTargetDarts: 0,
    completedTargets: [],
    visitDarts: [],
    visitOutcomes: [],
    turnComplete: false,
    totalDartsThrown: 0,
    totalHits: 0,
    currentStreak: 0,
    bestStreak: 0,
    isFinished: false,
  };
}

function isSniperTargetHit(dart: DartThrow, target: SniperTarget): boolean {
  if (isMiss(dart)) return false;
  if (target.ring === 'bull') return isInnerBull(dart);
  if (target.ring === 'treble') {
    return dart.segment.number === target.number && dart.segment.multiplier === 3;
  }
  return dart.segment.number === target.number && dart.segment.multiplier === 2;
}

export function applyDartToPrecisionSniper(
  state: PrecisionSniperState,
  dart: DartThrow
): { nextState: PrecisionSniperState; feedback: PrecisionSniperFeedback } {
  if (state.isFinished || state.turnComplete || state.visitDarts.length >= 3) {
    return { nextState: state, feedback: { sound: 'dartHit' } };
  }

  const target = state.targets[state.targetIndex];
  if (!target) {
    return { nextState: { ...state, isFinished: true }, feedback: { sound: 'dartHit' } };
  }

  const hit = isSniperTargetHit(dart, target);
  const nextVisitDarts = [...state.visitDarts, dart];
  const nextTotalDarts = state.totalDartsThrown + 1;
  const nextTargetDarts = state.currentTargetDarts + 1;
  const isThirdDart = nextVisitDarts.length >= 3;

  if (!hit) {
    const nextOutcomes: SniperVisitOutcome[] = [
      ...state.visitOutcomes,
      { hit: false, tone: 'rose', label: `NEED ${target.label.toUpperCase()}` },
    ];
    return {
      nextState: {
        ...state,
        currentTargetDarts: nextTargetDarts,
        visitDarts: nextVisitDarts,
        visitOutcomes: nextOutcomes,
        turnComplete: isThirdDart,
        totalDartsThrown: nextTotalDarts,
        currentStreak: 0,
      },
      feedback: { sound: 'dartHit' },
    };
  }

  // Exact bed hit!
  const nextTotalHits = state.totalHits + 1;
  const nextTargetHits = state.currentTargetHits + 1;
  const nextStreak = state.currentStreak + 1;
  const nextBestStreak = Math.max(state.bestStreak, nextStreak);
  const targetCleared = nextTargetHits >= state.hitsPerTarget;

  let nextTargetIndex = state.targetIndex;
  let nextCurrentTargetHits = nextTargetHits;
  let nextCurrentTargetDarts = nextTargetDarts;
  let nextCompletedTargets = state.completedTargets;
  let isFinished = false;

  if (targetCleared) {
    nextCompletedTargets = [
      ...state.completedTargets,
      {
        targetIndex: state.targetIndex,
        label: target.label,
        hits: nextTargetHits,
        dartsTaken: nextTargetDarts,
      },
    ];
    nextTargetIndex = state.targetIndex + 1;
    nextCurrentTargetHits = 0;
    nextCurrentTargetDarts = 0;
    isFinished = nextTargetIndex >= state.targets.length;
  }

  const nextOutcomes: SniperVisitOutcome[] = [
    ...state.visitOutcomes,
    {
      hit: true,
      tone: targetCleared ? 'amber' : 'emerald',
      label: isFinished
        ? 'CIRCUIT CLEARED!'
        : targetCleared
        ? `${target.label.toUpperCase()} LOCKED!`
        : `${target.label.toUpperCase()} (${nextTargetHits}/${state.hitsPerTarget})`,
    },
  ];

  const nextTarget = state.targets[nextTargetIndex];
  const accuracyPct = ((nextTotalHits / nextTotalDarts) * 100).toFixed(1);

  let feedback: PrecisionSniperFeedback;
  if (isFinished) {
    feedback = {
      sound: 'jackpot',
      title: 'PRECISION CIRCUIT COMPLETE!',
      subtitle: `${nextTotalHits} hits in ${nextTotalDarts} darts (${accuracyPct}% accuracy)`,
      accent: 'emerald',
    };
  } else if (targetCleared) {
    feedback = {
      sound: target.ring === 'bull' || nextTargetDarts === state.hitsPerTarget ? 'jackpot' : 'bonusHit',
      title: `${target.label.toUpperCase()} CLEARED! (${nextTargetDarts} ${nextTargetDarts === 1 ? 'DART' : 'DARTS'})`,
      subtitle: `Next target locked: ${nextTarget.label.toUpperCase()}`,
      accent: 'amber',
    };
  } else {
    feedback = {
      sound: 'bonusHit',
      title: `${target.label.toUpperCase()} HIT! (${nextTargetHits}/${state.hitsPerTarget})`,
      subtitle: `${state.hitsPerTarget - nextTargetHits} more to advance`,
      accent: 'emerald',
    };
  }

  return {
    nextState: {
      ...state,
      targetIndex: isFinished ? state.targets.length : nextTargetIndex,
      currentTargetHits: nextCurrentTargetHits,
      currentTargetDarts: nextCurrentTargetDarts,
      completedTargets: nextCompletedTargets,
      visitDarts: nextVisitDarts,
      visitOutcomes: nextOutcomes,
      turnComplete: isFinished || isThirdDart,
      totalDartsThrown: nextTotalDarts,
      totalHits: nextTotalHits,
      currentStreak: nextStreak,
      bestStreak: nextBestStreak,
      isFinished,
    },
    feedback,
  };
}

export function advancePrecisionSniperVisit(state: PrecisionSniperState): PrecisionSniperState {
  if (state.isFinished) return state;
  return {
    ...state,
    visitDarts: [],
    visitOutcomes: [],
    turnComplete: false,
  };
}

export function getCircuitDisplayName(circuit: SniperCircuit): string {
  if (circuit === 'doubles') return 'Doubles Circuit';
  if (circuit === 'power') return 'Power 4 Circuit';
  return 'Trebles Circuit (T20–T10)';
}

export function buildPrecisionSniperResult(
  state: PrecisionSniperState,
  startedAt: number
): GameResult {
  const accuracyPct =
    state.totalDartsThrown > 0
      ? ((state.totalHits / state.totalDartsThrown) * 100).toFixed(1)
      : '0.0';
  const dartsPerHit =
    state.totalHits > 0 ? (state.totalDartsThrown / state.totalHits).toFixed(2) : '—';
  const circuitName = getCircuitDisplayName(state.circuit);

  return {
    gameId: 'precision-sniper',
    winnerId: state.player.id,
    winnerName: state.player.name,
    headline: `${state.player.name} cleared ${circuitName} at ${accuracyPct}% accuracy!`,
    standings: [
      {
        playerId: state.player.id,
        playerName: state.player.name,
        colorHex: state.player.colorHex,
        rank: 1,
        primaryStatLabel: 'Darts Used',
        primaryStatValue: state.totalDartsThrown,
        secondaryStat: `${accuracyPct}% accuracy • ${dartsPerHit} darts/hit`,
      },
    ],
    totalDartsThrown: state.totalDartsThrown,
    durationMs: Date.now() - startedAt,
    highlights: [
      `Circuit: ${circuitName} (${state.hitsPerTarget} hit${state.hitsPerTarget > 1 ? 's' : ''}/target)`,
      `Accuracy: ${state.totalHits}/${state.totalDartsThrown} (${accuracyPct}%)`,
      `Efficiency: ${dartsPerHit} Darts / Hit`,
      `Best Hit Streak: ${state.bestStreak}`,
    ],
    completedAt: Date.now(),
  };
}
