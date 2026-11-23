import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  BoardCameraMode,
  CameraDeviceInfo,
  CaptureClipMetadata,
  OcheCamStatus,
  RecordedClipBundle,
  ReplayClipRecord,
  ReplayTriggerSettings,
} from '../types/replay';
import { ocheCamService } from '../services/ocheCamService';
import { soundEngine } from '../games/utils/soundEngine';
import { useGameStore } from './useGameStore';
import { useOnlineMatchStore } from './useOnlineMatchStore';

export function isDartCounterClippingDisabled(): boolean {
  const activeView = useGameStore.getState().activeView;
  if (activeView === 'dartcounter') return true;
  const om = useOnlineMatchStore.getState();
  return Boolean(om.isActive && om.source === 'dartcounter');
}

export const DEFAULT_REPLAY_SAVE_DIR = 'C:\\Users\\callu\\Desktop\\Media\\darts-autoclipper';

export interface SavedClipConfirmation {
  id: number;
  title: string;
  subfolder: string;
  filename: string;
}

let savedConfirmTimer: number | null = null;
let inFlightStartPromise: Promise<void> | null = null;
let deviceChangeListenerAttached = false;
let deviceChangeRetryTimer: number | null = null;

interface ReplayStoreState {
  // Persisted settings
  cameraEnabled: boolean;
  /** Auto-start the Side-by-Side Split-Cam ring buffer during Kiosk Boot */
  autoStartCamera: boolean;
  selectedDeviceId: string;
  boardCameraMode: BoardCameraMode;
  boardCameraDeviceId: string;
  autodartsCamIndex: number;
  autodartsCamCustomUrl: string;
  includeAudio: boolean;
  saveDir: string;
  triggers: ReplayTriggerSettings;
  playbackRate: 0.5 | 0.75 | 1;

  // Ephemeral runtime state
  status: OcheCamStatus;
  errorMessage: string | null;
  boardFeedActive: boolean;
  boardFeedError: string | null;
  activeCameraLabel: string | null;
  /** Increments each time a camera error episode occurs so paired iPads know an error fired */
  cameraErrorEpoch: number;
  availableCameras: CameraDeviceInfo[];
  clips: ReplayClipRecord[];
  activeOverlayClip: ReplayClipRecord | null;
  isGalleryOpen: boolean;

  /** Live count of paired iPad/Phone remotes (0 = auto-save clips; >0 = wait for iPad Save tap) */
  connectedRemotes: number;
  /** Most recent recording (kept in RAM if unsaved so iPad can tap "Save Last Recording") */
  lastRecordedClip: ReplayClipRecord | null;
  pendingSaveBundle: RecordedClipBundle | null;
  isSavingLastClip: boolean;
  /** Non-null during the ~2.2s "CLIP SAVED!" broadcast confirmation before auto-resuming game */
  savedConfirmation: SavedClipConfirmation | null;
  /** True while cameras/clipping were automatically paused for Target DartCounter stability */
  pausedForDartCounter: boolean;

  /* [DEV-TEST: REMOVE WHEN DONE] One-shot debug trigger to clip the very next dart */
  devCaptureNextDartArmed: boolean;
  lastCaptureBanner: string | null;

  // Actions
  setConnectedRemotes: (count: number) => void;
  pauseForDartCounter: () => void;
  resumeFromDartCounter: () => void;
  refreshCameras: () => Promise<void>;
  loadSavedClips: () => Promise<void>;
  startCamera: (override?: {
    ocheDeviceId?: string;
    strictSelection?: boolean;
    autoDetect?: boolean;
    boardCameraMode?: BoardCameraMode;
    boardDeviceId?: string;
    autodartsCamIndex?: number;
  }) => Promise<void>;
  redetectCameras: () => Promise<void>;
  stopCamera: () => void;
  setSelectedDeviceId: (deviceId: string) => void;
  setAutoStartCamera: (autoStart: boolean) => void;
  setBoardCameraMode: (mode: BoardCameraMode) => void;
  setBoardCameraDeviceId: (deviceId: string) => void;
  setAutodartsCamIndex: (index: number) => void;
  setAutodartsCamCustomUrl: (url: string) => void;
  setIncludeAudio: (include: boolean) => void;
  setSaveDir: (dir: string) => void;
  updateTrigger: <K extends keyof ReplayTriggerSettings>(
    key: K,
    value: ReplayTriggerSettings[K]
  ) => void;
  setPlaybackRate: (rate: 0.5 | 0.75 | 1) => void;

  // Replay overlay & gallery
  openOverlayClip: (clip: ReplayClipRecord) => void;
  closeOverlayClip: () => void;
  openGallery: () => void;
  closeGallery: () => void;
  deleteClip: (filename: string) => Promise<void>;

  /* [DEV-TEST: REMOVE WHEN DONE] Arm/disarm one-shot next-dart capture */
  armDevNextDartCapture: () => void;
  cancelDevNextDartCapture: () => void;

  // Trigger a ~10s capture (auto-saves if no iPad remote connected; holds for iPad Save if paired)
  triggerActionReplay: (meta: CaptureClipMetadata) => Promise<ReplayClipRecord | null>;
  // Persist the pending last recording to disk (called from iPad Save button or Kiosk overlay)
  saveLastRecording: () => Promise<ReplayClipRecord | null>;
}

export const useReplayStore = create<ReplayStoreState>()(
  persist(
    (set, get) => ({
      cameraEnabled: false,
      autoStartCamera: true,
      selectedDeviceId: '',
      boardCameraMode: 'autodarts',
      boardCameraDeviceId: '',
      autodartsCamIndex: 0,
      autodartsCamCustomUrl: '',
      includeAudio: false,
      saveDir: DEFAULT_REPLAY_SAVE_DIR,
      triggers: {
        onBullseye: true,
        onT20: false,
        onTonPlus: true,
        on140Plus: true,
        autoShowOverlay: true,
      },
      playbackRate: 0.75,

      status: 'idle',
      errorMessage: null,
      boardFeedActive: false,
      boardFeedError: null,
      activeCameraLabel: null,
      cameraErrorEpoch: 0,
      availableCameras: [],
      clips: [],
      activeOverlayClip: null,
      isGalleryOpen: false,

      connectedRemotes: 0,
      lastRecordedClip: null,
      pendingSaveBundle: null,
      isSavingLastClip: false,
      savedConfirmation: null,
      pausedForDartCounter: false,

      devCaptureNextDartArmed: false,
      lastCaptureBanner: null,

      setConnectedRemotes: (connectedRemotes) => set({ connectedRemotes }),

      pauseForDartCounter: () => {
        const s = get();
        const wasRunning =
          s.cameraEnabled ||
          s.status === 'buffering' ||
          s.status === 'starting' ||
          s.status === 'capturing' ||
          ocheCamService.isRunning();
        ocheCamService.stop();
        set({
          pausedForDartCounter: s.pausedForDartCounter || wasRunning || s.autoStartCamera,
          cameraEnabled: false,
          status: 'idle',
          activeCameraLabel: null,
          boardFeedActive: false,
          devCaptureNextDartArmed: false,
          activeOverlayClip: null,
          lastCaptureBanner: null,
          errorMessage: null,
          boardFeedError: null,
        });
      },

      resumeFromDartCounter: () => {
        const s = get();
        if (!s.pausedForDartCounter) return;
        set({ pausedForDartCounter: false });
        if (s.autoStartCamera && !isDartCounterClippingDisabled()) {
          void get().startCamera();
        }
      },

      refreshCameras: async () => {
        try {
          const cams = await ocheCamService.listCameras();
          set((s) => {
            const preferredNonBoard = cams.find((c) => !c.isAutodartsBoardCam);
            const savedMatch = cams.find((c) => c.deviceId === s.selectedDeviceId);
            const ocheId =
              savedMatch && !savedMatch.isAutodartsBoardCam
                ? savedMatch.deviceId
                : preferredNonBoard?.deviceId || savedMatch?.deviceId || cams[0]?.deviceId || '';
            const fallbackBoard =
              cams.find((c) => c.deviceId !== ocheId)?.deviceId || '';
            return {
              availableCameras: cams,
              selectedDeviceId: ocheId,
              boardCameraDeviceId: s.boardCameraDeviceId || fallbackBoard,
            };
          });
        } catch {
          // ignore
        }
      },

      loadSavedClips: async () => {
        try {
          const dir = encodeURIComponent(get().saveDir || DEFAULT_REPLAY_SAVE_DIR);
          const res = await fetch(`/api/replays/list?dir=${dir}`, { cache: 'no-store' });
          if (!res.ok) return;
          const data = await res.json();
          if (data?.ok && Array.isArray(data.clips)) {
            set({ clips: data.clips as ReplayClipRecord[] });
          }
        } catch {
          // ignore
        }
      },

      startCamera: async (override) => {
        // Deduplicate concurrent startup calls (e.g. KioskBootScreen + App mount) unless explicit override
        if (inFlightStartPromise && !override?.ocheDeviceId && !override?.autoDetect) {
          return inFlightStartPromise;
        }

        const runStart = async () => {
          const state = get();
          const ocheDeviceId = override?.autoDetect
            ? undefined
            : override?.ocheDeviceId ?? state.selectedDeviceId;
          const strictSelection = Boolean(override?.strictSelection);
          const autoDetect = Boolean(override?.autoDetect);
          // Board Cam is permanently locked to Autodarts Desktop's 3-camera live stream
          const boardCameraMode: BoardCameraMode = 'autodarts';
          const includeAudio = state.includeAudio;

          set({
            status: 'starting',
            errorMessage: null,
            boardFeedError: null,
            boardCameraMode,
          });
          try {
            await ocheCamService.start({
              ocheDeviceId: ocheDeviceId || undefined,
              strictSelection,
              autoDetect,
              includeAudio,
              boardCameraMode,
            });
            const cams = await ocheCamService.listCameras();
            const activeTrack = ocheCamService.getOcheStream()?.getVideoTracks()[0];
            const activeInfo = ocheCamService.getActiveCameraInfo();
            const resolvedId =
              activeInfo.deviceId ||
              activeTrack?.getSettings()?.deviceId ||
              ocheDeviceId ||
              cams.find((c) => !c.isAutodartsBoardCam)?.deviceId ||
              cams[0]?.deviceId ||
              '';
            const resolvedLabel =
              activeInfo.label ||
              activeTrack?.label ||
              cams.find((c) => c.deviceId === resolvedId)?.label ||
              'Oche Webcam';
            const boardStatus = ocheCamService.getBoardFeedStatus();

            set({
              cameraEnabled: true,
              boardCameraMode: 'autodarts',
              selectedDeviceId: resolvedId,
              activeCameraLabel: resolvedLabel,
              availableCameras: cams,
              status: 'buffering',
              errorMessage: null,
              boardFeedActive: boardStatus.active,
              boardFeedError: boardStatus.error,
            });
          } catch (err) {
            const cams = await ocheCamService.listCameras().catch(() => get().availableCameras);
            const message =
              (err as Error).message ||
              'Could not access Oche webcam. Check USB cable, camera permissions, or device selection.';
            set((s) => ({
              cameraEnabled: false,
              availableCameras: cams,
              activeCameraLabel: null,
              status: 'error',
              errorMessage: message,
              cameraErrorEpoch: s.cameraErrorEpoch + 1,
            }));
          }
        };

        const p = runStart().finally(() => {
          if (inFlightStartPromise === p) {
            inFlightStartPromise = null;
          }
        });
        inFlightStartPromise = p;
        return p;
      },

      redetectCameras: async () => {
        await get().startCamera({ autoDetect: true });
      },

      stopCamera: () => {
        ocheCamService.stop();
        set({
          cameraEnabled: false,
          status: 'idle',
          activeCameraLabel: null,
          boardFeedActive: false,
          devCaptureNextDartArmed: false,
          errorMessage: null,
          boardFeedError: null,
        });
      },

      setSelectedDeviceId: (selectedDeviceId) => set({ selectedDeviceId }),

      setAutoStartCamera: (autoStartCamera) => set({ autoStartCamera }),

      setBoardCameraMode: () => set({ boardCameraMode: 'autodarts' }),

      setBoardCameraDeviceId: (boardCameraDeviceId) => set({ boardCameraDeviceId }),

      setAutodartsCamIndex: (autodartsCamIndex) => set({ autodartsCamIndex }),

      setAutodartsCamCustomUrl: (autodartsCamCustomUrl) => set({ autodartsCamCustomUrl }),

      setIncludeAudio: (includeAudio) => set({ includeAudio }),

      setSaveDir: (saveDir) => set({ saveDir }),

      updateTrigger: (key, value) =>
        set((s) => ({
          triggers: {
            ...s.triggers,
            [key]: value,
          },
        })),

      setPlaybackRate: (playbackRate) => set({ playbackRate }),

      openOverlayClip: (activeOverlayClip) => set({ activeOverlayClip }),
      closeOverlayClip: () => set({ activeOverlayClip: null }),
      openGallery: () => {
        void get().loadSavedClips();
        set({ isGalleryOpen: true });
      },
      closeGallery: () => set({ isGalleryOpen: false }),

      deleteClip: async (relativePathOrFilename) => {
        try {
          const dir = encodeURIComponent(get().saveDir || DEFAULT_REPLAY_SAVE_DIR);
          const encodedPath = relativePathOrFilename
            .split('/')
            .map((part) => encodeURIComponent(part))
            .join('/');
          const res = await fetch(`/api/replays/file/${encodedPath}?dir=${dir}`, {
            method: 'DELETE',
          });
          if (res.ok) {
            set((s) => ({
              clips: s.clips.filter(
                (c) =>
                  c.relativePath !== relativePathOrFilename &&
                  c.filename !== relativePathOrFilename
              ),
              activeOverlayClip:
                s.activeOverlayClip?.relativePath === relativePathOrFilename ||
                s.activeOverlayClip?.filename === relativePathOrFilename
                  ? null
                  : s.activeOverlayClip,
            }));
          }
        } catch {
          // ignore
        }
      },

      armDevNextDartCapture: () => {
        set({ devCaptureNextDartArmed: true, errorMessage: null });
      },

      cancelDevNextDartCapture: () => {
        set({ devCaptureNextDartArmed: false });
      },

      triggerActionReplay: async (meta) => {
        // Clipping is permanently disabled during Target DartCounter sessions for stability
        if (isDartCounterClippingDisabled()) {
          return null;
        }
        if (!ocheCamService.isRunning()) {
          return null;
        }
        if (get().status === 'capturing') {
          // If a Game Winning Shot landed on the exact same dart as a Bullseye/Ton+ highlight,
          // upgrade the in-flight capture so it uses the winning shot title & auto-saves to disk!
          if (meta.forceAutoSave && ocheCamService.upgradeActiveCaptureMeta(meta)) {
            set({
              lastCaptureBanner: `Game Winning Shot — Saving ${meta.playerName}'s clip...`,
            });
          }
          return null;
        }

        set({
          status: 'capturing',
          lastCaptureBanner: meta.forceAutoSave
            ? `Game Winning Shot — Recording ${meta.playerName}'s celebration...`
            : meta.category === 'user'
            ? `Capturing 20s Manual Clip (15s back + 5s)...`
            : `Recording 5s reaction for ${meta.segmentName}...`,
        });

        try {
          const bundle = await ocheCamService.recordTenSecondClip(meta);
          if (!bundle) {
            set({
              status: ocheCamService.isRunning() ? 'buffering' : 'idle',
              lastCaptureBanner: null,
            });
            return null;
          }

          const finalMeta = bundle.meta;
          const resolvedCategory = finalMeta.isDevTest ? 'dev' : finalMeta.category || 'game';

          // Revoke previous unsaved object URL if we are replacing it
          const prevClip = get().lastRecordedClip;
          if (prevClip && !prevClip.isSavedToDisk && prevClip.url.startsWith('blob:')) {
            URL.revokeObjectURL(prevClip.url);
          }

          const hasRemoteConnected = get().connectedRemotes > 0;
          // Automatic game clips & winning shots ALWAYS auto-save straight to disk;
          // Manual iPad clips ("Clip That!") show preview and await iPad Save confirmation (unless no iPad paired)
          const shouldAutoSave =
            !hasRemoteConnected ||
            Boolean(finalMeta.forceAutoSave) ||
            resolvedCategory === 'game';

          if (shouldAutoSave) {
            // AUTO-SAVE TO DISK (Game Winning Shots ALWAYS auto-save, or when no iPad is connected)
            const saved = await ocheCamService.uploadRecordedClip(
              bundle,
              get().saveDir || DEFAULT_REPLAY_SAVE_DIR
            );

            set((s) => ({
              status: ocheCamService.isRunning() ? 'buffering' : 'idle',
              lastCaptureBanner: null,
              clips: [saved, ...s.clips].slice(0, 150),
              lastRecordedClip: saved,
              pendingSaveBundle: null,
              activeOverlayClip:
                s.triggers.autoShowOverlay || finalMeta.isDevTest || finalMeta.forceAutoSave
                  ? saved
                  : s.activeOverlayClip,
            }));

            return saved;
          } else {
            // IPAD / OCHE REMOTE CONNECTED -> SHOW REPLAY IMMEDIATELY & LET IPAD CLICK TO SAVE
            const blobUrl = URL.createObjectURL(bundle.blob);
            const resolvedCategory = finalMeta.isDevTest ? 'dev' : finalMeta.category || 'game';
            const resolvedSubfolder =
              resolvedCategory === 'dev'
                ? 'Dev Tests'
                : resolvedCategory === 'user'
                ? 'User Triggered'
                : 'Game Highlights';
            const previewClip: ReplayClipRecord = {
              id: `unsaved-${bundle.createdAt}`,
              filename: `${finalMeta.customFileName || `${finalMeta.playerName}_${finalMeta.segmentName}`}_unsaved.webm`,
              category: resolvedCategory,
              subfolder: resolvedSubfolder,
              filePath: `${get().saveDir || DEFAULT_REPLAY_SAVE_DIR}\\${resolvedSubfolder} (Tap Save on iPad)`,
              url: blobUrl,
              playerName: finalMeta.playerName,
              segmentName: finalMeta.segmentName,
              score: finalMeta.score,
              reason: finalMeta.reason,
              coords: finalMeta.coords,
              preSeconds: bundle.preSeconds,
              postSeconds: bundle.postSeconds,
              durationSec: bundle.durationSec,
              sizeBytes: bundle.blob.size,
              isDevTest: Boolean(finalMeta.isDevTest),
              isDualCamera: bundle.isDualCamera,
              isSavedToDisk: false,
              createdAt: bundle.createdAt,
            };

            set((s) => ({
              status: ocheCamService.isRunning() ? 'buffering' : 'idle',
              lastCaptureBanner: null,
              lastRecordedClip: previewClip,
              pendingSaveBundle: bundle,
              activeOverlayClip:
                s.triggers.autoShowOverlay || finalMeta.isDevTest ? previewClip : s.activeOverlayClip,
            }));

            return previewClip;
          }
        } catch (err) {
          set({
            status: ocheCamService.isRunning() ? 'buffering' : 'error',
            lastCaptureBanner: null,
            errorMessage: (err as Error).message || 'Failed capturing Action Replay clip',
          });
          return null;
        }
      },

      saveLastRecording: async () => {
        const { pendingSaveBundle, lastRecordedClip, isSavingLastClip, saveDir } = get();
        if (isSavingLastClip) return null;
        if (!pendingSaveBundle) {
          return lastRecordedClip?.isSavedToDisk ? lastRecordedClip : null;
        }

        const tempClipId = lastRecordedClip?.id;
        const tempBlobUrl =
          lastRecordedClip && lastRecordedClip.url.startsWith('blob:')
            ? lastRecordedClip.url
            : null;

        set({ isSavingLastClip: true, errorMessage: null });
        try {
          const saved = await ocheCamService.uploadRecordedClip(
            pendingSaveBundle,
            saveDir || DEFAULT_REPLAY_SAVE_DIR
          );

          soundEngine.playBonusHit(useGameStore.getState().soundEnabled);

          const confirmId = Date.now();
          const confirmation: SavedClipConfirmation = {
            id: confirmId,
            title: saved.reason,
            subfolder: saved.subfolder || 'Game Highlights',
            filename: saved.filename,
          };

          // Keep the currently playing blob video intact (zero black flash!) while playing
          // the celebratory "CLIP SAVED!" animation, then auto-resume the game cleanly.
          set((s) => ({
            isSavingLastClip: false,
            pendingSaveBundle: null,
            lastRecordedClip: saved,
            clips: [saved, ...s.clips].slice(0, 150),
            savedConfirmation: confirmation,
            activeOverlayClip:
              s.activeOverlayClip && s.activeOverlayClip.id === tempClipId
                ? { ...s.activeOverlayClip, isSavedToDisk: true, filePath: saved.filePath }
                : s.activeOverlayClip,
          }));

          if (savedConfirmTimer !== null) {
            window.clearTimeout(savedConfirmTimer);
          }
          savedConfirmTimer = window.setTimeout(() => {
            savedConfirmTimer = null;
            set((s) => ({
              savedConfirmation:
                s.savedConfirmation?.id === confirmId ? null : s.savedConfirmation,
              activeOverlayClip:
                s.activeOverlayClip && s.activeOverlayClip.id === tempClipId
                  ? null
                  : s.activeOverlayClip,
            }));
            if (tempBlobUrl) {
              // Revoke temp blob URL safely AFTER the <video> element unmounts
              window.setTimeout(() => URL.revokeObjectURL(tempBlobUrl), 250);
            }
          }, 2200);

          return saved;
        } catch (err) {
          set({
            isSavingLastClip: false,
            errorMessage: (err as Error).message || 'Failed saving clip to disk',
          });
          return null;
        }
      },
    }),
    {
      name: 'autodarts_replay_settings_v1',
      partialize: (state) => ({
        autoStartCamera: state.autoStartCamera,
        selectedDeviceId: state.selectedDeviceId,
        boardCameraMode: state.boardCameraMode,
        boardCameraDeviceId: state.boardCameraDeviceId,
        autodartsCamIndex: state.autodartsCamIndex,
        autodartsCamCustomUrl: state.autodartsCamCustomUrl,
        includeAudio: state.includeAudio,
        saveDir: state.saveDir,
        triggers: state.triggers,
        playbackRate: state.playbackRate,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.boardCameraMode = 'autodarts';
        }
      },
    }
  )
);

// Keep live Autodarts 3-cam board feed status/errors synced into the store
ocheCamService.onBoardFeedStatusChange(({ active, error }) => {
  useReplayStore.setState((s) => {
    const isNewBoardError = Boolean(error) && !s.boardFeedError;
    return {
      boardFeedActive: active,
      boardFeedError: error,
      cameraErrorEpoch: isNewBoardError ? s.cameraErrorEpoch + 1 : s.cameraErrorEpoch,
    };
  });
});

// Keep live Oche webcam disconnect/recovery events synced into the store
ocheCamService.onOcheStatusChange(({ active, error, label }) => {
  if (!active && error) {
    useReplayStore.setState((s) => ({
      cameraEnabled: false,
      status: 'error',
      activeCameraLabel: null,
      errorMessage: error,
      cameraErrorEpoch: s.cameraErrorEpoch + 1,
    }));
  } else if (active && label) {
    useReplayStore.setState({ activeCameraLabel: label });
  }
});

// Automatically detect newly plugged-in USB cameras and recover Split-Cam if currently errored
if (
  typeof window !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  navigator.mediaDevices?.addEventListener &&
  !deviceChangeListenerAttached
) {
  deviceChangeListenerAttached = true;
  navigator.mediaDevices.addEventListener('devicechange', () => {
    if (deviceChangeRetryTimer !== null) {
      window.clearTimeout(deviceChangeRetryTimer);
    }
    deviceChangeRetryTimer = window.setTimeout(() => {
      deviceChangeRetryTimer = null;
      const state = useReplayStore.getState();
      void state.refreshCameras();
      if (state.autoStartCamera && state.status === 'error') {
        void state.startCamera({ autoDetect: true });
      }
    }, 1200);
  });
}
