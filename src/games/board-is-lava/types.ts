import { DartThrow } from '../../types/darts';
import { GameAccent } from '../../types/games';

export type HeatEscalation = 'easy' | 'normal' | 'hard';

export interface LavaConfig {
  startingLives: number;
  heatEscalation: HeatEscalation;
  bullCoolsLava: boolean;
}

export type LavaPillTone = 'emerald' | 'amber' | 'rose' | 'sky' | 'purple' | 'slate';

export type LavaDartOutcome =
  | 'safe'
  | 'safe_bonus'
  | 'lava_hit'
  | 'eliminated'
  | 'bull_cool'
  | 'miss';

export interface LavaVisitEntry {
  dart: DartThrow;
  label: string;
  tone: LavaPillTone;
  points: number;
  outcome: LavaDartOutcome;
}

export interface LavaPlayerState {
  id: string;
  name: string;
  colorHex: string;
  avatarInitial: string;
  lives: number;
  maxLives: number;
  score: number;
  isEliminated: boolean;
  eliminatedOnRound: number | null;
  safeHits: number;
  lavaHits: number;
  bullCools: number;
  bestVisit: number;
  dartsThrown: number;
}

export type LavaFinishReason = 'last_survivor' | 'max_rounds' | 'all_burned';

export interface LavaGameState {
  config: LavaConfig;
  seed: number;
  round: number;
  maxRounds: number;
  activePlayerIndex: number;
  players: LavaPlayerState[];
  /** Currently burning dartboard segment numbers (1..20) */
  lavaSegments: number[];
  /** Segments cooled by Bullseye/25 during the current round */
  extinguishedSegments: number[];
  peakLavaCount: number;
  visitEntries: LavaVisitEntry[];
  visitScore: number;
  turnEndedEarly: boolean;
  totalDartsThrown: number;
  isFinished: boolean;
  winnerId: string | null;
  finishReason: LavaFinishReason | null;
}

export interface LavaDartFeedback {
  ignored: boolean;
  sound: 'hit' | 'bonus' | 'jackpot' | 'hazard' | 'elimination' | 'none';
  callout: {
    title: string;
    subtitle?: string;
    accent: GameAccent;
  } | null;
}

export interface LavaHistorySnapshot {
  state: LavaGameState;
  turnStartState: LavaGameState;
}
