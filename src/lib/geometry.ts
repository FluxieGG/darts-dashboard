import { DartCoords, DartSegment } from '../types/darts';

/**
 * Standard Bristle Dartboard Dimensions (BDO/WDF/PDC specification):
 * - Double wire outer radius: 170 mm (Normalized to 1.0)
 * - Double wire inner radius: 162 mm (162 / 170 = 0.9529)
 * - Treble wire outer radius: 107 mm (107 / 170 = 0.6294)
 * - Treble wire inner radius: 99 mm (99 / 170 = 0.5824)
 * - Outer Bull (25) radius: 15.9 mm (31.8mm diameter / 340mm = 0.0935)
 * - Inner Bull (50) radius: 6.35 mm (12.7mm diameter / 340mm = 0.0374)
 */
export const DARTBOARD_RADIUS = {
  INNER_BULL: 12.7 / 340,   // ~0.03735
  OUTER_BULL: 31.8 / 340,   // ~0.09353
  INNER_TREBLE: 99 / 170,   // ~0.58235
  OUTER_TREBLE: 107 / 170,  // ~0.62941
  INNER_DOUBLE: 162 / 170,  // ~0.95294
  OUTER_DOUBLE: 1.0,        // 170 / 170 = 1.0
  OUTSIDE_RING: 1.25,       // Catch ring / number wire
};

/**
 * Clockwise order of standard dartboard segments starting from top 20
 */
export const SEGMENT_ORDER = [
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5
] as const;

export const SEGMENT_ANGLE_DEG = 360 / 20; // 18 degrees

/**
 * Returns the angular slice center in standard polar degrees (0 = +x right, 90 = +y top)
 * 20 is at top (+y, 90 degrees). Clockwise from 20 is 1 (72 deg), 18 (54 deg), etc.
 */
export function getSegmentCenterAngle(segmentNumber: number): number {
  const index = SEGMENT_ORDER.indexOf(segmentNumber as (typeof SEGMENT_ORDER)[number]);
  if (index === -1) return 90;
  // Index 0 (20) -> 90 degrees. Clockwise decreases polar angle.
  let angle = 90 - index * SEGMENT_ANGLE_DEG;
  while (angle < 0) angle += 360;
  return angle % 360;
}

/**
 * Convert Bull-centered Autodarts coordinate (radius 1.0 = outer double wire, +y up, +x right)
 * to SVG viewBox coordinates with center (viewBoxCenter, viewBoxCenter) and scaling.
 */
export function coordsToSvg(
  coords: DartCoords,
  center = 200,
  boardScaleRadius = 160 // SVG units for radius = 1.0
): { svgX: number; svgY: number } {
  const svgX = center + coords.x * boardScaleRadius;
  // Autodarts has +y up, SVG has +y down
  const svgY = center - coords.y * boardScaleRadius;
  return { svgX, svgY };
}

/**
 * Convert SVG coordinate back to normalized Autodarts (x, y)
 */
export function svgToCoords(
  svgX: number,
  svgY: number,
  center = 200,
  boardScaleRadius = 160
): DartCoords {
  const x = (svgX - center) / boardScaleRadius;
  const y = (center - svgY) / boardScaleRadius;
  return { x, y };
}

/**
 * Identify the segment from normalized (x, y) coordinate
 */
export function coordsToSegment(x: number, y: number): DartSegment {
  const radius = Math.sqrt(x * x + y * y);

  if (radius <= DARTBOARD_RADIUS.INNER_BULL) {
    return { name: 'Bull', number: 50, bed: 'InnerBull', multiplier: 2 };
  }
  if (radius <= DARTBOARD_RADIUS.OUTER_BULL) {
    return { name: '25', number: 25, bed: 'Bull', multiplier: 1 };
  }
  if (radius > DARTBOARD_RADIUS.OUTER_DOUBLE) {
    return { name: 'Miss', number: 0, bed: 'Outside', multiplier: 0 };
  }

  // Calculate polar angle in degrees (0 to 360), where 90 is top (+y)
  let angleDeg = (Math.atan2(y, x) * 180) / Math.PI;
  if (angleDeg < 0) angleDeg += 360;

  // Segment 20 is centered at 90 deg, spanning 81 to 99 deg.
  // Shift angle by -81 to align segment 20 with 0-18 deg in reverse-clockwise order
  // Angle relative to top: (90 - angleDeg + 9) mod 360
  let relDeg = (90 - angleDeg + 9) % 360;
  if (relDeg < 0) relDeg += 360;
  const segmentIdx = Math.floor(relDeg / SEGMENT_ANGLE_DEG) % 20;
  const number = SEGMENT_ORDER[segmentIdx];

  if (radius >= DARTBOARD_RADIUS.INNER_DOUBLE && radius <= DARTBOARD_RADIUS.OUTER_DOUBLE) {
    return { name: `D${number}`, number, bed: 'Double', multiplier: 2 };
  }
  if (radius >= DARTBOARD_RADIUS.INNER_TREBLE && radius <= DARTBOARD_RADIUS.OUTER_TREBLE) {
    return { name: `T${number}`, number, bed: 'Triple', multiplier: 3 };
  }

  return { name: `S${number}`, number, bed: 'Single', multiplier: 1 };
}

/**
 * Calculate SVG Arc Path for an annular sector (pie slice band)
 */
export function describeArcSector(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngleDeg: number,
  endAngleDeg: number
): string {
  // SVG coordinates: y is down, so convert angle where 90 deg is top
  const toSvgX = (angle: number, r: number) => cx + r * Math.cos((angle * Math.PI) / 180);
  const toSvgY = (angle: number, r: number) => cy - r * Math.sin((angle * Math.PI) / 180);

  const p1x = toSvgX(startAngleDeg, outerR);
  const p1y = toSvgY(startAngleDeg, outerR);
  const p2x = toSvgX(endAngleDeg, outerR);
  const p2y = toSvgY(endAngleDeg, outerR);
  const p3x = toSvgX(endAngleDeg, innerR);
  const p3y = toSvgY(endAngleDeg, innerR);
  const p4x = toSvgX(startAngleDeg, innerR);
  const p4y = toSvgY(startAngleDeg, innerR);

  // Large arc flag is 0 because slices are 18 degrees (< 180)
  return [
    `M ${p1x.toFixed(2)} ${p1y.toFixed(2)}`,
    `A ${outerR.toFixed(2)} ${outerR.toFixed(2)} 0 0 0 ${p2x.toFixed(2)} ${p2y.toFixed(2)}`,
    `L ${p3x.toFixed(2)} ${p3y.toFixed(2)}`,
    `A ${innerR.toFixed(2)} ${innerR.toFixed(2)} 0 0 1 ${p4x.toFixed(2)} ${p4y.toFixed(2)}`,
    'Z',
  ].join(' ');
}
