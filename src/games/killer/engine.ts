import { DartThrow } from '../../types/darts';
import { GameMatchConfig, GamePlayer, GameResult, GameStanding } from '../../types/games';
import { SEGMENT_ORDER } from '../../lib/geometry';
import { getDartNumber, isAnyBull, isMiss } from '../utils/dartHelpers';
import {
  KillerAssignmentMode,
  KillerConfig,
  KillerDartFeedback,
  KillerGameState,
  KillerPlayerState,
  KillerVisitEntry,
} from './types';

export function parseKillerConfig(config: GameMatchConfig): KillerConfig {
  const rawLives = Number(config.maxLives);
  const maxLives = Number.isFinite(rawLives) && rawLives >= 1 ? Math.min(10, Math.round(rawLives)) : 3;

  const rawAssign = String(config.numberAssignment ?? 'auto');
  const numberAssignment: KillerAssignmentMode = rawAssign === 'throw' ? 'throw' : 'auto';

  const suicideRule = Boolean(config.suicideRule);

  return {
    maxLives,
    numberAssignment,
    suicideRule,
  };
}

/**
 * Generates compact, unique 2-character tags for SVG dartboard wedge badges.
 */
export function makeUniqueShortTags(players: GamePlayer[]): string[] {
  const used = new Set<string>();
  return players.map((p, idx) => {
    const cleaned = p.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const base = cleaned.slice(0, 2) || `P${idx + 1}`;
    if (!used.has(base)) {
      used.add(base);
      return base;
    }
    const alt = `${cleaned.charAt(0) || 'P'}${idx + 1}`;
    used.add(alt);
    return alt;
  });
}

/**
 * Evenly distributes `count` unique dartboard numbers around SEGMENT_ORDER
 * so players are spaced fairly across the board instead of clustered together.
 */
export function assignBalancedNumbers(count: number, seed: number): number[] {
  const n = Math.max(1, Math.min(20, count));
  const startOffset = ((seed % 20) + 20) % 20;
  const assigned: number[] = [];
  const used = new Set<number>();

  for (let i = 0; i < n; i++) {
    let idx = (startOffset + Math.floor((i * 20) / n)) % 20;
    while (used.has(SEGMENT_ORDER[idx])) {
      idx = (idx + 1) % 20;
    }
    const num = SEGMENT_ORDER[idx];
    used.add(num);
    assigned.push(num);
  }

  return assigned;
}

function rankKillerPlayers(players: KillerPlayerState[]): KillerPlayerState[] {
  return [...players].sort((a, b) => {
    if (a.isEliminated !== b.isEliminated) {
      return a.isEliminated ? 1 : -1;
    }
    if (!a.isEliminated) {
      if (b.lives !== a.lives) return b.lives - a.lives;
      if (b.kills !== a.kills) return b.kills - a.kills;
      return b.damageDealt - a.damageDealt;
    }
    const rA = a.eliminatedOnRound ?? 0;
    const rB = b.eliminatedOnRound ?? 0;
    if (rB !== rA) return rB - rA;
    if (b.kills !== a.kills) return b.kills - a.kills;
    return b.damageDealt - a.damageDealt;
  });
}

export function createInitialState(
  players: GamePlayer[],
  config: GameMatchConfig,
  seed = 4242
): KillerGameState {
  const parsed = parseKillerConfig(config);
  const tags = makeUniqueShortTags(players);
  const autoNumbers =
    parsed.numberAssignment === 'auto' ? assignBalancedNumbers(players.length, seed) : [];

  const playerStates: KillerPlayerState[] = players.map((p, idx) => ({
    id: p.id,
    name: p.name,
    colorHex: p.colorHex,
    avatarInitial: p.avatarInitial,
    shortTag: tags[idx],
    assignedNumber: parsed.numberAssignment === 'auto' ? (autoNumbers[idx] ?? null) : null,
    lives: 0,
    isKiller: false,
    isEliminated: false,
    kills: 0,
    damageDealt: 0,
    timesBecameKiller: 0,
    eliminatedOnRound: null,
    eliminatedBy: null,
    dartsThrown: 0,
  }));

  return {
    config: parsed,
    seed,
    phase: parsed.numberAssignment === 'throw' ? 'claiming' : 'playing',
    round: 1,
    activePlayerIndex: 0,
    players: playerStates,
    visitEntries: [],
    turnEndedEarly: false,
    totalDartsThrown: 0,
    isFinished: false,
    winnerId: null,
  };
}

export function applyDartToState(
  state: KillerGameState,
  dart: DartThrow
): { nextState: KillerGameState; feedback: KillerDartFeedback } {
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

  // =========================================================================
  // PHASE 1: THROW TO CLAIM NUMBER (1–20)
  // =========================================================================
  if (state.phase === 'claiming') {
    const segNum = getDartNumber(dart);
    let entry: KillerVisitEntry;
    let feedback: KillerDartFeedback;
    let turnEndedEarly = false;

    if (isMiss(dart) || isAnyBull(dart) || segNum < 1 || segNum > 20) {
      entry = {
        dart,
        label: 'HIT 1–20',
        tone: 'rose',
      };
      feedback = {
        ignored: false,
        sound: 'hazard',
        callout: {
          title: '🎯 AIM FOR 1–20!',
          subtitle: `${activePlayer.name}, throw again to claim an open wedge`,
          accent: 'amber',
        },
      };
    } else {
      const existingOwner = players.find((p) => p.assignedNumber === segNum);
      if (existingOwner) {
        entry = {
          dart,
          label: `TAKEN (${existingOwner.shortTag})`,
          tone: 'rose',
        };
        feedback = {
          ignored: false,
          sound: 'hazard',
          callout: {
            title: `🚫 #${segNum} ALREADY CLAIMED!`,
            subtitle: `Owned by ${existingOwner.name} — throw for an open wedge`,
            accent: 'rose',
          },
        };
      } else {
        activePlayer.assignedNumber = segNum;
        turnEndedEarly = true;
        const remainingUnclaimed = players.filter((p) => p.assignedNumber === null).length;

        entry = {
          dart,
          label: `CLAIMED #${segNum}`,
          tone: 'emerald',
        };
        feedback = {
          ignored: false,
          sound: 'bonus',
          callout: {
            title: `🎯 ${activePlayer.name.toUpperCase()} CLAIMS #${segNum}!`,
            subtitle:
              remainingUnclaimed === 0
                ? 'All numbers locked in! Pull darts to start the hunt!'
                : `Pull darts for next player (${remainingUnclaimed} left to claim)`,
            accent: 'emerald',
          },
        };
      }
    }

    return {
      nextState: {
        ...state,
        players,
        visitEntries: [...state.visitEntries, entry],
        turnEndedEarly,
        totalDartsThrown: state.totalDartsThrown + 1,
      },
      feedback,
    };
  }

  // =========================================================================
  // PHASE 2: KILLER HUNT GAMEPLAY
  // =========================================================================
  const maxLives = state.config.maxLives;
  const segNum = getDartNumber(dart);
  const multiplier = Math.max(1, Math.min(3, dart.segment.multiplier || 1));

  let entry: KillerVisitEntry;
  let feedback: KillerDartFeedback;
  let turnEndedEarly = false;
  let isFinished = false;
  let winnerId: string | null = null;

  if (isMiss(dart) || isAnyBull(dart) || segNum < 1 || segNum > 20) {
    entry = {
      dart,
      label: isMiss(dart) ? 'MISS' : 'NEUTRAL',
      tone: 'slate',
    };
    feedback = {
      ignored: false,
      sound: isMiss(dart) ? 'hazard' : 'hit',
      callout: null,
    };
  } else if (segNum === activePlayer.assignedNumber) {
    // Hit own home number
    if (!activePlayer.isKiller) {
      const prevLives = activePlayer.lives;
      const nextLives = Math.min(maxLives, prevLives + multiplier);
      const gained = nextLives - prevLives;
      activePlayer.lives = nextLives;

      if (nextLives >= maxLives) {
        activePlayer.isKiller = true;
        activePlayer.timesBecameKiller += 1;

        entry = {
          dart,
          label: '💀 KILLER!',
          tone: 'amber',
        };
        feedback = {
          ignored: false,
          sound: 'jackpot',
          callout: {
            title: '💀 KILLER UNLOCKED!',
            subtitle: `${activePlayer.name} is armed and hunting rivals!`,
            accent: 'amber',
          },
        };
      } else {
        entry = {
          dart,
          label: `+${gained} LIFE`,
          tone: 'emerald',
        };
        feedback = {
          ignored: false,
          sound: multiplier >= 2 ? 'bonus' : 'hit',
          callout:
            multiplier >= 2
              ? {
                  title: `⚡ CHARGED +${gained}!`,
                  subtitle: `${activePlayer.name}: ${nextLives} / ${maxLives} lives`,
                  accent: 'emerald',
                }
              : null,
        };
      }
    } else if (state.config.suicideRule) {
      // Self-Hit Penalty enabled while Killer
      const rawLives = activePlayer.lives - multiplier;
      if (rawLives <= 0) {
        activePlayer.lives = 0;
        activePlayer.isKiller = false;
        activePlayer.isEliminated = true;
        activePlayer.eliminatedOnRound = state.round;
        activePlayer.eliminatedBy = 'Self-Hit';
        turnEndedEarly = true;

        const survivors = players.filter((p) => !p.isEliminated);
        if (players.length > 1 && survivors.length === 1) {
          isFinished = true;
          winnerId = survivors[0].id;
        }

        entry = {
          dart,
          label: '💥 SELF KO!',
          tone: 'rose',
        };
        feedback = {
          ignored: false,
          sound: 'elimination',
          callout: {
            title: `💥 ${activePlayer.name.toUpperCase()} SELF-ELIMINATED!`,
            subtitle: `Hit own #${segNum} under Suicide Rule!`,
            accent: 'rose',
          },
        };
      } else {
        activePlayer.lives = rawLives;
        activePlayer.isKiller = false;

        entry = {
          dart,
          label: `💥 SELF -${multiplier}`,
          tone: 'rose',
        };
        feedback = {
          ignored: false,
          sound: 'hazard',
          callout: {
            title: `💥 SELF-HIT! -${multiplier} ${multiplier === 1 ? 'LIFE' : 'LIVES'}`,
            subtitle: `${activePlayer.name} lost KILLER status (${rawLives}/${maxLives} left)`,
            accent: 'rose',
          },
        };
      }
    } else {
      // Already Killer & no suicide penalty
      entry = {
        dart,
        label: 'MAX KILLER',
        tone: 'amber',
      };
      feedback = {
        ignored: false,
        sound: 'hit',
        callout: null,
      };
    }
  } else {
    // Check if dart hit a surviving rival's wedge
    const targetPlayer = players.find(
      (p) => p.id !== activePlayer.id && !p.isEliminated && p.assignedNumber === segNum
    );

    if (!targetPlayer) {
      entry = {
        dart,
        label: 'NEUTRAL',
        tone: 'slate',
      };
      feedback = {
        ignored: false,
        sound: 'hit',
        callout: null,
      };
    } else if (!activePlayer.isKiller) {
      entry = {
        dart,
        label: 'NEED KILLER',
        tone: 'slate',
      };
      feedback = {
        ignored: false,
        sound: 'hit',
        callout: {
          title: `🔒 CHARGE #${activePlayer.assignedNumber} FIRST!`,
          subtitle: `Reach ${maxLives} lives before attacking ${targetPlayer.name}`,
          accent: 'sky',
        },
      };
    } else {
      // Active player IS a Killer hitting a rival's wedge!
      const dmg = multiplier;
      const wasTargetKiller = targetPlayer.isKiller;
      const rawLives = targetPlayer.lives - dmg;
      activePlayer.damageDealt += dmg;

      if (rawLives <= 0) {
        targetPlayer.lives = 0;
        targetPlayer.isKiller = false;
        targetPlayer.isEliminated = true;
        targetPlayer.eliminatedOnRound = state.round;
        targetPlayer.eliminatedBy = activePlayer.name;
        activePlayer.kills += 1;

        const survivors = players.filter((p) => !p.isEliminated);
        if (players.length > 1 && survivors.length === 1) {
          isFinished = true;
          winnerId = survivors[0].id;
        }

        entry = {
          dart,
          label: `☠️ KO ${targetPlayer.shortTag}`,
          tone: 'rose',
        };
        feedback = {
          ignored: false,
          sound: 'elimination',
          callout: {
            title: `☠️ ${targetPlayer.name.toUpperCase()} ELIMINATED!`,
            subtitle: isFinished
              ? `${activePlayer.name} is the last Killer standing!`
              : `Wiped out by ${activePlayer.name} with ${dart.segment.name}!`,
            accent: 'rose',
          },
        };
      } else {
        targetPlayer.lives = rawLives;
        targetPlayer.isKiller = false;

        entry = {
          dart,
          label: `-${dmg} → ${targetPlayer.shortTag}`,
          tone: 'amber',
        };
        feedback = {
          ignored: false,
          sound: 'bonus',
          callout: {
            title: `🎯 HIT ${targetPlayer.name.toUpperCase()}! -${dmg}`,
            subtitle: wasTargetKiller
              ? `${targetPlayer.name} stripped of KILLER status (${rawLives}/${maxLives} left)`
              : `${targetPlayer.name} down to ${rawLives}/${maxLives} lives`,
            accent: 'amber',
          },
        };
      }
    }
  }

  return {
    nextState: {
      ...state,
      players,
      visitEntries: [...state.visitEntries, entry],
      turnEndedEarly,
      totalDartsThrown: state.totalDartsThrown + 1,
      isFinished,
      winnerId,
    },
    feedback,
  };
}

export function advanceTurn(state: KillerGameState): KillerGameState {
  if (state.isFinished || state.players.length === 0) return state;

  // Claiming Phase Turn Advance
  if (state.phase === 'claiming') {
    const current = state.players[state.activePlayerIndex];

    // If active player didn't claim a valid number during their 3 darts, let them try again
    if (current && current.assignedNumber === null) {
      return {
        ...state,
        visitEntries: [],
        turnEndedEarly: false,
      };
    }

    // Find next player who still needs to claim a number
    let nextUnclaimed = -1;
    for (let offset = 1; offset <= state.players.length; offset++) {
      const idx = (state.activePlayerIndex + offset) % state.players.length;
      if (state.players[idx].assignedNumber === null) {
        nextUnclaimed = idx;
        break;
      }
    }

    if (nextUnclaimed !== -1) {
      return {
        ...state,
        activePlayerIndex: nextUnclaimed,
        visitEntries: [],
        turnEndedEarly: false,
      };
    }

    // Everyone has claimed a number -> begin Round 1!
    return {
      ...state,
      phase: 'playing',
      round: 1,
      activePlayerIndex: 0,
      visitEntries: [],
      turnEndedEarly: false,
    };
  }

  // Playing Phase Turn Advance (skip eliminated players)
  const survivors = state.players.filter((p) => !p.isEliminated);
  if (state.players.length > 1 && survivors.length <= 1) {
    const winner = survivors[0] ?? rankKillerPlayers(state.players)[0];
    return {
      ...state,
      visitEntries: [],
      turnEndedEarly: false,
      isFinished: true,
      winnerId: winner?.id ?? null,
    };
  }

  let nextIdx = -1;
  for (let offset = 1; offset <= state.players.length; offset++) {
    const candidate = (state.activePlayerIndex + offset) % state.players.length;
    if (!state.players[candidate].isEliminated) {
      nextIdx = candidate;
      break;
    }
  }

  if (nextIdx === -1) return state;

  const wrappedRound = nextIdx <= state.activePlayerIndex;

  return {
    ...state,
    round: wrappedRound ? state.round + 1 : state.round,
    activePlayerIndex: nextIdx,
    visitEntries: [],
    turnEndedEarly: false,
  };
}

export function buildGameResult(state: KillerGameState, startedAt: number): GameResult {
  const ranked = rankKillerPlayers(state.players);
  const winner = ranked[0];

  const standings: GameStanding[] = ranked.map((p, idx) => ({
    playerId: p.id,
    playerName: p.name,
    colorHex: p.colorHex,
    rank: idx + 1,
    primaryStatLabel: p.isEliminated ? 'Eliminated' : 'Lives Left',
    primaryStatValue: p.isEliminated
      ? `Rd ${p.eliminatedOnRound ?? state.round}`
      : `${p.lives}/${state.config.maxLives}`,
    secondaryStat: `#${p.assignedNumber ?? '—'} • ${p.kills} Kill${p.kills === 1 ? '' : 's'} • ${p.damageDealt} Dmg${
      p.isEliminated && p.eliminatedBy ? ` • KO by ${p.eliminatedBy}` : ''
    }`,
  }));

  const topKiller = [...state.players].sort((a, b) => b.kills - a.kills || b.damageDealt - a.damageDealt)[0];
  const totalDamage = state.players.reduce((sum, p) => sum + p.damageDealt, 0);
  const totalUnlocks = state.players.reduce((sum, p) => sum + p.timesBecameKiller, 0);

  const highlights: string[] = [`Rounds Played: ${state.round}`];
  if (topKiller && topKiller.kills > 0) {
    highlights.push(`Top Hunter: ${topKiller.name} (${topKiller.kills} KO${topKiller.kills > 1 ? 's' : ''})`);
  }
  if (totalDamage > 0) highlights.push(`Total Lives Stripped: ${totalDamage}`);
  if (totalUnlocks > 0) highlights.push(`Killer Unlocks: ${totalUnlocks}`);

  const winnerName = winner?.name ?? 'Champion';

  return {
    gameId: 'killer',
    winnerId: winner?.id ?? null,
    winnerName,
    headline: `${winnerName} is the Last Killer Standing!`,
    standings,
    totalDartsThrown: state.totalDartsThrown,
    durationMs: Math.max(0, Date.now() - startedAt),
    highlights,
    completedAt: Date.now(),
  };
}
