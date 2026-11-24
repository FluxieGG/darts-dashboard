import { DartThrow } from '../../types/darts';
import { GameMatchConfig, GamePlayer, GameResult, GameStanding } from '../../types/games';
import {
  getDartNumber,
  isAnyBull,
  isDouble,
  isInnerBull,
  isMiss,
  isTreble,
} from '../utils/dartHelpers';
import {
  HalveItChallenge,
  HalveItFeedback,
  HalveItPlayerState,
  HalveItPreset,
  HalveItState,
  PillTone,
} from './types';

function numberChallenge(num: number): HalveItChallenge {
  return {
    id: `num-${num}`,
    shortLabel: String(num),
    label: `${num}s`,
    description: `Hit Single, Double, or Treble ${num}`,
    kind: 'number',
    targetNumber: num,
  };
}

const ANY_DOUBLE_CHALLENGE: HalveItChallenge = {
  id: 'any-double',
  shortLabel: 'ANY D',
  label: 'Any Double',
  description: 'Hit any Double (D1–D20) or Inner Bull (50)',
  kind: 'any_double',
};

const ANY_TREBLE_CHALLENGE: HalveItChallenge = {
  id: 'any-treble',
  shortLabel: 'ANY T',
  label: 'Any Treble',
  description: 'Hit any Treble bed (T1–T20)',
  kind: 'any_treble',
};

const DOUBLE_20_CHALLENGE: HalveItChallenge = {
  id: 'd20',
  shortLabel: 'D20',
  label: 'Double 20',
  description: 'Tops only! Hit Double 20 (40 pts)',
  kind: 'specific_double',
  targetNumber: 20,
};

const BULL_CHALLENGE: HalveItChallenge = {
  id: 'bull',
  shortLabel: 'BULL',
  label: 'Bullseye',
  description: 'Hit Outer Bull (25) or Inner Bull (50)',
  kind: 'bull',
};

export const HALVE_IT_PRESETS: Record<HalveItPreset, HalveItChallenge[]> = {
  classic: [
    numberChallenge(20),
    numberChallenge(16),
    ANY_DOUBLE_CHALLENGE,
    numberChallenge(19),
    ANY_TREBLE_CHALLENGE,
    numberChallenge(14),
    BULL_CHALLENGE,
  ],
  extended: [
    numberChallenge(20),
    numberChallenge(18),
    ANY_DOUBLE_CHALLENGE,
    numberChallenge(16),
    numberChallenge(15),
    ANY_TREBLE_CHALLENGE,
    numberChallenge(19),
    numberChallenge(14),
    DOUBLE_20_CHALLENGE,
    BULL_CHALLENGE,
  ],
};

export function matchesChallenge(dart: DartThrow, challenge: HalveItChallenge): boolean {
  if (isMiss(dart)) return false;

  switch (challenge.kind) {
    case 'number':
      return getDartNumber(dart) === challenge.targetNumber;
    case 'any_double':
      return isDouble(dart);
    case 'any_treble':
      return isTreble(dart);
    case 'specific_double':
      return getDartNumber(dart) === challenge.targetNumber && dart.segment.multiplier === 2;
    case 'bull':
      return isAnyBull(dart);
    default:
      return false;
  }
}

function sortPlayersForStandings(players: HalveItPlayerState[]): HalveItPlayerState[] {
  return [...players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.timesHalved !== b.timesHalved) return a.timesHalved - b.timesHalved;
    if (b.challengeHits !== a.challengeHits) return b.challengeHits - a.challengeHits;
    return b.bestVisit - a.bestVisit;
  });
}

export function createInitialState(
  players: GamePlayer[],
  config: GameMatchConfig
): HalveItState {
  const preset: HalveItPreset = config.preset === 'extended' ? 'extended' : 'classic';
  const rawBank = config.startingBank;
  const startingBank =
    rawBank === 0 || rawBank === '0'
      ? 0
      : typeof rawBank === 'number' && Number.isFinite(rawBank)
      ? Math.max(0, Math.floor(rawBank))
      : 40;

  const challenges = HALVE_IT_PRESETS[preset];

  const initialPlayers: HalveItPlayerState[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    colorHex: p.colorHex,
    avatarInitial: p.avatarInitial,
    score: startingBank,
    challengeHits: 0,
    timesHalved: 0,
    pointsLostToHalve: 0,
    bestVisit: 0,
    dartsThrown: 0,
  }));

  return {
    preset,
    startingBank,
    challenges,
    currentRoundIndex: 0,
    players: initialPlayers,
    activePlayerIndex: 0,
    visitDarts: [],
    visitLabels: [],
    visitTones: [],
    visitPoints: 0,
    visitHadHit: false,
    visitWasHalved: false,
    preHalveScore: null,
    turnComplete: false,
    totalDartsThrown: 0,
    isFinished: false,
    winnerId: null,
  };
}

export function applyDartToState(
  state: HalveItState,
  dart: DartThrow
): { nextState: HalveItState; feedback: HalveItFeedback } {
  if (
    state.isFinished ||
    state.turnComplete ||
    state.visitDarts.length >= 3 ||
    state.players.length === 0 ||
    !state.players[state.activePlayerIndex] ||
    !state.challenges[state.currentRoundIndex]
  ) {
    return { nextState: state, feedback: { sound: 'none', callout: null } };
  }

  const challenge = state.challenges[state.currentRoundIndex];
  const activePlayer = state.players[state.activePlayerIndex];
  const isHit = matchesChallenge(dart, challenge);
  const miss = isMiss(dart);
  const nextVisitDarts = [...state.visitDarts, dart];
  const isThirdDart = nextVisitDarts.length >= 3;

  const wasSafeBefore = state.visitHadHit;
  const nextVisitHadHit = state.visitHadHit || isHit;
  const pointsEarned = isHit ? dart.score : 0;
  const nextVisitPoints = state.visitPoints + pointsEarned;

  let pillLabel = miss ? 'MISS' : 'NO HIT';
  let pillTone: PillTone = 'rose';

  if (isHit) {
    if (!wasSafeBefore) {
      pillLabel = `+${pointsEarned} SAFE`;
      pillTone = 'emerald';
    } else if (isInnerBull(dart) || isTreble(dart) || challenge.kind === 'specific_double') {
      pillLabel = `+${pointsEarned} HUGE`;
      pillTone = 'amber';
    } else {
      pillLabel = `+${pointsEarned}`;
      pillTone = 'emerald';
    }
  }

  const shouldHalveNow = isThirdDart && !nextVisitHadHit && !state.visitWasHalved;
  const preHalveScore = shouldHalveNow ? activePlayer.score : state.preHalveScore;
  const postHalveScore = shouldHalveNow ? Math.floor(activePlayer.score / 2) : activePlayer.score + pointsEarned;
  const pointsLost = shouldHalveNow ? activePlayer.score - postHalveScore : 0;

  if (shouldHalveNow) {
    pillLabel = '✂️ HALVED!';
    pillTone = 'rose';
  }

  const nextPlayers = state.players.map((p, idx) => {
    if (idx !== state.activePlayerIndex) return p;
    return {
      ...p,
      score: postHalveScore,
      challengeHits: p.challengeHits + (isHit ? 1 : 0),
      timesHalved: p.timesHalved + (shouldHalveNow ? 1 : 0),
      pointsLostToHalve: p.pointsLostToHalve + pointsLost,
      bestVisit: Math.max(p.bestVisit, nextVisitPoints),
      dartsThrown: p.dartsThrown + 1,
    };
  });

  const isLastPlayerOfFinalRound =
    state.currentRoundIndex >= state.challenges.length - 1 &&
    state.activePlayerIndex === state.players.length - 1;

  const isFinished = isThirdDart && isLastPlayerOfFinalRound;
  const winnerId = isFinished ? (sortPlayersForStandings(nextPlayers)[0]?.id ?? null) : null;

  // Build dramatic audio/visual feedback
  let feedback: HalveItFeedback = { sound: 'none', callout: null };

  if (shouldHalveNow) {
    feedback = {
      sound: 'hazard',
      callout: {
        title: '✂️ HALVED!',
        subtitle:
          activePlayer.score > 0
            ? `${activePlayer.name} missed ${challenge.label} — bank slashed ${activePlayer.score} → ${postHalveScore}!`
            : `${activePlayer.name} missed ${challenge.label} — bank stays at 0!`,
        accent: 'rose',
      },
    };
  } else if (isHit) {
    const isBigHit =
      isInnerBull(dart) ||
      isTreble(dart) ||
      challenge.kind === 'specific_double' ||
      dart.score >= 40;

    if (!wasSafeBefore) {
      feedback = {
        sound: isBigHit ? 'jackpot' : 'bonus',
        callout: {
          title: `🛡️ SAFE! +${pointsEarned} PTS`,
          subtitle: `${activePlayer.name} survives ${challenge.label} • Bank: ${postHalveScore}`,
          accent: 'emerald',
        },
      };
    } else if (isBigHit) {
      feedback = {
        sound: isInnerBull(dart) || dart.score >= 50 ? 'jackpot' : 'bonus',
        callout: {
          title: `🔥 MASSIVE ${dart.segment.name}! +${pointsEarned}`,
          subtitle: `${activePlayer.name} surges to ${postHalveScore} pts!`,
          accent: 'amber',
        },
      };
    } else {
      feedback = {
        sound: 'hit',
        callout: {
          title: `+${pointsEarned} ON ${challenge.label}`,
          subtitle: `Visit total: +${nextVisitPoints} • Bank: ${postHalveScore}`,
          accent: 'emerald',
        },
      };
    }
  } else {
    // Non-scoring dart (1st or 2nd, or 3rd when already safe)
    if (!nextVisitHadHit && nextVisitDarts.length === 2) {
      feedback = {
        sound: 'hazard',
        callout: {
          title: `🚨 FINAL DART! MISS = HALVE!`,
          subtitle: `Hit ${challenge.label} or drop ${activePlayer.score} → ${Math.floor(activePlayer.score / 2)}!`,
          accent: 'rose',
        },
      };
    } else {
      feedback = {
        sound: nextVisitHadHit ? 'hit' : 'hazard',
        callout: null,
      };
    }
  }

  const nextState: HalveItState = {
    ...state,
    players: nextPlayers,
    visitDarts: nextVisitDarts,
    visitLabels: [...state.visitLabels, pillLabel],
    visitTones: [...state.visitTones, pillTone],
    visitPoints: nextVisitPoints,
    visitHadHit: nextVisitHadHit,
    visitWasHalved: state.visitWasHalved || shouldHalveNow,
    preHalveScore,
    turnComplete: isThirdDart,
    totalDartsThrown: state.totalDartsThrown + 1,
    isFinished,
    winnerId,
  };

  return { nextState, feedback };
}

export function advanceTurn(state: HalveItState): HalveItState {
  if (state.isFinished || state.players.length === 0 || !state.players[state.activePlayerIndex]) {
    return state;
  }

  // Safeguard: if a player pulled darts early (after throwing >=1 dart) without hitting the target,
  // apply the Halve It penalty before advancing so nobody can skip out of a miss!
  let updatedPlayers = state.players;
  if (state.visitDarts.length > 0 && !state.visitHadHit && !state.visitWasHalved) {
    updatedPlayers = state.players.map((p, idx) => {
      if (idx !== state.activePlayerIndex) return p;
      const halved = Math.floor(p.score / 2);
      return {
        ...p,
        score: halved,
        timesHalved: p.timesHalved + 1,
        pointsLostToHalve: p.pointsLostToHalve + (p.score - halved),
      };
    });
  }

  const isLastPlayer = state.activePlayerIndex === updatedPlayers.length - 1;
  const isFinalRound = state.currentRoundIndex >= state.challenges.length - 1;

  if (isLastPlayer && isFinalRound) {
    const winner = sortPlayersForStandings(updatedPlayers)[0];
    return {
      ...state,
      players: updatedPlayers,
      isFinished: true,
      winnerId: winner?.id ?? null,
      turnComplete: true,
    };
  }

  const nextPlayerIndex = isLastPlayer ? 0 : state.activePlayerIndex + 1;
  const nextRoundIndex = isLastPlayer ? state.currentRoundIndex + 1 : state.currentRoundIndex;

  return {
    ...state,
    players: updatedPlayers,
    activePlayerIndex: nextPlayerIndex,
    currentRoundIndex: nextRoundIndex,
    visitDarts: [],
    visitLabels: [],
    visitTones: [],
    visitPoints: 0,
    visitHadHit: false,
    visitWasHalved: false,
    preHalveScore: null,
    turnComplete: false,
  };
}

export function buildGameResult(state: HalveItState, startedAt: number): GameResult {
  const sorted = sortPlayersForStandings(state.players);
  const winner = sorted[0];

  const standings: GameStanding[] = sorted.map((p, index) => {
    const secondaryParts = [`${p.challengeHits} hits`];
    if (p.timesHalved === 0) {
      secondaryParts.push('🛡️ Never Halved!');
    } else {
      secondaryParts.push(`✂️ Halved ×${p.timesHalved}`);
    }
    return {
      playerId: p.id,
      playerName: p.name,
      colorHex: p.colorHex,
      rank: index + 1,
      primaryStatLabel: 'Final Bank',
      primaryStatValue: p.score,
      secondaryStat: secondaryParts.join(' • '),
    };
  });

  const totalHalvings = state.players.reduce((sum, p) => sum + p.timesHalved, 0);
  const bestVisitPlayer = [...state.players].sort((a, b) => b.bestVisit - a.bestVisit)[0];
  const unhalvedPlayers = state.players.filter((p) => p.timesHalved === 0);

  const highlights: string[] = [];
  highlights.push(`✂️ ${totalHalvings} Total Halving${totalHalvings === 1 ? '' : 's'}`);
  if (bestVisitPlayer && bestVisitPlayer.bestVisit > 0) {
    highlights.push(`Biggest Round: ${bestVisitPlayer.name} (+${bestVisitPlayer.bestVisit})`);
  }
  if (unhalvedPlayers.length > 0) {
    highlights.push(
      `Untouched: ${unhalvedPlayers.map((p) => p.name).join(', ')}`
    );
  }

  const headline = !winner
    ? 'Halve It match complete!'
    : winner.timesHalved === 0
    ? `🛡️ ${winner.name} conquers Halve It unscathed (${winner.score} pts)!`
    : `✂️ ${winner.name} survives the gauntlet with ${winner.score} pts!`;

  return {
    gameId: 'halve-it',
    winnerId: winner?.id ?? null,
    winnerName: winner?.name ?? 'Draw',
    headline,
    standings,
    totalDartsThrown: state.totalDartsThrown,
    durationMs: Math.max(1000, Date.now() - startedAt),
    highlights,
    completedAt: Date.now(),
  };
}
