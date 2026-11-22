import { DartCoords, DartThrow, DartVisit } from '../types/darts';
import { coordsToSegment, DARTBOARD_RADIUS, getSegmentCenterAngle } from '../lib/geometry';
import { generateId } from '../lib/utils';
import { PlayerStats, SegmentAccuracyItem } from '../types/stats';

/**
 * Default tracked target precision segments (all starting at 0 hits / 0 attempts)
 */
export function createEmptySegmentAccuracy(): SegmentAccuracyItem[] {
  return [
    { segment: 'T20', hits: 0, attempts: 0, pct: 0, color: '#10B981' },
    { segment: 'T19', hits: 0, attempts: 0, pct: 0, color: '#38BDF8' },
    { segment: 'T18', hits: 0, attempts: 0, pct: 0, color: '#A855F7' },
    { segment: 'D20', hits: 0, attempts: 0, pct: 0, color: '#F59E0B' },
    { segment: 'D16', hits: 0, attempts: 0, pct: 0, color: '#10B981' },
    { segment: 'D8', hits: 0, attempts: 0, pct: 0, color: '#F43F5E' },
    { segment: 'Bull', hits: 0, attempts: 0, pct: 0, color: '#EC4899' },
  ];
}

/**
 * Create clean, zeroed player stats (no mock/fake data)
 */
export function createEmptyPlayerStats(playerId: string, playerName = 'Callum'): PlayerStats {
  return {
    playerId,
    name: playerName,
    threeDartAvg: 0,
    allTimeAvg: 0,
    firstNineAvg: 0,
    checkoutPct: 0,
    checkoutHits: 0,
    checkoutAttempts: 0,
    highestCheckout: 0,
    highestVisit: 0,
    tonBreakdown: {
      ton60Plus: 0,
      ton100Plus: 0,
      ton140Plus: 0,
      ton180: 0,
      totalVisits: 0,
    },
    segmentAccuracy: createEmptySegmentAccuracy(),
    trendHistory: [],
    recentMatches: [],
    sessionThrows: [],
    totalDartsThrown: 0,
  };
}

/**
 * Returns polar coords (r, thetaDeg) of the target center (used only in Demo Simulator mode)
 */
function getTargetPolar(target: string): { r: number; angleDeg: number } {
  if (target === 'Bull') return { r: 0, angleDeg: 90 };
  if (target === '25') {
    return { r: (DARTBOARD_RADIUS.INNER_BULL + DARTBOARD_RADIUS.OUTER_BULL) / 2, angleDeg: 90 };
  }

  const match = target.match(/^([STD])(\d+)$/);
  if (!match) return { r: 0.6, angleDeg: 90 };

  const bed = match[1];
  const num = parseInt(match[2], 10);
  const angleDeg = getSegmentCenterAngle(num);

  let r = 0.4;
  if (bed === 'T') {
    r = (DARTBOARD_RADIUS.INNER_TREBLE + DARTBOARD_RADIUS.OUTER_TREBLE) / 2;
  } else if (bed === 'D') {
    r = (DARTBOARD_RADIUS.INNER_DOUBLE + DARTBOARD_RADIUS.OUTER_DOUBLE) / 2;
  } else if (bed === 'S') {
    r = 0.35;
  }
  return { r, angleDeg };
}

function randomGaussian(mean = 0, stdev = 1): number {
  let u1 = Math.random();
  let u2 = Math.random();
  while (u1 === 0) u1 = Math.random();
  return mean + stdev * Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

/**
 * Generate a simulated dart throw (used ONLY when Demo Simulator mode is selected)
 */
export function generateSimulatedThrow(
  target = 'T20',
  dartIndex = 0,
  scatterStdev = 0.045
): DartThrow {
  const { r: targetR, angleDeg } = getTargetPolar(target);

  const angleRad = (angleDeg * Math.PI) / 180;
  const targetX = targetR * Math.cos(angleRad);
  const targetY = targetR * Math.sin(angleRad);

  const x = targetX + randomGaussian(0, scatterStdev);
  const y = targetY + randomGaussian(0, scatterStdev);
  const coords: DartCoords = { x, y };

  const segment = coordsToSegment(x, y);
  const score = segment.number === 50 ? 50 : segment.number * segment.multiplier;

  return {
    id: generateId('sim-dart'),
    visitDartIndex: dartIndex,
    segment,
    score,
    coords,
    timestamp: Date.now(),
  };
}

/**
 * Generate a simulated 3-dart visit (used ONLY in Demo Simulator mode)
 */
export function generateSimulatedVisit(playerId: string, visitNumber: number): DartVisit {
  const roll = Math.random();
  let targets: [string, string, string] = ['T20', 'T20', 'T20'];

  if (roll < 0.45) {
    targets = ['T20', 'T20', 'T20'];
  } else if (roll < 0.7) {
    targets = ['T20', 'T20', 'T19'];
  } else if (roll < 0.85) {
    targets = ['T19', 'T19', 'T19'];
  } else if (roll < 0.95) {
    targets = ['T20', 'D20', 'D10'];
  } else {
    targets = ['Bull', 'Bull', 'Bull'];
  }

  const throws: DartThrow[] = targets.map((t, i) => generateSimulatedThrow(t, i, 0.048));
  const totalScore = throws.reduce((acc, t) => acc + t.score, 0);

  return {
    id: generateId('sim-visit'),
    visitNumber,
    playerId,
    throws,
    totalScore,
    isCompleted: true,
    isBust: false,
    timestamp: Date.now(),
  };
}
