import { DartThrow } from '../../types/darts';
import { GameMatchConfig, GamePlayer, GameResult, GameStanding } from '../../types/games';
import { SEGMENT_ORDER } from '../../lib/geometry';
import {
  getDartNumber,
  isAnyBull,
  isDouble,
  isMiss,
  isTreble,
} from '../utils/dartHelpers';
import {
  HeatEscalation,
  LavaConfig,
  LavaDartFeedback,
  LavaGameState,
  LavaPlayerState,
  LavaVisitEntry,
} from './types';

export const MAX_ROUNDS = 8;
const MAX_LAVA_WEDGES = 16;
const BULL_SHIELD_POINTS = 50;

export function parseLavaConfig(config: GameMatchConfig): LavaConfig {
  const rawLives = Number(config.startingLives);
  const startingLives = Number.isFinite(rawLives) && rawLives >= 1 ? Math.min(10, Math.round(rawLives)) : 3;

  const rawHeat = String(config.heatEscalation ?? 'normal');
  const heatEscalation: HeatEscalation =
    rawHeat === 'easy' || rawHeat === 'hard' ? rawHeat : 'normal';

  const bullCoolsLava = config.bullCoolsLava !== false;

  return {
    startingLives,
    heatEscalation,
    bullCoolsLava,
  };
}

/**
 * Escalates active lava wedge count per round (capped at 16 wedges so safe zones always exist).
 */
export function getLavaCountForRound(round: number, heatEscalation: HeatEscalation): number {
  const r = Math.max(1, round);
  if (heatEscalation === 'easy') {
    return Math.min(MAX_LAVA_WEDGES, 4 + (r - 1));
  }
  if (heatEscalation === 'hard') {
    return Math.min(MAX_LAVA_WEDGES, 8 + (r - 1) * 2);
  }
  // normal
  return Math.min(MAX_LAVA_WEDGES, 6 + (r - 1) * 2);
}

export function getHeatLevelMeta(lavaCount: number): {
  label: string;
  percent: number;
  barClass: string;
  textClass: string;
} {
  const percent = Math.round((lavaCount / 20) * 100);
  if (lavaCount >= 14) {
    return {
      label: 'MOLTEN INFERNO',
      percent,
      barClass: 'from-orange-500 via-rose-500 to-red-600',
      textClass: 'text-rose-400',
    };
  }
  if (lavaCount >= 10) {
    return {
      label: 'ERUPTION',
      percent,
      barClass: 'from-amber-400 via-orange-500 to-rose-500',
      textClass: 'text-orange-400',
    };
  }
  if (lavaCount >= 7) {
    return {
      label: 'SCORCHING',
      percent,
      barClass: 'from-amber-400 to-orange-500',
      textClass: 'text-amber-300',
    };
  }
  return {
    label: 'SIMMER',
    percent,
    barClass: 'from-yellow-400 to-amber-500',
    textClass: 'text-amber-200',
  };
}

/**
 * Pure deterministic Mulberry32 PRNG so lava eruptions stay identical across undo/replay.
 */
function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministically picks `count` burning wedges around the board for a given round & match seed.
 */
export function generateLavaSegments(count: number, round: number, seed: number): number[] {
  const clamped = Math.max(1, Math.min(MAX_LAVA_WEDGES, count));
  const pool: number[] = [...SEGMENT_ORDER];
  const rng = createSeededRng((seed ^ (round * 2654435761)) >>> 0);

  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }

  return pool.slice(0, clamped).sort((a, b) => a - b);
}

function rankLavaPlayers(players: LavaPlayerState[]): LavaPlayerState[] {
  return [...players].sort((a, b) => {
    // Survivors always rank ahead of eliminated players
    if (a.isEliminated !== b.isEliminated) {
      return a.isEliminated ? 1 : -1;
    }
    // Both alive: highest score, then lives left, then safe hits
    if (!a.isEliminated) {
      if (b.score !== a.score) return b.score - a.score;
      if (b.lives !== a.lives) return b.lives - a.lives;
      return b.safeHits - a.safeHits;
    }
    // Both eliminated: survived later round first, then highest score
    const roundA = a.eliminatedOnRound ?? 0;
    const roundB = b.eliminatedOnRound ?? 0;
    if (roundB !== roundA) return roundB - roundA;
    return b.score - a.score;
  });
}

export function createInitialState(
  players: GamePlayer[],
  config: GameMatchConfig,
  seed = 1337
): LavaGameState {
  const parsed = parseLavaConfig(config);
  const initialLavaCount = getLavaCountForRound(1, parsed.heatEscalation);
  const lavaSegments = generateLavaSegments(initialLavaCount, 1, seed);

  const playerStates: LavaPlayerState[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    colorHex: p.colorHex,
    avatarInitial: p.avatarInitial,
    lives: parsed.startingLives,
    maxLives: parsed.startingLives,
    score: 0,
    isEliminated: false,
    eliminatedOnRound: null,
    safeHits: 0,
    lavaHits: 0,
    bullCools: 0,
    bestVisit: 0,
    dartsThrown: 0,
  }));

  return {
    config: parsed,
    seed,
    round: 1,
    maxRounds: MAX_ROUNDS,
    activePlayerIndex: 0,
    players: playerStates,
    lavaSegments,
    extinguishedSegments: [],
    peakLavaCount: lavaSegments.length,
    visitEntries: [],
    visitScore: 0,
    turnEndedEarly: false,
    totalDartsThrown: 0,
    isFinished: false,
    winnerId: null,
    finishReason: null,
  };
}

export function applyDartToState(
  state: LavaGameState,
  dart: DartThrow
): { nextState: LavaGameState; feedback: LavaDartFeedback } {
  if (
    state.isFinished ||
    state.turnEndedEarly ||
    state.visitEntries.length >= 3 ||
    state.players.length === 0
  ) {
    return {
      nextState: state,
      feedback: { ignored: true, sound: 'none', callout: null },
    };
  }

  const players = state.players.map((p) => ({ ...p }));
  const activePlayer = players[state.activePlayerIndex];

  if (!activePlayer || activePlayer.isEliminated) {
    return {
      nextState: state,
      feedback: { ignored: true, sound: 'none', callout: null },
    };
  }

  activePlayer.dartsThrown += 1;

  let lavaSegments = [...state.lavaSegments];
  let extinguishedSegments = [...state.extinguishedSegments];
  let visitScore = state.visitScore;
  let turnEndedEarly = false;
  let isFinished = false;
  let winnerId: string | null = null;
  let finishReason: LavaGameState['finishReason'] = null;

  let entry: LavaVisitEntry;
  let feedback: LavaDartFeedback;

  // 1. Miss or Bouncer -> safe from lava, 0 points
  if (isMiss(dart)) {
    entry = {
      dart,
      label: 'SAFE • 0',
      tone: 'slate',
      points: 0,
      outcome: 'miss',
    };
    feedback = {
      ignored: false,
      sound: 'hit',
      callout: null,
    };
  }
  // 2. Bullseye / Outer Bull
  else if (isAnyBull(dart)) {
    if (state.config.bullCoolsLava) {
      let cooledSeg: number | null = null;
      if (lavaSegments.length > 0) {
        // Extinguish the highest-value burning wedge (strategic & deterministic)
        const highestLava = Math.max(...lavaSegments);
        lavaSegments = lavaSegments.filter((n) => n !== highestLava);
        extinguishedSegments = [...extinguishedSegments, highestLava];
        cooledSeg = highestLava;
      }

      activePlayer.score += BULL_SHIELD_POINTS;
      activePlayer.safeHits += 1;
      activePlayer.bullCools += 1;
      visitScore += BULL_SHIELD_POINTS;

      entry = {
        dart,
        label: cooledSeg !== null ? `❄️ -${cooledSeg} (+50)` : '❄️ +50 SHIELD',
        tone: 'sky',
        points: BULL_SHIELD_POINTS,
        outcome: 'bull_cool',
      };
      feedback = {
        ignored: false,
        sound: 'jackpot',
        callout: {
          title: cooledSeg !== null ? `❄️ LAVA COOLED! +${BULL_SHIELD_POINTS}` : `🛡️ BULL SHIELD! +${BULL_SHIELD_POINTS}`,
          subtitle:
            cooledSeg !== null
              ? `Wedge #${cooledSeg} extinguished for Round ${state.round}!`
              : `${activePlayer.name} banked +${BULL_SHIELD_POINTS} shield points!`,
          accent: 'sky',
        },
      };
    } else {
      const pts = dart.score;
      activePlayer.score += pts;
      activePlayer.safeHits += 1;
      visitScore += pts;

      entry = {
        dart,
        label: `⚡ +${pts}`,
        tone: 'amber',
        points: pts,
        outcome: 'safe_bonus',
      };
      feedback = {
        ignored: false,
        sound: 'jackpot',
        callout: {
          title: `🎯 SAFE BULL! +${pts}`,
          subtitle: `${activePlayer.name} stays cool under pressure`,
          accent: 'emerald',
        },
      };
    }
  }
  // 3. Standard Wedge (1..20)
  else {
    const segNum = getDartNumber(dart);
    const hitLava = lavaSegments.includes(segNum);

    if (hitLava) {
      activePlayer.lives = Math.max(0, activePlayer.lives - 1);
      activePlayer.lavaHits += 1;

      if (activePlayer.lives === 0) {
        activePlayer.isEliminated = true;
        activePlayer.eliminatedOnRound = state.round;
        activePlayer.bestVisit = Math.max(activePlayer.bestVisit, visitScore);
        turnEndedEarly = true;

        const survivors = players.filter((p) => !p.isEliminated);
        if (players.length > 1 && survivors.length === 1) {
          isFinished = true;
          winnerId = survivors[0].id;
          finishReason = 'last_survivor';
        } else if (survivors.length === 0) {
          isFinished = true;
          const ranked = rankLavaPlayers(players);
          winnerId = ranked[0]?.id ?? null;
          finishReason = 'all_burned';
        }

        entry = {
          dart,
          label: '💀 BURNED OUT',
          tone: 'rose',
          points: 0,
          outcome: 'eliminated',
        };
        feedback = {
          ignored: false,
          sound: 'elimination',
          callout: {
            title: `💀 ${activePlayer.name.toUpperCase()} BURNED OUT!`,
            subtitle:
              isFinished && winnerId
                ? `${players.find((p) => p.id === winnerId)?.name ?? 'Winner'} is the last survivor!`
                : `Hit molten ${dart.segment.name} — eliminated on Round ${state.round}`,
            accent: 'rose',
          },
        };
      } else {
        entry = {
          dart,
          label: '🔥 -1 LIFE',
          tone: 'rose',
          points: 0,
          outcome: 'lava_hit',
        };
        feedback = {
          ignored: false,
          sound: 'hazard',
          callout: {
            title: '🔥 LAVA HIT! -1 LIFE',
            subtitle: `${activePlayer.name} scorched on ${dart.segment.name} • ${activePlayer.lives} ${
              activePlayer.lives === 1 ? 'life' : 'lives'
            } left`,
            accent: 'rose',
          },
        };
      }
    } else {
      // Safe wedge!
      const pts = dart.score;
      const bonusBed = isDouble(dart) || isTreble(dart);
      activePlayer.score += pts;
      activePlayer.safeHits += 1;
      visitScore += pts;

      const isThirdDart = state.visitEntries.length === 2;
      const hadLavaThisVisit = state.visitEntries.some(
        (e) => e.outcome === 'lava_hit' || e.outcome === 'eliminated'
      );

      if (bonusBed) {
        const treble = isTreble(dart);
        entry = {
          dart,
          label: `⚡ +${pts}`,
          tone: treble ? 'amber' : 'emerald',
          points: pts,
          outcome: 'safe_bonus',
        };
        feedback = {
          ignored: false,
          sound: pts >= 54 ? 'jackpot' : 'bonus',
          callout: {
            title: `⚡ SAFE BONUS! +${pts}`,
            subtitle: `${activePlayer.name} nailed ${dart.segment.name} in the safe zone!`,
            accent: treble ? 'amber' : 'emerald',
          },
        };
      } else {
        entry = {
          dart,
          label: `✓ +${pts}`,
          tone: 'emerald',
          points: pts,
          outcome: 'safe',
        };
        const cleanSweep = isThirdDart && !hadLavaThisVisit && visitScore >= 60;
        feedback = {
          ignored: false,
          sound: cleanSweep ? 'bonus' : 'hit',
          callout: cleanSweep
            ? {
                title: `🛡️ CLEAN SWEEP! +${visitScore}`,
                subtitle: `${activePlayer.name} dodged every lava wedge!`,
                accent: 'emerald',
              }
            : null,
        };
      }
    }
  }

  const nextVisitEntries = [...state.visitEntries, entry];
  if (nextVisitEntries.length >= 3) {
    activePlayer.bestVisit = Math.max(activePlayer.bestVisit, visitScore);
  }

  const nextState: LavaGameState = {
    ...state,
    players,
    lavaSegments,
    extinguishedSegments,
    visitEntries: nextVisitEntries,
    visitScore,
    turnEndedEarly,
    totalDartsThrown: state.totalDartsThrown + 1,
    isFinished,
    winnerId,
    finishReason,
  };

  return { nextState, feedback };
}

export function advanceTurn(state: LavaGameState): LavaGameState {
  if (state.isFinished || state.players.length === 0) return state;

  const players = state.players.map((p, idx) =>
    idx === state.activePlayerIndex
      ? { ...p, bestVisit: Math.max(p.bestVisit, state.visitScore) }
      : { ...p }
  );

  const survivors = players.filter((p) => !p.isEliminated);
  if (survivors.length === 0) {
    const ranked = rankLavaPlayers(players);
    return {
      ...state,
      players,
      visitEntries: [],
      visitScore: 0,
      turnEndedEarly: false,
      isFinished: true,
      winnerId: ranked[0]?.id ?? null,
      finishReason: 'all_burned',
    };
  }

  if (players.length > 1 && survivors.length === 1) {
    return {
      ...state,
      players,
      visitEntries: [],
      visitScore: 0,
      turnEndedEarly: false,
      isFinished: true,
      winnerId: survivors[0].id,
      finishReason: 'last_survivor',
    };
  }

  // Locate next surviving player in clockwise turn order
  let nextIdx = -1;
  for (let offset = 1; offset <= players.length; offset++) {
    const candidate = (state.activePlayerIndex + offset) % players.length;
    if (!players[candidate].isEliminated) {
      nextIdx = candidate;
      break;
    }
  }

  if (nextIdx === -1) return state;

  const wrappedRound = nextIdx <= state.activePlayerIndex;

  if (wrappedRound && state.round >= state.maxRounds) {
    const ranked = rankLavaPlayers(players);
    return {
      ...state,
      players,
      visitEntries: [],
      visitScore: 0,
      turnEndedEarly: false,
      isFinished: true,
      winnerId: ranked[0]?.id ?? null,
      finishReason: 'max_rounds',
    };
  }

  const nextRound = wrappedRound ? state.round + 1 : state.round;
  const nextLavaSegments = wrappedRound
    ? generateLavaSegments(
        getLavaCountForRound(nextRound, state.config.heatEscalation),
        nextRound,
        state.seed
      )
    : state.lavaSegments;
  const nextExtinguished = wrappedRound ? [] : state.extinguishedSegments;
  const peakLavaCount = Math.max(state.peakLavaCount, nextLavaSegments.length);

  return {
    ...state,
    round: nextRound,
    activePlayerIndex: nextIdx,
    players,
    lavaSegments: nextLavaSegments,
    extinguishedSegments: nextExtinguished,
    peakLavaCount,
    visitEntries: [],
    visitScore: 0,
    turnEndedEarly: false,
  };
}

export function buildGameResult(state: LavaGameState, startedAt: number): GameResult {
  const ranked = rankLavaPlayers(state.players);
  const winner = ranked[0];

  const standings: GameStanding[] = ranked.map((p, idx) => ({
    playerId: p.id,
    playerName: p.name,
    colorHex: p.colorHex,
    rank: idx + 1,
    primaryStatLabel: 'Points',
    primaryStatValue: p.score,
    secondaryStat: p.isEliminated
      ? `Burned out Rd ${p.eliminatedOnRound ?? state.round} • ${p.safeHits} Safe`
      : `${p.lives}/${p.maxLives} Lives Left • ${p.safeHits} Safe${
          p.bullCools > 0 ? ` • ${p.bullCools} Cool${p.bullCools > 1 ? 's' : ''}` : ''
        }`,
  }));

  const totalCools = state.players.reduce((sum, p) => sum + p.bullCools, 0);
  const topVisit = state.players.reduce((best, p) => Math.max(best, p.bestVisit), 0);
  const totalLavaHits = state.players.reduce((sum, p) => sum + p.lavaHits, 0);

  const highlights: string[] = [
    `Peak Heat: ${state.peakLavaCount} Lava Wedges`,
    `Rounds Played: ${state.round}/${state.maxRounds}`,
  ];
  if (topVisit > 0) highlights.push(`Best Visit: ${topVisit} pts`);
  if (totalCools > 0) highlights.push(`Bullseye Cools: ${totalCools}`);
  if (totalLavaHits > 0) highlights.push(`Lava Burns: ${totalLavaHits}`);

  const winnerName = winner?.name ?? 'Champion';
  const headline =
    state.finishReason === 'last_survivor'
      ? `${winnerName} survives the Lava!`
      : `${winnerName} conquers the Inferno!`;

  return {
    gameId: 'board-is-lava',
    winnerId: winner?.id ?? null,
    winnerName,
    headline,
    standings,
    totalDartsThrown: state.totalDartsThrown,
    durationMs: Math.max(0, Date.now() - startedAt),
    highlights,
    completedAt: Date.now(),
  };
}
