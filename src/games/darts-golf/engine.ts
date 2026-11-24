import { DartThrow } from '../../types/darts';
import {
  GameAccent,
  GameMatchConfig,
  GamePlayer,
  GameResult,
  GameStanding,
} from '../../types/games';
import { getDartNumber, isInnerBull, isMiss } from '../utils/dartHelpers';

export type GolfCourse = '9hole' | '20hole';
export type GolfScoringRule = 'lastDart' | 'bestDart';

export type GolfShotTerm =
  | 'Eagle'
  | 'Birdie'
  | 'Par'
  | 'Gimme Par'
  | 'Bogey'
  | 'Double Bogey';

export interface GolfShotResult {
  dartId: string;
  holeIndex: number;
  targetNumber: number;
  scoreDelta: number; // -2, -1, 0, +1, +2
  term: GolfShotTerm;
  shortLabel: string;
  tone: 'amber' | 'emerald' | 'sky' | 'slate' | 'rose';
  isGimmeBull: boolean;
}

export interface DartsGolfPlayerState {
  player: GamePlayer;
  holeScores: Record<number, number>; // holeIndex (0-based) -> scoreDelta
  totalToPar: number;
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubleBogeys: number;
  gimmeBulls: number;
  dartsThrown: number;
}

export interface DartsGolfState {
  course: GolfCourse;
  scoringRule: GolfScoringRule;
  gimmeBull: boolean;
  /** Randomised unique dartboard target numbers (1–20), one per hole */
  holes: number[];
  holeIndex: number;
  activePlayerIndex: number;
  players: DartsGolfPlayerState[];
  visitDarts: DartThrow[];
  visitShots: GolfShotResult[];
  turnComplete: boolean;
  totalDartsThrown: number;
  isFinished: boolean;
}

export interface DartsGolfFeedback {
  title?: string;
  subtitle?: string;
  accent?: GameAccent;
  sound: 'dartHit' | 'bonusHit' | 'jackpot' | 'hazard';
}

export function formatGolfScore(delta: number): string {
  if (delta === 0) return 'E';
  return delta > 0 ? `+${delta}` : `${delta}`;
}

/**
 * Generates a freshly shuffled random set of unique dartboard numbers (1–20).
 * - '9hole' picks 9 random unique segments
 * - '20hole' shuffles all 20 segments for a full-board random challenge
 */
export function getCourseHoles(course: GolfCourse): number[] {
  const pool = Array.from({ length: 20 }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return course === '20hole' ? pool : pool.slice(0, 9);
}

function parseCourse(raw: unknown): GolfCourse {
  if (raw === '20hole' || raw === 'full18') return '20hole';
  return '9hole';
}

function parseScoringRule(raw: unknown): GolfScoringRule {
  if (raw === 'bestDart' || raw === 'lastDart') return raw;
  return 'lastDart';
}

export function evaluateGolfShot(
  dart: DartThrow,
  holeIndex: number,
  targetNumber: number,
  gimmeBull: boolean
): GolfShotResult {
  if (gimmeBull && isInnerBull(dart)) {
    return {
      dartId: dart.id,
      holeIndex,
      targetNumber,
      scoreDelta: 0,
      term: 'Gimme Par',
      shortLabel: 'Gimme E',
      tone: 'sky',
      isGimmeBull: true,
    };
  }

  // Miss completely off the board / bounce-out = Double Bogey (+2)
  if (isMiss(dart)) {
    return {
      dartId: dart.id,
      holeIndex,
      targetNumber,
      scoreDelta: 2,
      term: 'Double Bogey',
      shortLabel: 'Out +2',
      tone: 'rose',
      isGimmeBull: false,
    };
  }

  // Wrong number still on the board = Bogey (+1)
  const num = getDartNumber(dart);
  if (num !== targetNumber) {
    return {
      dartId: dart.id,
      holeIndex,
      targetNumber,
      scoreDelta: 1,
      term: 'Bogey',
      shortLabel: 'Bogey +1',
      tone: 'slate',
      isGimmeBull: false,
    };
  }

  if (dart.segment.multiplier === 3 || dart.segment.bed === 'Triple') {
    return {
      dartId: dart.id,
      holeIndex,
      targetNumber,
      scoreDelta: -2,
      term: 'Eagle',
      shortLabel: 'Eagle -2',
      tone: 'amber',
      isGimmeBull: false,
    };
  }

  if (dart.segment.multiplier === 2 || dart.segment.bed === 'Double') {
    return {
      dartId: dart.id,
      holeIndex,
      targetNumber,
      scoreDelta: -1,
      term: 'Birdie',
      shortLabel: 'Birdie -1',
      tone: 'emerald',
      isGimmeBull: false,
    };
  }

  // Any Single on the target number (inner or outer) = Par (E)
  return {
    dartId: dart.id,
    holeIndex,
    targetNumber,
    scoreDelta: 0,
    term: 'Par',
    shortLabel: 'Par E',
    tone: 'sky',
    isGimmeBull: false,
  };
}

export function getProvisionalShot(
  visitShots: GolfShotResult[],
  scoringRule: GolfScoringRule
): GolfShotResult | null {
  if (visitShots.length === 0) return null;
  if (scoringRule === 'lastDart') {
    return visitShots[visitShots.length - 1];
  }
  return visitShots.reduce((best, current) =>
    current.scoreDelta < best.scoreDelta ? current : best
  );
}

export function createInitialDartsGolfState(
  players: GamePlayer[],
  config: GameMatchConfig
): DartsGolfState {
  const course = parseCourse(config.course);
  const scoringRule = parseScoringRule(config.scoringRule);
  const gimmeBull = config.gimmeBull !== undefined ? Boolean(config.gimmeBull) : true;
  const holes = getCourseHoles(course);

  return {
    course,
    scoringRule,
    gimmeBull,
    holes,
    holeIndex: 0,
    activePlayerIndex: 0,
    players: players.map((player) => ({
      player,
      holeScores: {},
      totalToPar: 0,
      eagles: 0,
      birdies: 0,
      pars: 0,
      bogeys: 0,
      doubleBogeys: 0,
      gimmeBulls: 0,
      dartsThrown: 0,
    })),
    visitDarts: [],
    visitShots: [],
    turnComplete: false,
    totalDartsThrown: 0,
    isFinished: false,
  };
}

function commitActivePlayerHole(state: DartsGolfState): DartsGolfState {
  const targetNumber = state.holes[state.holeIndex];
  const finalShot = getProvisionalShot(state.visitShots, state.scoringRule);
  if (targetNumber === undefined || !finalShot) {
    return state;
  }

  const nextPlayers = state.players.map((entry, idx) => {
    if (idx !== state.activePlayerIndex) return entry;
    const delta = finalShot.scoreDelta;
    const nextHoleScores = {
      ...entry.holeScores,
      [state.holeIndex]: delta,
    };
    const nextTotal = Object.values(nextHoleScores).reduce((sum, val) => sum + val, 0);

    return {
      ...entry,
      holeScores: nextHoleScores,
      totalToPar: nextTotal,
      eagles: entry.eagles + (delta === -2 ? 1 : 0),
      birdies: entry.birdies + (delta === -1 ? 1 : 0),
      pars: entry.pars + (delta === 0 ? 1 : 0),
      bogeys: entry.bogeys + (delta === 1 ? 1 : 0),
      doubleBogeys: entry.doubleBogeys + (delta >= 2 ? 1 : 0),
      gimmeBulls: entry.gimmeBulls + (finalShot.isGimmeBull ? 1 : 0),
    };
  });

  return {
    ...state,
    players: nextPlayers,
  };
}

export function applyDartToDartsGolf(
  state: DartsGolfState,
  dart: DartThrow
): { nextState: DartsGolfState; feedback: DartsGolfFeedback } {
  if (
    state.isFinished ||
    state.turnComplete ||
    state.players.length === 0 ||
    !state.players[state.activePlayerIndex]
  ) {
    return { nextState: state, feedback: { sound: 'dartHit' } };
  }

  const targetNumber = state.holes[state.holeIndex];
  const holeOrder = state.holeIndex + 1;
  const activeEntry = state.players[state.activePlayerIndex];
  if (targetNumber === undefined || !activeEntry) {
    return { nextState: state, feedback: { sound: 'dartHit' } };
  }

  const shot = evaluateGolfShot(dart, state.holeIndex, targetNumber, state.gimmeBull);
  const nextVisitDarts = [...state.visitDarts, dart];
  const nextVisitShots = [...state.visitShots, shot];

  const nextPlayers = state.players.map((entry, idx) =>
    idx === state.activePlayerIndex
      ? { ...entry, dartsThrown: entry.dartsThrown + 1 }
      : entry
  );

  // Best-dart mode auto-locks on an unbeatable Eagle (-2)
  const hitMaxBest = state.scoringRule === 'bestDart' && shot.scoreDelta === -2;
  const turnComplete = nextVisitDarts.length >= 3 || hitMaxBest;

  let nextState: DartsGolfState = {
    ...state,
    players: nextPlayers,
    visitDarts: nextVisitDarts,
    visitShots: nextVisitShots,
    turnComplete,
    totalDartsThrown: state.totalDartsThrown + 1,
  };

  const isFinalPlayerOfFinalHole =
    state.holeIndex === state.holes.length - 1 &&
    state.activePlayerIndex === state.players.length - 1;

  if (turnComplete && isFinalPlayerOfFinalHole) {
    nextState = {
      ...commitActivePlayerHole(nextState),
      isFinished: true,
    };
  }

  const playerName = activeEntry.player.name;
  let feedback: DartsGolfFeedback;

  if (shot.scoreDelta === -2) {
    feedback = {
      title: `🦅 EAGLE! (-2) ON HOLE ${holeOrder} (#${targetNumber})`,
      subtitle:
        state.scoringRule === 'lastDart' && !turnComplete
          ? `${playerName} drained T${targetNumber}! Pull darts now to lock -2!`
          : `${playerName} buried T${targetNumber} for a massive Eagle!`,
      accent: 'amber',
      sound: 'jackpot',
    };
  } else if (shot.scoreDelta === -1) {
    feedback = {
      title: `🐦 BIRDIE! (-1) ON HOLE ${holeOrder} (#${targetNumber})`,
      subtitle:
        state.scoringRule === 'lastDart' && !turnComplete
          ? `${playerName} hit D${targetNumber}! Pull darts to bank -1 or risk Eagle!`
          : `${playerName} sank D${targetNumber} for Birdie!`,
      accent: 'emerald',
      sound: 'bonusHit',
    };
  } else if (shot.isGimmeBull) {
    feedback = {
      title: `🎯 GIMME BULL! PAR SAVED (E)`,
      subtitle: `${playerName} rescued Hole ${holeOrder} (#${targetNumber}) from the center cup!`,
      accent: 'sky',
      sound: 'jackpot',
    };
  } else if (shot.scoreDelta === 0) {
    feedback = {
      title: `⛳ PAR (E) ON HOLE ${holeOrder} (#${targetNumber})`,
      subtitle: `${playerName} landed Single #${targetNumber} for Par.`,
      accent: 'sky',
      sound: 'bonusHit',
    };
  } else if (shot.scoreDelta === 1) {
    feedback = {
      title: `BOGEY (+1) ON HOLE ${holeOrder} (#${targetNumber})`,
      subtitle: `${playerName} missed into ${dart.segment.name} on the board.`,
      accent: 'amber',
      sound: 'dartHit',
    };
  } else {
    feedback = {
      title: `DOUBLE BOGEY (+2)`,
      subtitle: `${playerName} missed off the board on Hole ${holeOrder}!`,
      accent: 'rose',
      sound: 'hazard',
    };
  }

  return { nextState, feedback };
}

export function advanceDartsGolfTurn(state: DartsGolfState): DartsGolfState {
  if (
    state.isFinished ||
    state.visitDarts.length === 0 ||
    state.players.length === 0 ||
    !state.players[state.activePlayerIndex]
  ) {
    return state;
  }

  const committed = commitActivePlayerHole(state);
  const nextPlayerIndex = (committed.activePlayerIndex + 1) % committed.players.length;
  const wrappedToNextHole = nextPlayerIndex === 0;
  const nextHoleIndex = wrappedToNextHole ? committed.holeIndex + 1 : committed.holeIndex;

  if (nextHoleIndex >= committed.holes.length) {
    return {
      ...committed,
      visitDarts: [],
      visitShots: [],
      turnComplete: true,
      isFinished: true,
    };
  }

  return {
    ...committed,
    activePlayerIndex: nextPlayerIndex,
    holeIndex: nextHoleIndex,
    visitDarts: [],
    visitShots: [],
    turnComplete: false,
  };
}

export function sortDartsGolfStandings(players: DartsGolfPlayerState[]): DartsGolfPlayerState[] {
  return [...players].sort((a, b) => {
    if (a.totalToPar !== b.totalToPar) return a.totalToPar - b.totalToPar;
    if (a.eagles !== b.eagles) return b.eagles - a.eagles;
    if (a.birdies !== b.birdies) return b.birdies - a.birdies;
    return a.doubleBogeys - b.doubleBogeys;
  });
}

export function buildDartsGolfResult(state: DartsGolfState, startedAt: number): GameResult {
  const sorted = sortDartsGolfStandings(state.players);
  const champion = sorted[0];
  const courseLabel =
    state.course === '20hole' ? '20-Hole Random' : '9-Hole Random';

  const standings: GameStanding[] = sorted.map((entry, idx) => ({
    playerId: entry.player.id,
    playerName: entry.player.name,
    colorHex: entry.player.colorHex,
    rank: idx + 1,
    primaryStatLabel: 'To Par',
    primaryStatValue: formatGolfScore(entry.totalToPar),
    secondaryStat: `${entry.eagles}E • ${entry.birdies}B • ${entry.pars}P`,
  }));

  const totalEagles = sorted.reduce((sum, p) => sum + p.eagles, 0);
  const totalBirdies = sorted.reduce((sum, p) => sum + p.birdies, 0);
  const totalGimmes = sorted.reduce((sum, p) => sum + p.gimmeBulls, 0);

  const highlights: string[] = [
    `${courseLabel} (${state.scoringRule === 'lastDart' ? 'Last Dart Risk' : 'Best of 3'})`,
    `Winning Card: ${formatGolfScore(champion?.totalToPar ?? 0)}`,
  ];
  if (totalEagles > 0) highlights.push(`${totalEagles} Eagle${totalEagles > 1 ? 's' : ''} Drained`);
  if (totalBirdies > 0) highlights.push(`${totalBirdies} Birdie${totalBirdies > 1 ? 's' : ''} Sunk`);
  if (totalGimmes > 0) highlights.push(`${totalGimmes} Gimme Bull Save${totalGimmes > 1 ? 's' : ''}`);

  return {
    gameId: 'darts-golf',
    winnerId: champion?.player.id ?? null,
    winnerName: champion?.player.name ?? 'Winner',
    headline: `${champion?.player.name ?? 'Champion'} takes the Green Jacket at ${formatGolfScore(
      champion?.totalToPar ?? 0
    )}!`,
    standings,
    totalDartsThrown: state.totalDartsThrown,
    durationMs: Math.max(0, Date.now() - startedAt),
    highlights,
    completedAt: Date.now(),
  };
}
