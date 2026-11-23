import { DartThrow } from '../../types/darts';
import { GameMatchConfig, GamePlayer, GameResult } from '../../types/games';
import { isInnerBull } from '../utils/dartHelpers';

export type JdcStage = 'shanghai-low' | 'doubles' | 'shanghai-high';

export interface JdcRoundSpec {
  stage: JdcStage;
  stageLabel: string;
  title: string;
  /** For Shanghai rounds, single target number; for Doubles rounds, 3 targets (one per dart) */
  shanghaiNumber?: number;
  doubleTargets?: Array<{ number: number; label: string; isBull: boolean }>;
}

export interface JdcRoundLog {
  roundIndex: number;
  title: string;
  points: number;
  shanghaiBonus: boolean;
}

export interface JdcState {
  player: GamePlayer;
  rounds: JdcRoundSpec[];
  roundIndex: number;
  score: number;
  visitDarts: DartThrow[];
  visitPoints: number;
  hitS: boolean;
  hitD: boolean;
  hitT: boolean;
  shanghaiCount: number;
  doublesHit: number;
  turnComplete: boolean;
  totalDartsThrown: number;
  logs: JdcRoundLog[];
  isFinished: boolean;
}

export interface JdcFeedback {
  sound: 'dartHit' | 'bonusHit' | 'jackpot' | 'hazard';
  title?: string;
  subtitle?: string;
  accent?: 'emerald' | 'amber' | 'rose' | 'sky' | 'purple';
}

export function getJdcBelt(score: number): { name: string; colorClass: string } {
  if (score >= 750) return { name: 'Black Belt', colorClass: 'text-white bg-slate-950 border-white/60' };
  if (score >= 650) return { name: 'Red Belt', colorClass: 'text-rose-200 bg-rose-500/25 border-rose-400/60' };
  if (score >= 550) return { name: 'Purple Belt', colorClass: 'text-purple-200 bg-purple-500/25 border-purple-400/60' };
  if (score >= 450) return { name: 'Blue Belt', colorClass: 'text-sky-200 bg-sky-500/25 border-sky-400/60' };
  if (score >= 350) return { name: 'Green Belt', colorClass: 'text-emerald-200 bg-emerald-500/25 border-emerald-400/60' };
  if (score >= 250) return { name: 'Orange Belt', colorClass: 'text-orange-200 bg-orange-500/25 border-orange-400/60' };
  if (score >= 150) return { name: 'Yellow Belt', colorClass: 'text-amber-200 bg-amber-500/25 border-amber-400/60' };
  return { name: 'White Belt', colorClass: 'text-slate-200 bg-white/10 border-white/25' };
}

export function buildJdcRounds(): JdcRoundSpec[] {
  const rounds: JdcRoundSpec[] = [];
  // Stage 1: Shanghai 10–15
  for (let n = 10; n <= 15; n++) {
    rounds.push({
      stage: 'shanghai-low',
      stageLabel: 'Stage 1 • Shanghai 10–15',
      title: `Shanghai ${n}`,
      shanghaiNumber: n,
    });
  }
  // Stage 2: Around the World Doubles (D1–D20 + Bull = 7 rounds of 3 darts)
  const doubleGroups: Array<Array<{ number: number; label: string; isBull: boolean }>> = [];
  const allDoubles: Array<{ number: number; label: string; isBull: boolean }> = [];
  for (let n = 1; n <= 20; n++) {
    allDoubles.push({ number: n, label: `D${n}`, isBull: false });
  }
  allDoubles.push({ number: 25, label: 'Bull', isBull: true });
  for (let i = 0; i < allDoubles.length; i += 3) {
    doubleGroups.push(allDoubles.slice(i, i + 3));
  }
  for (const grp of doubleGroups) {
    rounds.push({
      stage: 'doubles',
      stageLabel: 'Stage 2 • Doubles Gauntlet',
      title: grp.map((g) => g.label).join(' • '),
      doubleTargets: grp,
    });
  }
  // Stage 3: Shanghai 15–20
  for (let n = 15; n <= 20; n++) {
    rounds.push({
      stage: 'shanghai-high',
      stageLabel: 'Stage 3 • Shanghai 15–20',
      title: `Shanghai ${n}`,
      shanghaiNumber: n,
    });
  }
  return rounds;
}

export function createInitialJdcState(players: GamePlayer[], _config: GameMatchConfig): JdcState {
  const player: GamePlayer = players[0] || {
    id: 'solo',
    name: 'Player',
    colorHex: '#A855F7',
    colorIndex: 4,
    avatarInitial: 'P',
  };

  return {
    player,
    rounds: buildJdcRounds(),
    roundIndex: 0,
    score: 0,
    visitDarts: [],
    visitPoints: 0,
    hitS: false,
    hitD: false,
    hitT: false,
    shanghaiCount: 0,
    doublesHit: 0,
    turnComplete: false,
    totalDartsThrown: 0,
    logs: [],
    isFinished: false,
  };
}

export function applyDartToJdc(
  state: JdcState,
  dart: DartThrow
): { nextState: JdcState; feedback: JdcFeedback } {
  if (state.isFinished || state.turnComplete || state.visitDarts.length >= 3) {
    return { nextState: state, feedback: { sound: 'dartHit' } };
  }

  const round = state.rounds[state.roundIndex];
  if (!round) {
    return { nextState: { ...state, isFinished: true }, feedback: { sound: 'dartHit' } };
  }

  const dartIdx = state.visitDarts.length;
  const isMiss = Boolean(dart.bouncer || dart.score === 0 || dart.segment.bed === 'Outside');
  let dartPts = 0;
  let hitS = state.hitS;
  let hitD = state.hitD;
  let hitT = state.hitT;
  let doublesHit = state.doublesHit;
  let shanghaiBonus = false;
  let feedback: JdcFeedback = { sound: 'dartHit' };

  if (round.shanghaiNumber !== undefined) {
    if (!isMiss && dart.segment.number === round.shanghaiNumber) {
      dartPts = round.shanghaiNumber * dart.segment.multiplier;
      if (dart.segment.multiplier === 1) hitS = true;
      if (dart.segment.multiplier === 2) hitD = true;
      if (dart.segment.multiplier === 3) hitT = true;

      if (hitS && hitD && hitT && !(state.hitS && state.hitD && state.hitT)) {
        shanghaiBonus = true;
        dartPts += 100;
        feedback = {
          sound: 'jackpot',
          title: `SHANGHAI ON ${round.shanghaiNumber}! +100 BONUS`,
          subtitle: 'Single + Double + Treble in one visit!',
          accent: 'purple',
        };
      } else if (dart.segment.multiplier >= 2) {
        feedback = {
          sound: 'bonusHit',
          title: `${dart.segment.name}  +${dartPts}`,
          accent: 'emerald',
        };
      }
    }
  } else if (round.doubleTargets) {
    const target = round.doubleTargets[dartIdx];
    if (target && !isMiss) {
      const hit = target.isBull
        ? isInnerBull(dart)
        : dart.segment.number === target.number && dart.segment.multiplier === 2;
      if (hit) {
        dartPts = target.isBull ? 100 : 50;
        doublesHit += 1;
        feedback = {
          sound: target.isBull ? 'jackpot' : 'bonusHit',
          title: `${target.label} NAILED! +${dartPts}`,
          accent: 'emerald',
        };
      }
    }
  }

  const nextVisitDarts = [...state.visitDarts, dart];
  const nextVisitPoints = state.visitPoints + dartPts;
  const nextScore = state.score + dartPts;
  const isThird = nextVisitDarts.length >= 3;
  const isFinished = isThird && state.roundIndex >= state.rounds.length - 1;
  const nextLogs = isThird
    ? [
        ...state.logs,
        {
          roundIndex: state.roundIndex,
          title: round.title,
          points: nextVisitPoints,
          shanghaiBonus: state.hitS && state.hitD && state.hitT ? true : shanghaiBonus,
        },
      ]
    : state.logs;

  return {
    nextState: {
      ...state,
      score: nextScore,
      visitDarts: nextVisitDarts,
      visitPoints: nextVisitPoints,
      hitS,
      hitD,
      hitT,
      shanghaiCount: state.shanghaiCount + (shanghaiBonus ? 1 : 0),
      doublesHit,
      turnComplete: isThird,
      totalDartsThrown: state.totalDartsThrown + 1,
      logs: nextLogs,
      isFinished,
    },
    feedback,
  };
}

export function advanceJdcRound(state: JdcState): JdcState {
  if (state.isFinished) return state;

  const round = state.rounds[state.roundIndex];
  let logs = state.logs;
  if (!state.turnComplete && state.visitDarts.length > 0 && round) {
    logs = [
      ...state.logs,
      {
        roundIndex: state.roundIndex,
        title: round.title,
        points: state.visitPoints,
        shanghaiBonus: state.hitS && state.hitD && state.hitT,
      },
    ];
  }

  const nextRound = state.roundIndex + 1;
  if (nextRound >= state.rounds.length) {
    return { ...state, logs, isFinished: true };
  }

  return {
    ...state,
    roundIndex: nextRound,
    visitDarts: [],
    visitPoints: 0,
    hitS: false,
    hitD: false,
    hitT: false,
    turnComplete: false,
    logs,
  };
}

export function buildJdcResult(state: JdcState, startedAt: number): GameResult {
  const belt = getJdcBelt(state.score);
  return {
    gameId: 'jdc-challenge',
    winnerId: state.player.id,
    winnerName: state.player.name,
    headline: `${state.player.name} scored ${state.score} — ${belt.name}!`,
    standings: [
      {
        playerId: state.player.id,
        playerName: state.player.name,
        colorHex: state.player.colorHex,
        rank: 1,
        primaryStatLabel: 'JDC Score',
        primaryStatValue: state.score,
        secondaryStat: `${belt.name} • ${state.doublesHit}/21 Doubles • ${state.shanghaiCount} Shanghais`,
      },
    ],
    totalDartsThrown: state.totalDartsThrown,
    durationMs: Date.now() - startedAt,
    highlights: [
      `Rating: ${belt.name}`,
      `Doubles Hit: ${state.doublesHit} / 21`,
      `Shanghai Bonuses: ${state.shanghaiCount}`,
    ],
    completedAt: Date.now(),
  };
}
