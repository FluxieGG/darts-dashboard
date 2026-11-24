import { DartThrow } from '../../types/darts';
import { GameMatchConfig, GamePlayer, GameResult, GameStanding } from '../../types/games';
import { getDartNumber, isInnerBull, isMiss, isOuterBull } from '../utils/dartHelpers';
import {
  SnookerColourId,
  SnookerColourSpec,
  SnookerDartFeedback,
  SnookerPlayerState,
  SnookerState,
} from './types';

/**
 * All 14 non-colour board segments act as Red balls during the 'red' phase.
 */
export const SNOOKER_RED_SEGMENTS: readonly number[] = [
  1, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
];

const RED_SEGMENT_SET = new Set<number>(SNOOKER_RED_SEGMENTS);

/**
 * Official Snooker colour sequence & non-overlapping dartboard mapping:
 * 2 = Yellow (2), 3 = Green (3), 4 = Brown (4), 5 = Blue (5), 6 = Pink (6), 7 & Bull = Black (7)
 */
export const SNOOKER_COLOURS: readonly SnookerColourSpec[] = [
  {
    id: 'yellow',
    name: 'Yellow',
    shortName: 'YEL',
    points: 2,
    segment: 2,
    acceptsBull: false,
    hex: '#FACC15',
    strokeHex: '#FEF08A',
    badgeTextColor: '#0F172A',
    pillTone: 'amber',
  },
  {
    id: 'green',
    name: 'Green',
    shortName: 'GRN',
    points: 3,
    segment: 3,
    acceptsBull: false,
    hex: '#10B981',
    strokeHex: '#6EE7B7',
    badgeTextColor: '#FFFFFF',
    pillTone: 'emerald',
  },
  {
    id: 'brown',
    name: 'Brown',
    shortName: 'BRN',
    points: 4,
    segment: 4,
    acceptsBull: false,
    hex: '#B45309',
    strokeHex: '#F59E0B',
    badgeTextColor: '#FFFFFF',
    pillTone: 'amber',
  },
  {
    id: 'blue',
    name: 'Blue',
    shortName: 'BLU',
    points: 5,
    segment: 5,
    acceptsBull: false,
    hex: '#38BDF8',
    strokeHex: '#BAE6FD',
    badgeTextColor: '#0F172A',
    pillTone: 'sky',
  },
  {
    id: 'pink',
    name: 'Pink',
    shortName: 'PNK',
    points: 6,
    segment: 6,
    acceptsBull: false,
    hex: '#EC4899',
    strokeHex: '#F9A8D4',
    badgeTextColor: '#FFFFFF',
    pillTone: 'purple',
  },
  {
    id: 'black',
    name: 'Black',
    shortName: 'BLK',
    points: 7,
    segment: 7,
    acceptsBull: true,
    hex: '#1E293B',
    strokeHex: '#FBBF24',
    badgeTextColor: '#FDE047',
    pillTone: 'amber',
  },
];

const COLOUR_BY_SEGMENT = new Map<number, SnookerColourSpec>(
  SNOOKER_COLOURS.map((c) => [c.segment, c])
);

const BLACK_SPEC = SNOOKER_COLOURS[SNOOKER_COLOURS.length - 1];

export function getColourById(id: SnookerColourId): SnookerColourSpec {
  return SNOOKER_COLOURS.find((c) => c.id === id) ?? SNOOKER_COLOURS[0];
}

export function getActiveClearanceColour(state: SnookerState): SnookerColourSpec | null {
  if (state.clearanceIndex < 0 || state.clearanceIndex >= SNOOKER_COLOURS.length) {
    return null;
  }
  return SNOOKER_COLOURS[state.clearanceIndex];
}

type DartHitClassification =
  | { kind: 'red' }
  | { kind: 'colour'; colour: SnookerColourSpec; viaBull: boolean }
  | { kind: 'miss' };

function classifySnookerDart(dart: DartThrow): DartHitClassification {
  if (isMiss(dart)) return { kind: 'miss' };
  if (isInnerBull(dart)) return { kind: 'colour', colour: BLACK_SPEC, viaBull: true };
  if (isOuterBull(dart)) return { kind: 'miss' };

  const num = getDartNumber(dart);
  const colour = COLOUR_BY_SEGMENT.get(num);
  if (colour) {
    return { kind: 'colour', colour, viaBull: false };
  }
  if (RED_SEGMENT_SET.has(num)) {
    return { kind: 'red' };
  }
  return { kind: 'miss' };
}

function rankSnookerPlayers(players: SnookerPlayerState[]): SnookerPlayerState[] {
  return [...players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.highestBreak !== a.highestBreak) return b.highestBreak - a.highestBreak;
    if (b.coloursPotted !== a.coloursPotted) return b.coloursPotted - a.coloursPotted;
    return b.redsPotted - a.redsPotted;
  });
}

export function createInitialState(players: GamePlayer[], config: GameMatchConfig): SnookerState {
  const rawReds = Number(config.redCount);
  const totalReds = rawReds === 6 || rawReds === 10 || rawReds === 15 ? rawReds : 10;
  const foulPenalty = config.foulPenalty !== undefined ? Boolean(config.foulPenalty) : true;

  return {
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      colorHex: p.colorHex,
      avatarInitial: p.avatarInitial,
      score: 0,
      redsPotted: 0,
      coloursPotted: 0,
      highestBreak: 0,
      foulsCommitted: 0,
      foulPointsEarned: 0,
      dartsThrown: 0,
    })),
    currentPlayerIndex: 0,
    round: 1,
    totalReds,
    redsRemaining: totalReds,
    foulPenalty,
    targetPhase: 'red',
    clearanceIndex: 0,
    currentBreak: 0,
    highestBreakOverall: 0,
    highestBreakPlayerName: null,
    currentVisitDarts: [],
    currentVisitLabels: [],
    currentVisitTones: [],
    potsThisVisit: 0,
    missedThisVisit: false,
    turnComplete: false,
    totalDartsThrown: 0,
    isFinished: false,
    winnerId: null,
    lastEventSummary: 'Break off — pot any Red segment (1 pt)',
  };
}

export function applyDartToState(
  state: SnookerState,
  dart: DartThrow
): { nextState: SnookerState; feedback: SnookerDartFeedback } {
  if (
    state.isFinished ||
    state.turnComplete ||
    state.currentVisitDarts.length >= 3 ||
    state.players.length === 0 ||
    !state.players[state.currentPlayerIndex]
  ) {
    return { nextState: state, feedback: { sound: 'none', ignored: true } };
  }

  const activeIdx = state.currentPlayerIndex;
  const players = state.players.map((p) => ({ ...p }));
  const player = players[activeIdx];
  player.dartsThrown += 1;

  const hit = classifySnookerDart(dart);
  const nextVisitDarts = [...state.currentVisitDarts, dart];
  const nextVisitLabels = [...state.currentVisitLabels];
  const nextVisitTones = [...state.currentVisitTones];

  let redsRemaining = state.redsRemaining;
  let targetPhase = state.targetPhase;
  let clearanceIndex = state.clearanceIndex;
  let currentBreak = state.currentBreak;
  let highestBreakOverall = state.highestBreakOverall;
  let highestBreakPlayerName = state.highestBreakPlayerName;
  let potsThisVisit = state.potsThisVisit;
  let missedThisVisit = state.missedThisVisit;
  let isFinished = false;
  let winnerId: string | null = null;
  let lastEventSummary = state.lastEventSummary;

  let feedback: SnookerDartFeedback = { sound: 'dartHit' };

  if (targetPhase === 'red') {
    if (hit.kind === 'red' && redsRemaining > 0) {
      redsRemaining -= 1;
      player.score += 1;
      player.redsPotted += 1;
      currentBreak += 1;
      potsThisVisit += 1;
      targetPhase = 'colour';

      if (currentBreak > player.highestBreak) {
        player.highestBreak = currentBreak;
      }
      if (currentBreak > highestBreakOverall) {
        highestBreakOverall = currentBreak;
        highestBreakPlayerName = player.name;
      }

      nextVisitLabels.push('RED +1');
      nextVisitTones.push('emerald');
      lastEventSummary = `${player.name} potted a Red (+1) • Nominate a Colour!`;

      feedback = {
        calloutTitle: currentBreak >= 15 ? `🔴 RED! ${currentBreak} BREAK` : '🔴 RED POTTED! +1',
        calloutSubtitle:
          redsRemaining > 0
            ? `Nominate a Colour (2–7) • ${redsRemaining} reds left`
            : 'Final Red down! Pot a Colour before clearance!',
        calloutAccent: 'emerald',
        sound: currentBreak >= 20 ? 'bonusHit' : 'dartHit',
      };
    } else {
      const hadBreak = currentBreak > 0;
      const previousBreak = currentBreak;
      currentBreak = 0;
      missedThisVisit = true;
      nextVisitLabels.push('MISS');
      nextVisitTones.push('rose');
      lastEventSummary = `${player.name} missed the Red`;

      feedback = hadBreak
        ? {
            calloutTitle: `BREAK ENDED (${previousBreak})`,
            calloutSubtitle: 'Missed Red target',
            calloutAccent: 'rose',
            sound: 'hazard',
          }
        : {
            sound: 'hazard',
          };
    }
  } else if (targetPhase === 'colour') {
    if (hit.kind === 'colour') {
      const { colour, viaBull } = hit;
      player.score += colour.points;
      player.coloursPotted += 1;
      currentBreak += colour.points;
      potsThisVisit += 1;

      if (currentBreak > player.highestBreak) {
        player.highestBreak = currentBreak;
      }
      if (currentBreak > highestBreakOverall) {
        highestBreakOverall = currentBreak;
        highestBreakPlayerName = player.name;
      }

      targetPhase = redsRemaining > 0 ? 'red' : 'clearance';
      nextVisitLabels.push(`${colour.shortName} +${colour.points}`);
      nextVisitTones.push(colour.pillTone);
      lastEventSummary = `${player.name} potted ${colour.name} (+${colour.points}) • Break ${currentBreak}`;

      const isBigPot = colour.points >= 6 || currentBreak >= 20;
      feedback = {
        calloutTitle:
          currentBreak >= 25
            ? `🎱 ${currentBreak} BREAK! (${colour.name.toUpperCase()} +${colour.points})`
            : viaBull
            ? `🎯 BULL BLACK! +7`
            : `🎱 ${colour.name.toUpperCase()}! +${colour.points}`,
        calloutSubtitle:
          targetPhase === 'clearance'
            ? `All Reds cleared! Clearance begins on Yellow (#2)`
            : `Break: ${currentBreak} • Back to Red (${redsRemaining} left)`,
        calloutAccent: colour.id === 'black' || currentBreak >= 25 ? 'amber' : 'emerald',
        sound: isBigPot ? 'jackpot' : 'bonusHit',
      };
    } else {
      const hadBreak = currentBreak > 0;
      const previousBreak = currentBreak;
      currentBreak = 0;
      missedThisVisit = true;
      targetPhase = redsRemaining > 0 ? 'red' : 'clearance';
      nextVisitLabels.push('MISS');
      nextVisitTones.push('rose');
      lastEventSummary = `${player.name} missed the Colour`;

      feedback = hadBreak
        ? {
            calloutTitle: `BREAK ENDED (${previousBreak})`,
            calloutSubtitle:
              targetPhase === 'clearance'
                ? 'Missed Colour — Clearance begins on Yellow (#2)'
                : 'Missed Colour — back to Red',
            calloutAccent: 'rose',
            sound: 'hazard',
          }
        : {
            sound: 'hazard',
          };
    }
  } else {
    // 'clearance' phase: strict sequence Yellow -> Green -> Brown -> Blue -> Pink -> Black
    const requiredColour = SNOOKER_COLOURS[clearanceIndex];
    if (requiredColour && hit.kind === 'colour' && hit.colour.id === requiredColour.id) {
      player.score += requiredColour.points;
      player.coloursPotted += 1;
      currentBreak += requiredColour.points;
      potsThisVisit += 1;
      clearanceIndex += 1;

      if (currentBreak > player.highestBreak) {
        player.highestBreak = currentBreak;
      }
      if (currentBreak > highestBreakOverall) {
        highestBreakOverall = currentBreak;
        highestBreakPlayerName = player.name;
      }

      nextVisitLabels.push(`${requiredColour.shortName} +${requiredColour.points}`);
      nextVisitTones.push(requiredColour.pillTone);

      if (clearanceIndex >= SNOOKER_COLOURS.length) {
        isFinished = true;
        const ranked = rankSnookerPlayers(players);
        winnerId = ranked[0]?.id ?? player.id;
        lastEventSummary = `${player.name} cleared the Black! Frame complete!`;
        feedback = {
          calloutTitle: '🏆 BLACK CLEARED! FRAME OVER!',
          calloutSubtitle: `${ranked[0]?.name ?? player.name} wins with ${ranked[0]?.score ?? player.score} pts`,
          calloutAccent: 'purple',
          sound: 'jackpot',
        };
      } else {
        const nextColour = SNOOKER_COLOURS[clearanceIndex];
        lastEventSummary = `${player.name} cleared ${requiredColour.name} (+${requiredColour.points}) • Next: ${nextColour.name}`;
        feedback = {
          calloutTitle: `🎱 ${requiredColour.name.toUpperCase()} CLEARED! +${requiredColour.points}`,
          calloutSubtitle: `Next Target: ${nextColour.name} (#${nextColour.segment}${nextColour.acceptsBull ? ' / Bull' : ''}) • Break ${currentBreak}`,
          calloutAccent: requiredColour.id === 'pink' ? 'purple' : 'emerald',
          sound: currentBreak >= 20 ? 'jackpot' : 'bonusHit',
        };
      }
    } else {
      const hadBreak = currentBreak > 0;
      const previousBreak = currentBreak;
      currentBreak = 0;
      missedThisVisit = true;
      nextVisitLabels.push('MISS');
      nextVisitTones.push('rose');
      lastEventSummary = `${player.name} missed ${requiredColour?.name ?? 'target'}`;

      feedback = hadBreak
        ? {
            calloutTitle: `BREAK ENDED (${previousBreak})`,
            calloutSubtitle: `Still on ${requiredColour?.name ?? 'Clearance'} (#${requiredColour?.segment ?? ''})`,
            calloutAccent: 'rose',
            sound: 'hazard',
          }
        : {
            sound: 'hazard',
          };
    }
  }

  let turnComplete = isFinished || nextVisitDarts.length >= 3;

  // Apply Foul Penalty if visit ends with 0 pots in multiplayer
  if (!isFinished && nextVisitDarts.length >= 3 && state.foulPenalty && potsThisVisit === 0) {
    if (players.length > 1) {
      player.foulsCommitted += 1;
      for (let i = 0; i < players.length; i++) {
        if (i !== activeIdx) {
          players[i].score += 4;
          players[i].foulPointsEarned += 4;
        }
      }
      lastEventSummary = `FOUL! ${player.name} failed to pot — opponents awarded +4 pts`;
      feedback = {
        calloutTitle: '⚠️ FOUL! +4',
        calloutSubtitle: `${player.name} scored 0 pots — +4 foul pts to ${players.length === 2 ? players[(activeIdx + 1) % 2].name : 'opponents'}`,
        calloutAccent: 'rose',
        sound: 'hazard',
      };
    } else {
      turnComplete = true;
    }
  }

  return {
    nextState: {
      ...state,
      players,
      redsRemaining,
      targetPhase,
      clearanceIndex,
      currentBreak,
      highestBreakOverall,
      highestBreakPlayerName,
      currentVisitDarts: nextVisitDarts,
      currentVisitLabels: nextVisitLabels,
      currentVisitTones: nextVisitTones,
      potsThisVisit,
      missedThisVisit,
      turnComplete,
      totalDartsThrown: state.totalDartsThrown + 1,
      isFinished,
      winnerId,
      lastEventSummary,
    },
    feedback,
  };
}

export function advanceTurn(state: SnookerState): SnookerState {
  if (state.isFinished || state.players.length === 0 || !state.players[state.currentPlayerIndex]) {
    return state;
  }

  const isSolo = state.players.length === 1;
  const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
  const wrapped = nextIndex === 0;
  const nextRound = wrapped ? state.round + 1 : state.round;

  // In Solo mode, preserve an active unbroken break (including waiting for a colour after a Dart-3 Red!)
  // so players can genuinely chase a 147 break across visits.
  // In Multiplayer, reset break & start the incoming player on Red (or Clearance).
  const keepBreak = isSolo && !state.missedThisVisit && state.currentBreak > 0;
  const nextPhase = keepBreak
    ? state.targetPhase
    : state.redsRemaining > 0
    ? 'red'
    : 'clearance';

  const nextPlayer = state.players[nextIndex];
  const nextClearance = SNOOKER_COLOURS[state.clearanceIndex];

  const summary =
    nextPhase === 'red'
      ? `${nextPlayer.name} at the table — pot a Red`
      : nextPhase === 'colour'
      ? `${nextPlayer.name} continues ${state.currentBreak} break — nominate a Colour`
      : `${nextPlayer.name} at the table — clear ${nextClearance?.name ?? 'Colours'}`;

  return {
    ...state,
    currentPlayerIndex: nextIndex,
    round: nextRound,
    targetPhase: nextPhase,
    currentBreak: keepBreak ? state.currentBreak : 0,
    currentVisitDarts: [],
    currentVisitLabels: [],
    currentVisitTones: [],
    potsThisVisit: 0,
    missedThisVisit: false,
    turnComplete: false,
    lastEventSummary: summary,
  };
}

export function buildGameResult(state: SnookerState, startedAt: number): GameResult {
  const ranked = rankSnookerPlayers(state.players);
  const winner = ranked[0];

  const standings: GameStanding[] = ranked.map((p, idx) => ({
    playerId: p.id,
    playerName: p.name,
    colorHex: p.colorHex,
    rank: idx + 1,
    primaryStatLabel: 'Frame Pts',
    primaryStatValue: p.score,
    secondaryStat: `Best Break: ${p.highestBreak} • ${p.redsPotted}R / ${p.coloursPotted}C`,
  }));

  const highlights: string[] = [];
  if (state.highestBreakOverall > 0) {
    highlights.push(
      `Highest Break: ${state.highestBreakOverall}${
        state.highestBreakPlayerName ? ` (${state.highestBreakPlayerName})` : ''
      }`
    );
  }
  const totalFouls = state.players.reduce((sum, p) => sum + p.foulsCommitted, 0);
  if (totalFouls > 0) {
    highlights.push(`Foul Visits: ${totalFouls} (+${totalFouls * 4} pts)`);
  }
  highlights.push(`${state.totalReds}-Red Frame Cleared`);

  const headline = !winner
    ? 'Snooker frame complete!'
    : state.players.length === 1
    ? `${winner.name} clears the table with ${winner.score} pts!`
    : `${winner.name} wins the frame (${winner.score} pts)!`;

  return {
    gameId: 'snooker',
    winnerId: winner?.id ?? null,
    winnerName: winner?.name ?? 'Winner',
    headline,
    standings,
    totalDartsThrown: state.totalDartsThrown,
    durationMs: Math.max(1000, Date.now() - startedAt),
    highlights,
    completedAt: Date.now(),
  };
}
