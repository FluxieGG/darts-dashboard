import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Header } from './components/layout/Header';
import { BentoGrid } from './components/layout/BentoGrid';
import { OnlineMatchFullscreenArena } from './components/online/OnlineMatchFullscreenArena';
import { DartCounterKioskArena } from './components/online/DartCounterKioskArena';
import { SettingsModal } from './components/layout/SettingsModal';
import { RemoteQrModal } from './components/remote/RemoteQrModal';
import { MobileRemoteView } from './components/remote/MobileRemoteView';
import { DevConsoleQrModal } from './components/dev/DevConsoleQrModal';
import { MobileDevConsoleView } from './components/dev/MobileDevConsoleView';
import { ActionReplayOverlay } from './components/replay/ActionReplayOverlay';
import { AppErrorBoundary } from './components/common/AppErrorBoundary';
import { KioskBootScreen } from './components/layout/KioskBootScreen';
import { GamesLobby } from './games/components/GamesLobby';
import { PracticeLobby } from './games/components/PracticeLobby';
import { GameHost } from './games/components/GameHost';
import { useSettingsStore } from './store/useSettingsStore';
import { useLiveBoardStore } from './store/useLiveBoardStore';
import { usePlayerStore } from './store/usePlayerStore';
import { useGameStore } from './store/useGameStore';
import { useCareerStore } from './store/useCareerStore';
import { isDartCounterClippingDisabled, useReplayStore } from './store/useReplayStore';
import { useOnlineMatchStore } from './store/useOnlineMatchStore';
import { useReplayAutoTrigger } from './hooks/useReplayAutoTrigger';
import { useOnlineMatchSync } from './hooks/useOnlineMatchSync';
import { useDartCounterBridge } from './services/dartCounterBridge';
import { LocalBoardManagerService } from './services/localBoardManager';
import { generateSimulatedThrow } from './services/simulator';
import { useKioskRemoteBridge } from './services/remoteBridge';
import { useKioskDevBridge } from './services/devLogger';
import {
  hydrateDashboardStateFromDisk,
  startDashboardDiskSync,
} from './services/dashboardPersistence';
import { DEFAULT_DART_COLOR, hexToRgbTriplet } from './lib/playerThemes';
import { Trophy } from 'lucide-react';

const KioskApp: React.FC = () => {
  const dataMode = useSettingsStore((s) => s.dataMode);
  const localWsUrl = useSettingsStore((s) => s.localWsUrl);
  const localHttpUrl = useSettingsStore((s) => s.localHttpUrl);
  const isAutoSimulating = useSettingsStore((s) => s.isAutoSimulating);
  const autoSimIntervalMs = useSettingsStore((s) => s.autoSimIntervalMs);
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
  const isOnlineMatchActive = useOnlineMatchStore((s) => s.isActive);
  const isOnlineMatchFullscreen = useOnlineMatchStore((s) => s.isFullscreenKiosk);
  const onlineMatchSource = useOnlineMatchStore((s) => s.source);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRemoteQrOpen, setIsRemoteQrOpen] = useState(false);
  const [isDevQrOpen, setIsDevQrOpen] = useState(false);
  const [isLocalConnected, setIsLocalConnected] = useState(false);
  const [isBootingKiosk, setIsBootingKiosk] = useState(true);

  const { connectedRemotes } = useKioskRemoteBridge(isLocalConnected);
  const { connectedDevs } = useKioskDevBridge(isLocalConnected, connectedRemotes);
  useReplayAutoTrigger();
  useOnlineMatchSync();
  useDartCounterBridge();

  const boardServiceRef = useRef<LocalBoardManagerService | null>(null);
  const startupHydratedRef = useRef(false);
  const handleBootComplete = useCallback(() => setIsBootingKiosk(false), []);

  // Kiosk Keyboard Shortcuts:
  // - F                 -> Instant Fullscreen Kiosk Mode toggle (ignores editable fields)
  // - Ctrl + Shift + D  -> PIN 0161 Dev Console QR Modal
  // - Ctrl + Shift + S  -> Emergency Hardware Settings Modal (e.g. USB webcam dropdown)
  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target.isContentEditable
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setIsDevQrOpen(true);
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setIsSettingsOpen((prev) => !prev);
      } else if (
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey &&
        e.key.toLowerCase() === 'f' &&
        !isEditableTarget(e.target)
      ) {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
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

  // Hydrate Saved Dashboard Layout/Settings/Players, Career Vault & Saved Clips on startup
  // and keep dashboard layout/data continuously persisted to ./data/dashboard-state.json
  useEffect(() => {
    let stopSync: (() => void) | null = null;
    let cancelled = false;
    startupHydratedRef.current = true;

    void hydrateDashboardStateFromDisk().then(() => {
      if (!cancelled) {
        stopSync = startDashboardDiskSync();
        // Immediately enable Split-Cam on boot (deduplicated with KioskBootScreen; skipped while in DartCounter)
        const replay = useReplayStore.getState();
        if (replay.autoStartCamera && replay.status === 'idle' && !isDartCounterClippingDisabled()) {
          void replay.startCamera();
        }
      }
    });
    void hydrateVault();
    void loadSavedClips();

    return () => {
      cancelled = true;
      stopSync?.();
    };
  }, [hydrateVault, loadSavedClips]);

  // Fallback hydration if somehow mount effect did not run before exiting KioskBootScreen
  useEffect(() => {
    if (!isBootingKiosk && !startupHydratedRef.current) {
      startupHydratedRef.current = true;
      void hydrateDashboardStateFromDisk();
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

  const isDartCounterClippingOff =
    activeView === 'dartcounter' ||
    (isOnlineMatchActive && onlineMatchSource === 'dartcounter');

  // Automatically disable & pause Oche-Cam / Action Replay clipping whenever in DartCounter
  // (frees 100% of camera/MediaRecorder CPU & RAM so DartCounter + auto-scoring never lag or crash),
  // and cleanly resume when returning to Dashboard / Arcade / Practice!
  useEffect(() => {
    const replay = useReplayStore.getState();
    if (isDartCounterClippingOff) {
      replay.pauseForDartCounter();
    } else {
      replay.resumeFromDartCounter();
    }
  }, [isDartCounterClippingOff]);

  const isDartCounterTheme =
    activeView === 'dartcounter' ||
    (activeView === 'dashboard' &&
      isOnlineMatchActive &&
      isOnlineMatchFullscreen &&
      onlineMatchSource === 'dartcounter');

  const isTurnTintActive = activeView === 'game-active' && Boolean(activeTurnPlayerColor);
  const resolvedTintHex = isDartCounterTheme
    ? undefined
    : isTurnTintActive
    ? activeTurnPlayerColor!
    : !isPartyMode
    ? activePlayer?.dartColor || DEFAULT_DART_COLOR
    : undefined;

  const rootStyle = resolvedTintHex
    ? ({
        '--player-tint-rgb': hexToRgbTriplet(resolvedTintHex),
        '--player-tint-hex': resolvedTintHex,
      } as React.CSSProperties)
    : undefined;

  return (
    <div
      data-theme={isDartCounterTheme ? 'dartcounter' : isPartyMode ? 'party' : 'default'}
      data-player-tint={!isDartCounterTheme && !isPartyMode && Boolean(resolvedTintHex) ? 'on' : 'off'}
      data-turn-tint={!isDartCounterTheme && isTurnTintActive ? 'on' : 'off'}
      style={rootStyle}
      className={`min-h-screen flex flex-col font-sans select-none antialiased transition-colors duration-300 ${
        isDartCounterTheme
          ? 'bg-[#F4F5F7] text-[#111827]'
          : 'bg-[#0B0F17] text-slate-100'
      }`}
    >
      {/* Ordered Kiosk Boot Sequence (Vault -> Board 3180 -> iPad Relay -> Split-Cam) */}
      {isBootingKiosk && (
        <KioskBootScreen
          isLocalConnected={isLocalConnected}
          onComplete={handleBootComplete}
        />
      )}

      {/* Pure Broadcast Kiosk Header (Secret 5-tap on AD crest opens PIN 0161 Dev QR) */}
      <Header
        onOpenRemoteQr={() => setIsRemoteQrOpen(true)}
        onTriggerSecretDev={() => setIsDevQrOpen(true)}
        connectedRemotes={connectedRemotes}
        isLocalConnected={isLocalConnected}
      />

      {/* Main Content View: Dashboard Bento Grid | Target DartCounter Arena | Arcade | Solo Training | Active Game */}
      <div className="flex-1 pb-8">
        {activeView === 'dashboard' &&
          (isOnlineMatchActive && isOnlineMatchFullscreen ? (
            onlineMatchSource === 'dartcounter' ? (
              <DartCounterKioskArena />
            ) : (
              <OnlineMatchFullscreenArena />
            )
          ) : (
            <BentoGrid />
          ))}
        {activeView === 'dartcounter' && <DartCounterKioskArena />}
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
      <AppErrorBoundary
        mode="silent"
        label="Action Replay Overlay"
        onError={() => useReplayStore.getState().closeOverlayClip()}
      >
        <ActionReplayOverlay />
      </AppErrorBoundary>

      {/* Passive Objective Completed Toast Banner */}
      {recentlyCompletedObjective && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 px-6 py-3.5 rounded-2xl bg-emerald-950/95 border-2 border-emerald-400/70 text-emerald-100 shadow-[0_0_32px_rgba(16,185,129,0.5)] flex items-center gap-3 animate-in fade-in zoom-in-95 pointer-events-none">
          <Trophy className="w-5 h-5 text-amber-300 shrink-0" />
          <span className="text-sm sm:text-base font-black tracking-tight">
            {recentlyCompletedObjective}
          </span>
        </div>
      )}

      {/* Broadcast Footer (adapts to DartCounter Light / Party / Dark-Night themes) */}
      <footer
        className={`border-t py-2 px-4 sm:px-6 text-center text-[11px] font-mono flex items-center justify-between transition-colors ${
          isDartCounterTheme
            ? 'bg-white border-slate-200 text-slate-500'
            : isPartyMode
            ? 'border-purple-400/15 text-purple-300/75'
            : 'border-white/[0.05] text-slate-600'
        }`}
      >
        <div className="flex items-center gap-3">
          {isDartCounterTheme ? (
            <span className="flex items-center gap-1.5 text-[#F76505] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F76505]" />
              Target DartCounter • Autodarts Auto-Scorer Active • Clipping Disabled
            </span>
          ) : isPartyMode ? (
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
            {isDartCounterTheme
              ? 'Use app.dartcounter.net/match • Confirm scores via iPad Oche Deck'
              : isPartyMode
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
