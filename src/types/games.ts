import React from 'react';
import { DartThrow } from './darts';

/**
 * Top-level navigation views in the Autodarts shell
 */
export type AppView = 'dashboard' | 'games-lobby' | 'game-active';

/**
 * Lifecycle phases managed by the GameHost socket
 */
export type GameMatchPhase = 'setup' | 'playing' | 'paused' | 'finished';

/**
 * Lifecycle status of a registered game cartridge
 */
export type GameStatus = 'coming_soon' | 'beta' | 'playable';

/**
 * High-level genre categories for lobby filtering
 */
export type GameCategory = 'Party' | 'Elimination' | 'Precision' | 'Classic' | 'Arcade';

/**
 * Accent palette aligned with the dashboard design tokens
 */
export type GameAccent = 'emerald' | 'amber' | 'rose' | 'sky' | 'purple';

/**
 * Distinct player colors used across multiplayer games (up to 8 players)
 */
export const GAME_PLAYER_COLORS = [
  { name: 'Emerald', hex: '#10B981', bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-400/50' },
  { name: 'Sky', hex: '#38BDF8', bg: 'bg-sky-500/20', text: 'text-sky-300', border: 'border-sky-400/50' },
  { name: 'Amber', hex: '#F59E0B', bg: 'bg-amber-500/20', text: 'text-amber-300', border: 'border-amber-400/50' },
  { name: 'Rose', hex: '#F43F5E', bg: 'bg-rose-500/20', text: 'text-rose-300', border: 'border-rose-400/50' },
  { name: 'Purple', hex: '#A855F7', bg: 'bg-purple-500/20', text: 'text-purple-300', border: 'border-purple-400/50' },
  { name: 'Cyan', hex: '#06B6D4', bg: 'bg-cyan-500/20', text: 'text-cyan-300', border: 'border-cyan-400/50' },
  { name: 'Orange', hex: '#F97316', bg: 'bg-orange-500/20', text: 'text-orange-300', border: 'border-orange-400/50' },
  { name: 'Pink', hex: '#EC4899', bg: 'bg-pink-500/20', text: 'text-pink-300', border: 'border-pink-400/50' },
] as const;

export interface GamePlayer {
  id: string;
  name: string;
  nickname?: string;
  colorHex: string;
  colorIndex: number;
  avatarInitial: string;
}

/**
 * Configurable match option rendered automatically by GameHost during the Setup phase
 */
export interface GameConfigOption {
  key: string;
  label: string;
  description?: string;
  type: 'select' | 'number' | 'toggle';
  defaultValue: string | number | boolean;
  options?: Array<{ label: string; value: string | number }>;
  min?: number;
  max?: number;
  step?: number;
}

export type GameMatchConfig = Record<string, string | number | boolean>;

/**
 * Concise rule bullet shown in the Game Preview modal and Setup drawer
 */
export interface GameRuleStep {
  title: string;
  description: string;
}

/**
 * Standardized outcome returned by a game module when a match finishes
 */
export interface GameStanding {
  playerId: string;
  playerName: string;
  colorHex: string;
  rank: number;
  primaryStatLabel: string; // e.g., "Score", "Lives Left", "Break", "Darts"
  primaryStatValue: string | number;
  secondaryStat?: string;   // e.g., "3 Kills", "Best Visit: 140"
}

export interface GameResult {
  gameId: string;
  winnerId: string | null;
  winnerName: string;
  headline: string;          // e.g., "Callum survives the Lava!"
  standings: GameStanding[];
  totalDartsThrown: number;
  durationMs: number;
  highlights?: string[];     // e.g., ["Highest Break: 64", "3 Lava Dodges"]
  completedAt: number;
}

export interface GameSessionSummary {
  id: string;
  gameId: string;
  gameTitle: string;
  winnerName: string;
  playerCount: number;
  headline: string;
  completedAt: number;
}

/**
 * Real-time events emitted by the Game Event Bus from Autodarts Desktop / Simulator
 */
export type GameBoardEvent =
  | {
      type: 'dart_thrown';
      dart: DartThrow;
      dartIndex: number; // 0, 1, or 2
      visitThrows: DartThrow[];
      timestamp: number;
    }
  | {
      type: 'dart_corrected';
      dart: DartThrow;
      previousDart: DartThrow;
      dartIndex: number;
      visitThrows: DartThrow[];
      timestamp: number;
    }
  | {
      type: 'visit_completed';
      throws: DartThrow[];
      totalScore: number;
      timestamp: number;
    }
  | {
      type: 'board_status';
      status: string; // 'throw' | 'takeout' | 'waiting' | 'stopped'
      event: string;
      timestamp: number;
    };

/**
 * Imperative controls a mounted Game Module can register with GameHost
 * so the shared top chrome (Undo / Restart) works seamlessly for every game.
 */
export interface GameModuleController {
  undoLastAction?: () => void;
  canUndo?: () => boolean;
  restartMatch?: () => void;
}

/**
 * Exact props passed by GameHost into every modular game component
 */
export interface GameModuleProps {
  /** Active match player roster (ordered by turn order) */
  players: GamePlayer[];
  /** Values selected in the Setup screen matching game.configOptions */
  config: GameMatchConfig;
  /** Whether sound effects are currently unmuted */
  soundEnabled: boolean;
  /** Whether the local Autodarts board is live connected */
  isBoardConnected: boolean;
  /** Current Autodarts board status ('throw' | 'takeout' | 'waiting') */
  boardStatus: string;
  /** Current darts physically sitting in the board right now */
  currentVisitThrows: DartThrow[];
  /** Call this when the game reaches a winner / completion state */
  onGameComplete: (result: GameResult) => void;
  /** Register undo/restart handlers with the GameHost header bar */
  registerController: (controller: GameModuleController) => void;
  /** Notify GameHost whether the Undo button should be enabled */
  onCanUndoChange?: (canUndo: boolean) => void;
}

/**
 * Central Game Cartridge Metadata & Plug-In Definition
 */
export interface GameDefinition {
  /** URL-safe unique slug, e.g. "board-is-lava", "killer", "snooker" */
  id: string;
  /** Display title */
  title: string;
  /** Punchy 1-liner for the Lobby card */
  tagline: string;
  /** Richer Flight Club / Roxy Ballroom style description */
  description: string;
  category: GameCategory;
  status: GameStatus;
  accent: GameAccent;
  /** Icon component from lucide-react */
  icon: React.ComponentType<{ className?: string }>;
  minPlayers: number;
  maxPlayers: number;
  estimatedMinutes: string; // e.g., "10–15 min"
  difficulty: 'Casual' | 'Balanced' | 'Skill';
  tags: string[];
  rules: GameRuleStep[];
  configOptions: GameConfigOption[];
  /**
   * Plug-in component rendered inside GameHost once implemented.
   * Leave undefined while status === 'coming_soon'.
   */
  component?: React.ComponentType<GameModuleProps>;
}
