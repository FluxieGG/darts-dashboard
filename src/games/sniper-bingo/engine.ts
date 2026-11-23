import { DartThrow } from '../../types/darts';
import { GameAccent, GameMatchConfig, GamePlayer, GameResult, GameStanding } from '../../types/games';
import { getDartNumber, isAnyBull, isMiss } from '../utils/dartHelpers';

export type SniperBingoCardMode = 'classic' | 'pro';
export type SniperBingoWinPattern = 'line' | 'blackout';

export interface SniperBingoConfig {
  cardMode: SniperBingoCardMode;
  winPattern: SniperBingoWinPattern;
}

export interface BingoSquare {
  index: number;
  /** Overlay key for SvgDartboard or semantic ID (e.g. '20', 'D16', 'T19', 'BULL') */
  id: string;
  label: string;
  sublabel: string;
  kind: 'number' | 'double' | 'treble' | 'bull';
  number: number; // 1..20 or 25 for Bull
  stamped: boolean;
}

export interface SniperBingoPlayerState extends GamePlayer {
  card: BingoSquare[]; // Always length 9 (3x3)
  stampedCount: number;
  dartsThrown: number;
  stampsThisGame: number;
  winningLine: number[] | null;
}

export interface SniperBingoVisitEntry {
  dart: DartThrow;
  label: string;
  tone: 'emerald' | 'amber' | 'rose' | 'sky' | 'purple' | 'slate';
}

export interface SniperBingoFeedback {
  sound: 'hit' | 'bonus' | 'jackpot' | 'hazard' | 'none';
  callout: {
    title: string;
    subtitle?: string;
    accent: GameAccent;
  } | null;
}

export interface SniperBingoGameState {
  config: SniperBingoConfig;
  players: SniperBingoPlayerState[];
  activePlayerIndex: number;
  round: number;
  visitEntries: SniperBingoVisitEntry[];
  visitStamps: number;
  turnComplete: boolean;
  totalDartsThrown: number;
  isFinished: boolean;
  winnerId: string | null;
}

export interface SniperBingoHistorySnapshot {
  state: SniperBingoGameState;
  turnStartState: SniperBingoGameState;
}

export const BINGO_LINES: readonly number[][] = [
  [0, 1, 2], // Top row
  [3, 4, 5], // Middle row
  [6, 7, 8], // Bottom row
  [0, 3, 6], // Left col
  [1, 4, 7], // Mid col
  [2, 5, 8], // Right col
  [0, 4, 8], // Main diagonal
  [2, 4, 6], // Anti-diagonal
] as const;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithRng<T>(items: T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generateCard(cardMode: SniperBingoCardMode, rng: () => number): BingoSquare[] {
  const allNumbers = Array.from({ length: 20 }, (_, i) => i + 1);
  const picked = shuffleWithRng(allNumbers, rng).slice(0, 8);

  let outerTargets: Array<Omit<BingoSquare, 'index'>>;

  if (cardMode === 'pro') {
    // 4 unique Doubles + 4 unique Trebles shuffled across the 8 outer cells
    const doubles = picked.slice(0, 4).map((num) => ({
      id: `D${num}`,
      label: `D${num}`,
      sublabel: 'DOUBLE',
      kind: 'double' as const,
      number: num,
      stamped: false,
    }));
    const trebles = picked.slice(4, 8).map((num) => ({
      id: `T${num}`,
      label: `T${num}`,
      sublabel: 'TREBLE',
      kind: 'treble' as const,
      number: num,
      stamped: false,
    }));
    outerTargets = shuffleWithRng([...doubles, ...trebles], rng);
  } else {
    outerTargets = picked.map((num) => ({
      id: String(num),
      label: String(num),
      sublabel: 'ANY BED',
      kind: 'number' as const,
      number: num,
      stamped: false,
    }));
  }

  const centerBull: Omit<BingoSquare, 'index'> = {
    id: 'BULL',
    label: 'BULL',
    sublabel: '25 • 50',
    kind: 'bull',
    number: 25,
    stamped: false,
  };

  const fullNine = [
    ...outerTargets.slice(0, 4),
    centerBull,
    ...outerTargets.slice(4, 8),
  ];

  return fullNine.map((sq, index) => ({ ...sq, index }));
}

export function parseSniperBingoConfig(raw: GameMatchConfig): SniperBingoConfig {
  const cardMode: SniperBingoCardMode = raw.cardMode === 'pro' ? 'pro' : 'classic';
  const winPattern: SniperBingoWinPattern = raw.winPattern === 'blackout' ? 'blackout' : 'line';
  return { cardMode, winPattern };
}

export function createInitialState(
  players: GamePlayer[],
  rawConfig: GameMatchConfig,
  seed: number = Date.now()
): SniperBingoGameState {
  const config = parseSniperBingoConfig(rawConfig);
  const rng = mulberry32(seed);

  const playerStates: SniperBingoPlayerState[] = players.map((p) => ({
    ...p,
    card: generateCard(config.cardMode, rng),
    stampedCount: 0,
    dartsThrown: 0,
    stampsThisGame: 0,
    winningLine: null,
  }));

  return {
    config,
    players: playerStates,
    activePlayerIndex: 0,
    round: 1,
    visitEntries: [],
    visitStamps: 0,
    turnComplete: false,
    totalDartsThrown: 0,
    isFinished: false,
    winnerId: null,
  };
}

export function findWinningPattern(
  card: BingoSquare[],
  winPattern: SniperBingoWinPattern
): number[] | null {
  if (winPattern === 'blackout') {
    return card.every((sq) => sq.stamped) ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : null;
  }
  for (const line of BINGO_LINES) {
    if (line.every((idx) => card[idx]?.stamped)) {
      return [...line];
    }
  }
  return null;
}

/**
 * Returns square indices that would immediately win the game if hit right now!
 */
export function getMatchPointIndices(
  card: BingoSquare[],
  winPattern: SniperBingoWinPattern
): Set<number> {
  const result = new Set<number>();

  if (winPattern === 'blackout') {
    const unstamped = card.filter((sq) => !sq.stamped);
    if (unstamped.length === 1) {
      result.add(unstamped[0].index);
    }
    return result;
  }

  for (const line of BINGO_LINES) {
    const unstamped = line.filter((idx) => !card[idx]?.stamped);
    if (unstamped.length === 1) {
      result.add(unstamped[0]);
    }
  }
  return result;
}

function doesDartMatchSquare(dart: DartThrow, square: BingoSquare): boolean {
  if (isMiss(dart)) return false;

  if (square.kind === 'bull') {
    return isAnyBull(dart);
  }

  if (isAnyBull(dart)) return false;

  const num = getDartNumber(dart);
  if (num !== square.number) return false;

  if (square.kind === 'number') return true;
  if (square.kind === 'double') return dart.segment.multiplier === 2;
  if (square.kind === 'treble') return dart.segment.multiplier === 3;
  return false;
}

export function applyDartToState(
  state: SniperBingoGameState,
  dart: DartThrow
): { nextState: SniperBingoGameState; feedback: SniperBingoFeedback } {
  if (state.isFinished || state.turnComplete || state.visitEntries.length >= 3) {
    return { nextState: state, feedback: { sound: 'none', callout: null } };
  }

  const players = state.players.map((p) => ({
    ...p,
    card: p.card.map((sq) => ({ ...sq })),
    winningLine: p.winningLine ? [...p.winningLine] : null,
  }));

  const active = players[state.activePlayerIndex];
  active.dartsThrown += 1;

  const nextTotalDarts = state.totalDartsThrown + 1;
  let nextVisitStamps = state.visitStamps;

  const matchedUnstamped = active.card.find((sq) => !sq.stamped && doesDartMatchSquare(dart, sq));
  const matchedAlreadyStamped = !matchedUnstamped
    ? active.card.find((sq) => sq.stamped && doesDartMatchSquare(dart, sq))
    : undefined;

  let entry: SniperBingoVisitEntry;
  let feedback: SniperBingoFeedback;
  let isFinished = false;
  let winnerId: string | null = null;

  if (matchedUnstamped) {
    matchedUnstamped.stamped = true;
    active.stampedCount += 1;
    active.stampsThisGame += 1;
    nextVisitStamps += 1;

    const winningLine = findWinningPattern(active.card, state.config.winPattern);

    if (winningLine) {
      active.winningLine = winningLine;
      isFinished = true;
      winnerId = active.id;
      entry = { dart, label: 'BINGO! 🏆', tone: 'emerald' };
      feedback = {
        sound: 'jackpot',
        callout: {
          title:
            state.config.winPattern === 'blackout'
              ? `🎯 BLACKOUT BINGO! ${active.name.toUpperCase()} WINS!`
              : `🎯 SNIPER BINGO! ${active.name.toUpperCase()} WINS!`,
          subtitle: `Winning stamp on ${matchedUnstamped.label} (${active.stampedCount}/9 squares)!`,
          accent: 'emerald',
        },
      };
    } else {
      const nextMatchPoints = getMatchPointIndices(active.card, state.config.winPattern);
      const isTripleStampVisit = nextVisitStamps === 3;
      const isMatchPointNow = nextMatchPoints.size > 0;

      entry = {
        dart,
        label: `STAMPED ${matchedUnstamped.label}`,
        tone: isMatchPointNow ? 'amber' : 'emerald',
      };

      if (isTripleStampVisit) {
        feedback = {
          sound: 'jackpot',
          callout: {
            title: '🔥 HAT-TRICK SNIPER! 3/3 STAMPS!',
            subtitle: `${active.name} stamped ${matchedUnstamped.label} for a perfect visit!`,
            accent: 'purple',
          },
        };
      } else if (isMatchPointNow) {
        const neededLabels = Array.from(nextMatchPoints)
          .map((idx) => active.card[idx]?.label)
          .filter(Boolean)
          .join(' / ');
        feedback = {
          sound: 'bonus',
          callout: {
            title: `🎯 STAMPED ${matchedUnstamped.label}! 1 AWAY FROM BINGO!`,
            subtitle: `Match point targets: ${neededLabels}`,
            accent: 'amber',
          },
        };
      } else {
        feedback = {
          sound: matchedUnstamped.kind === 'bull' || matchedUnstamped.kind === 'treble' ? 'jackpot' : 'bonus',
          callout: {
            title: `✅ STAMPED ${matchedUnstamped.label}!`,
            subtitle: `${active.name} has ${active.stampedCount}/9 squares cleared`,
            accent: 'emerald',
          },
        };
      }
    }
  } else if (matchedAlreadyStamped) {
    entry = { dart, label: `${matchedAlreadyStamped.label} DONE`, tone: 'sky' };
    feedback = {
      sound: 'hit',
      callout: {
        title: `✓ ${matchedAlreadyStamped.label} ALREADY STAMPED`,
        subtitle: 'Aim for remaining highlighted card targets',
        accent: 'sky',
      },
    };
  } else {
    entry = { dart, label: isMiss(dart) ? 'MISS' : 'OFF CARD', tone: 'slate' };
    feedback = {
      sound: isMiss(dart) ? 'hazard' : 'hit',
      callout: null,
    };
  }

  const nextEntries = [...state.visitEntries, entry];
  const turnComplete = isFinished || nextEntries.length >= 3;

  return {
    nextState: {
      ...state,
      players,
      visitEntries: nextEntries,
      visitStamps: nextVisitStamps,
      turnComplete,
      totalDartsThrown: nextTotalDarts,
      isFinished,
      winnerId,
    },
    feedback,
  };
}

export function advanceTurn(state: SniperBingoGameState): SniperBingoGameState {
  if (state.isFinished) return state;

  const nextPlayerIndex = (state.activePlayerIndex + 1) % state.players.length;
  const nextRound = nextPlayerIndex === 0 ? state.round + 1 : state.round;

  return {
    ...state,
    activePlayerIndex: nextPlayerIndex,
    round: nextRound,
    visitEntries: [],
    visitStamps: 0,
    turnComplete: false,
  };
}

export function buildGameResult(state: SniperBingoGameState, startedAt: number): GameResult {
  const winner = state.players.find((p) => p.id === state.winnerId) ?? state.players[0];

  const sorted = [...state.players].sort((a, b) => {
    if (a.id === state.winnerId) return -1;
    if (b.id === state.winnerId) return 1;
    if (b.stampedCount !== a.stampedCount) return b.stampedCount - a.stampedCount;
    return a.dartsThrown - b.dartsThrown;
  });

  const standings: GameStanding[] = sorted.map((p, idx) => {
    const accuracy = p.dartsThrown > 0 ? Math.round((p.stampsThisGame / p.dartsThrown) * 100) : 0;
    return {
      playerId: p.id,
      playerName: p.name,
      colorHex: p.colorHex,
      rank: idx + 1,
      primaryStatLabel: 'Squares',
      primaryStatValue: `${p.stampedCount} / 9`,
      secondaryStat: `${p.dartsThrown} Darts • ${accuracy}% Hit Rate`,
    };
  });

  return {
    gameId: 'sniper-bingo',
    winnerId: winner?.id ?? null,
    winnerName: winner?.name ?? 'Sniper',
    headline:
      state.config.winPattern === 'blackout'
        ? `${winner?.name ?? 'Sniper'} clears a Blackout Bingo card!`
        : `${winner?.name ?? 'Sniper'} snipes a winning Bingo line!`,
    standings,
    totalDartsThrown: state.totalDartsThrown,
    durationMs: Math.max(1000, Date.now() - startedAt),
    highlights: [
      `Card Mode: ${state.config.cardMode === 'pro' ? 'Pro (Doubles, Trebles & Bull)' : 'Classic (1–20 + Bull)'}`,
      `Win Pattern: ${state.config.winPattern === 'blackout' ? 'Full Blackout (9/9)' : '3-in-a-Row Line'}`,
      `Winning Darts: ${winner?.dartsThrown ?? 0}`,
    ],
    completedAt: Date.now(),
  };
}
