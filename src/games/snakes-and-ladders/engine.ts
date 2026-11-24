import { DartThrow } from '../../types/darts';
import { GameMatchConfig, GamePlayer, GameResult, GameStanding } from '../../types/games';
import { getDartNumber, isInnerBull, isMiss, isOuterBull } from '../utils/dartHelpers';
import {
  BoardLink,
  BoardSizeOption,
  SnakesAndLaddersState,
  SnakesDartFeedback,
  SnakesPlayerState,
  VisitPillTone,
} from './types';

export const LINKS_100: BoardLink[] = [
  // Curated balanced Emerald Ladders (7)
  { id: 'L1', type: 'ladder', from: 4, to: 25 },
  { id: 'L2', type: 'ladder', from: 13, to: 46 },
  { id: 'L3', type: 'ladder', from: 21, to: 42 },
  { id: 'L4', type: 'ladder', from: 33, to: 52 },
  { id: 'L5', type: 'ladder', from: 50, to: 69 },
  { id: 'L6', type: 'ladder', from: 62, to: 81 },
  { id: 'L7', type: 'ladder', from: 74, to: 92 },
  // Curated balanced Crimson Snakes (7)
  { id: 'S1', type: 'snake', from: 28, to: 10 },
  { id: 'S2', type: 'snake', from: 44, to: 19 },
  { id: 'S3', type: 'snake', from: 54, to: 31 },
  { id: 'S4', type: 'snake', from: 66, to: 45 },
  { id: 'S5', type: 'snake', from: 79, to: 58 },
  { id: 'S6', type: 'snake', from: 89, to: 67 },
  { id: 'S7', type: 'snake', from: 97, to: 76 },
];

export const LINKS_64: BoardLink[] = [
  // Curated balanced Emerald Ladders (5)
  { id: 'L1', type: 'ladder', from: 3, to: 22 },
  { id: 'L2', type: 'ladder', from: 11, to: 28 },
  { id: 'L3', type: 'ladder', from: 18, to: 37 },
  { id: 'L4', type: 'ladder', from: 31, to: 49 },
  { id: 'L5', type: 'ladder', from: 42, to: 59 },
  // Curated balanced Crimson Snakes (5)
  { id: 'S1', type: 'snake', from: 20, to: 6 },
  { id: 'S2', type: 'snake', from: 36, to: 15 },
  { id: 'S3', type: 'snake', from: 47, to: 30 },
  { id: 'S4', type: 'snake', from: 54, to: 39 },
  { id: 'S5', type: 'snake', from: 62, to: 45 },
];

/**
 * Maps a square number (1..boardSize) to serpentine (boustrophedon) grid coordinates.
 * Square 1 sits at bottom-left; rows alternate L->R and R->L going upward.
 */
export function squareToGridCoords(
  square: number,
  gridSize: number
): { row: number; col: number; cx: number; cy: number } {
  const clamped = Math.max(1, Math.min(gridSize * gridSize, square));
  const rowFromBottom = Math.floor((clamped - 1) / gridSize);
  const posInRow = (clamped - 1) % gridSize;
  const col = rowFromBottom % 2 === 0 ? posInRow : gridSize - 1 - posInRow;
  const row = gridSize - 1 - rowFromBottom;
  return {
    row,
    col,
    cx: col * 100 + 50,
    cy: row * 100 + 50,
  };
}

/**
 * Generates ordered square numbers in top-to-bottom, left-to-right visual grid order.
 */
export function buildVisualBoardSquares(gridSize: number): number[] {
  const squares: number[] = [];
  for (let visualRow = 0; visualRow < gridSize; visualRow++) {
    const rowFromBottom = gridSize - 1 - visualRow;
    for (let col = 0; col < gridSize; col++) {
      const posInRow = rowFromBottom % 2 === 0 ? col : gridSize - 1 - col;
      squares.push(rowFromBottom * gridSize + posInRow + 1);
    }
  }
  return squares;
}

/**
 * Converts a DartThrow into Snakes & Ladders movement steps (10-15 min pacing).
 */
export function calculateDartSteps(dart: DartThrow): {
  steps: number;
  tag: string;
  tone: VisitPillTone;
  boostType: 'miss' | 'single' | 'double' | 'treble' | 'outer-bull' | 'inner-bull';
} {
  if (isMiss(dart)) {
    return { steps: 0, tag: 'Miss', tone: 'rose', boostType: 'miss' };
  }
  if (isInnerBull(dart)) {
    return { steps: 10, tag: '+10 TURBO!', tone: 'purple', boostType: 'inner-bull' };
  }
  if (isOuterBull(dart)) {
    return { steps: 6, tag: '+6 BULL', tone: 'sky', boostType: 'outer-bull' };
  }

  const num = getDartNumber(dart);
  if (num <= 0) {
    return { steps: 0, tag: 'Miss', tone: 'rose', boostType: 'miss' };
  }

  const base = Math.ceil(num / 4); // 1..5
  if (dart.segment.multiplier === 3) {
    const steps = base + 4; // 5..9
    return { steps, tag: `+${steps} TREBLE`, tone: 'amber', boostType: 'treble' };
  }
  if (dart.segment.multiplier === 2) {
    const steps = base + 2; // 3..7
    return { steps, tag: `+${steps} DOUBLE`, tone: 'emerald', boostType: 'double' };
  }

  return { steps: base, tag: `+${base} steps`, tone: 'slate', boostType: 'single' };
}

export function createInitialState(
  players: GamePlayer[],
  config: GameMatchConfig
): SnakesAndLaddersState {
  const rawSize = Number(config.boardSize);
  const boardSize: BoardSizeOption = rawSize === 64 ? 64 : 100;
  const gridSize: 8 | 10 = boardSize === 64 ? 8 : 10;
  const exactFinish = config.exactFinish !== false;
  const links = boardSize === 64 ? LINKS_64 : LINKS_100;

  const initialPlayers: SnakesPlayerState[] = players.map((player) => ({
    player,
    position: 0,
    totalSteps: 0,
    laddersClimbed: 0,
    snakesBitten: 0,
    bounces: 0,
    dartsThrown: 0,
    bestDartSteps: 0,
  }));

  return {
    boardSize,
    gridSize,
    exactFinish,
    links,
    players: initialPlayers,
    activePlayerIndex: 0,
    round: 1,
    totalDartsThrown: 0,
    currentVisit: [],
    turnComplete: false,
    isFinished: false,
    winnerId: null,
    lastMove: null,
  };
}

export function applyDartToState(
  state: SnakesAndLaddersState,
  dart: DartThrow
): { nextState: SnakesAndLaddersState; feedback: SnakesDartFeedback } {
  if (
    state.isFinished ||
    state.turnComplete ||
    state.currentVisit.length >= 3 ||
    state.players.length === 0 ||
    !state.players[state.activePlayerIndex]
  ) {
    return {
      nextState: state,
      feedback: { sound: 'hit', calloutTitle: null, calloutAccent: 'sky' },
    };
  }

  const active = state.players[state.activePlayerIndex];
  const calc = calculateDartSteps(dart);
  const fromSquare = active.position;

  let landedSquare = fromSquare + calc.steps;
  let bounced = false;

  if (landedSquare > state.boardSize) {
    if (state.exactFinish) {
      const overshoot = landedSquare - state.boardSize;
      landedSquare = Math.max(1, state.boardSize - overshoot);
      bounced = true;
    } else {
      landedSquare = state.boardSize;
    }
  }

  // Check if landed square triggers a ladder or snake
  const matchedLink =
    calc.steps > 0 ? state.links.find((l) => l.from === landedSquare) ?? null : null;
  const finalSquare = matchedLink ? matchedLink.to : landedSquare;
  const won = finalSquare >= state.boardSize;

  let pillLabel = calc.tag;
  let pillTone: VisitPillTone = calc.tone;
  let feedback: SnakesDartFeedback;

  if (won) {
    pillLabel = `WIN! SQ ${state.boardSize}`;
    pillTone = 'emerald';
    feedback = {
      sound: 'jackpot',
      calloutTitle: `🏆 ${active.player.name} REACHED ${state.boardSize}!`,
      calloutSubtitle: `${dart.segment.name} (+${calc.steps}) clinches the board race!`,
      calloutAccent: 'emerald',
    };
  } else if (matchedLink?.type === 'ladder') {
    pillLabel = `🪜 ${matchedLink.from}→${matchedLink.to}`;
    pillTone = 'emerald';
    feedback = {
      sound: 'bonus',
      calloutTitle: `🪜 LADDER BOOST! ${matchedLink.from} → ${matchedLink.to}`,
      calloutSubtitle: `${active.player.name} vaulted +${matchedLink.to - matchedLink.from} squares!`,
      calloutAccent: 'emerald',
    };
  } else if (matchedLink?.type === 'snake') {
    pillLabel = `🐍 ${matchedLink.from}→${matchedLink.to}`;
    pillTone = 'rose';
    feedback = {
      sound: 'hazard',
      calloutTitle: `🐍 SNAKE BITE! ${matchedLink.from} → ${matchedLink.to}`,
      calloutSubtitle: bounced
        ? `Bounced off ${state.boardSize} straight into a snake!`
        : `${active.player.name} dropped -${matchedLink.from - matchedLink.to} squares!`,
      calloutAccent: 'rose',
    };
  } else if (bounced) {
    pillLabel = `↩️ SQ ${finalSquare}`;
    pillTone = 'amber';
    feedback = {
      sound: 'hazard',
      calloutTitle: `↩️ BOUNCED BACK TO ${finalSquare}!`,
      calloutSubtitle: `Need an exact landing on Square ${state.boardSize}`,
      calloutAccent: 'amber',
    };
  } else if (calc.boostType === 'miss') {
    feedback = {
      sound: 'hazard',
      calloutTitle: null,
      calloutAccent: 'rose',
    };
  } else if (calc.boostType === 'inner-bull') {
    feedback = {
      sound: 'jackpot',
      calloutTitle: `🎯 BULLSEYE TURBO! +10 STEPS`,
      calloutSubtitle: `${active.player.name} zooms to Square ${finalSquare}!`,
      calloutAccent: 'purple',
    };
  } else if (calc.boostType === 'outer-bull') {
    feedback = {
      sound: 'bonus',
      calloutTitle: `⚡ OUTER BULL! +6 STEPS`,
      calloutSubtitle: `${active.player.name} advances to Square ${finalSquare}`,
      calloutAccent: 'sky',
    };
  } else if (calc.boostType === 'treble') {
    feedback = {
      sound: 'bonus',
      calloutTitle: `🔥 TREBLE TURBO! +${calc.steps} STEPS`,
      calloutSubtitle: `${dart.segment.name} → Square ${finalSquare}`,
      calloutAccent: 'amber',
    };
  } else if (calc.boostType === 'double') {
    feedback = {
      sound: 'bonus',
      calloutTitle: `✨ DOUBLE BOOST! +${calc.steps} STEPS`,
      calloutSubtitle: `${dart.segment.name} → Square ${finalSquare}`,
      calloutAccent: 'emerald',
    };
  } else {
    feedback = {
      sound: 'hit',
      calloutTitle: null,
      calloutAccent: 'sky',
    };
  }

  const nextPlayers = state.players.map((ps, idx) => {
    if (idx !== state.activePlayerIndex) return ps;
    return {
      ...ps,
      position: finalSquare,
      totalSteps: ps.totalSteps + calc.steps,
      laddersClimbed: ps.laddersClimbed + (matchedLink?.type === 'ladder' ? 1 : 0),
      snakesBitten: ps.snakesBitten + (matchedLink?.type === 'snake' ? 1 : 0),
      bounces: ps.bounces + (bounced ? 1 : 0),
      dartsThrown: ps.dartsThrown + 1,
      bestDartSteps: Math.max(ps.bestDartSteps, calc.steps),
    };
  });

  const nextVisit = [
    ...state.currentVisit,
    {
      dart,
      steps: calc.steps,
      label: pillLabel,
      tone: pillTone,
    },
  ];

  const nextState: SnakesAndLaddersState = {
    ...state,
    players: nextPlayers,
    totalDartsThrown: state.totalDartsThrown + 1,
    currentVisit: nextVisit,
    turnComplete: won || nextVisit.length >= 3,
    isFinished: won,
    winnerId: won ? active.player.id : null,
    lastMove: {
      playerId: active.player.id,
      fromSquare,
      landedSquare,
      finalSquare,
      linkId: matchedLink?.id ?? null,
      linkType: matchedLink?.type ?? null,
      bounced,
    },
  };

  return { nextState, feedback };
}

export function advanceTurn(state: SnakesAndLaddersState): SnakesAndLaddersState {
  if (state.isFinished || state.players.length === 0 || !state.players[state.activePlayerIndex]) {
    return state;
  }

  const nextIndex = (state.activePlayerIndex + 1) % state.players.length;
  const nextRound = nextIndex === 0 ? state.round + 1 : state.round;

  return {
    ...state,
    activePlayerIndex: nextIndex,
    round: nextRound,
    currentVisit: [],
    turnComplete: false,
  };
}

export function buildGameResult(
  state: SnakesAndLaddersState,
  startedAt: number
): GameResult {
  const sorted = [...state.players].sort((a, b) => {
    if (a.player.id === state.winnerId) return -1;
    if (b.player.id === state.winnerId) return 1;
    if (b.position !== a.position) return b.position - a.position;
    if (b.laddersClimbed !== a.laddersClimbed) return b.laddersClimbed - a.laddersClimbed;
    return b.totalSteps - a.totalSteps;
  });

  const winner = sorted[0];

  const standings: GameStanding[] = sorted.map((ps, idx) => ({
    playerId: ps.player.id,
    playerName: ps.player.name,
    colorHex: ps.player.colorHex,
    rank: idx + 1,
    primaryStatLabel: `Square / ${state.boardSize}`,
    primaryStatValue: ps.position,
    secondaryStat: `🪜 ${ps.laddersClimbed} Ladders • 🐍 ${ps.snakesBitten} Snakes • ${ps.dartsThrown} Darts`,
  }));

  const totalLadders = state.players.reduce((sum, p) => sum + p.laddersClimbed, 0);
  const totalSnakes = state.players.reduce((sum, p) => sum + p.snakesBitten, 0);
  const bestClimber = [...state.players].sort((a, b) => b.laddersClimbed - a.laddersClimbed)[0];
  const unluckiest = [...state.players].sort((a, b) => b.snakesBitten - a.snakesBitten)[0];

  const highlights: string[] = [
    `${state.boardSize}-Square Board (${state.exactFinish ? 'Exact Finish' : 'Any Overshoot'})`,
    `${totalLadders} Ladders Climbed • ${totalSnakes} Snake Bites`,
  ];

  if (bestClimber && bestClimber.laddersClimbed > 0) {
    highlights.push(`Top Climber: ${bestClimber.player.name} (${bestClimber.laddersClimbed})`);
  }
  if (unluckiest && unluckiest.snakesBitten > 0) {
    highlights.push(`Snake Magnet: ${unluckiest.player.name} (${unluckiest.snakesBitten})`);
  }

  return {
    gameId: 'snakes-and-ladders',
    winnerId: winner?.player.id ?? null,
    winnerName: winner?.player.name ?? 'Winner',
    headline: `${winner?.player.name ?? 'Player'} conquered Square ${state.boardSize}!`,
    standings,
    totalDartsThrown: state.totalDartsThrown,
    durationMs: Math.max(1000, Date.now() - startedAt),
    highlights,
    completedAt: Date.now(),
  };
}
