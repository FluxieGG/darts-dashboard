import { DartThrow } from '../../types/darts';
import { GameAccent } from '../../types/games';

export type KillerAssignmentMode = 'auto' | 'throw';
export type KillerPhase = 'claiming' | 'playing';
export type KillerPillTone = 'emerald' | 'amber' | 'rose' | 'sky' | 'purple' | 'slate';

export interface KillerConfig {
  maxLives: number;
  numberAssignment: KillerAssignmentMode;
  suicideRule: boolean;
}

export interface KillerVisitEntry {
  dart: DartThrow;
  label: string;
  tone: KillerPillTone;
}

export interface KillerPlayerState {
  id: string;
  name: string;
  colorHex: string;
  avatarInitial: string;
  /** Compact 2-3 character uppercase tag rendered inside their dartboard wedge */
  shortTag: string;
  assignedNumber: number | null;
  lives: number;
  isKiller: boolean;
  isEliminated: boolean;
  kills: number;
  damageDealt: number;
  timesBecameKiller: number;
  eliminatedOnRound: number | null;
  eliminatedBy: string | null;
  dartsThrown: number;
}

export interface KillerGameState {
  config: KillerConfig;
  seed: number;
  phase: KillerPhase;
  round: number;
  activePlayerIndex: number;
  players: KillerPlayerState[];
  visitEntries: KillerVisitEntry[];
  turnEndedEarly: boolean;
  totalDartsThrown: number;
  isFinished: boolean;
  winnerId: string | null;
}

export interface KillerDartFeedback {
  ignored: boolean;
  sound: 'hit' | 'bonus' | 'jackpot' | 'hazard' | 'elimination' | 'none';
  callout: {
    title: string;
    subtitle?: string;
    accent: GameAccent;
  } | null;
}

export interface KillerHistorySnapshot {
  state: KillerGameState;
  turnStartState: KillerGameState;
}
