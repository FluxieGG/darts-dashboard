import { DartThrow } from '../../types/darts';
import { GameAccent, GameMatchConfig, GamePlayer, GameResult, GameStanding } from '../../types/games';
import { SEGMENT_ORDER } from '../../lib/geometry';
import { getDartNumber, isAnyBull, isInnerBull, isMiss } from '../utils/dartHelpers';

export type BattleshipFleetSize = 'standard' | 'blitz';

export interface BattleshipConfig {
  fleetSize: BattleshipFleetSize;
  sonarOnMulti: boolean;
}

export interface BattleshipShip {
  id: string;
  name: string;
  size: number;
  wedges: number[];
  hits: number[];
  sunk: boolean;
}

export interface BattleshipPlayerState extends GamePlayer {
  fleet: BattleshipShip[];
  hitWedges: number[];
  missWedges: number[];
  sonarWedges: number[];
  shotsFired: number;
  hitsLanded: number;
  shipsSunk: number;
  sonarPingsTriggered: number;
}

export interface BattleshipVisitEntry {
  dart: DartThrow;
  label: string;
  tone: 'emerald' | 'amber' | 'rose' | 'sky' | 'purple' | 'slate';
}

export interface BattleshipFeedback {
  sound: 'hit' | 'bonus' | 'jackpot' | 'hazard' | 'elimination' | 'none';
  callout: {
    title: string;
    subtitle?: string;
    accent: GameAccent;
  } | null;
}

export interface BattleshipGameState {
  config: BattleshipConfig;
  players: BattleshipPlayerState[];
  activePlayerIndex: number;
  round: number;
  visitEntries: BattleshipVisitEntry[];
  turnComplete: boolean;
  totalDartsThrown: number;
  isFinished: boolean;
  winnerId: string | null;
  lastRadarMessage: string | null;
}

export interface BattleshipHistorySnapshot {
  state: BattleshipGameState;
  turnStartState: BattleshipGameState;
}

const BOARD_RING: number[] = [...SEGMENT_ORDER];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getFleetBlueprint(fleetSize: BattleshipFleetSize): Array<{ id: string; name: string; size: number }> {
  if (fleetSize === 'blitz') {
    return [
      { id: 'cruiser', name: 'Cruiser', size: 2 },
      { id: 'sub', name: 'Submarine', size: 2 },
    ];
  }
  return [
    { id: 'carrier', name: 'Carrier', size: 3 },
    { id: 'cruiser', name: 'Cruiser', size: 2 },
    { id: 'sub', name: 'Submarine', size: 2 },
  ];
}

function generateFleet(fleetSize: BattleshipFleetSize, rng: () => number): BattleshipShip[] {
  const blueprint = getFleetBlueprint(fleetSize);
  const occupiedIndices = new Set<number>();
  const bufferedIndices = new Set<number>();
  const ships: BattleshipShip[] = [];

  for (const spec of blueprint) {
    let placedIndices: number[] | null = null;

    // First try placing with a 1-wedge buffer between ships for cleaner tactical spread
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const start = Math.floor(rng() * BOARD_RING.length);
      const candidate: number[] = [];
      let blocked = false;
      for (let offset = 0; offset < spec.size; offset += 1) {
        const ringIdx = (start + offset) % BOARD_RING.length;
        if (bufferedIndices.has(ringIdx)) {
          blocked = true;
          break;
        }
        candidate.push(ringIdx);
      }
      if (!blocked) {
        placedIndices = candidate;
        break;
      }
    }

    // Fallback: any non-overlapping contiguous placement
    if (!placedIndices) {
      for (let start = 0; start < BOARD_RING.length; start += 1) {
        const candidate: number[] = [];
        let blocked = false;
        for (let offset = 0; offset < spec.size; offset += 1) {
          const ringIdx = (start + offset) % BOARD_RING.length;
          if (occupiedIndices.has(ringIdx)) {
            blocked = true;
            break;
          }
          candidate.push(ringIdx);
        }
        if (!blocked) {
          placedIndices = candidate;
          break;
        }
      }
    }

    const finalIndices = placedIndices ?? [0];
    for (const idx of finalIndices) {
      occupiedIndices.add(idx);
      bufferedIndices.add(idx);
      bufferedIndices.add((idx + 1) % BOARD_RING.length);
      bufferedIndices.add((idx - 1 + BOARD_RING.length) % BOARD_RING.length);
    }

    ships.push({
      id: spec.id,
      name: spec.name,
      size: spec.size,
      wedges: finalIndices.map((idx) => BOARD_RING[idx]),
      hits: [],
      sunk: false,
    });
  }

  return ships;
}

export function getTargetDefenderIndex(playerCount: number, attackerIndex: number): number {
  if (playerCount <= 1) return 0;
  return (attackerIndex + 1) % playerCount;
}

function circularWedgeDistance(wedgeA: number, wedgeB: number): number {
  const idxA = BOARD_RING.indexOf(wedgeA);
  const idxB = BOARD_RING.indexOf(wedgeB);
  if (idxA === -1 || idxB === -1) return 10;
  const diff = Math.abs(idxA - idxB);
  return Math.min(diff, BOARD_RING.length - diff);
}

/**
 * Finds the closest unhit, un-pinged enemy ship wedge to the struck wedge (or any unhit un-pinged wedge).
 */
function findSonarTargetWedge(
  defender: BattleshipPlayerState,
  referenceWedge: number | null
): number | null {
  const candidates: number[] = [];
  for (const ship of defender.fleet) {
    for (const w of ship.wedges) {
      if (!defender.hitWedges.includes(w) && !defender.sonarWedges.includes(w)) {
        candidates.push(w);
      }
    }
  }
  if (candidates.length === 0) return null;
  if (referenceWedge === null) return candidates[0];

  candidates.sort((a, b) => circularWedgeDistance(referenceWedge, a) - circularWedgeDistance(referenceWedge, b));
  return candidates[0];
}

export function parseBattleshipConfig(raw: GameMatchConfig): BattleshipConfig {
  const fleetSize: BattleshipFleetSize = raw.fleetSize === 'blitz' ? 'blitz' : 'standard';
  const sonarOnMulti = raw.sonarOnMulti === undefined ? true : Boolean(raw.sonarOnMulti);
  return { fleetSize, sonarOnMulti };
}

export function createInitialState(
  players: GamePlayer[],
  rawConfig: GameMatchConfig,
  seed: number = Date.now()
): BattleshipGameState {
  const config = parseBattleshipConfig(rawConfig);
  const rng = mulberry32(seed);

  const playerStates: BattleshipPlayerState[] = players.map((p) => ({
    ...p,
    fleet: generateFleet(config.fleetSize, rng),
    hitWedges: [],
    missWedges: [],
    sonarWedges: [],
    shotsFired: 0,
    hitsLanded: 0,
    shipsSunk: 0,
    sonarPingsTriggered: 0,
  }));

  return {
    config,
    players: playerStates,
    activePlayerIndex: 0,
    round: 1,
    visitEntries: [],
    turnComplete: false,
    totalDartsThrown: 0,
    isFinished: false,
    winnerId: null,
    lastRadarMessage: null,
  };
}

export function applyDartToState(
  state: BattleshipGameState,
  dart: DartThrow
): { nextState: BattleshipGameState; feedback: BattleshipFeedback } {
  if (
    state.isFinished ||
    state.turnComplete ||
    state.visitEntries.length >= 3 ||
    state.players.length === 0 ||
    !state.players[state.activePlayerIndex]
  ) {
    return { nextState: state, feedback: { sound: 'none', callout: null } };
  }

  const attackerIdx = state.activePlayerIndex;
  const defenderIdx = getTargetDefenderIndex(state.players.length, attackerIdx);

  const players = state.players.map((p) => ({
    ...p,
    fleet: p.fleet.map((s) => ({ ...s, wedges: [...s.wedges], hits: [...s.hits] })),
    hitWedges: [...p.hitWedges],
    missWedges: [...p.missWedges],
    sonarWedges: [...p.sonarWedges],
  }));

  const attacker = players[attackerIdx];
  const defender = players[defenderIdx];
  if (!attacker || !defender) {
    return { nextState: state, feedback: { sound: 'none', callout: null } };
  }
  attacker.shotsFired += 1;

  const nextTotalDarts = state.totalDartsThrown + 1;
  const hitNumber = getDartNumber(dart);
  const isMultiBed = !isMiss(dart) && !isAnyBull(dart) && (dart.segment.multiplier === 2 || dart.segment.multiplier === 3);

  let entry: BattleshipVisitEntry;
  let feedback: BattleshipFeedback;
  let isFinished = false;
  let winnerId: string | null = null;
  let lastRadarMessage = state.lastRadarMessage;

  if (isMiss(dart)) {
    entry = { dart, label: 'MISS', tone: 'slate' };
    feedback = {
      sound: 'hazard',
      callout: {
        title: '🌊 SHOT OVERBOARD!',
        subtitle: `${attacker.name} missed the sea grid`,
        accent: 'sky',
      },
    };
  } else if (isAnyBull(dart)) {
    const pingsWanted = isInnerBull(dart) ? 2 : 1;
    const revealed: number[] = [];
    for (let i = 0; i < pingsWanted; i += 1) {
      const targetWedge = findSonarTargetWedge(defender, null);
      if (targetWedge !== null) {
        defender.sonarWedges.push(targetWedge);
        revealed.push(targetWedge);
      }
    }

    if (revealed.length > 0) {
      attacker.sonarPingsTriggered += revealed.length;
      const signalList = revealed.map((n) => `#${n}`).join(' & ');
      lastRadarMessage = `📡 Radar locked onto ${defender.name}'s fleet at ${signalList}!`;
      entry = { dart, label: `RADAR ${signalList}`, tone: 'amber' };
      feedback = {
        sound: isInnerBull(dart) ? 'jackpot' : 'bonus',
        callout: {
          title: isInnerBull(dart) ? `📡 DEEP RADAR LOCK: ${signalList}!` : `📡 SONAR SWEEP: ${signalList}!`,
          subtitle: `Enemy hull detected on ${defender.name}'s grid`,
          accent: 'amber',
        },
      };
    } else {
      entry = { dart, label: 'RADAR CLEAR', tone: 'sky' };
      feedback = {
        sound: 'hit',
        callout: {
          title: '📡 ALL TARGETS TRACKED',
          subtitle: 'All remaining enemy ship wedges are already revealed!',
          accent: 'sky',
        },
      };
    }
  } else {
    const matchedShip = defender.fleet.find((s) => s.wedges.includes(hitNumber));

    if (matchedShip) {
      const alreadyHit = defender.hitWedges.includes(hitNumber);

      if (alreadyHit) {
        let pingedWedge: number | null = null;
        if (state.config.sonarOnMulti && isMultiBed) {
          pingedWedge = findSonarTargetWedge(defender, hitNumber);
          if (pingedWedge !== null) {
            defender.sonarWedges.push(pingedWedge);
            attacker.sonarPingsTriggered += 1;
            lastRadarMessage = `📡 Sonar ping revealed enemy hull at #${pingedWedge}!`;
          }
        }

        if (pingedWedge !== null) {
          entry = { dart, label: `SONAR #${pingedWedge}`, tone: 'amber' };
          feedback = {
            sound: 'bonus',
            callout: {
              title: `📡 SONAR PING ON #${pingedWedge}!`,
              subtitle: `#${hitNumber} was already scorched — Multi-bed scanned nearby water!`,
              accent: 'amber',
            },
          };
        } else {
          entry = { dart, label: 'RE-HIT', tone: 'slate' };
          feedback = {
            sound: 'hit',
            callout: {
              title: `⚓ WEDGE #${hitNumber} ALREADY HIT`,
              subtitle: `Aim for fresh wedges on ${defender.name}'s grid`,
              accent: 'sky',
            },
          };
        }
      } else {
        // Fresh confirmed hit!
        defender.hitWedges.push(hitNumber);
        defender.sonarWedges = defender.sonarWedges.filter((w) => w !== hitNumber);
        matchedShip.hits.push(hitNumber);
        attacker.hitsLanded += 1;

        const justSunk = matchedShip.wedges.every((w) => defender.hitWedges.includes(w));
        if (justSunk) {
          matchedShip.sunk = true;
          attacker.shipsSunk += 1;
        }

        const allFleetSunk = defender.fleet.every((s) => s.sunk);

        if (allFleetSunk) {
          isFinished = true;
          winnerId = attacker.id;
          entry = { dart, label: 'FLEET SUNK ☠️', tone: 'rose' };
          feedback = {
            sound: 'jackpot',
            callout: {
              title: `☠️ FLEET DESTROYED! ${attacker.name.toUpperCase()} WINS!`,
              subtitle: `Final blow on #${hitNumber} sank ${defender.name}'s ${matchedShip.name}!`,
              accent: 'emerald',
            },
          };
        } else {
          // Optional Sonar Ping on Double/Treble hit
          let pingedWedge: number | null = null;
          if (state.config.sonarOnMulti && isMultiBed) {
            pingedWedge = findSonarTargetWedge(defender, hitNumber);
            if (pingedWedge !== null) {
              defender.sonarWedges.push(pingedWedge);
              attacker.sonarPingsTriggered += 1;
              lastRadarMessage = `📡 Sonar ping revealed enemy hull at #${pingedWedge}!`;
            }
          }

          if (justSunk) {
            entry = {
              dart,
              label: pingedWedge !== null ? `SUNK + 📡#${pingedWedge}` : `${matchedShip.name.toUpperCase()} ☠️`,
              tone: 'rose',
            };
            feedback = {
              sound: 'elimination',
              callout: {
                title: `☠️ ${matchedShip.name.toUpperCase()} SUNK!`,
                subtitle:
                  pingedWedge !== null
                    ? `${defender.name}'s ${matchedShip.name} goes down + 📡 Sonar revealed #${pingedWedge}!`
                    : `${defender.name}'s ${matchedShip.name} is at the bottom of the sea!`,
                accent: 'rose',
              },
            };
          } else {
            entry = {
              dart,
              label: pingedWedge !== null ? `HIT + 📡#${pingedWedge}` : 'DIRECT HIT 💥',
              tone: 'rose',
            };
            feedback = {
              sound: pingedWedge !== null ? 'jackpot' : 'bonus',
              callout: {
                title:
                  pingedWedge !== null
                    ? `💥 DIRECT HIT + 📡 SONAR #${pingedWedge}!`
                    : `💥 DIRECT HIT ON #${hitNumber}!`,
                subtitle:
                  pingedWedge !== null
                    ? `Hull breached & multi-bed sonar locked onto #${pingedWedge}!`
                    : `${defender.name}'s ${matchedShip.name} takes heavy fire!`,
                accent: pingedWedge !== null ? 'amber' : 'rose',
              },
            };
          }
        }
      }
    } else {
      // Water / Splash
      if (!defender.missWedges.includes(hitNumber)) {
        defender.missWedges.push(hitNumber);
      }

      let pingedWedge: number | null = null;
      if (state.config.sonarOnMulti && isMultiBed) {
        pingedWedge = findSonarTargetWedge(defender, hitNumber);
        if (pingedWedge !== null) {
          defender.sonarWedges.push(pingedWedge);
          attacker.sonarPingsTriggered += 1;
          lastRadarMessage = `📡 Sonar ping detected enemy ship at #${pingedWedge}!`;
        }
      }

      if (pingedWedge !== null) {
        entry = { dart, label: `SONAR #${pingedWedge}`, tone: 'amber' };
        feedback = {
          sound: 'bonus',
          callout: {
            title: `📡 SONAR PING! SIGNAL ON #${pingedWedge}`,
            subtitle: `Splash on #${hitNumber}, but ${dart.segment.name} pinged an enemy hull!`,
            accent: 'amber',
          },
        };
      } else {
        entry = { dart, label: 'SPLASH 💦', tone: 'sky' };
        feedback = {
          sound: 'hazard',
          callout: {
            title: `💦 SPLASH ON #${hitNumber}`,
            subtitle: 'Open water — no enemy hull detected',
            accent: 'sky',
          },
        };
      }
    }
  }

  const nextEntries = [...state.visitEntries, entry];
  const turnComplete = isFinished || nextEntries.length >= 3;

  return {
    nextState: {
      ...state,
      players,
      visitEntries: nextEntries,
      turnComplete,
      totalDartsThrown: nextTotalDarts,
      isFinished,
      winnerId,
      lastRadarMessage,
    },
    feedback,
  };
}

export function advanceTurn(state: BattleshipGameState): BattleshipGameState {
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
    turnComplete: false,
  };
}

export function getTotalFleetHull(fleet: BattleshipShip[]): number {
  return fleet.reduce((sum, s) => sum + s.size, 0);
}

export function getRemainingFleetHull(fleet: BattleshipShip[]): number {
  return fleet.reduce((sum, s) => sum + Math.max(0, s.size - s.hits.length), 0);
}

export function buildGameResult(state: BattleshipGameState, startedAt: number): GameResult {
  const winner = state.players.find((p) => p.id === state.winnerId) ?? state.players[0];

  const sorted = [...state.players].sort((a, b) => {
    if (a.id === state.winnerId) return -1;
    if (b.id === state.winnerId) return 1;
    if (b.shipsSunk !== a.shipsSunk) return b.shipsSunk - a.shipsSunk;
    if (b.hitsLanded !== a.hitsLanded) return b.hitsLanded - a.hitsLanded;
    return getRemainingFleetHull(b.fleet) - getRemainingFleetHull(a.fleet);
  });

  const standings: GameStanding[] = sorted.map((p, idx) => {
    const accuracy = p.shotsFired > 0 ? Math.round((p.hitsLanded / p.shotsFired) * 100) : 0;
    return {
      playerId: p.id,
      playerName: p.name,
      colorHex: p.colorHex,
      rank: idx + 1,
      primaryStatLabel: 'Ships Sunk',
      primaryStatValue: `${p.shipsSunk} / ${p.fleet.length}`,
      secondaryStat: `${p.hitsLanded} Hits (${accuracy}%) • ${p.sonarPingsTriggered} Sonar`,
    };
  });

  const totalPings = state.players.reduce((sum, p) => sum + p.sonarPingsTriggered, 0);

  return {
    gameId: 'battleship',
    winnerId: winner?.id ?? null,
    winnerName: winner?.name ?? 'Commander',
    headline: `${winner?.name ?? 'Commander'} sinks the enemy fleet!`,
    standings,
    totalDartsThrown: state.totalDartsThrown,
    durationMs: Math.max(1000, Date.now() - startedAt),
    highlights: [
      `Fleet Mode: ${state.config.fleetSize === 'blitz' ? 'Blitz (4 Hull)' : 'Standard (7 Hull)'}`,
      `Rounds Played: ${state.round}`,
      `Sonar Pings Locked: ${totalPings}`,
    ],
    completedAt: Date.now(),
  };
}
