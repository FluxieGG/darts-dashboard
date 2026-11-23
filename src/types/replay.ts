import { DartCoords } from './darts';

export type BoardCameraMode = 'usb' | 'autodarts' | 'none';
export type ReplayClipCategory = 'game' | 'user' | 'dev';

export interface ReplayClipRecord {
  id: string;
  filename: string;
  /** Subfolder relative path, e.g. "Game Highlights/2026-11-22_...webm" */
  relativePath?: string;
  subfolder?: string;
  category?: ReplayClipCategory;
  filePath: string;
  url: string;
  playerName: string;
  segmentName: string;
  score: number;
  reason: string;
  coords?: DartCoords;
  preSeconds: number;
  postSeconds: number;
  durationSec: number;
  sizeBytes: number;
  isDevTest: boolean;
  isDualCamera?: boolean;
  /** False when held in RAM awaiting iPad "Save Last Recording" tap; true once written to disk */
  isSavedToDisk?: boolean;
  createdAt: number;
}

export interface RecordedClipBundle {
  blob: Blob;
  meta: CaptureClipMetadata;
  preSeconds: number;
  postSeconds: number;
  durationSec: number;
  isDualCamera: boolean;
  createdAt: number;
}

export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
}

export interface ReplayTriggerSettings {
  /** Auto-clip on Inner Bullseye (50) */
  onBullseye: boolean;
  /** Auto-clip on T20 hits (great for highlights) */
  onT20: boolean;
  /** Auto-clip on 100+ visits */
  onTonPlus: boolean;
  /** Auto-clip on 140+ / 180 visits */
  on140Plus: boolean;
  /** Auto-pop the slow-mo Action Replay overlay after saving a clip */
  autoShowOverlay: boolean;
}

export type OcheCamStatus = 'idle' | 'starting' | 'buffering' | 'capturing' | 'error';

export interface CaptureClipMetadata {
  playerName: string;
  segmentName: string;
  score: number;
  reason: string;
  coords?: DartCoords;
  isDevTest?: boolean;
  category?: ReplayClipCategory;
  /** Optional readable clip filename base, e.g. "Killer - Game Winning Shot - Callum" */
  customFileName?: string;
  /** Always auto-save directly to disk even when an iPad Oche Remote is connected */
  forceAutoSave?: boolean;
  /** Target seconds before trigger moment (default 5s for game clips, 15s for manual clips) */
  preSeconds?: number;
  /** Target seconds after trigger moment (default 5s) */
  postSeconds?: number;
}
