import { DartThrow } from '../../types/darts';
import { GameMatchConfig, GamePlayer, GameResult } from '../../types/games';
import { isDouble } from '../utils/dartHelpers';

export interface Checkout121Attempt {
  target: number;
  success: boolean;
  dartsUsed: number;
  finishSegment?: string;
}

export interface Checkout121State {
  player: GamePlayer;
  startTarget: number;
  maxTargets: number;
  safeFloor: boolean;
  currentTarget: number;
  highestCleared: number;
  remaining: number;
  turnStartRemaining: number;
  dartsLeftInTarget: number; // starts at 9
  visitDarts: DartThrow[];
  turnComplete: boolean;
  targetResolved: 'cleared' | 'failed' | null;
  totalDartsThrown: number;
  attempts: Checkout121Attempt[];
  isFinished: boolean;
}

export interface Checkout121Feedback {
  sound: 'dartHit' | 'bonusHit' | 'jackpot' | 'hazard';
  title?: string;
  subtitle?: string;
  accent?: 'emerald' | 'amber' | 'rose' | 'sky' | 'purple';
}

export function createInitialCheckout121State(
  players: GamePlayer[],
  config: GameMatchConfig
): Checkout121State {
  const player: GamePlayer = players[0] || {
    id: 'solo',
    name: 'Player',
    colorHex: '#38BDF8',
    colorIndex: 1,
    avatarInitial: 'P',
  };
  const startTarget = Number(config.startTarget) || 121;
  const maxTargets = Number(config.maxTargets) || 10;
  const safeFloor = config.safeFloor !== false;

  return {
    player,
    startTarget,
    maxTargets,
    safeFloor,
    currentTarget: startTarget,
    highestCleared: 0,
    remaining: startTarget,
    turnStartRemaining: startTarget,
    dartsLeftInTarget: 9,
    visitDarts: [],
    turnComplete: false,
    targetResolved: null,
    totalDartsThrown: 0,
    attempts: [],
    isFinished: false,
  };
}

export function applyDartToCheckout121(
  state: Checkout121State,
  dart: DartThrow
): { nextState: Checkout121State; feedback: Checkout121Feedback } {
  if (state.isFinished || state.turnComplete || state.visitDarts.length >= 3) {
    return { nextState: state, feedback: { sound: 'dartHit' } };
  }

  const nextVisitDarts = [...state.visitDarts, dart];
  const nextTotalDarts = state.totalDartsThrown + 1;
  const score = dart.bouncer ? 0 : dart.score;
  const afterScore = state.remaining - score;
  const dartsLeftAfter = Math.max(0, state.dartsLeftInTarget - 1);

  // 1. Check exact Double-Out checkout!
  if (afterScore === 0 && isDouble(dart)) {
    const dartsUsed = 9 - dartsLeftAfter;
    const nextAttempts: Checkout121Attempt[] = [
      ...state.attempts,
      {
        target: state.currentTarget,
        success: true,
        dartsUsed,
        finishSegment: dart.segment.name,
      },
    ];
    const nextHighest = Math.max(state.highestCleared, state.currentTarget);
    const isFinished = nextAttempts.length >= state.maxTargets;

    return {
      nextState: {
        ...state,
        remaining: 0,
        dartsLeftInTarget: dartsLeftAfter,
        visitDarts: nextVisitDarts,
        turnComplete: true,
        targetResolved: 'cleared',
        highestCleared: nextHighest,
        totalDartsThrown: nextTotalDarts,
        attempts: nextAttempts,
        isFinished,
      },
      feedback: {
        sound: 'jackpot',
        title: `${state.currentTarget} CHECKED OUT! (${dart.segment.name})`,
        subtitle: isFinished
          ? `Ladder Complete! Peak Checkout: ${nextHighest}`
          : `Climbing up to ${state.currentTarget + 1} next!`,
        accent: 'emerald',
      },
    };
  }

  // 2. Check Bust (< 0, === 1, or === 0 without Double/Bull)
  const isBust = afterScore < 0 || afterScore === 1 || afterScore === 0;
  if (isBust) {
    // Remaining darts of this visit are forfeited
    const remainingDartsThisVisit = 3 - nextVisitDarts.length;
    const adjustedDartsLeft = Math.max(0, dartsLeftAfter - remainingDartsThisVisit);
    const outOfDarts = adjustedDartsLeft === 0;
    const nextAttempts = outOfDarts
      ? [
          ...state.attempts,
          { target: state.currentTarget, success: false, dartsUsed: 9 },
        ]
      : state.attempts;
    const isFinished = outOfDarts && nextAttempts.length >= state.maxTargets;

    return {
      nextState: {
        ...state,
        remaining: state.turnStartRemaining,
        dartsLeftInTarget: adjustedDartsLeft,
        visitDarts: nextVisitDarts,
        turnComplete: true,
        targetResolved: outOfDarts ? 'failed' : null,
        totalDartsThrown: nextTotalDarts,
        attempts: nextAttempts,
        isFinished,
      },
      feedback: {
        sound: 'hazard',
        title: outOfDarts ? `BUST — MISSED ${state.currentTarget}` : 'BUST!',
        subtitle: outOfDarts
          ? `9 darts used — dropping to ${Math.max(state.safeFloor ? state.startTarget : 61, state.currentTarget - 1)}`
          : `Score restored to ${state.turnStartRemaining}`,
        accent: 'rose',
      },
    };
  }

  // 3. Normal scoring dart
  const isThirdDart = nextVisitDarts.length >= 3;
  const outOfDarts = dartsLeftAfter === 0;
  const nextAttempts = outOfDarts
    ? [...state.attempts, { target: state.currentTarget, success: false, dartsUsed: 9 }]
    : state.attempts;
  const isFinished = outOfDarts && nextAttempts.length >= state.maxTargets;

  return {
    nextState: {
      ...state,
      remaining: afterScore,
      dartsLeftInTarget: dartsLeftAfter,
      visitDarts: nextVisitDarts,
      turnComplete: isThirdDart || outOfDarts,
      targetResolved: outOfDarts ? 'failed' : null,
      totalDartsThrown: nextTotalDarts,
      attempts: nextAttempts,
      isFinished,
    },
    feedback: outOfDarts
      ? {
          sound: 'hazard',
          title: `OUT OF DARTS ON ${state.currentTarget}`,
          subtitle: `${afterScore} left after 9 darts`,
          accent: 'amber',
        }
      : {
          sound: dart.segment.multiplier >= 2 ? 'bonusHit' : 'dartHit',
        },
  };
}

export function advanceCheckout121Visit(state: Checkout121State): Checkout121State {
  if (state.isFinished) return state;

  if (state.targetResolved === 'cleared') {
    const nextTarget = state.currentTarget + 1;
    return {
      ...state,
      currentTarget: nextTarget,
      remaining: nextTarget,
      turnStartRemaining: nextTarget,
      dartsLeftInTarget: 9,
      visitDarts: [],
      turnComplete: false,
      targetResolved: null,
    };
  }

  if (state.targetResolved === 'failed') {
    const floor = state.safeFloor ? state.startTarget : 61;
    const nextTarget = Math.max(floor, state.currentTarget - 1);
    return {
      ...state,
      currentTarget: nextTarget,
      remaining: nextTarget,
      turnStartRemaining: nextTarget,
      dartsLeftInTarget: 9,
      visitDarts: [],
      turnComplete: false,
      targetResolved: null,
    };
  }

  // Still working on the same target (e.g., Visit 1 -> Visit 2 -> Visit 3)
  return {
    ...state,
    turnStartRemaining: state.remaining,
    visitDarts: [],
    turnComplete: false,
  };
}

export function buildCheckout121Result(state: Checkout121State, startedAt: number): GameResult {
  const cleared = state.attempts.filter((a) => a.success).length;
  const total = state.attempts.length;
  const pct = total > 0 ? ((cleared / total) * 100).toFixed(0) : '0';

  return {
    gameId: 'checkout-121',
    winnerId: state.player.id,
    winnerName: state.player.name,
    headline:
      state.highestCleared > 0
        ? `${state.player.name} climbed to ${state.highestCleared} Checkout!`
        : `${state.player.name} completed ${total} Checkout Ladder rounds`,
    standings: [
      {
        playerId: state.player.id,
        playerName: state.player.name,
        colorHex: state.player.colorHex,
        rank: 1,
        primaryStatLabel: 'Peak Checkout',
        primaryStatValue: state.highestCleared || state.currentTarget,
        secondaryStat: `${cleared}/${total} checked out (${pct}%)`,
      },
    ],
    totalDartsThrown: state.totalDartsThrown,
    durationMs: Date.now() - startedAt,
    highlights: [
      `Highest Finish: ${state.highestCleared || 'None'}`,
      `Success Rate: ${cleared}/${total} (${pct}%)`,
      `Ended on Target: ${state.currentTarget}`,
    ],
    completedAt: Date.now(),
  };
}
