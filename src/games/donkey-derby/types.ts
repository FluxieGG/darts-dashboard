import { DartThrow } from '../../types/darts';
import { GameAccent, GamePlayer } from '../../types/games';

export type TrackLengthOption = 8 | 12 | 20;

export type VisitPillTone = 'emerald' | 'amber' | 'rose' | 'sky' | 'purple' | 'slate';

export interface DerbyRacerState {
  player: GamePlayer;
  laneNumber: number; // 1..N (for P1, P2, etc.)
  targetSegment: number; // Assigned unique dartboard wedge (1..20)
  position: number; // 0..trackLength furlongs
  selfHits: number;
  bullBoosts: number;
  rivalsHelped: number; // How many times this player boosted a rival
  giftsReceived: number; // How many times rivals boosted this player
  dartsThrown: number;
}

export interface DerbyVisitEntry {
  dart: DartThrow;
  steps: number;
  movedPlayerId: string | null;
  label: string;
  tone: VisitPillTone;
}

export interface DerbyLastBoost {
  moverId: string;
  throwerId: string;
  steps: number;
  wasRivalGift: boolean;
  wasBull: boolean;
  timestamp: number;
}

export interface DonkeyDerbyState {
  trackLength: TrackLengthOption;
  helpRivals: boolean;
  racers: DerbyRacerState[];
  activePlayerIndex: number;
  round: number;
  totalDartsThrown: number;
  currentVisit: DerbyVisitEntry[];
  turnComplete: boolean;
  isFinished: boolean;
  winnerId: string | null;
  winningThrowerId: string | null;
  lastBoost: DerbyLastBoost | null;
}

export type DerbySoundCue = 'hit' | 'bonus' | 'jackpot' | 'hazard';

export interface DerbyDartFeedback {
  sound: DerbySoundCue;
  calloutTitle: string | null;
  calloutSubtitle?: string;
  calloutAccent: GameAccent;
}

export interface DerbyHistorySnapshot {
  state: DonkeyDerbyState;
  turnStartState: DonkeyDerbyState;
}
