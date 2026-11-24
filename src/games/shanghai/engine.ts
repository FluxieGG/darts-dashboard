import { DartThrow } from '../../types/darts';
import { GameMatchConfig, GamePlayer, GameResult, GameStanding } from '../../types/games';
import { getDartNumber, isMiss } from '../utils/dartHelpers';
import {
  PillTone,
  ShanghaiFeedback,
  ShanghaiPlayerState,
  ShanghaiState,
  ShanghaiVisitCombo,
} from './types';

function emptyCombo(): ShanghaiVisitCombo {
  return { hitSingle: false, hitDouble: false, hitTreble: false };
}

function getMissingComboPiece(combo: ShanghaiVisitCombo, target: number): string | null {
  const hits = Number(combo.hitSingle) + Number(combo.hitDouble) + Number(combo.hitTreble);
  if (hits !== 2) return null;
  if (!combo.hitSingle) return `S${target}`;
  if (!combo.hitDouble) return `D${target}`;
  return `T${target}`;
}

function resolvePointsWinner(players: ShanghaiPlayerState[]): ShanghaiPlayerState | undefined {
  const sorted = sortPlayersForStandings(players, null);
  return sorted[0];
}

function sortPlayersForStandings(
  players: ShanghaiPlayerState[],
  shanghaiWinnerId: string | null
): ShanghaiPlayerState[] {
  return [...players].sort((a, b) => {
    if (shanghaiWinnerId) {
      if (a.id === shanghaiWinnerId) return -1;
      if (b.id === shanghaiWinnerId) return 1;
    }
    if (b.score !== a.score) return b.score - a.score;
    if (b.shanghaisHit !== a.shanghaisHit) return b.shanghaisHit - a.shanghaisHit;
    if (b.targetHits !== a.targetHits) return b.targetHits - a.targetHits;
    return b.bestVisit - a.bestVisit;
  });
}

export function createInitialState(
  players: GamePlayer[],
  config: GameMatchConfig
): ShanghaiState {
  const parsedRounds = Number(config.rounds);
  const totalRounds = parsedRounds === 7 || parsedRounds === 10 || parsedRounds === 20 ? parsedRounds : 7;
  const instantWin = config.instantWin !== false;

  const initialPlayers: ShanghaiPlayerState[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    colorHex: p.colorHex,
    avatarInitial: p.avatarInitial,
    score: 0,
    targetHits: 0,
    singlesHit: 0,
    doublesHit: 0,
    treblesHit: 0,
    bestVisit: 0,
    shanghaisHit: 0,
    dartsThrown: 0,
  }));

  return {
    players: initialPlayers,
    activePlayerIndex: 0,
    currentRound: 1,
    totalRounds,
    instantWin,
    visitDarts: [],
    visitLabels: [],
    visitTones: [],
    visitPoints: 0,
    visitCombo: emptyCombo(),
    shanghaiAwardedThisVisit: false,
    turnComplete: false,
    totalDartsThrown: 0,
    isFinished: false,
    winnerId: null,
    winReason: null,
  };
}

export function applyDartToState(
  state: ShanghaiState,
  dart: DartThrow
): { nextState: ShanghaiState; feedback: ShanghaiFeedback } {
  if (
    state.isFinished ||
    state.turnComplete ||
    state.visitDarts.length >= 3 ||
    state.players.length === 0 ||
    !state.players[state.activePlayerIndex]
  ) {
    return { nextState: state, feedback: { sound: 'none', callout: null } };
  }

  const target = state.currentRound;
  const activePlayer = state.players[state.activePlayerIndex];
  const miss = isMiss(dart);
  const hitNumber = getDartNumber(dart);
  const multiplier = dart.segment.multiplier;
  const isTargetHit = !miss && hitNumber === target && (multiplier === 1 || multiplier === 2 || multiplier === 3);

  const nextCombo: ShanghaiVisitCombo = { ...state.visitCombo };
  let pointsEarned = 0;
  let pillLabel = miss ? 'MISS' : 'OFF TARGET';
  let pillTone: PillTone = 'rose';

  if (isTargetHit) {
    pointsEarned = target * multiplier;
    if (multiplier === 1) {
      nextCombo.hitSingle = true;
      pillLabel = `+${pointsEarned} (S${target})`;
      pillTone = 'sky';
    } else if (multiplier === 2) {
      nextCombo.hitDouble = true;
      pillLabel = `+${pointsEarned} (D${target})`;
      pillTone = 'emerald';
    } else {
      nextCombo.hitTreble = true;
      pillLabel = `+${pointsEarned} (T${target})`;
      pillTone = 'amber';
    }
  }

  const completedShanghaiNow =
    !state.shanghaiAwardedThisVisit &&
    nextCombo.hitSingle &&
    nextCombo.hitDouble &&
    nextCombo.hitTreble;

  const shanghaiBonus = completedShanghaiNow && !state.instantWin ? 100 : 0;
  const totalDartPoints = pointsEarned + shanghaiBonus;
  const nextVisitPoints = state.visitPoints + totalDartPoints;
  const nextVisitDarts = [...state.visitDarts, dart];
  const isThirdDart = nextVisitDarts.length >= 3;

  if (completedShanghaiNow) {
    pillLabel = state.instantWin ? 'SHANGHAI!' : `+${totalDartPoints} SHANGHAI!`;
    pillTone = 'purple';
  }

  const nextPlayers = state.players.map((p, idx) => {
    if (idx !== state.activePlayerIndex) return p;
    return {
      ...p,
      score: p.score + totalDartPoints,
      targetHits: p.targetHits + (isTargetHit ? 1 : 0),
      singlesHit: p.singlesHit + (isTargetHit && multiplier === 1 ? 1 : 0),
      doublesHit: p.doublesHit + (isTargetHit && multiplier === 2 ? 1 : 0),
      treblesHit: p.treblesHit + (isTargetHit && multiplier === 3 ? 1 : 0),
      bestVisit: Math.max(p.bestVisit, nextVisitPoints),
      shanghaisHit: p.shanghaisHit + (completedShanghaiNow ? 1 : 0),
      dartsThrown: p.dartsThrown + 1,
    };
  });

  const isLastPlayerOfFinalRound =
    state.currentRound >= state.totalRounds &&
    state.activePlayerIndex === state.players.length - 1;

  let isFinished = false;
  let winnerId: string | null = null;
  let winReason: 'shanghai' | 'points' | null = null;
  let turnComplete = isThirdDart;

  if (completedShanghaiNow && state.instantWin) {
    isFinished = true;
    winnerId = activePlayer.id;
    winReason = 'shanghai';
    turnComplete = true;
  } else if (isThirdDart && isLastPlayerOfFinalRound) {
    const topPlayer = resolvePointsWinner(nextPlayers);
    isFinished = true;
    winnerId = topPlayer?.id ?? null;
    winReason = 'points';
    turnComplete = true;
  }

  // Build dramatic venue feedback
  let feedback: ShanghaiFeedback = { sound: 'none', callout: null };

  if (completedShanghaiNow && state.instantWin) {
    feedback = {
      sound: 'jackpot',
      callout: {
        title: '👑 SHANGHAI! INSTANT VICTORY!',
        subtitle: `${activePlayer.name} nailed S${target} + D${target} + T${target} in one visit!`,
        accent: 'purple',
      },
    };
  } else if (completedShanghaiNow) {
    feedback = {
      sound: 'jackpot',
      callout: {
        title: '👑 SHANGHAI! +100 BONUS!',
        subtitle: `${activePlayer.name} completed S${target} + D${target} + T${target}!`,
        accent: 'purple',
      },
    };
  } else if (isTargetHit) {
    const missingForShanghai = !isThirdDart ? getMissingComboPiece(nextCombo, target) : null;
    if (missingForShanghai) {
      feedback = {
        sound: multiplier >= 2 ? 'bonus' : 'hit',
        callout: {
          title: `🔥 1 AWAY FROM SHANGHAI!`,
          subtitle: `+${pointsEarned} pts • Hit ${missingForShanghai} for ${state.instantWin ? 'INSTANT WIN!' : '+100 BONUS!'}`,
          accent: 'purple',
        },
      };
    } else if (multiplier === 3) {
      feedback = {
        sound: 'bonus',
        callout: {
          title: `🎯 TREBLE ${target}! +${pointsEarned}`,
          subtitle: `${activePlayer.name} lights up Round ${target}`,
          accent: 'amber',
        },
      };
    } else if (multiplier === 2) {
      feedback = {
        sound: 'bonus',
        callout: {
          title: `✨ DOUBLE ${target}! +${pointsEarned}`,
          subtitle: `${activePlayer.name} banks ${nextVisitPoints} this visit`,
          accent: 'emerald',
        },
      };
    } else {
      feedback = {
        sound: 'hit',
        callout: {
          title: `+${pointsEarned} ON ${target}s`,
          subtitle: `Visit total: ${nextVisitPoints} pts`,
          accent: 'sky',
        },
      };
    }
  } else {
    feedback = {
      sound: 'hazard',
      callout: isThirdDart && nextVisitPoints === 0
        ? {
            title: `ZERO ON ${target}s`,
            subtitle: `${activePlayer.name} blanks Round ${target}`,
            accent: 'rose',
          }
        : null,
    };
  }

  const nextState: ShanghaiState = {
    ...state,
    players: nextPlayers,
    visitDarts: nextVisitDarts,
    visitLabels: [...state.visitLabels, pillLabel],
    visitTones: [...state.visitTones, pillTone],
    visitPoints: nextVisitPoints,
    visitCombo: nextCombo,
    shanghaiAwardedThisVisit: state.shanghaiAwardedThisVisit || completedShanghaiNow,
    turnComplete,
    totalDartsThrown: state.totalDartsThrown + 1,
    isFinished,
    winnerId,
    winReason,
  };

  return { nextState, feedback };
}

export function advanceTurn(state: ShanghaiState): ShanghaiState {
  if (state.isFinished || state.players.length === 0 || !state.players[state.activePlayerIndex]) {
    return state;
  }

  const isLastPlayer = state.activePlayerIndex === state.players.length - 1;
  if (isLastPlayer && state.currentRound >= state.totalRounds) {
    const topPlayer = resolvePointsWinner(state.players);
    return {
      ...state,
      isFinished: true,
      winnerId: topPlayer?.id ?? null,
      winReason: 'points',
      turnComplete: true,
    };
  }

  const nextPlayerIndex = isLastPlayer ? 0 : state.activePlayerIndex + 1;
  const nextRound = isLastPlayer ? state.currentRound + 1 : state.currentRound;

  return {
    ...state,
    activePlayerIndex: nextPlayerIndex,
    currentRound: nextRound,
    visitDarts: [],
    visitLabels: [],
    visitTones: [],
    visitPoints: 0,
    visitCombo: emptyCombo(),
    shanghaiAwardedThisVisit: false,
    turnComplete: false,
  };
}

export function buildGameResult(state: ShanghaiState, startedAt: number): GameResult {
  const shanghaiWinnerId = state.winReason === 'shanghai' ? state.winnerId : null;
  const sorted = sortPlayersForStandings(state.players, shanghaiWinnerId);
  const winner = sorted[0];

  const standings: GameStanding[] = sorted.map((p, index) => {
    const parts: string[] = [`${p.targetHits} hits`, `Best: ${p.bestVisit}`];
    if (p.shanghaisHit > 0) {
      parts.unshift(`👑 ${p.shanghaisHit} Shanghai${p.shanghaisHit > 1 ? 's' : ''}`);
    }
    return {
      playerId: p.id,
      playerName: p.name,
      colorHex: p.colorHex,
      rank: index + 1,
      primaryStatLabel: shanghaiWinnerId === p.id ? 'SHANGHAI KO' : 'Points',
      primaryStatValue: p.score,
      secondaryStat: parts.join(' • '),
    };
  });

  const bestVisitPlayer = [...state.players].sort((a, b) => b.bestVisit - a.bestVisit)[0];
  const mostAccurate = [...state.players].sort((a, b) => b.targetHits - a.targetHits)[0];
  const totalShanghais = state.players.reduce((sum, p) => sum + p.shanghaisHit, 0);

  const highlights: string[] = [];
  if (totalShanghais > 0) {
    highlights.push(`👑 ${totalShanghais} Shanghai${totalShanghais > 1 ? 's' : ''} Hit`);
  }
  if (bestVisitPlayer && bestVisitPlayer.bestVisit > 0) {
    highlights.push(`Top Visit: ${bestVisitPlayer.name} (${bestVisitPlayer.bestVisit} pts)`);
  }
  if (mostAccurate && mostAccurate.targetHits > 0) {
    highlights.push(`Sharpshooter: ${mostAccurate.name} (${mostAccurate.targetHits} hits)`);
  }

  let headline = winner
    ? `${winner.name} wins Shanghai with ${winner.score} pts!`
    : 'Shanghai match complete!';
  if (winner && state.winReason === 'shanghai') {
    headline = `👑 ${winner.name} hits SHANGHAI on ${state.currentRound}s!`;
  } else if (winner && sorted.length >= 2 && sorted[0].score === sorted[1].score) {
    headline = `🏆 ${winner.name} edges a thriller at ${winner.score} pts!`;
  }

  return {
    gameId: 'shanghai',
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
