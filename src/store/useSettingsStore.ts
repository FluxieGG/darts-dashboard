import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DataConnectionMode } from '../types/config';

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

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      dataMode: (import.meta.env.VITE_DEFAULT_DATA_MODE as DataConnectionMode) || 'local',
      localWsUrl: (import.meta.env.VITE_BOARD_MANAGER_WS as string) || 'ws://127.0.0.1:3180/api/events',
      localHttpUrl: (import.meta.env.VITE_BOARD_MANAGER_HTTP as string) || 'http://127.0.0.1:3180/api/state',
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
    }
  )
);
