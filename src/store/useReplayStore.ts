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

export const DEFAULT_REPLAY_SAVE_DIR = 'C:\\Users\\callu\\Desktop\\Media\\darts-autoclipper';

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
  boardFeedError: string | null;
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

  /* [DEV-TEST: REMOVE WHEN DONE] One-shot debug trigger to clip the very next dart */
  devCaptureNextDartArmed: boolean;
  lastCaptureBanner: string | null;

  // Actions
  setConnectedRemotes: (count: number) => void;
  refreshCameras: () => Promise<void>;
  loadSavedClips: () => Promise<void>;
  startCamera: (override?: {
    ocheDeviceId?: string;
    boardCameraMode?: BoardCameraMode;
    boardDeviceId?: string;
    autodartsCamIndex?: number;
  }) => Promise<void>;
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
      boardCameraMode: 'usb',
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
      boardFeedError: null,
      availableCameras: [],
      clips: [],
      activeOverlayClip: null,
      isGalleryOpen: false,

      connectedRemotes: 0,
      lastRecordedClip: null,
      pendingSaveBundle: null,
      isSavingLastClip: false,

      devCaptureNextDartArmed: false,
      lastCaptureBanner: null,

      setConnectedRemotes: (connectedRemotes) => set({ connectedRemotes }),

      refreshCameras: async () => {
        try {
          const cams = await ocheCamService.listCameras();
          set((s) => {
            const ocheId = s.selectedDeviceId || cams[0]?.deviceId || '';
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
        const state = get();
        const ocheDeviceId = override?.ocheDeviceId ?? state.selectedDeviceId;
        const boardCameraMode = override?.boardCameraMode ?? state.boardCameraMode;
        const boardDeviceId = override?.boardDeviceId ?? state.boardCameraDeviceId;
        const autodartsCamIndex = override?.autodartsCamIndex ?? state.autodartsCamIndex;
        const includeAudio = state.includeAudio;

        set({ status: 'starting', errorMessage: null, boardFeedError: null });
        try {
          await ocheCamService.start({
            ocheDeviceId: ocheDeviceId || undefined,
            includeAudio,
            boardCameraMode,
            boardDeviceId: boardDeviceId || undefined,
            autodartsCamIndex,
            autodartsCamCustomUrl: state.autodartsCamCustomUrl || undefined,
          });
          const cams = await ocheCamService.listCameras();
          const activeTrack = ocheCamService.getOcheStream()?.getVideoTracks()[0];
          const resolvedId =
            activeTrack?.getSettings()?.deviceId || ocheDeviceId || cams[0]?.deviceId || '';
          const boardStatus = ocheCamService.getBoardFeedStatus();

          set({
            cameraEnabled: true,
            selectedDeviceId: resolvedId,
            boardCameraDeviceId:
              boardDeviceId || cams.find((c) => c.deviceId !== resolvedId)?.deviceId || '',
            availableCameras: cams,
            status: 'buffering',
            errorMessage: null,
            boardFeedError: boardStatus.error,
          });
        } catch (err) {
          set({
            cameraEnabled: false,
            status: 'error',
            errorMessage:
              (err as Error).message ||
              'Could not access webcam. Check camera permissions or device selection.',
          });
        }
      },

      stopCamera: () => {
        ocheCamService.stop();
        set({
          cameraEnabled: false,
          status: 'idle',
          devCaptureNextDartArmed: false,
          errorMessage: null,
          boardFeedError: null,
        });
      },

      setSelectedDeviceId: (selectedDeviceId) => set({ selectedDeviceId }),

      setAutoStartCamera: (autoStartCamera) => set({ autoStartCamera }),

      setBoardCameraMode: (boardCameraMode) => set({ boardCameraMode }),

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
        if (!ocheCamService.isRunning()) {
          return null;
        }
        if (get().status === 'capturing') {
          return null;
        }

        set({
          status: 'capturing',
          lastCaptureBanner: `Recording 5s reaction for ${meta.segmentName}...`,
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

          // Revoke previous unsaved object URL if we are replacing it
          const prevClip = get().lastRecordedClip;
          if (prevClip && !prevClip.isSavedToDisk && prevClip.url.startsWith('blob:')) {
            URL.revokeObjectURL(prevClip.url);
          }

          const hasRemoteConnected = get().connectedRemotes > 0;

          if (!hasRemoteConnected) {
            // NO OCHE REMOTE DETECTED -> AUTO-SAVE AUTOMATICALLY TO DISK
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
                s.triggers.autoShowOverlay || meta.isDevTest ? saved : s.activeOverlayClip,
            }));

            return saved;
          } else {
            // IPAD / OCHE REMOTE CONNECTED -> SHOW REPLAY IMMEDIATELY & LET IPAD CLICK TO SAVE
            const blobUrl = URL.createObjectURL(bundle.blob);
            const resolvedCategory = meta.isDevTest ? 'dev' : meta.category || 'game';
            const resolvedSubfolder =
              resolvedCategory === 'dev'
                ? 'Dev Tests'
                : resolvedCategory === 'user'
                ? 'User Triggered'
                : 'Game Highlights';
            const previewClip: ReplayClipRecord = {
              id: `unsaved-${bundle.createdAt}`,
              filename: `${meta.playerName}_${meta.segmentName}_unsaved.webm`,
              category: resolvedCategory,
              subfolder: resolvedSubfolder,
              filePath: `${get().saveDir || DEFAULT_REPLAY_SAVE_DIR}\\${resolvedSubfolder} (Tap Save on iPad)`,
              url: blobUrl,
              playerName: meta.playerName,
              segmentName: meta.segmentName,
              score: meta.score,
              reason: meta.reason,
              coords: meta.coords,
              preSeconds: bundle.preSeconds,
              postSeconds: bundle.postSeconds,
              durationSec: bundle.durationSec,
              sizeBytes: bundle.blob.size,
              isDevTest: Boolean(meta.isDevTest),
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
                s.triggers.autoShowOverlay || meta.isDevTest ? previewClip : s.activeOverlayClip,
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

        set({ isSavingLastClip: true, errorMessage: null });
        try {
          const saved = await ocheCamService.uploadRecordedClip(
            pendingSaveBundle,
            saveDir || DEFAULT_REPLAY_SAVE_DIR
          );

          // Revoke temp blob URL if overlay isn't using it (overlay switches to disk URL seamlessly)
          if (lastRecordedClip && lastRecordedClip.url.startsWith('blob:')) {
            URL.revokeObjectURL(lastRecordedClip.url);
          }

          set((s) => ({
            isSavingLastClip: false,
            pendingSaveBundle: null,
            lastRecordedClip: saved,
            clips: [saved, ...s.clips].slice(0, 150),
            activeOverlayClip:
              s.activeOverlayClip && s.activeOverlayClip.id === lastRecordedClip?.id
                ? saved
                : s.activeOverlayClip,
          }));

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
    }
  )
);
