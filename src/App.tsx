import React, { useEffect, useState, useRef } from 'react';
import { Header } from './components/layout/Header';
import { BentoGrid } from './components/layout/BentoGrid';
import { SettingsModal } from './components/layout/SettingsModal';
import { RemoteQrModal } from './components/remote/RemoteQrModal';
import { MobileRemoteView } from './components/remote/MobileRemoteView';
import { DevConsoleQrModal } from './components/dev/DevConsoleQrModal';
import { MobileDevConsoleView } from './components/dev/MobileDevConsoleView';
import { ActionReplayOverlay } from './components/replay/ActionReplayOverlay';
import { KioskBootScreen } from './components/layout/KioskBootScreen';
import { GamesLobby } from './games/components/GamesLobby';
import { PracticeLobby } from './games/components/PracticeLobby';
import { GameHost } from './games/components/GameHost';
import { useSettingsStore } from './store/useSettingsStore';
import { useLiveBoardStore } from './store/useLiveBoardStore';
import { usePlayerStore } from './store/usePlayerStore';
import { useGameStore } from './store/useGameStore';
import { useCareerStore } from './store/useCareerStore';
import { useReplayStore } from './store/useReplayStore';
import { useReplayAutoTrigger } from './hooks/useReplayAutoTrigger';
import { useOnlineMatchSync } from './hooks/useOnlineMatchSync';
import { LocalBoardManagerService } from './services/localBoardManager';
import { generateSimulatedThrow } from './services/simulator';
import { useKioskRemoteBridge } from './services/remoteBridge';
import { useKioskDevBridge } from './services/devLogger';
import { DEFAULT_DART_COLOR, hexToRgbTriplet } from './lib/playerThemes';
import { Trophy } from 'lucide-react';

const KioskApp: React.FC = () => {
  const { dataMode, localWsUrl, localHttpUrl, isAutoSimulating, autoSimIntervalMs } =
    useSettingsStore();
  const syncBoardThrows = useLiveBoardStore((s) => s.syncBoardThrows);
  const addSimulatedDart = useLiveBoardStore((s) => s.addSimulatedDart);
  const completeVisit = useLiveBoardStore((s) => s.completeVisit);
  const activePlayerId = usePlayerStore((s) => s.activePlayerId);
  const activePlayer = usePlayerStore((s) => s.getActivePlayer());
  const isPartyMode = usePlayerStore((s) => s.isPartyMode);
  const activeView = useGameStore((s) => s.activeView);
  const activeTurnPlayerColor = useGameStore((s) => s.activeTurnPlayerColor);
  const hydrateVault = useCareerStore((s) => s.hydrateVault);
  const recentlyCompletedObjective = useCareerStore((s) => s.recentlyCompletedObjective);
  const dismissObjectiveToast = useCareerStore((s) => s.dismissObjectiveToast);
  const loadSavedClips = useReplayStore((s) => s.loadSavedClips);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRemoteQrOpen, setIsRemoteQrOpen] = useState(false);
  const [isDevQrOpen, setIsDevQrOpen] = useState(false);
  const [isLocalConnected, setIsLocalConnected] = useState(false);
  const [isBootingKiosk, setIsBootingKiosk] = useState(true);

  const { connectedRemotes } = useKioskRemoteBridge(isLocalConnected);
  const { connectedDevs } = useKioskDevBridge(isLocalConnected, connectedRemotes);
  useReplayAutoTrigger();
  useOnlineMatchSync();

  const boardServiceRef = useRef<LocalBoardManagerService | null>(null);

  // Hidden Kiosk Keyboard Shortcuts:
  // - Ctrl + Shift + D -> PIN 0161 Dev Console QR Modal
  // - Ctrl + Shift + S -> Emergency Hardware Settings Modal (e.g. USB webcam dropdown)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setIsDevQrOpen(true);
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setIsSettingsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Auto-dismiss live objective celebration banner after 6.5s (no touch needed on kiosk TV)
  useEffect(() => {
    if (!recentlyCompletedObjective) return;
    const timer = window.setTimeout(() => {
      dismissObjectiveToast();
    }, 6500);
    return () => window.clearTimeout(timer);
  }, [recentlyCompletedObjective, dismissObjectiveToast]);

  // Hydrate Career Vault & Saved Clips immediately on startup so restarts never miss disk clips
  useEffect(() => {
    void hydrateVault();
    void loadSavedClips();
  }, [hydrateVault, loadSavedClips]);

  // Fallback hydration if user skips KioskBootScreen early
  useEffect(() => {
    if (!isBootingKiosk) {
      void hydrateVault();
      void loadSavedClips();
    }
  }, [isBootingKiosk, hydrateVault, loadSavedClips]);

  // Purge legacy v1 mock localStorage keys once so old mock data never lingers
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

  const isTurnTintActive = activeView === 'game-active' && Boolean(activeTurnPlayerColor);
  const resolvedTintHex = isTurnTintActive
    ? activeTurnPlayerColor!
    : !isPartyMode
    ? activePlayer.dartColor || DEFAULT_DART_COLOR
    : undefined;

  const rootStyle = resolvedTintHex
    ? ({
        '--player-tint-rgb': hexToRgbTriplet(resolvedTintHex),
        '--player-tint-hex': resolvedTintHex,
      } as React.CSSProperties)
    : undefined;

  return (
    <div
      data-theme={isPartyMode ? 'party' : 'default'}
      data-player-tint={!isPartyMode && Boolean(resolvedTintHex) ? 'on' : 'off'}
      data-turn-tint={isTurnTintActive ? 'on' : 'off'}
      style={rootStyle}
      className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col font-sans select-none antialiased transition-colors duration-300"
    >
      {/* Ordered Kiosk Boot Sequence (Vault -> Board 3180 -> iPad Relay -> Split-Cam) */}
      {isBootingKiosk && (
        <KioskBootScreen
          isLocalConnected={isLocalConnected}
          onComplete={() => setIsBootingKiosk(false)}
        />
      )}

      {/* Pure Broadcast Kiosk Header (Secret 5-tap on AD crest opens PIN 0161 Dev QR) */}
      <Header
        onOpenRemoteQr={() => setIsRemoteQrOpen(true)}
        onTriggerSecretDev={() => setIsDevQrOpen(true)}
        connectedRemotes={connectedRemotes}
        isLocalConnected={isLocalConnected}
      />

      {/* Main Content View: Dashboard Bento Grid | Tech Darts Arcade | Solo Training | Active Game */}
      <div className="flex-1 pb-8">
        {activeView === 'dashboard' && <BentoGrid />}
        {activeView === 'games-lobby' && (
          <GamesLobby isLocalConnected={isLocalConnected} />
        )}
        {activeView === 'practice-lobby' && (
          <PracticeLobby isLocalConnected={isLocalConnected} />
        )}
        {activeView === 'game-active' && (
          <GameHost isLocalConnected={isLocalConnected} />
        )}
      </div>

      {/* Emergency Keyboard-Only Settings Modal (Ctrl + Shift + S) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isLocalConnected={isLocalConnected}
      />

      {/* iPad Oche Deck QR Pairing Modal (accessible when no iPad is connected) */}
      <RemoteQrModal
        isOpen={isRemoteQrOpen}
        onClose={() => setIsRemoteQrOpen(false)}
        connectedRemotes={connectedRemotes}
      />

      {/* Hidden PIN-Protected Dev Console QR Modal (Code: 0161) */}
      <DevConsoleQrModal
        isOpen={isDevQrOpen}
        onClose={() => setIsDevQrOpen(false)}
        connectedDevs={connectedDevs}
      />

      {/* Full-Viewport Broadcast Side-by-Side Action Replay Overlay */}
      <ActionReplayOverlay />

      {/* Passive Objective Completed Toast Banner */}
      {recentlyCompletedObjective && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 px-6 py-3.5 rounded-2xl bg-emerald-950/95 border-2 border-emerald-400/70 text-emerald-100 shadow-[0_0_32px_rgba(16,185,129,0.5)] flex items-center gap-3 animate-in fade-in zoom-in-95 pointer-events-none">
          <Trophy className="w-5 h-5 text-amber-300 shrink-0" />
          <span className="text-sm sm:text-base font-black tracking-tight">
            {recentlyCompletedObjective}
          </span>
        </div>
      )}

      {/* Calm Dark-Night Broadcast Footer */}
      <footer
        className={`border-t py-2 px-4 sm:px-6 text-center text-[11px] font-mono flex items-center justify-between transition-colors ${
          isPartyMode
            ? 'border-purple-400/15 text-purple-300/75'
            : 'border-white/[0.05] text-slate-600'
        }`}
      >
        <div className="flex items-center gap-3">
          {isPartyMode ? (
            <span className="flex items-center gap-1.5 text-amber-300/90 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Party Mode Active • Personal Stats Protected
            </span>
          ) : (
            <>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60" />
                Oche Distance: 2.37m (7' 9¼")
              </span>
              <span className="hidden sm:inline">•</span>
              <span className="hidden sm:inline">Bull Height: 1.73m (5' 8")</span>
            </>
          )}
        </div>
        <div>
          <span>
            {isPartyMode
              ? 'Vice Party Session • Controlled via iPad Oche Deck'
              : 'Autodarts Broadcast Kiosk • Controlled via iPad Oche Deck'}
          </span>
        </div>
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  const params =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;

  if (params?.get('dev') === '1') {
    return <MobileDevConsoleView />;
  }

  if (params?.get('remote') === '1') {
    return <MobileRemoteView />;
  }

  return <KioskApp />;
};
