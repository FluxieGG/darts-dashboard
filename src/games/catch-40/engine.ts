import { DartThrow } from '../../types/darts';
import { GameMatchConfig, GamePlayer, GameResult } from '../../types/games';
import { isDouble } from '../utils/dartHelpers';

export interface Catch40Attempt {
  target: number; // 61..100 (or 61..80)
  success: boolean;
  points: 0 | 1 | 2 | 3;
  dartsUsed: number;
  finishSegment?: string;
}

export interface Catch40State {
  player: GamePlayer;
  length: 20 | 40;
  startTarget: number; // 61
  endTarget: number; // 80 or 100
  currentTarget: number;
  remaining: number;
  turnStartRemaining: number;
  dartsLeftInTarget: number; // starts at 6 (2 visits of 3 darts)
  visitDarts: DartThrow[];
  turnComplete: boolean;
  targetResolved: 'cleared' | 'failed' | null;
  totalScore: number;
  twoDartFinishes: number;
  threeDartFinishes: number;
  fourToSixFinishes: number;
  totalDartsThrown: number;
  attempts: Catch40Attempt[];
  isFinished: boolean;
}

export interface Catch40Feedback {
  sound: 'dartHit' | 'bonusHit' | 'jackpot' | 'hazard';
  title?: string;
  subtitle?: string;
  accent?: 'emerald' | 'amber' | 'rose' | 'sky' | 'purple';
}

export function createInitialCatch40State(
  players: GamePlayer[],
  config: GameMatchConfig
): Catch40State {
  const player: GamePlayer = players[0] || {
    id: 'solo',
    name: 'Player',
    colorHex: '#F59E0B',
    colorIndex: 2,
    avatarInitial: 'P',
  };

  const length: 20 | 40 = Number(config.length) === 20 ? 20 : 40;
  const startTarget = 61;
  const endTarget = startTarget + length - 1;

  return {
    player,
    length,
    startTarget,
    endTarget,
    currentTarget: startTarget,
    remaining: startTarget,
    turnStartRemaining: startTarget,
    dartsLeftInTarget: 6,
    visitDarts: [],
    turnComplete: false,
    targetResolved: null,
    totalScore: 0,
    twoDartFinishes: 0,
    threeDartFinishes: 0,
    fourToSixFinishes: 0,
    totalDartsThrown: 0,
    attempts: [],
    isFinished: false,
  };
}

export function applyDartToCatch40(
  state: Catch40State,
  dart: DartThrow
): { nextState: Catch40State; feedback: Catch40Feedback } {
  if (state.isFinished || state.turnComplete || state.visitDarts.length >= 3) {
    return { nextState: state, feedback: { sound: 'dartHit' } };
  }

  const nextVisitDarts = [...state.visitDarts, dart];
  const nextTotalDarts = state.totalDartsThrown + 1;
  const score = dart.bouncer ? 0 : dart.score;
  const afterScore = state.remaining - score;
  const dartsLeftAfter = Math.max(0, state.dartsLeftInTarget - 1);

  // 1. Check Double-Out checkout!
  if (afterScore === 0 && isDouble(dart)) {
    const dartsUsed = 6 - dartsLeftAfter;
    const points: 1 | 2 | 3 = dartsUsed <= 2 ? 3 : dartsUsed === 3 ? 2 : 1;
    const nextTotalScore = state.totalScore + points;
    const nextTwoDart = state.twoDartFinishes + (points === 3 ? 1 : 0);
    const nextThreeDart = state.threeDartFinishes + (points === 2 ? 1 : 0);
    const nextFourToSix = state.fourToSixFinishes + (points === 1 ? 1 : 0);

    const nextAttempts: Catch40Attempt[] = [
      ...state.attempts,
      {
        target: state.currentTarget,
        success: true,
        points,
        dartsUsed,
        finishSegment: dart.segment.name,
      },
    ];
    const isFinished = state.currentTarget >= state.endTarget;

    const accent: Catch40Feedback['accent'] =
      points === 3 ? 'amber' : points === 2 ? 'emerald' : 'sky';
    const tierLabel =
      points === 3
        ? '2-DART GOLD FINISH! +3 PTS'
        : points === 2
        ? '3-DART FINISH! +2 PTS'
        : `${dartsUsed}-DART FINISH! +1 PT`;

    return {
      nextState: {
        ...state,
        remaining: 0,
        dartsLeftInTarget: dartsLeftAfter,
        visitDarts: nextVisitDarts,
        turnComplete: true,
        targetResolved: 'cleared',
        totalScore: nextTotalScore,
        twoDartFinishes: nextTwoDart,
        threeDartFinishes: nextThreeDart,
        fourToSixFinishes: nextFourToSix,
        totalDartsThrown: nextTotalDarts,
        attempts: nextAttempts,
        isFinished,
      },
      feedback: {
        sound: points >= 2 ? 'jackpot' : 'bonusHit',
        title: `${state.currentTarget} OUT (${dart.segment.name}) • +${points} PT${points > 1 ? 'S' : ''}`,
        subtitle: isFinished
          ? `Catch ${state.length} Complete! Final Score: ${nextTotalScore}/${state.length * 3}`
          : `${tierLabel} — Next: ${state.currentTarget + 1}`,
        accent,
      },
    };
  }

  // 2. Check Bust (< 0, === 1, or === 0 without Double/Inner Bull)
  const isBust = afterScore < 0 || afterScore === 1 || afterScore === 0;
  if (isBust) {
    const remainingDartsThisVisit = 3 - nextVisitDarts.length;
    const adjustedDartsLeft = Math.max(0, dartsLeftAfter - remainingDartsThisVisit);
    const outOfDarts = adjustedDartsLeft === 0;

    const nextAttempts: Catch40Attempt[] = outOfDarts
      ? [
          ...state.attempts,
          {
            target: state.currentTarget,
            success: false,
            points: 0,
            dartsUsed: 6,
          },
        ]
      : state.attempts;
    const isFinished = outOfDarts && state.currentTarget >= state.endTarget;

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
        title: outOfDarts ? `BUST — ${state.currentTarget} MISSED (0 PTS)` : 'BUST!',
        subtitle: outOfDarts
          ? isFinished
            ? `Final Score: ${state.totalScore}/${state.length * 3}`
            : `Advancing to ${state.currentTarget + 1}`
          : `Restored to ${state.turnStartRemaining} • 3 darts left`,
        accent: 'rose',
      },
    };
  }

  // 3. Normal scoring dart
  const isThirdDart = nextVisitDarts.length >= 3;
  const outOfDarts = dartsLeftAfter === 0;
  const nextAttempts: Catch40Attempt[] = outOfDarts
    ? [
        ...state.attempts,
        {
          target: state.currentTarget,
          success: false,
          points: 0,
          dartsUsed: 6,
        },
      ]
    : state.attempts;
  const isFinished = outOfDarts && state.currentTarget >= state.endTarget;

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
          title: `${state.currentTarget} FAILED — 0 PTS`,
          subtitle: isFinished
            ? `Catch ${state.length} Complete! Final Score: ${state.totalScore}/${state.length * 3}`
            : `${afterScore} left after 6 darts — Next: ${state.currentTarget + 1}`,
          accent: 'rose',
        }
      : {
          sound: dart.segment.multiplier >= 2 ? 'bonusHit' : 'dartHit',
        },
  };
}

export function advanceCatch40Visit(state: Catch40State): Catch40State {
  if (state.isFinished) return state;

  // Target was cleared or failed -> advance sequentially to next number
  if (state.targetResolved === 'cleared' || state.targetResolved === 'failed') {
    const nextTarget = state.currentTarget + 1;
    if (nextTarget > state.endTarget) {
      return { ...state, isFinished: true, visitDarts: [], turnComplete: true };
    }
    return {
      ...state,
      currentTarget: nextTarget,
      remaining: nextTarget,
      turnStartRemaining: nextTarget,
      dartsLeftInTarget: 6,
      visitDarts: [],
      turnComplete: false,
      targetResolved: null,
    };
  }

  // Handle early takeout on Visit 1 vs Visit 2
  const isSecondVisit = state.dartsLeftInTarget <= 3;
  if (isSecondVisit) {
    // Player pulled darts early during Visit 2 without checking out -> failed target
    const nextAttempts: Catch40Attempt[] = [
      ...state.attempts,
      {
        target: state.currentTarget,
        success: false,
        points: 0,
        dartsUsed: 6,
      },
    ];
    const nextTarget = state.currentTarget + 1;
    if (nextTarget > state.endTarget) {
      return {
        ...state,
        attempts: nextAttempts,
        dartsLeftInTarget: 0,
        visitDarts: [],
        turnComplete: true,
        targetResolved: 'failed',
        isFinished: true,
      };
    }
    return {
      ...state,
      attempts: nextAttempts,
      currentTarget: nextTarget,
      remaining: nextTarget,
      turnStartRemaining: nextTarget,
      dartsLeftInTarget: 6,
      visitDarts: [],
      turnComplete: false,
      targetResolved: null,
    };
  }

  // Moving cleanly from Visit 1 -> Visit 2 (always 3 darts remaining for Visit 2)
  return {
    ...state,
    turnStartRemaining: state.remaining,
    dartsLeftInTarget: 3,
    visitDarts: [],
    turnComplete: false,
  };
}

export function buildCatch40Result(state: Catch40State, startedAt: number): GameResult {
  const maxScore = state.length * 3;
  const cleared = state.attempts.filter((a) => a.success).length;
  const pct = state.attempts.length > 0 ? ((cleared / state.attempts.length) * 100).toFixed(0) : '0';

  return {
    gameId: 'catch-40',
    winnerId: state.player.id,
    winnerName: state.player.name,
    headline: `${state.player.name} scored ${state.totalScore}/${maxScore} on Catch ${state.length}!`,
    standings: [
      {
        playerId: state.player.id,
        playerName: state.player.name,
        colorHex: state.player.colorHex,
        rank: 1,
        primaryStatLabel: 'Catch 40 Score',
        primaryStatValue: state.totalScore,
        secondaryStat: `${cleared}/${state.length} cleared (${pct}%) • ${state.twoDartFinishes}× 2-dart`,
      },
    ],
    totalDartsThrown: state.totalDartsThrown,
    durationMs: Date.now() - startedAt,
    highlights: [
      `Total Points: ${state.totalScore} / ${maxScore}`,
      `Checkouts Cleared: ${cleared} / ${state.length} (${pct}%)`,
      `2-Dart Gold Finishes (+3): ${state.twoDartFinishes}`,
      `3-Dart (+2): ${state.threeDartFinishes} • 4–6 Dart (+1): ${state.fourToSixFinishes}`,
    ],
    completedAt: Date.now(),
  };
}
