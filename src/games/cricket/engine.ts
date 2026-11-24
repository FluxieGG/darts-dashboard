import { DartThrow } from '../../types/darts';
import { GameAccent, GameMatchConfig, GamePlayer, GameResult, GameStanding } from '../../types/games';
import { getDartNumber, isInnerBull, isMiss, isOuterBull } from '../utils/dartHelpers';

export type CricketVariant = 'standard' | 'cutthroat';
export type CricketTargetsMode = 'classic';
export type CricketTarget = 20 | 19 | 18 | 17 | 16 | 15 | 25;

export const CRICKET_TARGETS: readonly CricketTarget[] = [20, 19, 18, 17, 16, 15, 25] as const;

export interface CricketConfig {
  variant: CricketVariant;
  targets: CricketTargetsMode;
}

export interface CricketPlayerState extends GamePlayer {
  score: number;
  marks: Record<CricketTarget, number>;
  totalMarks: number;
  dartsThrown: number;
  bestVisitMarks: number;
}

export interface CricketVisitEntry {
  dart: DartThrow;
  label: string;
  tone: 'emerald' | 'amber' | 'rose' | 'sky' | 'purple' | 'slate';
}

export interface CricketFeedback {
  sound: 'hit' | 'bonus' | 'jackpot' | 'hazard' | 'none';
  callout: {
    title: string;
    subtitle?: string;
    accent: GameAccent;
  } | null;
}

export interface CricketGameState {
  config: CricketConfig;
  players: CricketPlayerState[];
  activePlayerIndex: number;
  round: number;
  visitEntries: CricketVisitEntry[];
  visitMarks: number;
  visitPointsDelta: number;
  turnComplete: boolean;
  totalDartsThrown: number;
  isFinished: boolean;
  winnerId: string | null;
}

export interface CricketHistorySnapshot {
  state: CricketGameState;
  turnStartState: CricketGameState;
}

export function formatTargetLabel(target: CricketTarget): string {
  return target === 25 ? 'BULL' : String(target);
}

export function parseCricketConfig(raw: GameMatchConfig): CricketConfig {
  const variant: CricketVariant = raw.variant === 'cutthroat' ? 'cutthroat' : 'standard';
  const targets: CricketTargetsMode = 'classic';
  return { variant, targets };
}

function createEmptyMarks(): Record<CricketTarget, number> {
  return {
    20: 0,
    19: 0,
    18: 0,
    17: 0,
    16: 0,
    15: 0,
    25: 0,
  };
}

export function isTargetDead(players: CricketPlayerState[], target: CricketTarget): boolean {
  if (players.length === 0) return false;
  return players.every((p) => p.marks[target] >= 3);
}

export function hasClosedAllTargets(player: CricketPlayerState): boolean {
  return CRICKET_TARGETS.every((t) => player.marks[t] >= 3);
}

export function getClosedCount(player: CricketPlayerState): number {
  return CRICKET_TARGETS.reduce((sum, t) => sum + (player.marks[t] >= 3 ? 1 : 0), 0);
}

function findWinner(
  players: CricketPlayerState[],
  variant: CricketVariant,
  activePlayerIndex: number
): CricketPlayerState | null {
  const checkPlayer = (candidate: CricketPlayerState): boolean => {
    if (!hasClosedAllTargets(candidate)) return false;
    const others = players.filter((p) => p.id !== candidate.id);
    if (others.length === 0) return true;
    if (variant === 'cutthroat') {
      return others.every((o) => candidate.score <= o.score);
    }
    return others.every((o) => candidate.score >= o.score);
  };

  // Prioritize checking active player first
  const active = players[activePlayerIndex];
  if (active && checkPlayer(active)) return active;

  // In Cut-Throat, dumping points on another rival could hand victory to an already-closed player
  for (const p of players) {
    if (p.id !== active?.id && checkPlayer(p)) {
      return p;
    }
  }

  return null;
}

export function createInitialState(
  players: GamePlayer[],
  rawConfig: GameMatchConfig
): CricketGameState {
  const config = parseCricketConfig(rawConfig);

  const playerStates: CricketPlayerState[] = players.map((p) => ({
    ...p,
    score: 0,
    marks: createEmptyMarks(),
    totalMarks: 0,
    dartsThrown: 0,
    bestVisitMarks: 0,
  }));

  return {
    config,
    players: playerStates,
    activePlayerIndex: 0,
    round: 1,
    visitEntries: [],
    visitMarks: 0,
    visitPointsDelta: 0,
    turnComplete: false,
    totalDartsThrown: 0,
    isFinished: false,
    winnerId: null,
  };
}

function extractCricketHit(dart: DartThrow): { target: CricketTarget; marks: number } | null {
  if (isMiss(dart)) return null;
  if (isInnerBull(dart)) return { target: 25, marks: 2 };
  if (isOuterBull(dart)) return { target: 25, marks: 1 };

  const num = getDartNumber(dart);
  if (num === 20 || num === 19 || num === 18 || num === 17 || num === 16 || num === 15) {
    const mult = Math.max(1, Math.min(3, dart.segment.multiplier || 1));
    return { target: num, marks: mult };
  }
  return null;
}

export function applyDartToState(
  state: CricketGameState,
  dart: DartThrow
): { nextState: CricketGameState; feedback: CricketFeedback } {
  if (
    state.isFinished ||
    state.turnComplete ||
    state.visitEntries.length >= 3 ||
    state.players.length === 0 ||
    !state.players[state.activePlayerIndex]
  ) {
    return { nextState: state, feedback: { sound: 'none', callout: null } };
  }

  const players = state.players.map((p) => ({
    ...p,
    marks: { ...p.marks },
  }));
  const active = players[state.activePlayerIndex];
  active.dartsThrown += 1;

  const hit = extractCricketHit(dart);
  const nextTotalDarts = state.totalDartsThrown + 1;
  let nextVisitMarks = state.visitMarks;
  let nextVisitPoints = state.visitPointsDelta;

  let entry: CricketVisitEntry;
  let feedback: CricketFeedback;

  if (!hit) {
    entry = { dart, label: isMiss(dart) ? 'MISS' : 'OFF TARGET', tone: 'slate' };
    feedback = {
      sound: isMiss(dart) ? 'hazard' : 'hit',
      callout: null,
    };
  } else {
    const { target, marks: earnedMarks } = hit;
    const targetName = formatTargetLabel(target);
    const deadBefore = isTargetDead(players, target);

    if (deadBefore) {
      entry = { dart, label: `${targetName} DEAD`, tone: 'slate' };
      feedback = {
        sound: 'hit',
        callout: {
          title: `${targetName} IS DEAD`,
          subtitle: 'All players have already closed this target',
          accent: 'sky',
        },
      };
    } else {
      const prevMarks = active.marks[target];
      const neededToClose = Math.max(0, 3 - prevMarks);
      const closingMarks = Math.min(neededToClose, earnedMarks);
      const overflowMarks = Math.max(0, earnedMarks - neededToClose);

      active.marks[target] = prevMarks + closingMarks;

      const openOpponents = players.filter(
        (p) => p.id !== active.id && p.marks[target] < 3
      );

      let pointsScored = 0;
      let effectiveMarks = closingMarks;

      if (overflowMarks > 0 && openOpponents.length > 0) {
        effectiveMarks += overflowMarks;
        const pointUnit = target === 25 ? 25 : target;
        pointsScored = overflowMarks * pointUnit;

        if (state.config.variant === 'cutthroat') {
          for (const opp of openOpponents) {
            opp.score += pointsScored;
          }
        } else {
          active.score += pointsScored;
        }
        nextVisitPoints += pointsScored;
      }

      active.totalMarks += effectiveMarks;
      nextVisitMarks += effectiveMarks;
      if (nextVisitMarks > active.bestVisitMarks) {
        active.bestVisitMarks = nextVisitMarks;
      }

      const justClosed = prevMarks < 3 && active.marks[target] >= 3;
      const nowDead = isTargetDead(players, target);

      if (pointsScored > 0) {
        const isCutthroat = state.config.variant === 'cutthroat';
        entry = {
          dart,
          label: isCutthroat ? `DUMP +${pointsScored}` : `+${pointsScored} PTS`,
          tone: isCutthroat ? 'rose' : 'emerald',
        };
        feedback = {
          sound: earnedMarks >= 3 || isInnerBull(dart) ? 'jackpot' : 'bonus',
          callout: {
            title: isCutthroat
              ? `⚔️ CUT-THROAT! +${pointsScored} ON RIVALS!`
              : `⚡ +${pointsScored} ON ${targetName}!`,
            subtitle: justClosed
              ? `${active.name} closed ${targetName} & scored overflow!`
              : isCutthroat
              ? `Dumped onto ${openOpponents.map((o) => o.name).join(', ')}`
              : `${overflowMarks} scoring ${overflowMarks === 1 ? 'mark' : 'marks'}`,
            accent: isCutthroat ? 'rose' : 'emerald',
          },
        };
      } else if (justClosed) {
        entry = { dart, label: `CLOSED ${targetName}`, tone: 'emerald' };
        feedback = {
          sound: earnedMarks >= 3 || isInnerBull(dart) ? 'jackpot' : 'bonus',
          callout: {
            title: nowDead ? `🔒 ${targetName} LOCKED DEAD!` : `⊗ ${targetName} CLOSED!`,
            subtitle: nowDead
              ? 'Everyone has closed this target — move on!'
              : state.config.variant === 'cutthroat'
              ? `${active.name} can now dump ${targetName}s on rivals!`
              : `${active.name} can now score points on ${targetName}!`,
            accent: nowDead ? 'sky' : 'emerald',
          },
        };
      } else if (effectiveMarks > 0) {
        entry = {
          dart,
          label: `+${effectiveMarks} ${effectiveMarks === 1 ? 'MARK' : 'MARKS'}`,
          tone: effectiveMarks >= 2 ? 'amber' : 'sky',
        };
        feedback = {
          sound: effectiveMarks >= 2 ? 'bonus' : 'hit',
          callout:
            effectiveMarks >= 2
              ? {
                  title: `🎯 ${effectiveMarks} MARKS ON ${targetName}!`,
                  subtitle: `${3 - active.marks[target]} more to close ${targetName}`,
                  accent: 'amber',
                }
              : null,
        };
      } else {
        entry = { dart, label: `${targetName} CLOSED`, tone: 'slate' };
        feedback = { sound: 'hit', callout: null };
      }
    }
  }

  // Check for immediate victory
  const winner = findWinner(players, state.config.variant, state.activePlayerIndex);
  const isFinished = winner !== null;
  const winnerId = winner?.id ?? null;

  if (isFinished && winner) {
    feedback = {
      sound: 'jackpot',
      callout: {
        title: `🏆 CRICKET VICTORY! ${winner.name.toUpperCase()} WINS!`,
        subtitle:
          state.config.variant === 'cutthroat'
            ? `All 7 targets closed with lowest score (${winner.score} pts)!`
            : `All 7 targets closed with ${winner.score} pts!`,
        accent: 'emerald',
      },
    };
  } else if (nextVisitMarks >= 5 && state.visitEntries.length === 2) {
    // Celebrate a monster 5+ mark visit on Dart 3
    feedback = {
      sound: 'jackpot',
      callout: {
        title: `🔥 ${nextVisitMarks}-MARK WHITE HORSE VISIT!`,
        subtitle: `${active.name} is tearing up the Cricket board!`,
        accent: 'purple',
      },
    };
  }

  const nextEntries = [...state.visitEntries, entry];
  const turnComplete = isFinished || nextEntries.length >= 3;

  return {
    nextState: {
      ...state,
      players,
      visitEntries: nextEntries,
      visitMarks: nextVisitMarks,
      visitPointsDelta: nextVisitPoints,
      turnComplete,
      totalDartsThrown: nextTotalDarts,
      isFinished,
      winnerId,
    },
    feedback,
  };
}

export function advanceTurn(state: CricketGameState): CricketGameState {
  if (state.isFinished || state.players.length === 0 || !state.players[state.activePlayerIndex]) {
    return state;
  }

  const nextPlayerIndex = (state.activePlayerIndex + 1) % state.players.length;
  const nextRound = nextPlayerIndex === 0 ? state.round + 1 : state.round;

  return {
    ...state,
    activePlayerIndex: nextPlayerIndex,
    round: nextRound,
    visitEntries: [],
    visitMarks: 0,
    visitPointsDelta: 0,
    turnComplete: false,
  };
}

export function buildGameResult(state: CricketGameState, startedAt: number): GameResult {
  const isCutthroat = state.config.variant === 'cutthroat';
  const winner = state.players.find((p) => p.id === state.winnerId) ?? state.players[0];

  const sorted = [...state.players].sort((a, b) => {
    if (a.id === state.winnerId) return -1;
    if (b.id === state.winnerId) return 1;
    const closedDiff = getClosedCount(b) - getClosedCount(a);
    if (closedDiff !== 0) return closedDiff;
    return isCutthroat ? a.score - b.score : b.score - a.score;
  });

  const standings: GameStanding[] = sorted.map((p, idx) => {
    const mpr = p.dartsThrown > 0 ? ((p.totalMarks / p.dartsThrown) * 3).toFixed(2) : '0.00';
    return {
      playerId: p.id,
      playerName: p.name,
      colorHex: p.colorHex,
      rank: idx + 1,
      primaryStatLabel: isCutthroat ? 'Penalty Pts' : 'Points',
      primaryStatValue: p.score,
      secondaryStat: `${getClosedCount(p)}/7 Closed • ${mpr} MPR`,
    };
  });

  const bestMprPlayer = [...state.players].sort((a, b) => {
    const mprA = a.dartsThrown > 0 ? (a.totalMarks / a.dartsThrown) * 3 : 0;
    const mprB = b.dartsThrown > 0 ? (b.totalMarks / b.dartsThrown) * 3 : 0;
    return mprB - mprA;
  })[0];

  const bestMprVal =
    bestMprPlayer && bestMprPlayer.dartsThrown > 0
      ? ((bestMprPlayer.totalMarks / bestMprPlayer.dartsThrown) * 3).toFixed(2)
      : '0.00';

  return {
    gameId: 'cricket',
    winnerId: winner?.id ?? null,
    winnerName: winner?.name ?? 'Champion',
    headline: isCutthroat
      ? `${winner?.name ?? 'Champion'} survives Cut-Throat Cricket!`
      : `${winner?.name ?? 'Champion'} closes out the Cricket board!`,
    standings,
    totalDartsThrown: state.totalDartsThrown,
    durationMs: Math.max(1000, Date.now() - startedAt),
    highlights: [
      `Variant: ${isCutthroat ? 'Cut-Throat (Lowest Score)' : 'Standard Cricket'}`,
      `Rounds Played: ${state.round}`,
      `Top MPR: ${bestMprPlayer?.name ?? '-'} (${bestMprVal} MPR)`,
    ],
    completedAt: Date.now(),
  };
}
