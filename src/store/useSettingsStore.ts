import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DataConnectionMode } from '../types/config';
import { safeLocalStorage } from '../lib/storage';

interface SettingsState {
  dataMode: DataConnectionMode;
  localWsUrl: string;
  localHttpUrl: string;
  cloudClientId: string;
  cloudRedirectUri: string;
  heatmapMode: 'dots' | 'density' | 'both';
  isAutoSimulating: boolean;
  autoSimIntervalMs: number;
  showDevCoords: boolean;

  // Actions
  setDataMode: (mode: DataConnectionMode) => void;
  setLocalWsUrl: (url: string) => void;
  setLocalHttpUrl: (url: string) => void;
  setCloudClientId: (clientId: string) => void;
  setHeatmapMode: (mode: 'dots' | 'density' | 'both') => void;
  setIsAutoSimulating: (active: boolean) => void;
  toggleAutoSimulating: () => void;
  setShowDevCoords: (show: boolean) => void;
}

function migrateLocalBoardUrl(rawUrl: string, fallbackPath: string): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return fallbackPath;
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

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      dataMode: (import.meta.env.VITE_DEFAULT_DATA_MODE as DataConnectionMode) || 'local',
      localWsUrl: migrateLocalBoardUrl(
        (import.meta.env.VITE_BOARD_MANAGER_WS as string) || '/api/board/api/events',
        '/api/board/api/events'
      ),
      localHttpUrl: migrateLocalBoardUrl(
        (import.meta.env.VITE_BOARD_MANAGER_HTTP as string) || '/api/board/api/state',
        '/api/board/api/state'
      ),
      cloudClientId: (import.meta.env.VITE_AUTODARTS_CLIENT_ID as string) || '',
      cloudRedirectUri:
        (import.meta.env.VITE_AUTODARTS_REDIRECT_URI as string) ||
        `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`,
      heatmapMode: 'both',
      isAutoSimulating: false,
      autoSimIntervalMs: 2500,
      showDevCoords: false,

      setDataMode: (dataMode) => set({ dataMode }),
      setLocalWsUrl: (localWsUrl) => set({ localWsUrl }),
      setLocalHttpUrl: (localHttpUrl) => set({ localHttpUrl }),
      setCloudClientId: (cloudClientId) => set({ cloudClientId }),
      setHeatmapMode: (heatmapMode) => set({ heatmapMode }),
      setIsAutoSimulating: (isAutoSimulating) => set({ isAutoSimulating }),
      toggleAutoSimulating: () => set((s) => ({ isAutoSimulating: !s.isAutoSimulating })),
      setShowDevCoords: (showDevCoords) => set({ showDevCoords }),
    }),
    {
      name: 'autodarts_dashboard_settings_v2',
      storage: createJSONStorage(() => safeLocalStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.localWsUrl = migrateLocalBoardUrl(state.localWsUrl, '/api/board/api/events');
          state.localHttpUrl = migrateLocalBoardUrl(state.localHttpUrl, '/api/board/api/state');
        }
      },
    }
  )
);
