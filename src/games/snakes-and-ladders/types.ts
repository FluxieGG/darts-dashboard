import { DartThrow } from '../../types/darts';
import { GameAccent, GamePlayer } from '../../types/games';

export type BoardSizeOption = 64 | 100;

export interface BoardLink {
  id: string;
  type: 'ladder' | 'snake';
  from: number;
  to: number;
}

export interface SnakesPlayerState {
  player: GamePlayer;
  position: number; // 0 = start pad, 1..boardSize
  totalSteps: number;
  laddersClimbed: number;
  snakesBitten: number;
  bounces: number;
  dartsThrown: number;
  bestDartSteps: number;
}

export type VisitPillTone = 'emerald' | 'amber' | 'rose' | 'sky' | 'purple' | 'slate';

export interface SnakesVisitEntry {
  dart: DartThrow;
  steps: number;
  label: string;
  tone: VisitPillTone;
}

export interface LastMoveHighlight {
  playerId: string;
  fromSquare: number;
  landedSquare: number;
  finalSquare: number;
  linkId: string | null;
  linkType: 'ladder' | 'snake' | null;
  bounced: boolean;
}

export interface SnakesAndLaddersState {
  boardSize: BoardSizeOption;
  gridSize: 8 | 10;
  exactFinish: boolean;
  links: BoardLink[];
  players: SnakesPlayerState[];
  activePlayerIndex: number;
  round: number;
  totalDartsThrown: number;
  currentVisit: SnakesVisitEntry[];
  turnComplete: boolean;
  isFinished: boolean;
  winnerId: string | null;
  lastMove: LastMoveHighlight | null;
}

export type SnakesSoundCue = 'hit' | 'bonus' | 'jackpot' | 'hazard';

export interface SnakesDartFeedback {
  sound: SnakesSoundCue;
  calloutTitle: string | null;
  calloutSubtitle?: string;
  calloutAccent: GameAccent;
}

export interface SnakesHistorySnapshot {
  state: SnakesAndLaddersState;
  turnStartState: SnakesAndLaddersState;
}
