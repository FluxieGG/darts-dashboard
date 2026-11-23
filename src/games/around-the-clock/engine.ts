import { DartThrow } from '../../types/darts';
import { GameMatchConfig, GamePlayer, GameResult } from '../../types/games';
import { isAnyBull, isInnerBull, isMiss } from '../utils/dartHelpers';

export type ClockRingMode = 'any' | 'doubles' | 'trebles';

export interface ClockTarget {
  index: number;
  number: number; // 1..20, or 25 for Bull
  label: string; // '1'..'20', 'D1'..'D20', 'T1'..'T20', 'Bull'
  overlayKey: string; // '1'..'20', 'D1'..'D20', 'T1'..'T20', 'Bull'
  isBull: boolean;
}

export type ClockTileStatus = 'hit' | 'skipped';

export interface ClockVisitOutcome {
  hit: boolean;
  tone: 'emerald' | 'amber' | 'rose';
  label: string;
}

export interface AroundTheClockState {
  player: GamePlayer;
  ringMode: ClockRingMode;
  turboSkip: boolean;
  includeBull: boolean;
  targets: ClockTarget[];
  targetIndex: number;
  tileStatuses: Record<number, ClockTileStatus>;
  visitDarts: DartThrow[];
  visitOutcomes: ClockVisitOutcome[];
  turnComplete: boolean;
  totalDartsThrown: number;
  totalHits: number;
  turboSkipsEarned: number;
  currentStreak: number;
  bestStreak: number;
  isFinished: boolean;
}

export interface AroundTheClockFeedback {
  sound: 'dartHit' | 'bonusHit' | 'jackpot' | 'hazard';
  title?: string;
  subtitle?: string;
  accent?: 'emerald' | 'amber' | 'rose' | 'sky' | 'purple';
}

export function buildClockTargets(
  ringMode: ClockRingMode,
  includeBull: boolean
): ClockTarget[] {
  const targets: ClockTarget[] = [];
  for (let n = 1; n <= 20; n++) {
    const label =
      ringMode === 'doubles'
        ? `D${n}`
        : ringMode === 'trebles'
        ? `T${n}`
        : String(n);
    targets.push({
      index: n - 1,
      number: n,
      label,
      overlayKey: label,
      isBull: false,
    });
  }
  if (includeBull) {
    targets.push({
      index: 20,
      number: 25,
      label: 'Bull',
      overlayKey: 'Bull',
      isBull: true,
    });
  }
  return targets;
}

export function createInitialAroundTheClockState(
  players: GamePlayer[],
  config: GameMatchConfig
): AroundTheClockState {
  const player: GamePlayer = players[0] || {
    id: 'solo',
    name: 'Player',
    colorHex: '#10B981',
    colorIndex: 0,
    avatarInitial: 'P',
  };

  const rawMode = String(config.ringMode || 'any');
  const ringMode: ClockRingMode =
    rawMode === 'doubles' || rawMode === 'trebles' ? rawMode : 'any';
  const turboSkip = config.turboSkip !== false;
  const includeBull = config.includeBull !== false;

  return {
    player,
    ringMode,
    turboSkip,
    includeBull,
    targets: buildClockTargets(ringMode, includeBull),
    targetIndex: 0,
    tileStatuses: {},
    visitDarts: [],
    visitOutcomes: [],
    turnComplete: false,
    totalDartsThrown: 0,
    totalHits: 0,
    turboSkipsEarned: 0,
    currentStreak: 0,
    bestStreak: 0,
    isFinished: false,
  };
}

function evaluateClockHit(
  dart: DartThrow,
  target: ClockTarget,
  ringMode: ClockRingMode,
  turboSkip: boolean
): { hit: boolean; advance: number; isTurbo: boolean } {
  if (isMiss(dart)) {
    return { hit: false, advance: 0, isTurbo: false };
  }

  if (target.isBull) {
    const bullHit = ringMode === 'any' ? isAnyBull(dart) : isInnerBull(dart);
    return { hit: bullHit, advance: bullHit ? 1 : 0, isTurbo: false };
  }

  if (dart.segment.number !== target.number) {
    return { hit: false, advance: 0, isTurbo: false };
  }

  if (ringMode === 'doubles') {
    const hit = dart.segment.multiplier === 2;
    return { hit, advance: hit ? 1 : 0, isTurbo: false };
  }

  if (ringMode === 'trebles') {
    const hit = dart.segment.multiplier === 3;
    return { hit, advance: hit ? 1 : 0, isTurbo: false };
  }

  // 'any' ring mode
  const mult = Math.max(1, Math.min(3, dart.segment.multiplier || 1));
  const advance = turboSkip ? mult : 1;
  return { hit: true, advance, isTurbo: turboSkip && advance > 1 };
}

export function applyDartToAroundTheClock(
  state: AroundTheClockState,
  dart: DartThrow
): { nextState: AroundTheClockState; feedback: AroundTheClockFeedback } {
  if (state.isFinished || state.turnComplete || state.visitDarts.length >= 3) {
    return { nextState: state, feedback: { sound: 'dartHit' } };
  }

  const target = state.targets[state.targetIndex];
  if (!target) {
    return { nextState: { ...state, isFinished: true }, feedback: { sound: 'dartHit' } };
  }

  const { hit, advance, isTurbo } = evaluateClockHit(
    dart,
    target,
    state.ringMode,
    state.turboSkip
  );

  const nextVisitDarts = [...state.visitDarts, dart];
  const nextTotalDarts = state.totalDartsThrown + 1;
  const isThirdDart = nextVisitDarts.length >= 3;

  if (!hit) {
    const nextOutcomes: ClockVisitOutcome[] = [
      ...state.visitOutcomes,
      { hit: false, tone: 'rose', label: `NEED ${target.label.toUpperCase()}` },
    ];
    return {
      nextState: {
        ...state,
        visitDarts: nextVisitDarts,
        visitOutcomes: nextOutcomes,
        turnComplete: isThirdDart,
        totalDartsThrown: nextTotalDarts,
        currentStreak: 0,
      },
      feedback: { sound: 'dartHit' },
    };
  }

  // Target hit!
  const bullIndex = state.includeBull ? state.targets.length - 1 : -1;
  let nextIndex = state.targetIndex + advance;

  // When Bullseye is enabled as the final target, hitting a Double/Treble on 19 or 20
  // lands cleanly on Bullseye so the drill always finishes on the Bull!
  if (state.includeBull && !target.isBull && nextIndex > bullIndex) {
    nextIndex = bullIndex;
  }

  const nextTileStatuses: Record<number, ClockTileStatus> = {
    ...state.tileStatuses,
    [state.targetIndex]: 'hit',
  };

  let skipsThisDart = 0;
  for (let i = state.targetIndex + 1; i < Math.min(nextIndex, state.targets.length); i++) {
    nextTileStatuses[i] = 'skipped';
    skipsThisDart += 1;
  }

  const nextTotalHits = state.totalHits + 1;
  const nextTurboSkips = state.turboSkipsEarned + skipsThisDart;
  const nextStreak = state.currentStreak + 1;
  const nextBestStreak = Math.max(state.bestStreak, nextStreak);
  const isFinished = nextIndex >= state.targets.length;

  const outcomeLabel = isFinished
    ? 'CLOCK CLEARED!'
    : skipsThisDart > 0
    ? `TURBO +${1 + skipsThisDart}`
    : `${target.label.toUpperCase()} HIT`;

  const nextOutcomes: ClockVisitOutcome[] = [
    ...state.visitOutcomes,
    {
      hit: true,
      tone: skipsThisDart > 0 ? 'amber' : 'emerald',
      label: outcomeLabel,
    },
  ];

  const nextTarget = state.targets[nextIndex];
  let feedback: AroundTheClockFeedback;

  if (isFinished) {
    feedback = {
      sound: 'jackpot',
      title: 'AROUND THE CLOCK COMPLETE!',
      subtitle: `Finished in ${nextTotalDarts} darts (${((nextTotalHits / nextTotalDarts) * 100).toFixed(1)}% hit rate)`,
      accent: 'emerald',
    };
  } else if (isTurbo && skipsThisDart > 0) {
    feedback = {
      sound: skipsThisDart >= 2 ? 'jackpot' : 'bonusHit',
      title: `TURBO SKIP! +${1 + skipsThisDart} (${dart.segment.name})`,
      subtitle: `Jumped straight to ${nextTarget.label.toUpperCase()}!`,
      accent: 'amber',
    };
  } else {
    feedback = {
      sound: target.isBull || state.ringMode !== 'any' ? 'bonusHit' : 'bonusHit',
      title: `${target.label.toUpperCase()} CLEARED!`,
      subtitle: `Next target: ${nextTarget.label.toUpperCase()}`,
      accent: 'emerald',
    };
  }

  return {
    nextState: {
      ...state,
      targetIndex: isFinished ? state.targets.length : nextIndex,
      tileStatuses: nextTileStatuses,
      visitDarts: nextVisitDarts,
      visitOutcomes: nextOutcomes,
      turnComplete: isFinished || isThirdDart,
      totalDartsThrown: nextTotalDarts,
      totalHits: nextTotalHits,
      turboSkipsEarned: nextTurboSkips,
      currentStreak: nextStreak,
      bestStreak: nextBestStreak,
      isFinished,
    },
    feedback,
  };
}

export function advanceAroundTheClockVisit(state: AroundTheClockState): AroundTheClockState {
  if (state.isFinished) return state;
  return {
    ...state,
    visitDarts: [],
    visitOutcomes: [],
    turnComplete: false,
  };
}

export function buildAroundTheClockResult(
  state: AroundTheClockState,
  startedAt: number
): GameResult {
  const hitRate =
    state.totalDartsThrown > 0
      ? ((state.totalHits / state.totalDartsThrown) * 100).toFixed(1)
      : '0.0';
  const modeLabel =
    state.ringMode === 'doubles'
      ? 'Doubles Only'
      : state.ringMode === 'trebles'
      ? 'Trebles Only'
      : state.turboSkip
      ? 'Any Bed (Turbo)'
      : 'Any Bed (Standard)';

  const highlights = [
    `Mode: ${modeLabel}`,
    `Hit Rate: ${state.totalHits}/${state.totalDartsThrown} (${hitRate}%)`,
    `Best Hit Streak: ${state.bestStreak}`,
  ];
  if (state.ringMode === 'any' && state.turboSkip) {
    highlights.push(`Turbo Skips Earned: +${state.turboSkipsEarned}`);
  }

  return {
    gameId: 'around-the-clock',
    winnerId: state.player.id,
    winnerName: state.player.name,
    headline: `${state.player.name} cleared Around the Clock in ${state.totalDartsThrown} darts!`,
    standings: [
      {
        playerId: state.player.id,
        playerName: state.player.name,
        colorHex: state.player.colorHex,
        rank: 1,
        primaryStatLabel: 'Darts Used',
        primaryStatValue: state.totalDartsThrown,
        secondaryStat: `${hitRate}% hit rate • ${modeLabel}`,
      },
    ],
    totalDartsThrown: state.totalDartsThrown,
    durationMs: Date.now() - startedAt,
    highlights,
    completedAt: Date.now(),
  };
}
