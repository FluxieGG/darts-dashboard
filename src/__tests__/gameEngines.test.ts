import { describe, expect, it } from 'vitest';
import { DartThrow } from '../types/darts';
import { GAME_PLAYER_COLORS, GameMatchConfig, GamePlayer, GameResult } from '../types/games';

import * as aroundTheClock from '../games/around-the-clock/engine';
import * as battleship from '../games/battleship/engine';
import * as boardIsLava from '../games/board-is-lava/engine';
import * as bobs27 from '../games/bobs-27/engine';
import * as calsQuest from '../games/cals-quest/engine';
import * as catch40 from '../games/catch-40/engine';
import * as checkout121 from '../games/checkout-121/engine';
import * as cricket from '../games/cricket/engine';
import * as dartsGolf from '../games/darts-golf/engine';
import * as demolition from '../games/demolition/engine';
import * as donkeyDerby from '../games/donkey-derby/engine';
import * as halveIt from '../games/halve-it/engine';
import * as jdcChallenge from '../games/jdc-challenge/engine';
import * as killer from '../games/killer/engine';
import * as precisionSniper from '../games/precision-sniper/engine';
import * as scoringGauntlet from '../games/scoring-gauntlet/engine';
import * as shanghai from '../games/shanghai/engine';
import * as snakesAndLadders from '../games/snakes-and-ladders/engine';
import * as sniperBingo from '../games/sniper-bingo/engine';
import * as snooker from '../games/snooker/engine';

interface EngineAdapter<TState = unknown> {
  id: string;
  playerCounts: number[];
  defaultConfig: GameMatchConfig;
  garbageConfigs: GameMatchConfig[];
  createInitial: (players: GamePlayer[], config: GameMatchConfig) => TState;
  applyDart: (state: TState, dart: DartThrow) => { nextState: TState; feedback: unknown };
  advanceTurn: (state: TState) => TState;
  buildResult: (state: TState, startedAt: number) => GameResult;
  isFinished: (state: TState) => boolean;
}

function makePlayers(count: number): GamePlayer[] {
  return Array.from({ length: count }, (_, idx) => {
    const color = GAME_PLAYER_COLORS[idx % GAME_PLAYER_COLORS.length];
    return {
      id: `p-${idx + 1}`,
      name: `Player ${idx + 1}`,
      colorHex: color.hex,
      colorIndex: idx,
      avatarInitial: `P`,
    };
  });
}

/**
 * Deterministic PRNG (Mulberry32) so CI fuzz runs are 100% reproducible.
 */
function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeDartFromSpec(
  number: number,
  multiplier: 0 | 1 | 2 | 3,
  idx: number,
  bouncer = false
): DartThrow {
  if (bouncer) {
    return {
      id: `rng-bouncer-${idx}`,
      visitDartIndex: idx,
      segment: { name: 'Bouncer', number: 0, bed: 'Outside', multiplier: 0 },
      score: 0,
      bouncer: true,
      timestamp: 1_700_000_000_000 + idx,
    };
  }
  if (number === 0 || multiplier === 0) {
    return {
      id: `rng-miss-${idx}`,
      visitDartIndex: idx,
      segment: { name: 'Miss', number: 0, bed: 'Outside', multiplier: 0 },
      score: 0,
      timestamp: 1_700_000_000_000 + idx,
    };
  }
  if (number === 25 && multiplier === 2) {
    return {
      id: `rng-bull-${idx}`,
      visitDartIndex: idx,
      segment: { name: 'Bull', number: 25, bed: 'InnerBull', multiplier: 2 },
      score: 50,
      timestamp: 1_700_000_000_000 + idx,
    };
  }
  if (number === 25) {
    return {
      id: `rng-25-${idx}`,
      visitDartIndex: idx,
      segment: { name: '25', number: 25, bed: 'Bull', multiplier: 1 },
      score: 25,
      timestamp: 1_700_000_000_000 + idx,
    };
  }

  const prefix = multiplier === 3 ? 'T' : multiplier === 2 ? 'D' : 'S';
  const bed: DartThrow['segment']['bed'] =
    multiplier === 3 ? 'Triple' : multiplier === 2 ? 'Double' : 'Single';
  return {
    id: `rng-${prefix}${number}-${idx}`,
    visitDartIndex: idx,
    segment: { name: `${prefix}${number}`, number, bed, multiplier },
    score: number * multiplier,
    timestamp: 1_700_000_000_000 + idx,
  };
}

function generateDeterministicDart(rng: () => number, visitDartIndex: number): DartThrow {
  const roll = rng();
  if (roll < 0.08) return makeDartFromSpec(0, 0, visitDartIndex, true); // bouncer
  if (roll < 0.18) return makeDartFromSpec(0, 0, visitDartIndex, false); // miss
  if (roll < 0.25) return makeDartFromSpec(25, 2, visitDartIndex); // inner bull
  if (roll < 0.32) return makeDartFromSpec(25, 1, visitDartIndex); // outer bull

  const segNum = Math.floor(rng() * 20) + 1;
  const multRoll = rng();
  const mult: 1 | 2 | 3 = multRoll < 0.5 ? 1 : multRoll < 0.8 ? 2 : 3;
  return makeDartFromSpec(segNum, mult, visitDartIndex);
}

function assertNoNaNOrInfinity(value: unknown, path = 'root', seen = new WeakSet<object>()): void {
  if (typeof value === 'number') {
    expect(Number.isFinite(value), `Non-finite number at ${path}: ${String(value)}`).toBe(true);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, idx) => assertNoNaNOrInfinity(item, `${path}[${idx}]`, seen));
    return;
  }
  if (value instanceof Set) {
    let idx = 0;
    for (const item of value) {
      assertNoNaNOrInfinity(item, `${path}.Set[${idx++}]`, seen);
    }
    return;
  }
  if (value instanceof Map) {
    for (const [k, v] of value.entries()) {
      assertNoNaNOrInfinity(k, `${path}.MapKey`, seen);
      assertNoNaNOrInfinity(v, `${path}.MapVal`, seen);
    }
    return;
  }

  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    assertNoNaNOrInfinity(v, `${path}.${k}`, seen);
  }
}

const GARBAGE_CONFIGS_COMMON: GameMatchConfig[] = [
  {},
  {
    startScore: 0,
    rounds: -5,
    dartCount: -10,
    maxLives: -3,
    startingLives: 0,
    startingBank: -100,
    trackLength: 0,
    boardSize: -64,
    redCount: -2,
    startingTarget: 0,
    endTarget: -10,
    outRule: 'invalid-out-rule',
    heatEscalation: 'invalid-heat',
    numberAssignment: 'invalid-assign',
    preset: 'invalid-preset',
    difficulty: 'invalid-diff',
    damageMode: 'invalid-dmg',
    course: 'invalid-course',
    scoringRule: 'invalid-scoring',
    fleetSize: 'invalid-fleet',
    variant: 'invalid-variant',
    cardMode: 'invalid-card',
    winPattern: 'invalid-pattern',
    ringMode: 'invalid-ring',
    circuit: 'invalid-circuit',
    focus: 'invalid-focus',
  },
  {
    startScore: Number.NaN,
    rounds: Number.NaN,
    dartCount: 0,
    maxLives: 0,
    startingLives: Number.NaN,
    trackLength: Number.NaN,
    boardSize: 0,
    redCount: 0,
    startingTarget: Number.NaN,
    endTarget: Number.NaN,
  },
];

// All 20 modular game & practice engines
const ENGINE_ADAPTERS: EngineAdapter[] = [
  {
    id: 'around-the-clock',
    playerCounts: [1],
    defaultConfig: { ringMode: 'any', includeBull: true, turboSkip: true },
    garbageConfigs: GARBAGE_CONFIGS_COMMON,
    createInitial: (p, c) => aroundTheClock.createInitialAroundTheClockState(p, c),
    applyDart: (s, d) =>
      aroundTheClock.applyDartToAroundTheClock(s as aroundTheClock.AroundTheClockState, d),
    advanceTurn: (s) =>
      aroundTheClock.advanceAroundTheClockVisit(s as aroundTheClock.AroundTheClockState),
    buildResult: (s, t) =>
      aroundTheClock.buildAroundTheClockResult(s as aroundTheClock.AroundTheClockState, t),
    isFinished: (s) => (s as aroundTheClock.AroundTheClockState).isFinished,
  },
  {
    id: 'battleship',
    playerCounts: [2, 4],
    defaultConfig: { fleetSize: 'standard', sonarOnMulti: true },
    garbageConfigs: GARBAGE_CONFIGS_COMMON,
    createInitial: (p, c) => battleship.createInitialState(p, c, 101),
    applyDart: (s, d) => battleship.applyDartToState(s as battleship.BattleshipGameState, d),
    advanceTurn: (s) => battleship.advanceTurn(s as battleship.BattleshipGameState),
    buildResult: (s, t) => battleship.buildGameResult(s as battleship.BattleshipGameState, t),
    isFinished: (s) => (s as battleship.BattleshipGameState).isFinished,
  },
  {
    id: 'board-is-lava',
    playerCounts: [2, 6],
    defaultConfig: { startingLives: 3, heatEscalation: 'normal', bullCoolsLava: true },
    garbageConfigs: GARBAGE_CONFIGS_COMMON,
    createInitial: (p, c) => boardIsLava.createInitialState(p, c, 202),
    applyDart: (s, d) => boardIsLava.applyDartToState(s as Parameters<typeof boardIsLava.applyDartToState>[0], d),
    advanceTurn: (s) => boardIsLava.advanceTurn(s as Parameters<typeof boardIsLava.advanceTurn>[0]),
    buildResult: (s, t) =>
      boardIsLava.buildGameResult(s as Parameters<typeof boardIsLava.buildGameResult>[0], t),
    isFinished: (s) => (s as { isFinished: boolean }).isFinished,
  },
  {
    id: 'bobs-27',
    playerCounts: [1],
    defaultConfig: { includeBull: true, allowNegative: false },
    garbageConfigs: GARBAGE_CONFIGS_COMMON,
    createInitial: (p, c) => bobs27.createInitialBobs27State(p, c),
    applyDart: (s, d) => bobs27.applyDartToBobs27(s as bobs27.Bobs27State, d),
    advanceTurn: (s) => bobs27.advanceBobs27Round(s as bobs27.Bobs27State),
    buildResult: (s, t) => bobs27.buildBobs27Result(s as bobs27.Bobs27State, t),
    isFinished: (s) => (s as bobs27.Bobs27State).isFinished,
  },
  {
    id: 'cals-quest',
    playerCounts: [1, 2, 6],
    defaultConfig: { difficulty: 'normal', damageMode: 'rpg' },
    garbageConfigs: GARBAGE_CONFIGS_COMMON,
    createInitial: (p, c) => calsQuest.createInitialCalsQuestState(p, c),
    applyDart: (s, d) =>
      calsQuest.applyDartToCalsQuest(s as Parameters<typeof calsQuest.applyDartToCalsQuest>[0], d),
    advanceTurn: (s) =>
      calsQuest.advanceCalsQuestTurn(s as Parameters<typeof calsQuest.advanceCalsQuestTurn>[0]).nextState,
    buildResult: (s, t) =>
      calsQuest.buildCalsQuestResult(s as Parameters<typeof calsQuest.buildCalsQuestResult>[0], t),
    isFinished: (s) => (s as { isFinished: boolean }).isFinished,
  },
  {
    id: 'catch-40',
    playerCounts: [1],
    defaultConfig: { range: 'full' },
    garbageConfigs: GARBAGE_CONFIGS_COMMON,
    createInitial: (p, c) => catch40.createInitialCatch40State(p, c),
    applyDart: (s, d) => catch40.applyDartToCatch40(s as catch40.Catch40State, d),
    advanceTurn: (s) => catch40.advanceCatch40Visit(s as catch40.Catch40State),
    buildResult: (s, t) => catch40.buildCatch40Result(s as catch40.Catch40State, t),
    isFinished: (s) => (s as catch40.Catch40State).isFinished,
  },
  {
    id: 'checkout-121',
    playerCounts: [1],
    defaultConfig: { startingTarget: 121, dartsAllowed: 9 },
    garbageConfigs: GARBAGE_CONFIGS_COMMON,
    createInitial: (p, c) => checkout121.createInitialCheckout121State(p, c),
    applyDart: (s, d) => checkout121.applyDartToCheckout121(s as checkout121.Checkout121State, d),
    advanceTurn: (s) => checkout121.advanceCheckout121Visit(s as checkout121.Checkout121State),
    buildResult: (s, t) => checkout121.buildCheckout121Result(s as checkout121.Checkout121State, t),
    isFinished: (s) => (s as checkout121.Checkout121State).isFinished,
  },
  {
    id: 'cricket',
    playerCounts: [2, 4],
    defaultConfig: { variant: 'standard', targets: 'classic' },
    garbageConfigs: GARBAGE_CONFIGS_COMMON,
    createInitial: (p, c) => cricket.createInitialState(p, c),
    applyDart: (s, d) => cricket.applyDartToState(s as cricket.CricketGameState, d),
    advanceTurn: (s) => cricket.advanceTurn(s as cricket.CricketGameState),
    buildResult: (s, t) => cricket.buildGameResult(s as cricket.CricketGameState, t),
    isFinished: (s) => (s as cricket.CricketGameState).isFinished,
  },
  {
    id: 'darts-golf',
    playerCounts: [1, 2, 6],
    defaultConfig: { course: '9hole', scoringRule: 'lastDart', gimmeBull: true },
    garbageConfigs: GARBAGE_CONFIGS_COMMON,
    createInitial: (p, c) => dartsGolf.createInitialDartsGolfState(p, c),
    applyDart: (s, d) =>
      dartsGolf.applyDartToDartsGolf(s as Parameters<typeof dartsGolf.applyDartToDartsGolf>[0], d),
    advanceTurn: (s) =>
      dartsGolf.advanceDartsGolfTurn(s as Parameters<typeof dartsGolf.advanceDartsGolfTurn>[0]),
    buildResult: (s, t) =>
      dartsGolf.buildDartsGolfResult(s as Parameters<typeof dartsGolf.buildDartsGolfResult>[0], t),
    isFinished: (s) => (s as { isFinished: boolean }).isFinished,
  },
  {
    id: 'demolition',
    playerCounts: [1, 2, 6],
    defaultConfig: { startScore: 501, outRule: 'double' },
    garbageConfigs: GARBAGE_CONFIGS_COMMON,
    createInitial: (p, c) => demolition.createInitialState(p, c),
    applyDart: (s, d) =>
      demolition.applyDartToState(s as Parameters<typeof demolition.applyDartToState>[0], d),
    advanceTurn: (s) =>
      demolition.advanceTurn(s as Parameters<typeof demolition.advanceTurn>[0]),
    buildResult: (s, t) =>
      demolition.buildGameResult(s as Parameters<typeof demolition.buildGameResult>[0], t),
    isFinished: (s) => (s as { isFinished: boolean }).isFinished,
  },
  {
    id: 'donkey-derby',
    playerCounts: [2, 6],
    defaultConfig: { trackLength: 12, helpRivals: true },
    garbageConfigs: GARBAGE_CONFIGS_COMMON,
    createInitial: (p, c) => donkeyDerby.createInitialState(p, c),
    applyDart: (s, d) =>
      donkeyDerby.applyDartToState(s as Parameters<typeof donkeyDerby.applyDartToState>[0], d),
    advanceTurn: (s) =>
      donkeyDerby.advanceTurn(s as Parameters<typeof donkeyDerby.advanceTurn>[0]),
    buildResult: (s, t) =>
      donkeyDerby.buildGameResult(s as Parameters<typeof donkeyDerby.buildGameResult>[0], t),
    isFinished: (s) => (s as { isFinished: boolean }).isFinished,
  },
  {
    id: 'halve-it',
    playerCounts: [2, 6],
    defaultConfig: { preset: 'classic', startingBank: 40 },
    garbageConfigs: GARBAGE_CONFIGS_COMMON,
    createInitial: (p, c) => halveIt.createInitialState(p, c),
    applyDart: (s, d) =>
      halveIt.applyDartToState(s as Parameters<typeof halveIt.applyDartToState>[0], d),
    advanceTurn: (s) => halveIt.advanceTurn(s as Parameters<typeof halveIt.advanceTurn>[0]),
    buildResult: (s, t) =>
      halveIt.buildGameResult(s as Parameters<typeof halveIt.buildGameResult>[0], t),
    isFinished: (s) => (s as { isFinished: boolean }).isFinished,
  },
  {
    id: 'jdc-challenge',
    playerCounts: [1],
    defaultConfig: {},
    garbageConfigs: GARBAGE_CONFIGS_COMMON,
    createInitial: (p, c) => jdcChallenge.createInitialJdcState(p, c),
    applyDart: (s, d) => jdcChallenge.applyDartToJdc(s as jdcChallenge.JdcState, d),
    advanceTurn: (s) => jdcChallenge.advanceJdcRound(s as jdcChallenge.JdcState),
    buildResult: (s, t) => jdcChallenge.buildJdcResult(s as jdcChallenge.JdcState, t),
    isFinished: (s) => (s as jdcChallenge.JdcState).isFinished,
  },
  {
    id: 'killer',
    playerCounts: [1, 2, 6],
    defaultConfig: { maxLives: 3, numberAssignment: 'auto', suicideRule: true },
    garbageConfigs: GARBAGE_CONFIGS_COMMON,
    createInitial: (p, c) => killer.createInitialState(p, c, 303),
    applyDart: (s, d) =>
      killer.applyDartToState(s as Parameters<typeof killer.applyDartToState>[0], d),
    advanceTurn: (s) => killer.advanceTurn(s as Parameters<typeof killer.advanceTurn>[0]),
    buildResult: (s, t) =>
      killer.buildGameResult(s as Parameters<typeof killer.buildGameResult>[0], t),
    isFinished: (s) => (s as { isFinished: boolean }).isFinished,
  },
  {
    id: 'precision-sniper',
    playerCounts: [1],
    defaultConfig: { circuit: 'trebles' },
    garbageConfigs: GARBAGE_CONFIGS_COMMON,
    createInitial: (p, c) => precisionSniper.createInitialPrecisionSniperState(p, c),
    applyDart: (s, d) =>
      precisionSniper.applyDartToPrecisionSniper(s as precisionSniper.PrecisionSniperState, d),
    advanceTurn: (s) =>
      precisionSniper.advancePrecisionSniperVisit(s as precisionSniper.PrecisionSniperState),
    buildResult: (s, t) =>
      precisionSniper.buildPrecisionSniperResult(s as precisionSniper.PrecisionSniperState, t),
    isFinished: (s) => (s as precisionSniper.PrecisionSniperState).isFinished,
  },
  {
    id: 'scoring-gauntlet',
    playerCounts: [1],
    defaultConfig: { dartCount: 30, focus: 'T20' },
    garbageConfigs: GARBAGE_CONFIGS_COMMON,
    createInitial: (p, c) => scoringGauntlet.createInitialGauntletState(p, c),
    applyDart: (s, d) => scoringGauntlet.applyDartToGauntlet(s as scoringGauntlet.GauntletState, d),
    advanceTurn: (s) => scoringGauntlet.advanceGauntletVisit(s as scoringGauntlet.GauntletState),
    buildResult: (s, t) => scoringGauntlet.buildGauntletResult(s as scoringGauntlet.GauntletState, t),
    isFinished: (s) => (s as scoringGauntlet.GauntletState).isFinished,
  },
  {
    id: 'shanghai',
    playerCounts: [2, 6],
    defaultConfig: { rounds: 7, instantWin: true },
    garbageConfigs: GARBAGE_CONFIGS_COMMON,
    createInitial: (p, c) => shanghai.createInitialState(p, c),
    applyDart: (s, d) =>
      shanghai.applyDartToState(s as Parameters<typeof shanghai.applyDartToState>[0], d),
    advanceTurn: (s) => shanghai.advanceTurn(s as Parameters<typeof shanghai.advanceTurn>[0]),
    buildResult: (s, t) =>
      shanghai.buildGameResult(s as Parameters<typeof shanghai.buildGameResult>[0], t),
    isFinished: (s) => (s as { isFinished: boolean }).isFinished,
  },
  {
    id: 'snakes-and-ladders',
    playerCounts: [2, 6],
    defaultConfig: { boardSize: 100, exactFinish: true },
    garbageConfigs: GARBAGE_CONFIGS_COMMON,
    createInitial: (p, c) => snakesAndLadders.createInitialState(p, c),
    applyDart: (s, d) =>
      snakesAndLadders.applyDartToState(
        s as Parameters<typeof snakesAndLadders.applyDartToState>[0],
        d
      ),
    advanceTurn: (s) =>
      snakesAndLadders.advanceTurn(s as Parameters<typeof snakesAndLadders.advanceTurn>[0]),
    buildResult: (s, t) =>
      snakesAndLadders.buildGameResult(
        s as Parameters<typeof snakesAndLadders.buildGameResult>[0],
        t
      ),
    isFinished: (s) => (s as { isFinished: boolean }).isFinished,
  },
  {
    id: 'sniper-bingo',
    playerCounts: [2, 6],
    defaultConfig: { cardMode: 'classic', winPattern: 'line' },
    garbageConfigs: GARBAGE_CONFIGS_COMMON,
    createInitial: (p, c) => sniperBingo.createInitialState(p, c, 404),
    applyDart: (s, d) => sniperBingo.applyDartToState(s as sniperBingo.SniperBingoGameState, d),
    advanceTurn: (s) => sniperBingo.advanceTurn(s as sniperBingo.SniperBingoGameState),
    buildResult: (s, t) => sniperBingo.buildGameResult(s as sniperBingo.SniperBingoGameState, t),
    isFinished: (s) => (s as sniperBingo.SniperBingoGameState).isFinished,
  },
  {
    id: 'snooker',
    playerCounts: [1, 2, 4],
    defaultConfig: { redCount: 10, foulPenalty: true },
    garbageConfigs: GARBAGE_CONFIGS_COMMON,
    createInitial: (p, c) => snooker.createInitialState(p, c),
    applyDart: (s, d) =>
      snooker.applyDartToState(s as Parameters<typeof snooker.applyDartToState>[0], d),
    advanceTurn: (s) => snooker.advanceTurn(s as Parameters<typeof snooker.advanceTurn>[0]),
    buildResult: (s, t) =>
      snooker.buildGameResult(s as Parameters<typeof snooker.buildGameResult>[0], t),
    isFinished: (s) => (s as { isFinished: boolean }).isFinished,
  },
];

describe('All 20 modular game & practice engines', () => {
  it('registers exactly 20 pure engines in the regression suite', () => {
    expect(ENGINE_ADAPTERS).toHaveLength(20);
  });

  for (const engine of ENGINE_ADAPTERS) {
    describe(engine.id, () => {
      it('passes deterministic fuzz gameplay with strict immutability and 0 NaN/Infinity', () => {
        const startedAt = Date.now() - 10_000;

        for (const playerCount of engine.playerCounts) {
          const rng = createRng(1000 + playerCount * 97 + engine.id.length * 31);
          let state = engine.createInitial(makePlayers(playerCount), engine.defaultConfig);
          assertNoNaNOrInfinity(state, `${engine.id}(${playerCount}P).initial`);

          for (let visit = 0; visit < 45 && !engine.isFinished(state); visit++) {
            // Mix full 3-dart visits with occasional early pullouts (1 or 2 darts)
            const dartsInVisit = visit % 7 === 0 ? 1 : visit % 5 === 0 ? 2 : 3;

            for (let d = 0; d < dartsInVisit && !engine.isFinished(state); d++) {
              const dart = generateDeterministicDart(rng, d);
              const beforeSnapshot = JSON.stringify(state);

              const { nextState, feedback } = engine.applyDart(state, dart);

              // Strict immutability check so Undo snapshots can never be corrupted
              expect(
                JSON.stringify(state),
                `${engine.id} mutated previous state during applyDart`
              ).toBe(beforeSnapshot);

              assertNoNaNOrInfinity(feedback, `${engine.id}.feedback`);
              assertNoNaNOrInfinity(nextState, `${engine.id}.state[v${visit}d${d}]`);
              state = nextState;
            }

            if (!engine.isFinished(state)) {
              const beforeAdvance = JSON.stringify(state);
              const advanced = engine.advanceTurn(state);
              expect(
                JSON.stringify(state),
                `${engine.id} mutated previous state during advanceTurn`
              ).toBe(beforeAdvance);
              assertNoNaNOrInfinity(advanced, `${engine.id}.advance[v${visit}]`);
              state = advanced;
            }
          }

          const result = engine.buildResult(state, startedAt);
          expect(result.gameId).toBe(engine.id);
          expect(Array.isArray(result.standings)).toBe(true);
          assertNoNaNOrInfinity(result, `${engine.id}(${playerCount}P).result`);
        }
      });

      it('handles garbage configs safely with 0 exceptions and 0 NaN/Infinity', () => {
        const startedAt = Date.now() - 5_000;
        const players = makePlayers(engine.playerCounts[0]);
        const rng = createRng(7777 + engine.id.length);

        for (let cfgIdx = 0; cfgIdx < engine.garbageConfigs.length; cfgIdx++) {
          const cfg = engine.garbageConfigs[cfgIdx];
          let state = engine.createInitial(players, cfg);
          assertNoNaNOrInfinity(state, `${engine.id}.garbage[${cfgIdx}].initial`);

          for (let d = 0; d < 3 && !engine.isFinished(state); d++) {
            const { nextState } = engine.applyDart(state, generateDeterministicDart(rng, d));
            state = nextState;
          }
          state = engine.advanceTurn(state);
          assertNoNaNOrInfinity(state, `${engine.id}.garbage[${cfgIdx}].afterTurn`);

          const result = engine.buildResult(state, startedAt);
          assertNoNaNOrInfinity(result, `${engine.id}.garbage[${cfgIdx}].result`);
        }
      });

      it('handles empty 0-player roster ([]) across createInitial, applyDart, advanceTurn, and buildResult', () => {
        const startedAt = Date.now() - 1_000;
        let state = engine.createInitial([], engine.defaultConfig);
        assertNoNaNOrInfinity(state, `${engine.id}.emptyRoster.initial`);

        const { nextState, feedback } = engine.applyDart(state, makeDartFromSpec(20, 3, 0));
        assertNoNaNOrInfinity(feedback, `${engine.id}.emptyRoster.feedback`);
        assertNoNaNOrInfinity(nextState, `${engine.id}.emptyRoster.afterDart`);

        state = engine.advanceTurn(nextState);
        assertNoNaNOrInfinity(state, `${engine.id}.emptyRoster.afterAdvance`);

        const result = engine.buildResult(state, startedAt);
        assertNoNaNOrInfinity(result, `${engine.id}.emptyRoster.result`);
      });
    });
  }
});

describe('Targeted game engine regressions', () => {
  it('Killer solo self-KO (suicideRule: true) finishes cleanly', () => {
    const soloPlayer = makePlayers(1);
    let state = killer.createInitialState(
      soloPlayer,
      { maxLives: 3, numberAssignment: 'auto', suicideRule: true },
      42
    );

    const homeNum = state.players[0].assignedNumber;
    expect(homeNum).not.toBeNull();

    // Dart 1: Treble on own number -> reaches 3/3 lives & unlocks Killer status
    const step1 = killer.applyDartToState(state, makeDartFromSpec(homeNum!, 3, 0));
    state = step1.nextState;
    expect(state.players[0].isKiller).toBe(true);
    expect(state.players[0].lives).toBe(3);
    expect(state.isFinished).toBe(false);

    // Dart 2: Treble on own number while Killer with suicideRule -> loses 3 lives -> Self-KO!
    const step2 = killer.applyDartToState(state, makeDartFromSpec(homeNum!, 3, 1));
    state = step2.nextState;
    expect(state.players[0].isEliminated).toBe(true);
    expect(state.players[0].lives).toBe(0);
    expect(state.isFinished).toBe(true);
    expect(state.winnerId).toBeNull();

    const result = killer.buildGameResult(state, Date.now() - 2_000);
    expect(result.gameId).toBe('killer');
    expect(result.standings).toHaveLength(1);
    assertNoNaNOrInfinity(result, 'killer.soloSelfKO.result');
  });

  it('Scoring Gauntlet early-takeout after 2 darts commits partial visit stats to recentVisits and highestVisit', () => {
    let state = scoringGauntlet.createInitialGauntletState(makePlayers(1), {
      dartCount: 30,
      focus: 'T20',
    });

    // Visit 1: 2 darts only (T20 + S20 = 80), then early takeout
    state = scoringGauntlet.applyDartToGauntlet(state, makeDartFromSpec(20, 3, 0)).nextState;
    state = scoringGauntlet.applyDartToGauntlet(state, makeDartFromSpec(20, 1, 1)).nextState;
    expect(state.turnComplete).toBe(false);
    expect(state.visitDarts).toHaveLength(2);
    expect(state.visitScore).toBe(80);

    state = scoringGauntlet.advanceGauntletVisit(state);
    expect(state.recentVisits).toEqual([80]);
    expect(state.highestVisit).toBe(80);
    expect(state.ton60Plus).toBe(1);
    expect(state.visitDarts).toEqual([]);
    expect(state.visitScore).toBe(0);

    // Visit 2: 2 darts only (T20 + T20 = 120), then early takeout
    state = scoringGauntlet.applyDartToGauntlet(state, makeDartFromSpec(20, 3, 0)).nextState;
    state = scoringGauntlet.applyDartToGauntlet(state, makeDartFromSpec(20, 3, 1)).nextState;
    state = scoringGauntlet.advanceGauntletVisit(state);
    expect(state.recentVisits).toEqual([120, 80]);
    expect(state.highestVisit).toBe(120);
    expect(state.ton100Plus).toBe(1);
    expect(state.totalDartsThrown).toBe(4);
    expect(state.totalPoints).toBe(200);
  });
});
