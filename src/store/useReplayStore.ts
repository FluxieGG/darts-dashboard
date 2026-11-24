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
let startEpoch = 0;
let deviceChangeRetryTimer: number | null = null;
const pendingRevokeBlobUrls = new Set<string>();

function revokeBlobUrlDeferred(url: string | null | undefined, delayMs = 250): void {
  if (!url || !url.startsWith('blob:')) return;
  pendingRevokeBlobUrls.delete(url);
  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, delayMs);
}

function scheduleRevokeIfUnused(url: string | null | undefined, delayMs = 250): void {
  if (!url || !url.startsWith('blob:')) return;
  const s = useReplayStore.getState();
  const inUse = s.activeOverlayClip?.url === url || s.lastRecordedClip?.url === url;
  if (inUse) {
    pendingRevokeBlobUrls.add(url);
  } else {
    revokeBlobUrlDeferred(url, delayMs);
  }
}

function flushUnusedDeferredBlobUrls(): void {
  if (pendingRevokeBlobUrls.size === 0) return;
  const s = useReplayStore.getState();
  for (const url of Array.from(pendingRevokeBlobUrls)) {
    const inUse = s.activeOverlayClip?.url === url || s.lastRecordedClip?.url === url;
    if (!inUse) {
      revokeBlobUrlDeferred(url);
    }
  }
}

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

  /** Hidden PIN 0161 Dev Console one-shot clip trigger for the very next dart */
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

  /** Arm/disarm the PIN 0161 Dev Console one-shot next-dart capture */
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
        startEpoch += 1;
        inFlightStartPromise = null;
        if (savedConfirmTimer !== null) {
          window.clearTimeout(savedConfirmTimer);
          savedConfirmTimer = null;
        }

        const s = get();
        const prevUnsavedUrl =
          s.lastRecordedClip && !s.lastRecordedClip.isSavedToDisk && s.lastRecordedClip.url.startsWith('blob:')
            ? s.lastRecordedClip.url
            : null;
        const prevOverlayBlobUrl =
          s.activeOverlayClip && s.activeOverlayClip.url.startsWith('blob:')
            ? s.activeOverlayClip.url
            : null;

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
          pendingSaveBundle: null,
          savedConfirmation: null,
          lastRecordedClip: s.lastRecordedClip?.isSavedToDisk ? s.lastRecordedClip : null,
          lastCaptureBanner: null,
          errorMessage: null,
          boardFeedError: null,
        });
        scheduleRevokeIfUnused(prevUnsavedUrl);
        scheduleRevokeIfUnused(prevOverlayBlobUrl);
        flushUnusedDeferredBlobUrls();
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
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 8000);
        try {
          const dir = encodeURIComponent(get().saveDir || DEFAULT_REPLAY_SAVE_DIR);
          const res = await fetch(`/api/replays/list?dir=${dir}`, {
            cache: 'no-store',
            signal: controller.signal,
          });
          if (!res.ok) return;
          const data = await res.json();
          if (data?.ok && Array.isArray(data.clips)) {
            set({ clips: data.clips as ReplayClipRecord[] });
          }
        } catch {
          // ignore
        } finally {
          window.clearTimeout(timer);
        }
      },

      startCamera: async (override) => {
        if (isDartCounterClippingDisabled() || get().pausedForDartCounter) {
          ocheCamService.stop();
          return;
        }

        const isExplicitOverride = Boolean(
          override?.ocheDeviceId || override?.autoDetect || override?.strictSelection
        );

        // Deduplicate concurrent startup calls (e.g. KioskBootScreen + App mount) unless explicit override
        if (inFlightStartPromise && !isExplicitOverride) {
          return inFlightStartPromise;
        }

        const epoch = ++startEpoch;

        const runStart = async () => {
          const state = get();
          if (isDartCounterClippingDisabled() || state.pausedForDartCounter) {
            ocheCamService.stop();
            return;
          }

          const ocheDeviceId = override?.autoDetect
            ? undefined
            : override?.ocheDeviceId ?? state.selectedDeviceId;
          const strictSelection = Boolean(override?.strictSelection);
          const autoDetect = Boolean(override?.autoDetect);
          // Board Cam is permanently locked to Autodarts Desktop's 3-camera live stream; kiosk has no audio
          const boardCameraMode: BoardCameraMode = 'autodarts';

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
              includeAudio: false,
              boardCameraMode,
            });
            if (epoch !== startEpoch) {
              return;
            }
            if (isDartCounterClippingDisabled() || get().pausedForDartCounter) {
              ocheCamService.stop();
              return;
            }
            if (!ocheCamService.isRunning()) {
              return;
            }

            const cams = await ocheCamService.listCameras();
            if (epoch !== startEpoch) {
              return;
            }
            if (isDartCounterClippingDisabled() || get().pausedForDartCounter) {
              ocheCamService.stop();
              return;
            }

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
            if (epoch !== startEpoch) {
              return;
            }
            if (isDartCounterClippingDisabled() || get().pausedForDartCounter) {
              ocheCamService.stop();
              return;
            }
            const cams = await ocheCamService.listCameras().catch(() => get().availableCameras);
            if (epoch !== startEpoch) {
              return;
            }
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
        startEpoch += 1;
        inFlightStartPromise = null;
        const s = get();
        const prevUnsavedUrl =
          s.lastRecordedClip && !s.lastRecordedClip.isSavedToDisk && s.lastRecordedClip.url.startsWith('blob:')
            ? s.lastRecordedClip.url
            : null;
        ocheCamService.stop();
        set({
          cameraEnabled: false,
          status: 'idle',
          activeCameraLabel: null,
          boardFeedActive: false,
          devCaptureNextDartArmed: false,
          pendingSaveBundle: null,
          lastRecordedClip: s.lastRecordedClip?.isSavedToDisk ? s.lastRecordedClip : null,
          lastCaptureBanner: null,
          errorMessage: null,
          boardFeedError: null,
        });
        scheduleRevokeIfUnused(prevUnsavedUrl);
        flushUnusedDeferredBlobUrls();
      },

      setSelectedDeviceId: (selectedDeviceId) => set({ selectedDeviceId }),

      setAutoStartCamera: (autoStartCamera) => set({ autoStartCamera }),

      setBoardCameraMode: () => set({ boardCameraMode: 'autodarts' }),

      setBoardCameraDeviceId: (boardCameraDeviceId) => set({ boardCameraDeviceId }),

      setAutodartsCamIndex: (autodartsCamIndex) => set({ autodartsCamIndex }),

      setAutodartsCamCustomUrl: (autodartsCamCustomUrl) => set({ autodartsCamCustomUrl }),

      setIncludeAudio: () => set({ includeAudio: false }),

      setSaveDir: (saveDir) => set({ saveDir }),

      updateTrigger: (key, value) =>
        set((s) => ({
          triggers: {
            ...s.triggers,
            [key]: value,
          },
        })),

      setPlaybackRate: (playbackRate) => set({ playbackRate }),

      openOverlayClip: (activeOverlayClip) => {
        set({ activeOverlayClip });
        flushUnusedDeferredBlobUrls();
      },
      closeOverlayClip: () => {
        set({ activeOverlayClip: null });
        flushUnusedDeferredBlobUrls();
      },
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
            flushUnusedDeferredBlobUrls();
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
        if (isDartCounterClippingDisabled() || get().pausedForDartCounter) {
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
          if (isDartCounterClippingDisabled() || get().pausedForDartCounter) {
            set({
              status: 'idle',
              lastCaptureBanner: null,
            });
            return null;
          }
          if (!bundle) {
            set({
              status: ocheCamService.isRunning() ? 'buffering' : 'idle',
              lastCaptureBanner: null,
            });
            return null;
          }

          const finalMeta = bundle.meta;
          const resolvedCategory = finalMeta.isDevTest ? 'dev' : finalMeta.category || 'game';
          const prevClip = get().lastRecordedClip;
          const prevUnsavedUrl =
            prevClip && !prevClip.isSavedToDisk && prevClip.url.startsWith('blob:')
              ? prevClip.url
              : null;

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
            const suppressOverlay = isDartCounterClippingDisabled() || get().pausedForDartCounter;

            set((s) => ({
              status: ocheCamService.isRunning() ? 'buffering' : 'idle',
              lastCaptureBanner: null,
              clips: [saved, ...s.clips].slice(0, 150),
              lastRecordedClip: saved,
              pendingSaveBundle: null,
              activeOverlayClip:
                !suppressOverlay &&
                (s.triggers.autoShowOverlay || finalMeta.isDevTest || finalMeta.forceAutoSave)
                  ? saved
                  : s.activeOverlayClip,
            }));

            // Only revoke previous unsaved blob URL if it is no longer displayed in activeOverlayClip
            scheduleRevokeIfUnused(prevUnsavedUrl);
            flushUnusedDeferredBlobUrls();

            return saved;
          } else {
            // IPAD / OCHE REMOTE CONNECTED -> SHOW REPLAY IMMEDIATELY & LET IPAD CLICK TO SAVE
            const blobUrl = URL.createObjectURL(bundle.blob);
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

            // Only revoke previous unsaved blob URL if it is no longer displayed in activeOverlayClip
            scheduleRevokeIfUnused(prevUnsavedUrl);
            flushUnusedDeferredBlobUrls();

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

          // Decouple blob URL revocation from savedConfirmTimer: register for safe revocation
          // immediately (revokes now if overlay isn't showing it, or as soon as overlay closes/changes)
          scheduleRevokeIfUnused(tempBlobUrl);

          if (savedConfirmTimer !== null) {
            window.clearTimeout(savedConfirmTimer);
            flushUnusedDeferredBlobUrls();
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
            flushUnusedDeferredBlobUrls();
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
          state.includeAudio = false;
        }
      },
    }
  )
);

const REPLAY_STORE_CLEANUP_KEY = Symbol.for('autodarts.useReplayStore.listenerCleanup');
type GlobalWithReplayCleanup = typeof globalThis & {
  [REPLAY_STORE_CLEANUP_KEY]?: () => void;
};

// Tear down any previous module-level listeners before re-attaching (guards against Vite HMR duplicates)
const prevListenerCleanup = (globalThis as GlobalWithReplayCleanup)[REPLAY_STORE_CLEANUP_KEY];
if (prevListenerCleanup) {
  prevListenerCleanup();
}

// Keep live Autodarts 3-cam board feed status/errors synced into the store
const unsubBoardStatus = ocheCamService.onBoardFeedStatusChange(({ active, error }) => {
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
const unsubOcheStatus = ocheCamService.onOcheStatusChange(({ active, error, label }) => {
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
const handleDeviceChange = () => {
  if (deviceChangeRetryTimer !== null) {
    window.clearTimeout(deviceChangeRetryTimer);
  }
  deviceChangeRetryTimer = window.setTimeout(() => {
    deviceChangeRetryTimer = null;
    const state = useReplayStore.getState();
    void state.refreshCameras();
    if (
      state.autoStartCamera &&
      state.status === 'error' &&
      !state.pausedForDartCounter &&
      !isDartCounterClippingDisabled()
    ) {
      void state.startCamera({ autoDetect: true });
    }
  }, 1200);
};

const hasDeviceChangeSupport =
  typeof window !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  Boolean(navigator.mediaDevices?.addEventListener);

if (hasDeviceChangeSupport) {
  navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
}

const cleanupReplayListeners = () => {
  unsubBoardStatus();
  unsubOcheStatus();
  if (hasDeviceChangeSupport) {
    navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
  }
  if (deviceChangeRetryTimer !== null) {
    window.clearTimeout(deviceChangeRetryTimer);
    deviceChangeRetryTimer = null;
  }
  if (savedConfirmTimer !== null) {
    window.clearTimeout(savedConfirmTimer);
    savedConfirmTimer = null;
  }
};

(globalThis as GlobalWithReplayCleanup)[REPLAY_STORE_CLEANUP_KEY] = cleanupReplayListeners;

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cleanupReplayListeners();
    if ((globalThis as GlobalWithReplayCleanup)[REPLAY_STORE_CLEANUP_KEY] === cleanupReplayListeners) {
      delete (globalThis as GlobalWithReplayCleanup)[REPLAY_STORE_CLEANUP_KEY];
    }
  });
}
