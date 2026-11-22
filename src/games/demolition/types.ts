import { DartThrow } from '../../types/darts';
import { GameAccent } from '../../types/games';

export type DemolitionOutRule = 'straight' | 'double';

export interface DemolitionPlayerState {
  id: string;
  name: string;
  colorHex: string;
  avatarInitial: string;
  score: number;
  turnStartScore: number;
  dartsThrown: number;
  highestVisit: number;
  tonPlusCount: number;
  bustCount: number;
  lastVisitScore: number | null;
  lastVisitWasBust: boolean;
}

export interface DemolitionState {
  players: DemolitionPlayerState[];
  currentPlayerIndex: number;
  round: number;
  startScore: number;
  outRule: DemolitionOutRule;
  currentVisitDarts: DartThrow[];
  currentVisitLabels: Array<string | undefined>;
  currentVisitTones: Array<'emerald' | 'amber' | 'rose' | 'sky' | 'purple' | 'slate' | undefined>;
  visitRunningScore: number;
  isBust: boolean;
  turnComplete: boolean;
  totalDartsThrown: number;
  isFinished: boolean;
  winnerId: string | null;
  winningDartName: string | null;
  lastEventSummary: string;
}

export type DemolitionSoundCue =
  | 'none'
  | 'dartHit'
  | 'bonusHit'
  | 'jackpot'
  | 'hazard'
  | 'turnChange';

export interface DemolitionDartFeedback {
  calloutTitle?: string;
  calloutSubtitle?: string;
  calloutAccent?: GameAccent;
  sound: DemolitionSoundCue;
  ignored?: boolean;
}
