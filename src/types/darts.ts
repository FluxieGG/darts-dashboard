export interface DartCoords {
  x: number; // -1.0 to 1.0 (radius 1.0 = outer double wire, +x right)
  y: number; // -1.0 to 1.0 (+y up)
}

export type DartBedType =
  | 'Single'
  | 'SingleInner'
  | 'SingleOuter'
  | 'Double'
  | 'Triple'
  | 'Bull'
  | 'InnerBull'
  | 'Outside';

export interface DartSegment {
  name: string;        // e.g. "T20", "D16", "S20", "Bull", "25", "Miss"
  number: number;      // 0-20 or 25, 50
  bed: DartBedType;
  multiplier: number;  // 0, 1, 2, 3
}

export interface DartThrow {
  id: string;
  visitDartIndex: number; // 0, 1, or 2 (Dart 1, 2, 3)
  segment: DartSegment;
  score: number;          // Exact score reported by Autodarts
  coords?: DartCoords;
  bouncer?: boolean;
  failed?: boolean;
  method?: string;
  timestamp: number;
  bust?: boolean;
}

export interface DartVisit {
  id: string;
  visitNumber: number;
  playerId: string;
  throws: DartThrow[];
  totalScore: number;
  isCompleted: boolean;
  isBust: boolean;
  timestamp: number;
}

/**
 * Raw Autodarts Board Manager / Desktop API Throw payload.
 * Supports BOTH:
 * 1) Modern Autodarts Desktop flat format (`segmentName`, `segmentNumber`, `multiplier`, `bed`, `coordsX`, `coordsY`)
 * 2) Legacy nested format (`segment: { name, number, bed, multiplier }`, `coords: { x, y }`)
 */
export interface BoardManagerRawThrow {
  // Modern Autodarts Desktop flat fields
  segmentName?: string;
  segmentNumber?: number;
  multiplier?: number;
  bed?: string;
  coordsX?: number;
  coordsY?: number;
  bouncer?: boolean;
  failed?: boolean;
  method?: string;
  // Legacy nested fields
  segment?: {
    name?: string;
    number?: number;
    bed?: string;
    multiplier?: number;
  };
  coords?: {
    x?: number;
    y?: number;
  };
}

export interface BoardManagerStatePayload {
  connected: boolean;
  running: boolean;
  status?: string;
  event?: string;
  numThrows?: number;
  throws: BoardManagerRawThrow[];
}
