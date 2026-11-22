import { DartThrow } from '../../types/darts';
import { GameAccent } from '../../types/games';

export interface ShanghaiPlayerState {
  id: string;
  name: string;
  colorHex: string;
  avatarInitial: string;
  score: number;
  targetHits: number;
  singlesHit: number;
  doublesHit: number;
  treblesHit: number;
  bestVisit: number;
  shanghaisHit: number;
  dartsThrown: number;
}

export interface ShanghaiVisitCombo {
  hitSingle: boolean;
  hitDouble: boolean;
  hitTreble: boolean;
}

export type PillTone = 'emerald' | 'amber' | 'rose' | 'sky' | 'purple' | 'slate';

export interface ShanghaiState {
  players: ShanghaiPlayerState[];
  activePlayerIndex: number;
  currentRound: number; // 1..totalRounds (equals active target segment number)
  totalRounds: number;  // 7 | 10 | 20
  instantWin: boolean;
  visitDarts: DartThrow[];
  visitLabels: string[];
  visitTones: PillTone[];
  visitPoints: number;
  visitCombo: ShanghaiVisitCombo;
  shanghaiAwardedThisVisit: boolean;
  turnComplete: boolean;
  totalDartsThrown: number;
  isFinished: boolean;
  winnerId: string | null;
  winReason: 'shanghai' | 'points' | null;
}

export interface ShanghaiFeedback {
  sound: 'hit' | 'bonus' | 'jackpot' | 'hazard' | 'none';
  callout: {
    title: string;
    subtitle?: string;
    accent: GameAccent;
  } | null;
}

export interface ShanghaiHistoryEntry {
  state: ShanghaiState;
  turnStartState: ShanghaiState;
}
