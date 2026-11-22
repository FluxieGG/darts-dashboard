import { DartThrow } from '../../types/darts';
import { GameAccent } from '../../types/games';

export type SnookerTargetPhase = 'red' | 'colour' | 'clearance';

export type SnookerColourId = 'yellow' | 'green' | 'brown' | 'blue' | 'pink' | 'black';

export interface SnookerColourSpec {
  id: SnookerColourId;
  name: string;
  shortName: string;
  points: number;
  segment: number;
  acceptsBull: boolean;
  hex: string;
  strokeHex: string;
  badgeTextColor: string;
  pillTone: 'emerald' | 'amber' | 'rose' | 'sky' | 'purple' | 'slate';
}

export interface SnookerPlayerState {
  id: string;
  name: string;
  colorHex: string;
  avatarInitial: string;
  score: number;
  redsPotted: number;
  coloursPotted: number;
  highestBreak: number;
  foulsCommitted: number;
  foulPointsEarned: number;
  dartsThrown: number;
}

export interface SnookerState {
  players: SnookerPlayerState[];
  currentPlayerIndex: number;
  round: number;
  totalReds: number;
  redsRemaining: number;
  foulPenalty: boolean;
  targetPhase: SnookerTargetPhase;
  /** 0 = Yellow, 1 = Green, 2 = Brown, 3 = Blue, 4 = Pink, 5 = Black, 6 = All Cleared */
  clearanceIndex: number;
  currentBreak: number;
  highestBreakOverall: number;
  highestBreakPlayerName: string | null;
  /** Darts thrown in the current active visit */
  currentVisitDarts: DartThrow[];
  currentVisitLabels: Array<string | undefined>;
  currentVisitTones: Array<'emerald' | 'amber' | 'rose' | 'sky' | 'purple' | 'slate' | undefined>;
  potsThisVisit: number;
  missedThisVisit: boolean;
  turnComplete: boolean;
  totalDartsThrown: number;
  isFinished: boolean;
  winnerId: string | null;
  lastEventSummary: string;
}

export type SnookerSoundCue =
  | 'none'
  | 'dartHit'
  | 'bonusHit'
  | 'jackpot'
  | 'hazard'
  | 'turnChange';

export interface SnookerDartFeedback {
  calloutTitle?: string;
  calloutSubtitle?: string;
  calloutAccent?: GameAccent;
  sound: SnookerSoundCue;
  ignored?: boolean;
}
