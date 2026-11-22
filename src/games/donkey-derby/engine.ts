import { DartThrow } from '../../types/darts';
import { GameMatchConfig, GamePlayer, GameResult, GameStanding } from '../../types/games';
import { SEGMENT_ORDER } from '../../lib/geometry';
import { getDartNumber, isInnerBull, isMiss, isOuterBull } from '../utils/dartHelpers';
import {
  DerbyDartFeedback,
  DerbyRacerState,
  DonkeyDerbyState,
  TrackLengthOption,
  VisitPillTone,
} from './types';

/**
 * Evenly distributes unique dartboard wedges around SEGMENT_ORDER so racers
 * are well-spaced across the board regardless of player count (2-6+).
 */
export function assignBalancedSegments(playerCount: number): number[] {
  const count = Math.max(1, Math.min(playerCount, SEGMENT_ORDER.length));
  const usedIndices = new Set<number>();
  const segments: number[] = [];

  for (let i = 0; i < count; i++) {
    let idx = Math.round((i * SEGMENT_ORDER.length) / count) % SEGMENT_ORDER.length;
    while (usedIndices.has(idx)) {
      idx = (idx + 1) % SEGMENT_ORDER.length;
    }
    usedIndices.add(idx);
    segments.push(SEGMENT_ORDER[idx]);
  }

  return segments;
}

export function createInitialState(
  players: GamePlayer[],
  config: GameMatchConfig
): DonkeyDerbyState {
  const rawTrack = Number(config.trackLength);
  const trackLength: TrackLengthOption =
    rawTrack === 8 || rawTrack === 20 ? rawTrack : 12;
  const helpRivals = config.helpRivals !== false;

  const assignedSegments = assignBalancedSegments(players.length);

  const racers: DerbyRacerState[] = players.map((player, idx) => ({
    player,
    laneNumber: idx + 1,
    targetSegment: assignedSegments[idx] ?? SEGMENT_ORDER[idx % SEGMENT_ORDER.length],
    position: 0,
    selfHits: 0,
    bullBoosts: 0,
    rivalsHelped: 0,
    giftsReceived: 0,
    dartsThrown: 0,
  }));

  return {
    trackLength,
    helpRivals,
    racers,
    activePlayerIndex: 0,
    round: 1,
    totalDartsThrown: 0,
    currentVisit: [],
    turnComplete: false,
    isFinished: false,
    winnerId: null,
    winningThrowerId: null,
    lastBoost: null,
  };
}

function getWedgeSteps(dart: DartThrow): number {
  if (dart.segment.multiplier === 3) return 3;
  if (dart.segment.multiplier === 2) return 2;
  return 1;
}

export function applyDartToState(
  state: DonkeyDerbyState,
  dart: DartThrow
): { nextState: DonkeyDerbyState; feedback: DerbyDartFeedback } {
  if (state.isFinished || state.turnComplete || state.currentVisit.length >= 3) {
    return {
      nextState: state,
      feedback: { sound: 'hit', calloutTitle: null, calloutAccent: 'sky' },
    };
  }

  const activeRacer = state.racers[state.activePlayerIndex];

  let movedRacerIdx: number | null = null;
  let steps = 0;
  let wasRivalGift = false;
  let wasBull = false;
  let pillLabel = 'No Lane';
  let pillTone: VisitPillTone = 'slate';
  let feedback: DerbyDartFeedback = {
    sound: 'hit',
    calloutTitle: null,
    calloutAccent: 'sky',
  };

  if (isMiss(dart)) {
    pillLabel = 'Miss';
    pillTone = 'rose';
    feedback = {
      sound: 'hazard',
      calloutTitle: null,
      calloutAccent: 'rose',
    };
  } else if (isInnerBull(dart)) {
    movedRacerIdx = state.activePlayerIndex;
    steps = 2;
    wasBull = true;
    pillLabel = '⚡ BULL +2';
    pillTone = 'purple';
    feedback = {
      sound: 'jackpot',
      calloutTitle: `🎯 BULLSEYE TURBO! +2 FURLONGS`,
      calloutSubtitle: `${activeRacer.player.name} rockets down Lane ${activeRacer.laneNumber}!`,
      calloutAccent: 'purple',
    };
  } else if (isOuterBull(dart)) {
    movedRacerIdx = state.activePlayerIndex;
    steps = 1;
    wasBull = true;
    pillLabel = '⚡ 25 +1';
    pillTone = 'sky';
    feedback = {
      sound: 'bonus',
      calloutTitle: `⚡ OUTER BULL BOOST! +1`,
      calloutSubtitle: `${activeRacer.player.name} surges ahead!`,
      calloutAccent: 'sky',
    };
  } else {
    const segNum = getDartNumber(dart);
    const matchedIdx = state.racers.findIndex((r) => r.targetSegment === segNum);

    if (matchedIdx === state.activePlayerIndex) {
      movedRacerIdx = matchedIdx;
      steps = getWedgeSteps(dart);
      if (steps === 3) {
        pillLabel = `🔥 +3 TURBO`;
        pillTone = 'amber';
        feedback = {
          sound: 'jackpot',
          calloutTitle: `🔥 TREBLE GALLOP! +3 FURLONGS`,
          calloutSubtitle: `${activeRacer.player.name} nails ${dart.segment.name}!`,
          calloutAccent: 'amber',
        };
      } else if (steps === 2) {
        pillLabel = `⚡ +2 DOUBLE`;
        pillTone = 'emerald';
        feedback = {
          sound: 'bonus',
          calloutTitle: `⚡ DOUBLE GALLOP! +2 FURLONGS`,
          calloutSubtitle: `${activeRacer.player.name} powers forward on ${dart.segment.name}!`,
          calloutAccent: 'emerald',
        };
      } else {
        pillLabel = `+1 FURLONG`;
        pillTone = 'emerald';
        feedback = {
          sound: 'hit',
          calloutTitle: null,
          calloutAccent: 'emerald',
        };
      }
    } else if (matchedIdx !== -1) {
      const rival = state.racers[matchedIdx];
      if (state.helpRivals) {
        movedRacerIdx = matchedIdx;
        steps = getWedgeSteps(dart);
        wasRivalGift = true;
        pillLabel = `🐴 ${rival.player.avatarInitial} +${steps}`;
        pillTone = 'rose';
        feedback = {
          sound: 'hazard',
          calloutTitle: `🐴 BOOSTED ${rival.player.name.toUpperCase()}!`,
          calloutSubtitle: `${dart.segment.name} gifts ${rival.player.name} +${steps} furlong${steps > 1 ? 's' : ''}!`,
          calloutAccent: 'rose',
        };
      } else {
        pillLabel = `Rival #${segNum}`;
        pillTone = 'slate';
        feedback = {
          sound: 'hit',
          calloutTitle: null,
          calloutAccent: 'sky',
        };
      }
    } else {
      pillLabel = `Off-Lane #${segNum}`;
      pillTone = 'slate';
      feedback = {
        sound: 'hit',
        calloutTitle: null,
        calloutAccent: 'sky',
      };
    }
  }

  let winnerId: string | null = null;
  let movedPlayerId: string | null = null;

  const nextRacers = state.racers.map((racer, idx) => {
    const isActive = idx === state.activePlayerIndex;
    const isMover = idx === movedRacerIdx && steps > 0;

    let nextPosition = racer.position;
    if (isMover) {
      nextPosition = Math.min(state.trackLength, racer.position + steps);
      movedPlayerId = racer.player.id;
      if (nextPosition >= state.trackLength) {
        winnerId = racer.player.id;
      }
    }

    return {
      ...racer,
      position: nextPosition,
      dartsThrown: racer.dartsThrown + (isActive ? 1 : 0),
      selfHits: racer.selfHits + (isMover && !wasRivalGift && !wasBull ? 1 : 0),
      bullBoosts: racer.bullBoosts + (isMover && wasBull ? 1 : 0),
      rivalsHelped: racer.rivalsHelped + (isActive && wasRivalGift ? 1 : 0),
      giftsReceived: racer.giftsReceived + (isMover && wasRivalGift ? 1 : 0),
    };
  });

  const isFinished = winnerId !== null;
  if (isFinished && movedRacerIdx !== null) {
    const winner = nextRacers[movedRacerIdx];
    pillLabel = `🏁 FINISH!`;
    pillTone = wasRivalGift ? 'amber' : 'emerald';
    feedback = {
      sound: 'jackpot',
      calloutTitle: wasRivalGift
        ? `🏁 ${activeRacer.player.name} ASSISTED ${winner.player.name} TO WIN!`
        : `🏁 PHOTO FINISH! ${winner.player.name} WINS!`,
      calloutSubtitle: `Crossed the ${state.trackLength}-furlong checkered line on ${dart.segment.name}!`,
      calloutAccent: wasRivalGift ? 'amber' : 'emerald',
    };
  }

  const nextVisit = [
    ...state.currentVisit,
    {
      dart,
      steps,
      movedPlayerId,
      label: pillLabel,
      tone: pillTone,
    },
  ];

  const nextState: DonkeyDerbyState = {
    ...state,
    racers: nextRacers,
    totalDartsThrown: state.totalDartsThrown + 1,
    currentVisit: nextVisit,
    turnComplete: isFinished || nextVisit.length >= 3,
    isFinished,
    winnerId,
    winningThrowerId: isFinished ? activeRacer.player.id : null,
    lastBoost:
      movedPlayerId && steps > 0
        ? {
            moverId: movedPlayerId,
            throwerId: activeRacer.player.id,
            steps,
            wasRivalGift,
            wasBull,
            timestamp: dart.timestamp,
          }
        : state.lastBoost,
  };

  return { nextState, feedback };
}

export function advanceTurn(state: DonkeyDerbyState): DonkeyDerbyState {
  if (state.isFinished) return state;

  const nextIndex = (state.activePlayerIndex + 1) % state.racers.length;
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
  state: DonkeyDerbyState,
  startedAt: number
): GameResult {
  const sorted = [...state.racers].sort((a, b) => {
    if (a.player.id === state.winnerId) return -1;
    if (b.player.id === state.winnerId) return 1;
    if (b.position !== a.position) return b.position - a.position;
    if (b.selfHits !== a.selfHits) return b.selfHits - a.selfHits;
    return a.laneNumber - b.laneNumber;
  });

  const winner = sorted[0];
  const assistedWin =
    state.winnerId !== null &&
    state.winningThrowerId !== null &&
    state.winnerId !== state.winningThrowerId;
  const assister = assistedWin
    ? state.racers.find((r) => r.player.id === state.winningThrowerId)
    : null;

  const standings: GameStanding[] = sorted.map((r, idx) => ({
    playerId: r.player.id,
    playerName: r.player.name,
    colorHex: r.player.colorHex,
    rank: idx + 1,
    primaryStatLabel: `Furlongs / ${state.trackLength}`,
    primaryStatValue: r.position,
    secondaryStat: `Target #${r.targetSegment} • ${r.selfHits} Lane Hits • ${r.bullBoosts} Bull Boosts${
      r.giftsReceived > 0 ? ` • ${r.giftsReceived} Rival Gifts` : ''
    }`,
  }));

  const totalRivalBoosts = state.racers.reduce((sum, r) => sum + r.rivalsHelped, 0);
  const totalBulls = state.racers.reduce((sum, r) => sum + r.bullBoosts, 0);
  const topHelper = [...state.racers].sort((a, b) => b.rivalsHelped - a.rivalsHelped)[0];

  const highlights: string[] = [
    `${state.trackLength}-Furlong Track (${state.helpRivals ? 'Rival Boost ON' : 'Rival Boost OFF'})`,
    `Winning Lane: #${winner?.targetSegment ?? '-'}`,
  ];

  if (totalBulls > 0) {
    highlights.push(`${totalBulls} Bullseye Turbo Boost${totalBulls > 1 ? 's' : ''}`);
  }
  if (totalRivalBoosts > 0 && topHelper && topHelper.rivalsHelped > 0) {
    highlights.push(
      `Most Generous: ${topHelper.player.name} (${topHelper.rivalsHelped} rival boost${
        topHelper.rivalsHelped > 1 ? 's' : ''
      })`
    );
  }

  return {
    gameId: 'donkey-derby',
    winnerId: winner?.player.id ?? null,
    winnerName: winner?.player.name ?? 'Winner',
    headline: assister
      ? `${winner?.player.name} wins via ${assister.player.name}'s assist!`
      : `${winner?.player.name ?? 'Racer'} wins the Donkey Derby!`,
    standings,
    totalDartsThrown: state.totalDartsThrown,
    durationMs: Math.max(1000, Date.now() - startedAt),
    highlights,
    completedAt: Date.now(),
  };
}
