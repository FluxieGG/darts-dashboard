import { AppView, GameMatchConfig, GameMatchPhase } from './games';
import { DataConnectionMode } from './config';
import { OcheCamStatus } from './replay';

export interface RemoteInterfaceOption {
  address: string;
  name: string;
  url: string;
}

export interface RemoteNetworkInfo {
  port: number;
  interfaces: RemoteInterfaceOption[];
  fallbackUrl: string;
  connectedRemotes: number;
  connectedKiosks: number;
}

export interface RemotePresencePayload {
  connectedRemotes: number;
  connectedKiosks: number;
}

export interface RemoteActiveGameSnapshot {
  id: string;
  title: string;
  phase: GameMatchPhase;
  minPlayers: number;
  maxPlayers: number;
  canUndo: boolean;
  matchConfig: GameMatchConfig;
  roster: Array<{
    id: string;
    name: string;
    colorHex: string;
  }>;
  winnerHeadline?: string;
}

/**
 * Compact live state snapshot synced from Kiosk -> iPad / Phone Remote over LAN SSE
 */
export interface RemoteKioskState {
  activeView: AppView;
  isPartyMode: boolean;
  activeTintHex: string | null;
  isLocalConnected: boolean;
  dataMode: DataConnectionMode;
  boardStatus: string;
  visitScore: number;
  currentVisitThrows: Array<{
    name: string;
    score: number;
    multiplier: number;
    bouncer?: boolean;
  }>;
  activePlayer: {
    id: string;
    name: string;
    dartColor?: string;
  };
  players: Array<{
    id: string;
    name: string;
    isPrimary?: boolean;
    dartColor?: string;
    isSaved?: boolean;
  }>;
  statsSnapshot: {
    threeDartAvg: number;
    highestVisit: number;
    totalDartsThrown: number;
  };
  soundEnabled: boolean;
  replayStatus: OcheCamStatus;
  hasActiveReplayOverlay: boolean;
  replayClipCount: number;
  isSavingReplay: boolean;
  lastRecording: {
    id: string;
    playerName: string;
    segmentName: string;
    reason: string;
    durationSec: number;
    isSaved: boolean;
  } | null;
  activeGame: RemoteActiveGameSnapshot | null;
  updatedAt: number;
}

/**
 * Commands sent from iPad / Phone Remote -> Kiosk
 */
export type RemoteCommand =
  | { type: 'toggle_party_mode' }
  | { type: 'navigate'; view: 'dashboard' | 'games-lobby' }
  | { type: 'switch_player'; playerId: string }
  | { type: 'add_player'; name: string; addToRoster?: boolean; dartColor?: string; isSaved?: boolean }
  | { type: 'add_saved_to_roster'; playerId: string }
  | { type: 'remove_roster_player'; playerId: string }
  | { type: 'launch_game'; gameId: string }
  | { type: 'set_match_config'; key: string; value: string | number | boolean }
  | { type: 'start_match' }
  | { type: 'rematch' }
  | { type: 'exit_game' }
  | { type: 'undo_last_action' }
  | { type: 'restart_match' }
  | { type: 'toggle_sound' }
  | { type: 'next_turn_takeout' }
  | { type: 'clear_visit' }
  | { type: 'reset_session' }
  | { type: 'inject_dart'; target: string }
  | { type: 'trigger_manual_replay' }
  | { type: 'save_last_replay' }
  | { type: 'dismiss_replay' };
