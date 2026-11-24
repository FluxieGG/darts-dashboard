import { DashboardLayout, DataConnectionMode } from '../types/config';
import { PlayerProfile, PlayerStats } from '../types/stats';
import { BoardCameraMode, ReplayTriggerSettings } from '../types/replay';
import { normalizeLayout } from '../lib/storage';
import { useLayoutStore } from '../store/useLayoutStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { useReplayStore } from '../store/useReplayStore';
import { resolveBoardHttpUrl } from './localBoardManager';

export interface PersistedDashboardState {
  version: 1;
  updatedAt: number;
  layout?: DashboardLayout;
  settings?: {
    dataMode: DataConnectionMode;
    localWsUrl: string;
    localHttpUrl: string;
    cloudClientId: string;
    heatmapMode: 'dots' | 'density' | 'both';
    autoSimIntervalMs: number;
    showDevCoords: boolean;
  };
  players?: {
    activePlayerId: string;
    players: PlayerProfile[];
    playerStats: Record<string, PlayerStats>;
  };
  replay?: {
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
  };
}

let hydrationPromise: Promise<boolean> | null = null;
let hasHydratedFromDisk = false;
let isApplyingDiskState = false;
let lastSavedPlayersSection: PersistedDashboardState['players'] | undefined;
let lastSerializedPayload = '';
let saveTimer: number | null = null;

function migrateWsSetting(rawUrl?: string): string {
  const trimmed = (rawUrl || '/api/board/api/events').trim();
  if (trimmed.startsWith('/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
      parsed.port === '3180'
    ) {
      return `/api/board${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // keep custom
  }
  return trimmed;
}

function buildPlayersSection(): PersistedDashboardState['players'] {
  const playerState = usePlayerStore.getState();
  // Never overwrite saved players on disk with ephemeral Party Mode state
  if (playerState.isPartyMode && lastSavedPlayersSection) {
    return lastSavedPlayersSection;
  }

  const savedPlayers = playerState.players.filter((p) => p.isPrimary || p.isSaved !== false);
  const savedIds = new Set(savedPlayers.map((p) => p.id));
  const savedStats: Record<string, PlayerStats> = {};
  for (const [id, stats] of Object.entries(playerState.playerStats)) {
    if (savedIds.has(id)) {
      savedStats[id] = stats;
    }
  }

  const section: PersistedDashboardState['players'] = {
    activePlayerId: savedIds.has(playerState.activePlayerId)
      ? playerState.activePlayerId
      : savedPlayers[0]?.id || 'player-callum',
    players: savedPlayers,
    playerStats: savedStats,
  };
  lastSavedPlayersSection = section;
  return section;
}

const MAX_KEEPALIVE_BYTES = 60_000;

function buildDashboardPayload(): { comparisonKey: string; body: string } {
  const layoutState = useLayoutStore.getState();
  const settingsState = useSettingsStore.getState();
  const replayState = useReplayStore.getState();

  const stableData = {
    layout: normalizeLayout(layoutState.layout),
    settings: {
      dataMode: settingsState.dataMode,
      localWsUrl: migrateWsSetting(settingsState.localWsUrl),
      localHttpUrl: resolveBoardHttpUrl(settingsState.localHttpUrl),
      cloudClientId: settingsState.cloudClientId,
      heatmapMode: settingsState.heatmapMode,
      autoSimIntervalMs: settingsState.autoSimIntervalMs,
      showDevCoords: settingsState.showDevCoords,
    },
    players: buildPlayersSection(),
    replay: {
      autoStartCamera: replayState.autoStartCamera,
      selectedDeviceId: replayState.selectedDeviceId,
      boardCameraMode: 'autodarts' as BoardCameraMode,
      boardCameraDeviceId: replayState.boardCameraDeviceId,
      autodartsCamIndex: replayState.autodartsCamIndex,
      autodartsCamCustomUrl: replayState.autodartsCamCustomUrl,
      includeAudio: replayState.includeAudio,
      saveDir: replayState.saveDir,
      triggers: replayState.triggers,
      playbackRate: replayState.playbackRate,
    },
  };

  // Serialize once per dirty check and reuse for both comparison and HTTP body
  const comparisonKey = JSON.stringify(stableData);
  const body = `{"version":1,"updatedAt":${Date.now()},${comparisonKey.slice(1)}`;
  return { comparisonKey, body };
}

async function postDashboardSnapshot(body: string, useKeepalive = false): Promise<boolean> {
  try {
    const init: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    };
    if (useKeepalive) {
      init.keepalive = true;
    }
    const res = await fetch('/api/dashboard/state', init);
    return res.ok;
  } catch {
    return false;
  }
}

export function flushDashboardStateToDisk(): void {
  if (!hasHydratedFromDisk || isApplyingDiskState) return;
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }

  const { comparisonKey, body } = buildDashboardPayload();
  if (comparisonKey === lastSerializedPayload) return;

  const blob = new Blob([body], { type: 'application/json' });
  const withinKeepaliveLimit = blob.size <= MAX_KEEPALIVE_BYTES;

  if (
    withinKeepaliveLimit &&
    typeof navigator !== 'undefined' &&
    typeof navigator.sendBeacon === 'function'
  ) {
    try {
      if (navigator.sendBeacon('/api/dashboard/state', blob)) {
        lastSerializedPayload = comparisonKey;
        return;
      }
    } catch {
      // fall back to fetch
    }
  }

  void postDashboardSnapshot(body, withinKeepaliveLimit).then((ok) => {
    if (ok) {
      lastSerializedPayload = comparisonKey;
    }
  });
}

export function scheduleDashboardDiskSave(delayMs = 180): void {
  if (!hasHydratedFromDisk || isApplyingDiskState) return;

  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
  }
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    const { comparisonKey, body } = buildDashboardPayload();
    if (comparisonKey === lastSerializedPayload) return;
    void postDashboardSnapshot(body, false).then((ok) => {
      if (ok) {
        lastSerializedPayload = comparisonKey;
      }
    });
  }, delayMs);
}

/**
 * Loads `./data/dashboard-state.json` from the local Vite server and hydrates
 * layout (hidden widgets, order, colSpan), settings, saved players, and replay settings.
 * Deduplicated so multiple callers (App mount + KioskBootScreen) share one clean load.
 */
export function hydrateDashboardStateFromDisk(): Promise<boolean> {
  if (hasHydratedFromDisk) return Promise.resolve(true);
  if (hydrationPromise) return hydrationPromise;

  hydrationPromise = (async () => {
    try {
      const res = await fetch('/api/dashboard/state', { cache: 'no-store' });
      if (!res.ok) {
        hasHydratedFromDisk = true;
        return false;
      }

      const disk = (await res.json()) as PersistedDashboardState;
      if (disk && typeof disk === 'object' && typeof disk.updatedAt === 'number' && disk.updatedAt > 0) {
        isApplyingDiskState = true;
        try {
          if (disk.layout && Array.isArray(disk.layout.widgets)) {
            useLayoutStore.getState().hydrateLayout(disk.layout);
          }

          if (disk.settings) {
            useSettingsStore.setState((prev) => ({
              ...prev,
              dataMode: disk.settings?.dataMode || prev.dataMode,
              localWsUrl: migrateWsSetting(disk.settings?.localWsUrl ?? prev.localWsUrl),
              localHttpUrl: resolveBoardHttpUrl(disk.settings?.localHttpUrl ?? prev.localHttpUrl),
              cloudClientId:
                typeof disk.settings?.cloudClientId === 'string'
                  ? disk.settings.cloudClientId
                  : prev.cloudClientId,
              heatmapMode: disk.settings?.heatmapMode || prev.heatmapMode,
              autoSimIntervalMs:
                typeof disk.settings?.autoSimIntervalMs === 'number'
                  ? disk.settings.autoSimIntervalMs
                  : prev.autoSimIntervalMs,
              showDevCoords:
                typeof disk.settings?.showDevCoords === 'boolean'
                  ? disk.settings.showDevCoords
                  : prev.showDevCoords,
            }));
          }

          if (
            disk.players &&
            Array.isArray(disk.players.players) &&
            disk.players.players.length > 0 &&
            !usePlayerStore.getState().isPartyMode
          ) {
            const savedPlayers = disk.players.players.filter((p) => p.isPrimary || p.isSaved !== false);
            if (savedPlayers.length > 0) {
              const savedIds = new Set(savedPlayers.map((p) => p.id));
              const nextActiveId = savedIds.has(disk.players.activePlayerId)
                ? disk.players.activePlayerId
                : savedPlayers[0].id;
              const nextStats =
                disk.players.playerStats && typeof disk.players.playerStats === 'object'
                  ? disk.players.playerStats
                  : usePlayerStore.getState().playerStats;

              lastSavedPlayersSection = {
                activePlayerId: nextActiveId,
                players: savedPlayers,
                playerStats: nextStats,
              };

              usePlayerStore.setState((prev) => ({
                ...prev,
                activePlayerId: nextActiveId,
                players: savedPlayers,
                playerStats: {
                  ...prev.playerStats,
                  ...nextStats,
                },
              }));
            }
          }

          if (disk.replay) {
            useReplayStore.setState((prev) => ({
              ...prev,
              autoStartCamera:
                typeof disk.replay?.autoStartCamera === 'boolean'
                  ? disk.replay.autoStartCamera
                  : prev.autoStartCamera,
              selectedDeviceId:
                typeof disk.replay?.selectedDeviceId === 'string'
                  ? disk.replay.selectedDeviceId
                  : prev.selectedDeviceId,
              boardCameraMode: 'autodarts',
              boardCameraDeviceId:
                typeof disk.replay?.boardCameraDeviceId === 'string'
                  ? disk.replay.boardCameraDeviceId
                  : prev.boardCameraDeviceId,
              autodartsCamIndex:
                typeof disk.replay?.autodartsCamIndex === 'number'
                  ? disk.replay.autodartsCamIndex
                  : prev.autodartsCamIndex,
              autodartsCamCustomUrl:
                typeof disk.replay?.autodartsCamCustomUrl === 'string'
                  ? disk.replay.autodartsCamCustomUrl
                  : prev.autodartsCamCustomUrl,
              includeAudio:
                typeof disk.replay?.includeAudio === 'boolean'
                  ? disk.replay.includeAudio
                  : prev.includeAudio,
              saveDir: disk.replay?.saveDir || prev.saveDir,
              triggers: disk.replay?.triggers
                ? { ...prev.triggers, ...disk.replay.triggers }
                : prev.triggers,
              playbackRate: disk.replay?.playbackRate || prev.playbackRate,
            }));
          }
        } finally {
          isApplyingDiskState = false;
        }

        lastSerializedPayload = buildDashboardPayload().comparisonKey;
        hasHydratedFromDisk = true;
        return true;
      }

      // First run: disk file does not exist yet — seed ./data/dashboard-state.json from current stores
      hasHydratedFromDisk = true;
      const { comparisonKey, body } = buildDashboardPayload();
      const seeded = await postDashboardSnapshot(body, false);
      if (seeded) {
        lastSerializedPayload = comparisonKey;
      }
      return true;
    } catch {
      hasHydratedFromDisk = true;
      return false;
    } finally {
      hydrationPromise = null;
    }
  })();

  return hydrationPromise;
}

/**
 * Starts continuous disk persistence for layout, hidden widgets, settings, saved players,
 * and replay preferences. Call once in `KioskApp`.
 */
export function startDashboardDiskSync(): () => void {
  // Layout changes (hide/show/reorder/span) save almost immediately (60ms)
  const unsubLayout = useLayoutStore.subscribe(() => {
    scheduleDashboardDiskSave(60);
  });
  const unsubSettings = useSettingsStore.subscribe(() => {
    scheduleDashboardDiskSave(150);
  });
  const unsubPlayer = usePlayerStore.subscribe((state) => {
    if (!state.isPartyMode) {
      scheduleDashboardDiskSave(350);
    }
  });
  const unsubReplay = useReplayStore.subscribe(() => {
    scheduleDashboardDiskSave(200);
  });

  const handleBeforeUnload = () => flushDashboardStateToDisk();
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      flushDashboardStateToDisk();
    }
  };

  window.addEventListener('beforeunload', handleBeforeUnload);
  window.addEventListener('pagehide', handleBeforeUnload);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    unsubLayout();
    unsubSettings();
    unsubPlayer();
    unsubReplay();
    window.removeEventListener('beforeunload', handleBeforeUnload);
    window.removeEventListener('pagehide', handleBeforeUnload);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    flushDashboardStateToDisk();
  };
}
