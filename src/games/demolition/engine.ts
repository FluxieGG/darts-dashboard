import { DartThrow } from '../../types/darts';
import { GameMatchConfig, GamePlayer, GameResult, GameStanding } from '../../types/games';
import { isDouble, isInnerBull, isMiss, isTreble } from '../utils/dartHelpers';
import {
  DemolitionDartFeedback,
  DemolitionOutRule,
  DemolitionPlayerState,
  DemolitionState,
} from './types';

export function getThreeDartAverage(player: DemolitionPlayerState, startScore: number): number {
  if (player.dartsThrown === 0) return 0;
  const netScored = Math.max(0, startScore - player.score);
  return (netScored / player.dartsThrown) * 3;
}

export function createInitialState(
  players: GamePlayer[],
  config: GameMatchConfig
): DemolitionState {
  const rawStart = Number(config.startScore);
  const startScore = rawStart === 180 || rawStart === 301 || rawStart === 501 ? rawStart : 501;
  // Standard X01 defaults to Single-In, Double-Out (must finish on Double or Bullseye)
  const outRule: DemolitionOutRule = config.outRule === 'straight' ? 'straight' : 'double';

  return {
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      colorHex: p.colorHex,
      avatarInitial: p.avatarInitial,
      score: startScore,
      turnStartScore: startScore,
      dartsThrown: 0,
      highestVisit: 0,
      tonPlusCount: 0,
      bustCount: 0,
      lastVisitScore: null,
      lastVisitWasBust: false,
    })),
    currentPlayerIndex: 0,
    round: 1,
    startScore,
    outRule,
    currentVisitDarts: [],
    currentVisitLabels: [],
    currentVisitTones: [],
    visitRunningScore: 0,
    isBust: false,
    turnComplete: false,
    totalDartsThrown: 0,
    isFinished: false,
    winnerId: null,
    winningDartName: null,
    lastEventSummary: `Demolish ${startScore} to zero (${outRule === 'double' ? 'Single In • Double Out' : 'Single In • Straight Out'})`,
  };
}

export function applyDartToState(
  state: DemolitionState,
  dart: DartThrow
): { nextState: DemolitionState; feedback: DemolitionDartFeedback } {
  if (state.isFinished || state.turnComplete || state.currentVisitDarts.length >= 3) {
    return { nextState: state, feedback: { sound: 'none', ignored: true } };
  }

  const activeIdx = state.currentPlayerIndex;
  const players = state.players.map((p) => ({ ...p }));
  const player = players[activeIdx];
  player.dartsThrown += 1;

  const missed = isMiss(dart);
  const points = missed ? 0 : dart.score;
  const candidate = player.score - points;
  const nextVisitDarts = [...state.currentVisitDarts, dart];
  const nextVisitLabels = [...state.currentVisitLabels];
  const nextVisitTones = [...state.currentVisitTones];

  const isDoubleOut = state.outRule === 'double';
  const hitValidDouble = isDouble(dart);

  // Check BUST conditions
  const busted = isDoubleOut
    ? candidate < 0 || candidate === 1 || (candidate === 0 && !hitValidDouble)
    : candidate < 0;

  if (busted) {
    const bustReason =
      isDoubleOut && candidate === 0 && !hitValidDouble
        ? 'Must check out on a Double or Bullseye (50)!'
        : isDoubleOut && candidate === 1
        ? 'Cannot leave 1 in Double-Out!'
        : `Overshot ${player.score} remaining!`;

    player.score = player.turnStartScore;
    player.bustCount += 1;
    player.lastVisitScore = 0;
    player.lastVisitWasBust = true;

    nextVisitLabels.push('BUST!');
    nextVisitTones.push('rose');

    return {
      nextState: {
        ...state,
        players,
        currentVisitDarts: nextVisitDarts,
        currentVisitLabels: nextVisitLabels,
        currentVisitTones: nextVisitTones,
        visitRunningScore: 0,
        isBust: true,
        turnComplete: true,
        totalDartsThrown: state.totalDartsThrown + 1,
        lastEventSummary: `💥 BUST! ${player.name} restored to ${player.turnStartScore}`,
      },
      feedback: {
        calloutTitle: '💥 BUST!',
        calloutSubtitle: `${bustReason} Score reset to ${player.turnStartScore}`,
        calloutAccent: 'rose',
        sound: 'hazard',
      },
    };
  }

  // Valid non-bust dart
  const nextVisitRunning = state.visitRunningScore + points;
  player.score = candidate;

  // Check WINNING CHECKOUT (exact 0)
  if (candidate === 0) {
    player.lastVisitScore = nextVisitRunning;
    player.lastVisitWasBust = false;
    player.highestVisit = Math.max(player.highestVisit, nextVisitRunning);
    if (nextVisitRunning >= 100) {
      player.tonPlusCount += 1;
    }

    nextVisitLabels.push('OUT! 🏆');
    nextVisitTones.push('emerald');

    return {
      nextState: {
        ...state,
        players,
        currentVisitDarts: nextVisitDarts,
        currentVisitLabels: nextVisitLabels,
        currentVisitTones: nextVisitTones,
        visitRunningScore: nextVisitRunning,
        isBust: false,
        turnComplete: true,
        totalDartsThrown: state.totalDartsThrown + 1,
        isFinished: true,
        winnerId: player.id,
        winningDartName: dart.segment.name,
        lastEventSummary: `🏆 ${player.name} checked out on ${dart.segment.name}!`,
      },
      feedback: {
        calloutTitle: `🏆 CHECKOUT! ${player.name.toUpperCase()} WINS!`,
        calloutSubtitle: `Demolished on ${dart.segment.name} • ${nextVisitRunning} visit (${player.dartsThrown} darts)`,
        calloutAccent: 'emerald',
        sound: 'jackpot',
      },
    };
  }

  // Standard scoring dart (still remaining > 0)
  if (missed) {
    nextVisitLabels.push('MISS');
    nextVisitTones.push('rose');
  } else if (isInnerBull(dart)) {
    nextVisitLabels.push('-50 BULL');
    nextVisitTones.push('purple');
  } else if (isTreble(dart)) {
    nextVisitLabels.push(`-${points}`);
    nextVisitTones.push('amber');
  } else if (hitValidDouble) {
    nextVisitLabels.push(`-${points}`);
    nextVisitTones.push('sky');
  } else {
    nextVisitLabels.push(`-${points}`);
    nextVisitTones.push('slate');
  }

  const isTurnOver = nextVisitDarts.length >= 3;
  if (isTurnOver) {
    player.lastVisitScore = nextVisitRunning;
    player.lastVisitWasBust = false;
    player.highestVisit = Math.max(player.highestVisit, nextVisitRunning);
    if (nextVisitRunning >= 100) {
      player.tonPlusCount += 1;
    }
  }

  let feedback: DemolitionDartFeedback;
  if (isTurnOver && nextVisitRunning === 180) {
    feedback = {
      calloutTitle: '🔥 180! MAXIMUM DEMOLITION!',
      calloutSubtitle: `${player.name} leaves ${player.score}`,
      calloutAccent: 'purple',
      sound: 'jackpot',
    };
  } else if (isTurnOver && nextVisitRunning >= 140) {
    feedback = {
      calloutTitle: `⚡ ${nextVisitRunning}! MASSIVE VISIT!`,
      calloutSubtitle: `${player.name} leaves ${player.score}`,
      calloutAccent: 'amber',
      sound: 'jackpot',
    };
  } else if (isTurnOver && nextVisitRunning >= 100) {
    feedback = {
      calloutTitle: `💥 ${nextVisitRunning}! TON+!`,
      calloutSubtitle: `${player.name} leaves ${player.score}`,
      calloutAccent: 'amber',
      sound: 'bonusHit',
    };
  } else if (missed) {
    feedback = {
      sound: 'hazard',
    };
  } else if (isInnerBull(dart) || points >= 54) {
    feedback = {
      calloutTitle: `🎯 ${dart.segment.name}! -${points}`,
      calloutSubtitle: `${player.score} remaining`,
      calloutAccent: isInnerBull(dart) ? 'purple' : 'amber',
      sound: isInnerBull(dart) ? 'jackpot' : 'bonusHit',
    };
  } else if (isTreble(dart) || hitValidDouble) {
    feedback = {
      sound: 'bonusHit',
    };
  } else {
    feedback = {
      sound: 'dartHit',
    };
  }

  return {
    nextState: {
      ...state,
      players,
      currentVisitDarts: nextVisitDarts,
      currentVisitLabels: nextVisitLabels,
      currentVisitTones: nextVisitTones,
      visitRunningScore: nextVisitRunning,
      isBust: false,
      turnComplete: isTurnOver,
      totalDartsThrown: state.totalDartsThrown + 1,
      lastEventSummary: missed
        ? `${player.name} missed (${player.score} left)`
        : `${player.name} hit ${dart.segment.name} (-${points}) → ${player.score} left`,
    },
    feedback,
  };
}

export function advanceTurn(state: DemolitionState): DemolitionState {
  if (state.isFinished) return state;

  const players = state.players.map((p) => ({ ...p }));
  const prevPlayer = players[state.currentPlayerIndex];

  // If the visit ended early (fewer than 3 darts and not busted), record partial visit stats
  if (!state.isBust && state.currentVisitDarts.length > 0 && state.currentVisitDarts.length < 3) {
    prevPlayer.lastVisitScore = state.visitRunningScore;
    prevPlayer.lastVisitWasBust = false;
    prevPlayer.highestVisit = Math.max(prevPlayer.highestVisit, state.visitRunningScore);
    if (state.visitRunningScore >= 100) {
      prevPlayer.tonPlusCount += 1;
    }
  }

  const nextIndex = (state.currentPlayerIndex + 1) % players.length;
  const wrapped = nextIndex === 0;
  const nextRound = wrapped ? state.round + 1 : state.round;
  const nextPlayer = players[nextIndex];
  nextPlayer.turnStartScore = nextPlayer.score;

  return {
    ...state,
    players,
    currentPlayerIndex: nextIndex,
    round: nextRound,
    currentVisitDarts: [],
    currentVisitLabels: [],
    currentVisitTones: [],
    visitRunningScore: 0,
    isBust: false,
    turnComplete: false,
    lastEventSummary: `${nextPlayer.name} up — ${nextPlayer.score} remaining`,
  };
}

export function buildGameResult(state: DemolitionState, startedAt: number): GameResult {
  const ranked = [...state.players].sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return getThreeDartAverage(b, state.startScore) - getThreeDartAverage(a, state.startScore);
  });

  const winner = ranked[0];

  const standings: GameStanding[] = ranked.map((p, idx) => {
    const avg = getThreeDartAverage(p, state.startScore).toFixed(1);
    return {
      playerId: p.id,
      playerName: p.name,
      colorHex: p.colorHex,
      rank: idx + 1,
      primaryStatLabel: p.score === 0 ? 'Darts Out' : 'Remaining',
      primaryStatValue: p.score === 0 ? `${p.dartsThrown} darts` : p.score,
      secondaryStat: `3DA: ${avg} • Best Visit: ${p.highestVisit}${p.tonPlusCount > 0 ? ` • ${p.tonPlusCount} Ton+` : ''}`,
    };
  });

  const highlights: string[] = [];
  if (state.winningDartName) {
    highlights.push(`Winning Dart: ${state.winningDartName}`);
  }
  const bestVisitPlayer = [...state.players].sort((a, b) => b.highestVisit - a.highestVisit)[0];
  if (bestVisitPlayer && bestVisitPlayer.highestVisit > 0) {
    highlights.push(`High Visit: ${bestVisitPlayer.highestVisit} (${bestVisitPlayer.name})`);
  }
  highlights.push(`${state.startScore} ${state.outRule === 'double' ? 'Double-Out' : 'Straight-Out'}`);

  const winnerAvg = winner ? getThreeDartAverage(winner, state.startScore).toFixed(1) : '0.0';

  return {
    gameId: 'demolition',
    winnerId: winner?.id ?? null,
    winnerName: winner?.name ?? 'Winner',
    headline: `${winner?.name ?? 'Winner'} demolished ${state.startScore} (${winnerAvg} avg)!`,
    standings,
    totalDartsThrown: state.totalDartsThrown,
    durationMs: Math.max(1000, Date.now() - startedAt),
    highlights,
    completedAt: Date.now(),
  };
}
