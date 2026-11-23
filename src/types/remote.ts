import { AppView, GameMatchConfig, GameMatchPhase } from './games';
import { DataConnectionMode, WidgetId } from './config';
import { ObjectiveProgress } from './career';
import {
  BoardCameraMode,
  OcheCamStatus,
  ReplayClipCategory,
  ReplayTriggerSettings,
} from './replay';
import { DartCounterControlCommand } from './dartCounter';

export interface RemoteInterfaceOption {
  address: string;
  name: string;
  url: string;
  devUrl?: string;
}

export interface RemoteNetworkInfo {
  port: number;
  interfaces: RemoteInterfaceOption[];
  fallbackUrl: string;
  fallbackDevUrl?: string;
  connectedRemotes: number;
  connectedKiosks: number;
  connectedDevs?: number;
}

export interface RemotePresencePayload {
  connectedRemotes: number;
  connectedKiosks: number;
}

export interface RemoteActiveGameSnapshot {
  id: string;
  title: string;
  mode: 'arcade' | 'practice';
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
  isRulesOpen: boolean;
  heatmapMode: 'dots' | 'density' | 'both';
  isAutoSimulating: boolean;
  layoutWidgets: Array<{
    id: WidgetId;
    title: string;
    enabled: boolean;
    order: number;
    colSpan: 1 | 2;
  }>;
  careerSummary: {
    currentStreak: number;
    longestStreak: number;
    bestDay3DA: number;
    totalCareerDarts: number;
    isDiskSynced: boolean;
  };
  dailyObjectives: ObjectiveProgress[];
  weeklyObjectives: ObjectiveProgress[];
  onlineMatch: {
    isActive: boolean;
    source: 'manual' | 'dartcounter';
    startScore: 501 | 301 | 701;
    outRule: 'double' | 'straight';
    legsToWin: number;
    opponentName: string;
    opponentRemaining: number | null;
    opponentAvg: number | null;
    isPlayerTurn: boolean;
    playerLegs: number;
    opponentLegs: number;
    remaining: number;
    dartsInLeg: number;
    legThreeDartAvg: number;
    checkoutRoute: string[] | null;
    isBust: boolean;
    canUndo: boolean;
    matchWinner: 'player' | 'opponent' | null;
    dcConnected: boolean;
    dcMode: 'auto' | 'confirm' | 'read-only';
    dcLastSubmitStatus: string | null;
    dcLastControlStatus: string | null;
    dcPendingInvites: Array<{
      id: string;
      fromName: string;
      summary: string;
      detectedAt: number;
    }>;
    isFullscreenKiosk: boolean;
    dcPendingVisit: {
      id: string;
      score: number;
      throws: string[];
      dartsUsed: number;
      isBust: boolean;
      isCheckout: boolean;
    } | null;
  };
  replayStatus: OcheCamStatus;
  replayBoardCameraMode: BoardCameraMode;
  replayAutoStartCamera: boolean;
  replayPlaybackRate: 0.5 | 0.75 | 1;
  replayTriggers: ReplayTriggerSettings;
  replayDevArmed: boolean;
  replayError: string | null;
  replayBoardFeedActive: boolean;
  replayBoardFeedError: string | null;
  replayActiveCameraLabel: string | null;
  replaySelectedDeviceId: string;
  replayAvailableCameras: Array<{
    deviceId: string;
    label: string;
    isAutodartsBoardCam?: boolean;
  }>;
  replayHasCameraIssue: boolean;
  replayCameraIssueSummary: string | null;
  replayErrorEpoch: number;
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
  recentClips: Array<{
    id: string;
    filename: string;
    relativePath?: string;
    subfolder?: string;
    category?: ReplayClipCategory;
    playerName: string;
    segmentName: string;
    score: number;
    reason: string;
    durationSec: number;
    isDualCamera?: boolean;
    createdAt: number;
  }>;
  activeGame: RemoteActiveGameSnapshot | null;
  updatedAt: number;
}

/**
 * Commands sent from iPad / Phone Remote -> Kiosk
 */
export type RemoteCommand =
  | { type: 'toggle_party_mode' }
  | { type: 'navigate'; view: 'dashboard' | 'games-lobby' | 'practice-lobby' | 'dartcounter' }
  | { type: 'switch_player'; playerId: string }
  | { type: 'add_player'; name: string; addToRoster?: boolean; dartColor?: string; isSaved?: boolean }
  | { type: 'update_player_color'; playerId: string; dartColor: string }
  | { type: 'add_saved_to_roster'; playerId: string }
  | { type: 'remove_roster_player'; playerId: string }
  | { type: 'launch_game'; gameId: string }
  | { type: 'set_match_config'; key: string; value: string | number | boolean }
  | { type: 'start_match' }
  | { type: 'rematch' }
  | { type: 'return_to_setup' }
  | { type: 'exit_game' }
  | { type: 'undo_last_action' }
  | { type: 'restart_match' }
  | { type: 'toggle_sound' }
  | { type: 'next_turn_takeout' }
  | { type: 'clear_visit' }
  | { type: 'reset_session' }
  | { type: 'inject_dart'; target: string }
  | { type: 'set_heatmap_mode'; mode: 'dots' | 'density' | 'both' }
  | { type: 'toggle_widget'; widgetId: WidgetId }
  | { type: 'set_all_widgets_enabled'; enabled: boolean }
  | { type: 'move_widget'; widgetId: WidgetId; direction: 'up' | 'down' }
  | { type: 'set_widget_span'; widgetId: WidgetId; colSpan: 1 | 2 }
  | { type: 'reset_layout' }
  | { type: 'reroll_objectives'; period: 'daily' | 'weekly' }
  | { type: 'set_data_mode'; mode: DataConnectionMode }
  | { type: 'toggle_auto_sim' }
  | { type: 'simulate_visit' }
  | { type: 'start_cameras' }
  | { type: 'stop_cameras' }
  | { type: 'redetect_cameras' }
  | { type: 'select_oche_camera'; deviceId: string }
  | { type: 'set_board_camera_mode'; mode: BoardCameraMode }
  | { type: 'set_auto_start_camera'; enabled: boolean }
  | { type: 'update_replay_trigger'; key: keyof ReplayTriggerSettings; value: boolean }
  | { type: 'set_replay_speed'; rate: 0.5 | 0.75 | 1 }
  | { type: 'trigger_manual_replay' }
  | { type: 'save_last_replay' }
  | { type: 'dismiss_replay' }
  | { type: 'play_saved_clip'; clipId: string }
  | { type: 'delete_saved_clip'; path: string }
  | { type: 'arm_dev_replay' }
  | { type: 'cancel_dev_replay' }
  | { type: 'toggle_fullscreen' }
  | {
      type: 'online_match_start';
      startScore: 501 | 301 | 701;
      outRule: 'double' | 'straight';
      legsToWin: number;
      opponentName?: string;
    }
  | { type: 'online_match_stop' }
  | { type: 'online_match_opp_leg' }
  | { type: 'online_match_reset_leg' }
  | { type: 'online_match_undo' }
  | { type: 'online_match_set_score'; remaining: number }
  | { type: 'online_match_set_fullscreen'; enabled?: boolean }
  | { type: 'dc_set_mode'; mode: 'auto' | 'confirm' | 'read-only' }
  | { type: 'dc_confirm_visit' }
  | { type: 'dc_discard_visit' }
  | { type: 'dc_force_send_visit' }
  | { type: 'dc_control'; command: DartCounterControlCommand }
  | { type: 'resync_and_recalibrate' }
  | { type: 'toggle_rules_overlay'; open?: boolean };
