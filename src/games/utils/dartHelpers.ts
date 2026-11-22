import { DartCoords, DartThrow } from '../../types/darts';
import { coordsToSegment } from '../../lib/geometry';
import { gameEventBus } from '../../services/gameEventBus';

export function isMiss(dart: DartThrow): boolean {
  return Boolean(dart.bouncer || dart.score === 0 || dart.segment.bed === 'Outside');
}

export function isInnerBull(dart: DartThrow): boolean {
  if (isMiss(dart)) return false;
  const upper = dart.segment.name.toUpperCase();
  return dart.score === 50 || dart.segment.bed === 'InnerBull' || upper === 'BULL' || upper === 'DBULL';
}

export function isOuterBull(dart: DartThrow): boolean {
  if (isMiss(dart)) return false;
  return (
    dart.score === 25 ||
    (dart.segment.number === 25 && dart.segment.multiplier === 1) ||
    dart.segment.name === '25'
  );
}

export function isAnyBull(dart: DartThrow): boolean {
  return isInnerBull(dart) || isOuterBull(dart);
}

/**
 * True ONLY for a valid X01 Double-Out finishing dart:
 * Outer Double ring (D1–D20) or Inner Bullseye (50).
 * Explicitly rejects Singles, Trebles, Outer Bull (25), and Misses.
 */
export function isDouble(dart: DartThrow): boolean {
  if (isMiss(dart) || isOuterBull(dart)) return false;
  if (isInnerBull(dart)) return true;
  return dart.segment.bed === 'Double' || dart.segment.multiplier === 2;
}

export function isTreble(dart: DartThrow): boolean {
  if (isMiss(dart)) return false;
  return dart.segment.multiplier === 3;
}

/**
 * Returns the clean segment number (1..20, 25 for Outer Bull, 50 for Inner Bull, 0 for Miss)
 */
export function getDartNumber(dart: DartThrow): number {
  if (isMiss(dart)) return 0;
  if (isInnerBull(dart)) return 50;
  if (isOuterBull(dart)) return 25;
  return dart.segment.number;
}

/**
 * Converts a click on SvgDartboard into a real DartThrow and injects it into gameEventBus
 * (used when local board is offline so users/testers can click the board directly).
 */
export function injectBoardClickThrow(coords: DartCoords): void {
  const segment = coordsToSegment(coords.x, coords.y);
  const score = segment.number === 50 ? 50 : segment.number * segment.multiplier;
  const dart: DartThrow = {
    id: `click-dart-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    visitDartIndex: 0,
    segment,
    score,
    coords,
    timestamp: Date.now(),
  };
  gameEventBus.injectManualDart(dart);
}

/**
 * Standard PDC Double-Out Checkout Chart (2 to 170).
 * Bogey numbers (169, 168, 166, 165, 163, 162, 159) return null.
 */
const DOUBLE_OUT_CHECKOUTS: Record<number, string[]> = {
  170: ['T20', 'T20', 'Bull'],
  167: ['T20', 'T19', 'Bull'],
  164: ['T20', 'T18', 'Bull'],
  161: ['T20', 'T17', 'Bull'],
  160: ['T20', 'T20', 'D20'],
  158: ['T20', 'T20', 'D19'],
  157: ['T20', 'T19', 'D20'],
  156: ['T20', 'T20', 'D18'],
  155: ['T20', 'T19', 'D19'],
  154: ['T20', 'T18', 'D20'],
  153: ['T20', 'T19', 'D18'],
  152: ['T20', 'T20', 'D16'],
  151: ['T20', 'T17', 'D20'],
  150: ['T20', 'T18', 'D18'],
  149: ['T20', 'T19', 'D16'],
  148: ['T20', 'T16', 'D20'],
  147: ['T20', 'T17', 'D18'],
  146: ['T20', 'T18', 'D16'],
  145: ['T20', 'T15', 'D20'],
  144: ['T20', 'T20', 'D12'],
  143: ['T20', 'T17', 'D16'],
  142: ['T20', 'T14', 'D20'],
  141: ['T20', 'T19', 'D12'],
  140: ['T20', 'T20', 'D10'],
  139: ['T19', 'T14', 'D20'],
  138: ['T20', 'T18', 'D12'],
  137: ['T19', 'T16', 'D16'],
  136: ['T20', 'T20', 'D8'],
  135: ['Bull', 'T15', 'D20'],
  134: ['T20', 'T14', 'D16'],
  133: ['T20', 'T19', 'D8'],
  132: ['Bull', 'Bull', 'D16'],
  131: ['T20', 'T13', 'D16'],
  130: ['T20', 'T20', 'D5'],
  129: ['T19', 'T16', 'D12'],
  128: ['T18', 'T14', 'D16'],
  127: ['T20', 'T17', 'D8'],
  126: ['T19', 'T19', 'D6'],
  125: ['25', 'T20', 'D20'],
  124: ['T20', 'T16', 'D8'],
  123: ['T19', 'T16', 'D9'],
  122: ['T18', 'T20', 'D4'],
  121: ['T20', 'T11', 'D14'],
  120: ['T20', 'S20', 'D20'],
  119: ['T19', 'T12', 'D13'],
  118: ['T20', 'S18', 'D20'],
  117: ['T20', 'S17', 'D20'],
  116: ['T20', 'S16', 'D20'],
  115: ['T20', 'S15', 'D20'],
  114: ['T20', 'S14', 'D20'],
  113: ['T20', 'S13', 'D20'],
  112: ['T20', 'S12', 'D20'],
  111: ['T20', 'S19', 'D16'],
  110: ['T20', 'S18', 'D16'],
  109: ['T20', 'S9', 'D20'],
  108: ['T20', 'S16', 'D16'],
  107: ['T19', 'S18', 'D16'],
  106: ['T20', 'S14', 'D16'],
  105: ['T20', 'S13', 'D16'],
  104: ['T18', 'S18', 'D16'],
  103: ['T20', 'S3', 'D20'],
  102: ['T20', 'S10', 'D16'],
  101: ['T20', 'S9', 'D16'],
  100: ['T20', 'D20'],
  99: ['T19', 'S10', 'D16'],
  98: ['T20', 'D19'],
  97: ['T19', 'D20'],
  96: ['T20', 'D18'],
  95: ['T19', 'D19'],
  94: ['T18', 'D20'],
  93: ['T19', 'D18'],
  92: ['T20', 'D16'],
  91: ['T17', 'D20'],
  90: ['T18', 'D18'],
  89: ['T19', 'D16'],
  88: ['T16', 'D20'],
  87: ['T17', 'D18'],
  86: ['T18', 'D16'],
  85: ['T15', 'D20'],
  84: ['T20', 'D12'],
  83: ['T17', 'D16'],
  82: ['Bull', 'D16'],
  81: ['T19', 'D12'],
  80: ['T20', 'D10'],
  79: ['T13', 'D20'],
  78: ['T18', 'D12'],
  77: ['T19', 'D10'],
  76: ['T20', 'D8'],
  75: ['T17', 'D12'],
  74: ['T14', 'D16'],
  73: ['T19', 'D8'],
  72: ['T16', 'D12'],
  71: ['T13', 'D16'],
  70: ['T18', 'D8'],
  69: ['T19', 'D6'],
  68: ['T20', 'D4'],
  67: ['T17', 'D8'],
  66: ['T10', 'D18'],
  65: ['25', 'D20'],
  64: ['T16', 'D8'],
  63: ['T13', 'D12'],
  62: ['T10', 'D16'],
  61: ['25', 'D18'],
  60: ['S20', 'D20'],
  59: ['S19', 'D20'],
  58: ['S18', 'D20'],
  57: ['S17', 'D20'],
  56: ['S16', 'D20'],
  55: ['S15', 'D20'],
  54: ['S14', 'D20'],
  53: ['S13', 'D20'],
  52: ['S20', 'D16'],
  51: ['S19', 'D16'],
  50: ['Bull'],
  49: ['S17', 'D16'],
  48: ['S16', 'D16'],
  47: ['S15', 'D16'],
  46: ['S14', 'D16'],
  45: ['S13', 'D16'],
  44: ['S12', 'D16'],
  43: ['S11', 'D16'],
  42: ['S10', 'D16'],
  41: ['S9', 'D16'],
};

/**
 * Returns optimal checkout dart sequence for remaining score (supports both Double-Out and Straight-Out).
 */
export function getCheckoutRoute(
  remaining: number,
  outRule: 'double' | 'straight' = 'double',
  dartsLeft = 3
): string[] | null {
  if (remaining <= 0) return null;

  if (outRule === 'straight') {
    if (remaining <= 20) return [`S${remaining}`];
    if (remaining === 25) return ['25'];
    if (remaining === 50) return ['Bull'];
    if (remaining <= 40 && remaining % 2 === 0) return [`D${remaining / 2}`];
    if (remaining <= 60 && remaining % 3 === 0) return [`T${remaining / 3}`];
    if (dartsLeft >= 2 && remaining <= 120) {
      if (remaining > 60) {
        const rem = remaining - 60;
        const second = getCheckoutRoute(rem, 'straight', dartsLeft - 1);
        if (second) return ['T20', ...second];
      } else {
        const rem = remaining - 20;
        const second = getCheckoutRoute(rem, 'straight', dartsLeft - 1);
        if (second) return ['S20', ...second];
      }
    }
    if (dartsLeft === 3 && remaining <= 180) {
      const rem = remaining - 60;
      const rest = getCheckoutRoute(rem, 'straight', 2);
      if (rest) return ['T20', ...rest];
    }
    return null;
  }

  // Double-Out rules (must finish on D1–D20 or Inner Bull 50)
  if (remaining < 2 || remaining > 170) return null;

  // Special 2-dart Bull finishes when player has exactly 2 darts in hand (101, 104, 107, 110)
  if (dartsLeft === 2) {
    const twoDartBullFinishes: Record<number, string[]> = {
      110: ['T20', 'Bull'],
      107: ['T19', 'Bull'],
      104: ['T18', 'Bull'],
      101: ['T17', 'Bull'],
    };
    if (twoDartBullFinishes[remaining]) {
      return twoDartBullFinishes[remaining];
    }
  }

  let route: string[] | null = null;
  if (remaining <= 40) {
    if (remaining % 2 === 0) {
      route = [`D${remaining / 2}`];
    } else if (remaining === 39) {
      route = ['S7', 'D16'];
    } else if (remaining === 37) {
      route = ['S5', 'D16'];
    } else if (remaining === 35) {
      route = ['S3', 'D16'];
    } else if (remaining === 33) {
      route = ['S1', 'D16'];
    } else {
      route = ['S1', `D${(remaining - 1) / 2}`];
    }
  } else {
    route = DOUBLE_OUT_CHECKOUTS[remaining] || null;
  }

  if (!route || route.length > dartsLeft) return null;
  return route;
}
