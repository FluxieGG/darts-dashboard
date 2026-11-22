export type DevLogChannel = 'BOARD' | 'CAMERA' | 'REMOTE' | 'GAME' | 'VAULT' | 'SYS';
export type DevLogLevel = 'info' | 'success' | 'warn' | 'error';

export interface DevLogEntry {
  id: string;
  timestamp: number;
  channel: DevLogChannel;
  level: DevLogLevel;
  message: string;
  detail?: string;
}

export interface DevHealthSnapshot {
  kioskUptimeSec: number;
  dataMode: string;
  boardConnected: boolean;
  boardStatus: string;
  boardEvent: string;
  currentVisitSummary: string;
  activeView: string;
  activePlayerName: string;
  isPartyMode: boolean;
  activeGameTitle: string | null;
  activeGamePhase: string | null;
  connectedRemotes: number;
  connectedDevs: number;
  cameraStatus: string;
  boardCameraMode: string;
  devReplayArmed: boolean;
  savedClipsCount: number;
  careerDiskSynced: boolean;
  errorCount: number;
  updatedAt: number;
}

export type DevConsoleCommand =
  | { type: 'ping' }
  | { type: 'force_health' }
  | { type: 'restart_cameras' }
  | { type: 'arm_dev_replay' }
  | { type: 'clear_logs' };

export const DEV_CONSOLE_PIN = '0161';
