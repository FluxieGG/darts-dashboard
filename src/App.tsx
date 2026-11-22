import React, { useEffect, useState, useRef } from 'react';
import { Header } from './components/layout/Header';
import { BentoGrid } from './components/layout/BentoGrid';
import { LayoutDrawer } from './components/layout/LayoutDrawer';
import { SettingsModal } from './components/layout/SettingsModal';
import { useSettingsStore } from './store/useSettingsStore';
import { useLiveBoardStore } from './store/useLiveBoardStore';
import { usePlayerStore } from './store/usePlayerStore';
import { LocalBoardManagerService } from './services/localBoardManager';
import { generateSimulatedThrow } from './services/simulator';

export const App: React.FC = () => {
  const { dataMode, localWsUrl, localHttpUrl, isAutoSimulating, autoSimIntervalMs } =
    useSettingsStore();
  const syncBoardThrows = useLiveBoardStore((s) => s.syncBoardThrows);
  const addSimulatedDart = useLiveBoardStore((s) => s.addSimulatedDart);
  const completeVisit = useLiveBoardStore((s) => s.completeVisit);
  const activePlayerId = usePlayerStore((s) => s.activePlayerId);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLocalConnected, setIsLocalConnected] = useState(false);

  const boardServiceRef = useRef<LocalBoardManagerService | null>(null);

  // Purge legacy v1 mock localStorage keys once so old mock data / Dave never linger
  useEffect(() => {
    try {
      localStorage.removeItem('autodarts_dashboard_players_v1');
      localStorage.removeItem('autodarts_dashboard_settings_v1');
      localStorage.removeItem('autodarts_dashboard_layout_v1');
      localStorage.removeItem('autodarts_dashboard_layout_v2');
      localStorage.removeItem('autodarts_dashboard_layout_v3');
    } catch {
      // ignore storage errors
    }
  }, []);

  // Manage Local Autodarts Board Manager connection (port 3180)
  useEffect(() => {
    if (dataMode === 'local') {
      const service = new LocalBoardManagerService({
        wsUrl: localWsUrl,
        httpUrl: localHttpUrl,
        pollIntervalMs: 500,
        onConnectionChange: (connected) => {
          setIsLocalConnected(connected);
        },
        onVisitSync: (throws, status, event) => {
          syncBoardThrows(throws, status, event);
        },
        onVisitCompleted: (throws) => {
          completeVisit(throws);
        },
      });

      boardServiceRef.current = service;
      service.connect();

      return () => {
        service.disconnect();
        boardServiceRef.current = null;
      };
    } else {
      setIsLocalConnected(false);
      if (boardServiceRef.current) {
        boardServiceRef.current.disconnect();
        boardServiceRef.current = null;
      }
    }
  }, [dataMode, localWsUrl, localHttpUrl, syncBoardThrows, completeVisit]);

  // Manage Demo Auto Simulator Interval (only when explicitly in Demo mode)
  useEffect(() => {
    if (!isAutoSimulating || dataMode !== 'demo') return;

    const interval = setInterval(() => {
      const currentThrows = useLiveBoardStore.getState().currentVisitThrows;
      const dartIndex = currentThrows.length % 3;
      const targets = ['T20', 'T20', 'T19', 'T18', 'D20', 'Bull', 'S20', 'T20'];
      const chosen = targets[Math.floor(Math.random() * targets.length)];
      const dart = generateSimulatedThrow(chosen, dartIndex, 0.046);
      addSimulatedDart(dart);
    }, autoSimIntervalMs);

    return () => clearInterval(interval);
  }, [isAutoSimulating, dataMode, autoSimIntervalMs, addSimulatedDart, activePlayerId]);

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col font-sans select-none antialiased">
      {/* Pinned Top Header */}
      <Header
        onOpenSettings={() => setIsSettingsOpen(true)}
        isLocalConnected={isLocalConnected}
      />

      {/* Main Responsive Bento Grid */}
      <div className="flex-1 pb-10">
        <BentoGrid />
      </div>

      {/* Slide-out Layout Customizer Drawer */}
      <LayoutDrawer />

      {/* Settings & Connection Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isLocalConnected={isLocalConnected}
      />

      {/* Kiosk Footer Bar */}
      <footer className="border-t border-white/[0.05] py-2 px-4 sm:px-6 text-center text-[11px] font-mono text-slate-600 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60" />
            Oche Distance: 2.37m (7' 9¼")
          </span>
          <span className="hidden sm:inline">•</span>
          <span className="hidden sm:inline">Bull Height: 1.73m (5' 8")</span>
        </div>
        <div>
          <span>Autodarts Bento v1.0 • F11 for Kiosk Fullscreen</span>
        </div>
      </footer>
    </div>
  );
};
