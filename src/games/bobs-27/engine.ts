import { DartThrow } from '../../types/darts';
import { GameMatchConfig, GamePlayer, GameResult } from '../../types/games';
import { isInnerBull } from '../utils/dartHelpers';

export interface Bobs27RoundRecord {
  targetIndex: number;
  label: string; // 'D1'..'D20' | 'Bull'
  value: number; // 2..40 | 50
  hits: number;
  delta: number;
  scoreAfter: number;
}

export interface Bobs27State {
  player: GamePlayer;
  targets: Array<{ number: number; label: string; value: number; isBull: boolean }>;
  roundIndex: number;
  score: number;
  highestScore: number;
  failOnNegative: boolean;
  visitDarts: DartThrow[];
  visitHits: number;
  turnComplete: boolean;
  totalDartsThrown: number;
  totalDoublesHit: number;
  history: Bobs27RoundRecord[];
  isFinished: boolean;
  didFail: boolean;
}

export interface Bobs27Feedback {
  sound: 'dartHit' | 'bonusHit' | 'jackpot' | 'hazard';
  title?: string;
  subtitle?: string;
  accent?: 'emerald' | 'amber' | 'rose' | 'sky' | 'purple';
}

export function createBobs27Targets(includeBull: boolean) {
  const list: Bobs27State['targets'] = [];
  for (let n = 1; n <= 20; n++) {
    list.push({ number: n, label: `D${n}`, value: n * 2, isBull: false });
  }
  if (includeBull) {
    list.push({ number: 25, label: 'Bull', value: 50, isBull: true });
  }
  return list;
}

export function createInitialBobs27State(
  players: GamePlayer[],
  config: GameMatchConfig
): Bobs27State {
  const player: GamePlayer = players[0] || {
    id: 'solo',
    name: 'Player',
    colorHex: '#10B981',
    colorIndex: 0,
    avatarInitial: 'P',
  };
  const includeBull = config.includeBull !== false;
  const failOnNegative = config.failOnNegative !== false;

  return {
    player,
    targets: createBobs27Targets(includeBull),
    roundIndex: 0,
    score: 27,
    highestScore: 27,
    failOnNegative,
    visitDarts: [],
    visitHits: 0,
    turnComplete: false,
    totalDartsThrown: 0,
    totalDoublesHit: 0,
    history: [],
    isFinished: false,
    didFail: false,
  };
}

export function applyDartToBobs27(
  state: Bobs27State,
  dart: DartThrow
): { nextState: Bobs27State; feedback: Bobs27Feedback } {
  if (state.isFinished || state.turnComplete || state.visitDarts.length >= 3) {
    return { nextState: state, feedback: { sound: 'dartHit' } };
  }

  const target = state.targets[state.roundIndex];
  if (!target) {
    return { nextState: { ...state, isFinished: true }, feedback: { sound: 'dartHit' } };
  }

  const isMiss = Boolean(dart.bouncer || dart.score === 0 || dart.segment.bed === 'Outside');
  const hitTarget =
    !isMiss &&
    (target.isBull
      ? isInnerBull(dart)
      : dart.segment.number === target.number && dart.segment.multiplier === 2);

  const nextVisitDarts = [...state.visitDarts, dart];
  const nextVisitHits = state.visitHits + (hitTarget ? 1 : 0);
  const nextTotalDarts = state.totalDartsThrown + 1;
  const nextTotalHits = state.totalDoublesHit + (hitTarget ? 1 : 0);

  let nextScore = state.score + (hitTarget ? target.value : 0);
  let nextHighest = Math.max(state.highestScore, nextScore);
  const isThirdDart = nextVisitDarts.length >= 3;
  let nextHistory = state.history;
  let isFinished = false;
  let didFail = false;

  let feedback: Bobs27Feedback = hitTarget
    ? {
        sound: target.isBull || nextVisitHits >= 2 ? 'jackpot' : 'bonusHit',
        title: `${target.label} HIT! +${target.value}`,
        subtitle:
          nextVisitHits >= 2
            ? `${nextVisitHits}× ${target.label} in this visit!`
            : `Score: ${nextScore}`,
        accent: 'emerald',
      }
    : { sound: 'dartHit' };

  if (isThirdDart) {
    let delta = nextVisitHits * target.value;
    if (nextVisitHits === 0) {
      nextScore = state.score - target.value;
      delta = -target.value;
      feedback = {
        sound: 'hazard',
        title: `MISSED ${target.label}  -${target.value}`,
        subtitle: `Score drops to ${nextScore}`,
        accent: 'rose',
      };
    }

    nextHighest = Math.max(nextHighest, nextScore);
    nextHistory = [
      ...state.history,
      {
        targetIndex: state.roundIndex,
        label: target.label,
        value: target.value,
        hits: nextVisitHits,
        delta,
        scoreAfter: nextScore,
      },
    ];

    if (state.failOnNegative && nextScore < 0) {
      isFinished = true;
      didFail = true;
      feedback = {
        sound: 'hazard',
        title: `KNOCKED OUT ON ${target.label}`,
        subtitle: `Score dropped to ${nextScore} — try again!`,
        accent: 'rose',
      };
    } else if (state.roundIndex >= state.targets.length - 1) {
      isFinished = true;
      feedback = {
        sound: 'jackpot',
        title: `BOB'S 27 CLEARED!`,
        subtitle: `Final Score: ${nextScore}`,
        accent: 'emerald',
      };
    }
  }

  return {
    nextState: {
      ...state,
      score: nextScore,
      highestScore: nextHighest,
      visitDarts: nextVisitDarts,
      visitHits: nextVisitHits,
      turnComplete: isThirdDart,
      totalDartsThrown: nextTotalDarts,
      totalDoublesHit: nextTotalHits,
      history: nextHistory,
      isFinished,
      didFail,
    },
    feedback,
  };
}

export function advanceBobs27Round(state: Bobs27State): Bobs27State {
  if (state.isFinished) return state;

  // If player pulled darts early before 3 darts, evaluate the round immediately
  if (!state.turnComplete && state.visitDarts.length > 0) {
    const target = state.targets[state.roundIndex];
    if (target) {
      const missedAll = state.visitHits === 0;
      const nextScore = missedAll ? state.score - target.value : state.score;
      const delta = missedAll ? -target.value : state.visitHits * target.value;
      const nextHistory: Bobs27RoundRecord[] = [
        ...state.history,
        {
          targetIndex: state.roundIndex,
          label: target.label,
          value: target.value,
          hits: state.visitHits,
          delta,
          scoreAfter: nextScore,
        },
      ];
      if ((state.failOnNegative && nextScore < 0) || state.roundIndex >= state.targets.length - 1) {
        return {
          ...state,
          score: nextScore,
          highestScore: Math.max(state.highestScore, nextScore),
          history: nextHistory,
          visitDarts: [],
          visitHits: 0,
          turnComplete: true,
          isFinished: true,
          didFail: state.failOnNegative && nextScore < 0,
        };
      }
      return {
        ...state,
        roundIndex: state.roundIndex + 1,
        score: nextScore,
        highestScore: Math.max(state.highestScore, nextScore),
        history: nextHistory,
        visitDarts: [],
        visitHits: 0,
        turnComplete: false,
      };
    }
  }

  if (!state.turnComplete) return state;

  const nextRound = state.roundIndex + 1;
  if (nextRound >= state.targets.length) {
    return { ...state, isFinished: true };
  }

  return {
    ...state,
    roundIndex: nextRound,
    visitDarts: [],
    visitHits: 0,
    turnComplete: false,
  };
}

export function buildBobs27Result(state: Bobs27State, startedAt: number): GameResult {
  const hitPct =
    state.totalDartsThrown > 0
      ? ((state.totalDoublesHit / state.totalDartsThrown) * 100).toFixed(1)
      : '0.0';
  const completedRounds = state.history.length;
  const totalRounds = state.targets.length;

  return {
    gameId: 'bobs-27',
    winnerId: state.didFail ? null : state.player.id,
    winnerName: state.player.name,
    headline: state.didFail
      ? `Knocked out on ${state.targets[state.roundIndex]?.label || 'Double'} (${completedRounds}/${totalRounds})`
      : `${state.player.name} cleared Bob's 27 with ${state.score} pts!`,
    standings: [
      {
        playerId: state.player.id,
        playerName: state.player.name,
        colorHex: state.player.colorHex,
        rank: 1,
        primaryStatLabel: 'Final Score',
        primaryStatValue: state.score,
        secondaryStat: `${state.totalDoublesHit}/${state.totalDartsThrown} doubles (${hitPct}%) • Peak ${state.highestScore}`,
      },
    ],
    totalDartsThrown: state.totalDartsThrown,
    durationMs: Date.now() - startedAt,
    highlights: [
      `Doubles Hit Rate: ${hitPct}%`,
      `Peak Score: ${state.highestScore}`,
      `Rounds Completed: ${completedRounds}/${totalRounds}`,
    ],
    completedAt: Date.now(),
  };
}
