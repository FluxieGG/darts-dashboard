import { DartThrow, DartVisit } from './darts';

export interface TonBreakdown {
  ton60Plus: number;
  ton100Plus: number;
  ton140Plus: number;
  ton180: number;
  totalVisits: number;
}

export interface SegmentAccuracyItem {
  segment: string;
  hits: number;
  attempts: number;
  pct: number;
  color?: string;
}

export interface TrendDataPoint {
  id: string;
  label: string;
  date: string;
  threeDartAvg: number;
  firstNineAvg: number;
  visitCount?: number;
}

export interface MatchRecord {
  id: string;
  opponent: string;
  gameMode: string;      // e.g. "501 D.O.", "Practice Session"
  result: 'W' | 'L';
  finalScore: string;    // e.g. "3 - 1"
  threeDartAvg: number;
  bestLegDarts: number;
  highestCheckout: number;
  date: string;
}

export interface PlayerStats {
  playerId: string;
  name: string;
  nickname?: string;
  avatarUrl?: string;
  threeDartAvg: number;
  allTimeAvg: number;
  firstNineAvg: number;
  checkoutPct: number;
  checkoutHits: number;
  checkoutAttempts: number;
  highestCheckout: number;
  highestVisit: number;
  tonBreakdown: TonBreakdown;
  segmentAccuracy: SegmentAccuracyItem[];
  trendHistory: TrendDataPoint[];
  recentMatches: MatchRecord[];
  recentVisits?: DartVisit[];
  sessionThrows: DartThrow[];
  totalDartsThrown: number;
}

export interface PlayerProfile {
  id: string;
  name: string;
  nickname?: string;
  isPrimary?: boolean;
  email?: string;
  /** Player's chosen darts colour (hex), drives their subtle custom gradient theme across the app */
  dartColor?: string;
  /** Friendly label for the chosen darts colour (e.g. "Crimson", "Electric Blue") */
  dartColorName?: string;
  /** If false, player profile & stats are session-only (not persisted to localStorage) */
  isSaved?: boolean;
}
