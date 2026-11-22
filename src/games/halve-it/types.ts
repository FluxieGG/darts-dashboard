import { DartThrow } from '../../types/darts';
import { GameAccent } from '../../types/games';

export type HalveItPreset = 'classic' | 'extended';

export type HalveItChallengeKind =
  | 'number'
  | 'any_double'
  | 'any_treble'
  | 'specific_double'
  | 'bull';

export interface HalveItChallenge {
  id: string;
  shortLabel: string;
  label: string;
  description: string;
  kind: HalveItChallengeKind;
  targetNumber?: number;
}

export interface HalveItPlayerState {
  id: string;
  name: string;
  colorHex: string;
  avatarInitial: string;
  score: number;
  challengeHits: number;
  timesHalved: number;
  pointsLostToHalve: number;
  bestVisit: number;
  dartsThrown: number;
}

export type PillTone = 'emerald' | 'amber' | 'rose' | 'sky' | 'purple' | 'slate';

export interface HalveItState {
  preset: HalveItPreset;
  startingBank: number;
  challenges: HalveItChallenge[];
  currentRoundIndex: number; // 0..challenges.length - 1
  players: HalveItPlayerState[];
  activePlayerIndex: number;
  visitDarts: DartThrow[];
  visitLabels: string[];
  visitTones: PillTone[];
  visitPoints: number;
  visitHadHit: boolean;
  visitWasHalved: boolean;
  preHalveScore: number | null;
  turnComplete: boolean;
  totalDartsThrown: number;
  isFinished: boolean;
  winnerId: string | null;
}

export interface HalveItFeedback {
  sound: 'hit' | 'bonus' | 'jackpot' | 'hazard' | 'none';
  callout: {
    title: string;
    subtitle?: string;
    accent: GameAccent;
  } | null;
}

export interface HalveItHistoryEntry {
  state: HalveItState;
  turnStartState: HalveItState;
}
