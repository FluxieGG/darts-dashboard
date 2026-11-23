import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RemoteCommand, RemoteKioskState, RemotePresencePayload } from '../../types/remote';
import { ReplayClipCategory, ReplayTriggerSettings } from '../../types/replay';
import { sendRemoteCommand } from '../../services/remoteBridge';
import { getArcadeGames, getPracticeDrills, getGameDefinition } from '../../games/gameRegistry';
import { DART_COLOR_OPTIONS, DEFAULT_DART_COLOR, hexToRgbTriplet } from '../../lib/playerThemes';
import { DevConsoleQrModal } from '../dev/DevConsoleQrModal';
import { GameCompanionScreen } from './GameCompanionScreen';
import { DartCounterRemoteScreen } from './DartCounterRemoteScreen';
import { DartCounterIcon } from '../common/DartCounterIcon';
import { Badge } from '../common/Badge';
import {
  Gamepad2,
  LayoutDashboard,
  PartyPopper,
  Square,
  Undo2,
  RotateCcw,
  Volume2,
  VolumeX,
  ArrowRight,
  Users,
  UserPlus,
  Play,
  Crosshair,
  Sliders,
  X,
  Trash2,
  Wifi,
  ShieldCheck,
  Trophy,
  Clapperboard,
  RefreshCw,
  Save,
  CheckCircle2,
  Video,
  VideoOff,
  Columns2,
  Gauge,
  Monitor,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Minimize2,
  Flame,
  Palette,
  FlaskConical,
  Target,
  Dices,
  BookOpen,
  AlertTriangle,
  Camera,
} from 'lucide-react';
import { cn } from '../../lib/utils';

type MobileTab = 'control' | 'mode' | 'players' | 'replays' | 'display';
type TabletRightPanel = 'mode' | 'players' | 'replays' | 'display';
type AppMode = 'dashboard' | 'arcade' | 'practice' | 'dartcounter';
type ClipFilter = 'all' | ReplayClipCategory;

const QUICK_TARGETS = ['T20', 'S20', 'T19', 'T18', 'D20', 'D16', 'Bull', '25', 'Miss'] as const;
const BOARD_NUMBERS = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const;

const TRIGGER_ITEMS: Array<{ key: keyof ReplayTriggerSettings; label: string }> = [
  { key: 'onBullseye', label: 'Bullseye' },
  { key: 'onT20', label: 'Treble 20' },
  { key: 'onTonPlus', label: '100+ Visit' },
  { key: 'on140Plus', label: '140+ / 180' },
  { key: 'autoShowOverlay', label: 'Auto-Pop TV' },
];

/**
 * iPad-First Oche Command Deck (and responsive Phone Remote) at `/?remote=1`.
 *
 * Holds 100% of Kiosk controls: Games, Setup, Players & Darts Colours, Split-Cam Replays & Gallery,
 * Bento Layout, Heatmap, Objectives, Data Mode, and Kiosk Fullscreen.
 * Secret Dev Console PIN (0161) QR Modal: tap the `AD` crest 5 times quickly.
 */
export const MobileRemoteView: React.FC = () => {
  const [state, setState] = useState<RemoteKioskState | null>(null);
  const [connected, setConnected] = useState(false);
  const [kioskOnline, setKioskOnline] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('control');
  const [tabletRightPanel, setTabletRightPanel] = useState<TabletRightPanel>('mode');
  const [toast, setToast] = useState<string | null>(null);

  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerColor, setNewPlayerColor] = useState<string>(DART_COLOR_OPTIONS[2].hex);
  const [saveNewPlayer, setSaveNewPlayer] = useState<boolean>(true);
  const [editingColorPlayerId, setEditingColorPlayerId] = useState<string | null>(null);

  const [throwMult, setThrowMult] = useState<'S' | 'D' | 'T'>('S');
  const [showMobileThrowPad, setShowMobileThrowPad] = useState(false);
  const [clipFilter, setClipFilter] = useState<ClipFilter>('all');
  const [diskClips, setDiskClips] = useState<RemoteKioskState['recentClips']>([]);
  const [loadingClips, setLoadingClips] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isDevQrOpen, setIsDevQrOpen] = useState(false);
  const [isCameraIssueModalOpen, setIsCameraIssueModalOpen] = useState(false);

  // Quick Online Match card (clean DartCounter Red/Green status pill + Play on Kiosk CTA)

  const eventSourceRef = useRef<EventSource | null>(null);
  const lastEventAtRef = useRef<number>(0);
  const devTapCountRef = useRef(0);
  const devTapTimerRef = useRef<number | null>(null);
  const hasAutoPoppedCameraErrorRef = useRef(false);

  // Secret 5-tap on AD crest opens the PIN 0161 Dev Debug Console QR modal
  const handleSecretCrestTap = () => {
    devTapCountRef.current += 1;
    if (devTapTimerRef.current !== null) {
      window.clearTimeout(devTapTimerRef.current);
    }
    if (devTapCountRef.current >= 5) {
      devTapCountRef.current = 0;
      setIsDevQrOpen(true);
      return;
    }
    devTapTimerRef.current = window.setTimeout(() => {
      devTapCountRef.current = 0;
    }, 2500);
  };

  const pullSavedClipsFromServer = useCallback(async () => {
    setLoadingClips(true);
    try {
      const res = await fetch('/api/replays/list', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.ok && Array.isArray(data.clips)) {
        setDiskClips(
          data.clips.map((c: Record<string, unknown>) => ({
            id: String(c.id || c.relativePath || c.filename || ''),
            filename: String(c.filename || ''),
            relativePath: c.relativePath ? String(c.relativePath) : undefined,
            subfolder: c.subfolder ? String(c.subfolder) : undefined,
            category: (c.category as ReplayClipCategory | undefined) || 'game',
            playerName: String(c.playerName || 'Player'),
            segmentName: String(c.segmentName || 'CLIP'),
            score: Number(c.score || 0),
            reason: String(c.reason || c.filename || 'Saved Clip'),
            durationSec: Number(c.durationSec || 10),
            isDualCamera: Boolean(c.isDualCamera),
            createdAt: Number(c.createdAt || Date.now()),
          }))
        );
      }
    } catch {
      // ignore offline error
    } finally {
      setLoadingClips(false);
    }
  }, []);

  const pullLatestState = useCallback(async () => {
    try {
      const res = await fetch('/api/remote/state', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.ok) {
        setConnected(true);
        setKioskOnline((data.connectedKiosks || 0) > 0 || Boolean(data.state));
        if (data.state) {
          setState(data.state as RemoteKioskState);
          lastEventAtRef.current = Date.now();
        }
      }
    } catch {
      setConnected(false);
    }
  }, []);

  const connectStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const es = new EventSource('/api/remote/stream?role=remote');
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
      lastEventAtRef.current = Date.now();
      void pullLatestState();
    };

    es.onerror = () => {
      setConnected(false);
    };

    es.addEventListener('state', (ev) => {
      try {
        const snapshot = JSON.parse((ev as MessageEvent).data) as RemoteKioskState;
        setState(snapshot);
        setConnected(true);
        setKioskOnline(true);
        lastEventAtRef.current = Date.now();
      } catch {
        // ignore
      }
    });

    es.addEventListener('presence', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as RemotePresencePayload;
        setKioskOnline((data.connectedKiosks || 0) > 0);
        lastEventAtRef.current = Date.now();
      } catch {
        // ignore
      }
    });
  }, [pullLatestState]);

  useEffect(() => {
    void pullLatestState();
    void pullSavedClipsFromServer();
    connectStream();

    // iPadOS Safari sleep/wake recovery: immediately refresh state & reopen SSE stream
    const handleWake = () => {
      if (document.visibilityState === 'visible') {
        void pullLatestState();
        void pullSavedClipsFromServer();
        if (!eventSourceRef.current || eventSourceRef.current.readyState === EventSource.CLOSED) {
          connectStream();
        }
      }
    };

    // Lightweight 3s safety poll if SSE has been silent (prevents stale iPad Safari screens)
    const safetyInterval = window.setInterval(() => {
      if (Date.now() - lastEventAtRef.current > 4000) {
        void pullLatestState();
      }
    }, 3000);

    document.addEventListener('visibilitychange', handleWake);
    window.addEventListener('focus', handleWake);

    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      window.clearInterval(safetyInterval);
      document.removeEventListener('visibilitychange', handleWake);
      window.removeEventListener('focus', handleWake);
    };
  }, [connectStream, pullLatestState]);

  const flashToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 1600);
  };

  const dispatch = async (cmd: RemoteCommand, feedbackLabel?: string) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(14);
      } catch {
        // ignore
      }
    }
    const ok = await sendRemoteCommand(cmd);
    if (feedbackLabel) {
      flashToast(ok ? feedbackLabel : 'Kiosk unreachable — check Wi-Fi');
    }
    // Pull fresh state right after command so iPad UI updates instantaneously even if SSE lagged
    window.setTimeout(() => {
      void pullLatestState();
    }, 120);
  };

  // Refresh saved clips from disk whenever the user opens the Replays tab
  useEffect(() => {
    if (tabletRightPanel === 'replays' || mobileTab === 'replays') {
      void pullSavedClipsFromServer();
    }
  }, [tabletRightPanel, mobileTab, pullSavedClipsFromServer]);

  const handleManualResync = async () => {
    setSyncing(true);
    flashToast('Recalibrating Autodarts cameras & resyncing...');
    await sendRemoteCommand({ type: 'resync_and_recalibrate' });
    connectStream();
    await Promise.all([pullLatestState(), pullSavedClipsFromServer()]);
    window.setTimeout(() => {
      void pullLatestState();
      void pullSavedClipsFromServer();
      setSyncing(false);
      flashToast('Cameras Recalibrated & Kiosk Synced!');
    }, 1800);
  };

  const handleAddPlayerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPlayerName.trim();
    if (!trimmed) return;
    const isGameSetup = state?.activeView === 'game-active' && state.activeGame?.phase === 'setup';
    void dispatch(
      {
        type: 'add_player',
        name: trimmed,
        addToRoster: isGameSetup,
        dartColor: newPlayerColor,
        isSaved: saveNewPlayer,
      },
      `Added ${trimmed}`
    );
    setNewPlayerName('');
    const nextIdx =
      (DART_COLOR_OPTIONS.findIndex((c) => c.hex === newPlayerColor) + 1) %
      DART_COLOR_OPTIONS.length;
    setNewPlayerColor(DART_COLOR_OPTIONS[nextIdx].hex);
  };

  const isPartyMode = Boolean(state?.isPartyMode);
  const activeGame = state?.activeGame ?? null;
  const activeGameDef = activeGame ? getGameDefinition(activeGame.id) : undefined;
  const currentMode: AppMode =
    state?.activeView === 'dartcounter'
      ? 'dartcounter'
      : state?.activeView === 'practice-lobby' || activeGame?.mode === 'practice'
      ? 'practice'
      : state?.activeView === 'games-lobby' || activeGame?.mode === 'arcade'
      ? 'arcade'
      : 'dashboard';
  const isDartCounterMode = currentMode === 'dartcounter' && !activeGame;
  const pendingInviteCount = state?.onlineMatch?.dcPendingInvites?.length ?? 0;

  const handleSwitchMode = (mode: AppMode) => {
    const view =
      mode === 'dashboard'
        ? 'dashboard'
        : mode === 'dartcounter'
        ? 'dartcounter'
        : mode === 'practice'
        ? 'practice-lobby'
        : 'games-lobby';
    const label =
      mode === 'dashboard'
        ? 'Stats Dashboard'
        : mode === 'dartcounter'
        ? 'Target DartCounter'
        : mode === 'practice'
        ? 'Solo Training Mode'
        : 'Tech Darts Arcade';
    setTabletRightPanel('mode');
    setMobileTab('mode');
    void dispatch({ type: 'navigate', view }, label);
  };

  const modeTabMeta =
    currentMode === 'dashboard'
      ? { label: 'Goals', icon: Trophy }
      : currentMode === 'practice'
      ? { label: 'Drills', icon: Crosshair }
      : currentMode === 'dartcounter'
      ? { label: 'DartCounter', icon: DartCounterIcon }
      : { label: 'Games', icon: Gamepad2 };

  const activeTintHex = state?.activeTintHex ?? null;
  const isTurnTint = Boolean(activeGame && activeTintHex);
  const canUndoNow = Boolean(activeGame && activeGame.phase === 'playing' && activeGame.canUndo);
  const camBuffering = state?.replayStatus === 'buffering';
  const camCapturing = state?.replayStatus === 'capturing';
  const camActive = camBuffering || camCapturing || state?.replayStatus === 'starting';
  const hasCameraIssue = Boolean(
    state?.replayHasCameraIssue ||
      state?.replayStatus === 'error' ||
      state?.replayError ||
      state?.replayBoardFeedError
  );

  // On the FIRST camera error detected by the Kiosk, automatically pop up the iPad camera warning modal
  useEffect(() => {
    if (hasCameraIssue && !hasAutoPoppedCameraErrorRef.current) {
      hasAutoPoppedCameraErrorRef.current = true;
      setIsCameraIssueModalOpen(true);
    }
  }, [hasCameraIssue]);

  const remoteStyle = activeTintHex
    ? ({
        '--player-tint-rgb': hexToRgbTriplet(activeTintHex),
        '--player-tint-hex': activeTintHex,
      } as React.CSSProperties)
    : undefined;

  // =========================================================================
  // LEFT COLUMN / CONTROL SECTION
  // =========================================================================
  const renderLiveReadoutCard = () => (
    <section className="card-matte rounded-2xl p-4 sm:p-5 space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{
              backgroundColor: activeTintHex || state?.activePlayer.dartColor || DEFAULT_DART_COLOR,
            }}
          />
          <span className="text-xs sm:text-sm font-mono uppercase tracking-wider text-slate-200 font-black truncate">
            {activeGame
              ? `${activeGame.title} • ${activeGame.phase.toUpperCase()}`
              : state?.activeView === 'practice-lobby'
              ? 'Solo Training Mode'
              : state?.activeView === 'games-lobby'
              ? 'Tech Darts Arcade Showcase'
              : `${state?.activePlayer.name || 'Player'} • Stats Dashboard`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Play-on-Kiosk X01 Toggle — ONLY shown when a DartCounter match is loaded */}
          {state?.onlineMatch?.isActive && state.onlineMatch.source === 'dartcounter' && (
            <button
              type="button"
              onClick={() =>
                void dispatch(
                  {
                    type: 'online_match_set_fullscreen',
                    enabled: !state.onlineMatch.isFullscreenKiosk,
                  },
                  state.onlineMatch.isFullscreenKiosk
                    ? 'Exited Kiosk X01 View'
                    : `Playing ${state.onlineMatch.startScore} on Kiosk TV!`
                )
              }
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-mono font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer',
                state.onlineMatch.isFullscreenKiosk
                  ? 'bg-emerald-500/25 border-emerald-400/70 text-emerald-200 shadow-[0_0_14px_-2px_rgba(16,185,129,0.55)]'
                  : 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-400/50 text-emerald-200'
              )}
            >
              {state.onlineMatch.isFullscreenKiosk ? (
                <>
                  <Minimize2 className="w-3 h-3" />
                  <span>Exit {state.onlineMatch.startScore} TV</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 fill-current" />
                  <span>Play on Kiosk</span>
                </>
              )}
            </button>
          )}
          {state && (
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/35 text-xs font-mono font-black text-emerald-300 tabular-nums">
              3DA {state.statsSnapshot.threeDartAvg.toFixed(1)}
            </span>
          )}
          <Badge
            variant={
              state?.boardStatus === 'takeout'
                ? 'amber'
                : state?.isLocalConnected
                ? 'emerald'
                : 'slate'
            }
            size="sm"
          >
            {state?.boardStatus === 'takeout'
              ? 'PULL DARTS'
              : state?.isLocalConnected
              ? 'BOARD LIVE'
              : state?.dataMode?.toUpperCase() || 'READY'}
          </Badge>
        </div>
      </div>

      {/* Live 3-Dart Visit Pills + Total */}
      <div className="grid grid-cols-4 gap-2.5">
        {[0, 1, 2].map((idx) => {
          const dart = state?.currentVisitThrows[idx];
          return (
            <div
              key={idx}
              className={cn(
                'h-16 sm:h-20 rounded-xl border-2 flex flex-col items-center justify-center transition-all',
                dart
                  ? dart.bouncer || dart.score === 0
                    ? 'bg-rose-500/15 border-rose-400/45 text-rose-300'
                    : dart.multiplier === 3
                    ? 'bg-amber-500/20 border-amber-400/55 text-amber-300'
                    : dart.multiplier === 2
                    ? 'bg-emerald-500/20 border-emerald-400/55 text-emerald-300'
                    : 'bg-slate-800/85 border-white/20 text-white'
                  : 'bg-slate-900/50 border-dashed border-white/10 text-slate-600'
              )}
            >
              <span className="text-lg sm:text-2xl font-black font-mono leading-none">
                {dart ? dart.name : '—'}
              </span>
              {dart && (
                <span className="text-[11px] font-mono opacity-80 mt-0.5">{dart.score} pts</span>
              )}
            </div>
          );
        })}

        <div className="h-16 sm:h-20 rounded-xl bg-slate-900/90 border-2 border-white/15 flex flex-col items-center justify-center">
          <span className="text-[10px] font-mono uppercase text-slate-400">Visit</span>
          <span className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-white leading-none mt-0.5">
            {state?.visitScore ?? 0}
          </span>
        </div>
      </div>
    </section>
  );

  const renderPrimaryActions = () => (
    <div className="space-y-3">
      {/* ACTIVE REPLAY / SAVE LAST RECORDING CONTROL CARD */}
      {(state?.hasActiveReplayOverlay || state?.lastRecording) && (
        <div
          className={cn(
            'rounded-2xl p-3.5 border-2 space-y-3 transition-all',
            state.hasActiveReplayOverlay
              ? 'bg-rose-950/35 border-rose-400/65 shadow-[0_0_28px_-4px_rgba(244,63,94,0.45)]'
              : state.lastRecording?.isSaved
              ? 'bg-emerald-500/10 border-emerald-400/35'
              : 'bg-emerald-500/15 border-emerald-400/75 shadow-[0_0_24px_-4px_rgba(16,185,129,0.45)]'
          )}
        >
          {state.lastRecording && (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-mono uppercase tracking-wider font-black text-emerald-300 flex items-center gap-1.5">
                  {state.lastRecording.isSaved ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Last Clip Saved to PC
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 animate-bounce" />
                      Unsaved Replay Ready
                    </>
                  )}
                </div>
                <div className="text-sm font-bold text-white truncate mt-0.5">
                  {state.lastRecording.playerName} • {state.lastRecording.reason} (
                  {state.lastRecording.durationSec.toFixed(1)}s)
                </div>
              </div>

              {!state.lastRecording.isSaved && (
                <button
                  type="button"
                  disabled={state.isSavingReplay}
                  onClick={() =>
                    void dispatch(
                      { type: 'save_last_replay' },
                      'Saved clip to darts-autoclipper!'
                    )
                  }
                  className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider active:scale-95 transition-transform cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {state.isSavingReplay ? 'Saving...' : 'Save Clip'}
                </button>
              )}
            </div>
          )}

          {state.hasActiveReplayOverlay && (
            <div className="pt-2.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1 mr-0.5">
                  <Gauge className="w-3.5 h-3.5" />
                  Speed
                </span>
                {([0.5, 0.75, 1] as const).map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() =>
                      void dispatch({ type: 'set_replay_speed', rate }, `Replay ${rate}x`)
                    }
                    className={cn(
                      'px-2.5 py-1.5 rounded-lg text-xs font-mono font-black border cursor-pointer transition-colors',
                      state.replayPlaybackRate === rate
                        ? 'bg-emerald-500/25 border-emerald-400/65 text-emerald-200'
                        : 'bg-slate-900/90 border-white/15 text-slate-300 hover:text-white'
                    )}
                  >
                    {rate === 1 ? '1.0x' : `${rate}x`}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => void dispatch({ type: 'dismiss_replay' }, 'Closed Replay on TV')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-black text-xs uppercase tracking-wider active:scale-95 cursor-pointer"
              >
                <X className="w-4 h-4" />
                Dismiss Replay
              </button>
            </div>
          )}
        </div>
      )}

      {/* Big Touch Pads: Next Turn + Undo */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => void dispatch({ type: 'next_turn_takeout' }, 'Next Turn / Pull Darts')}
          className="card-matte p-4 sm:p-5 rounded-2xl border-amber-400/50 bg-amber-500/12 hover:bg-amber-500/20 flex flex-col items-center justify-center gap-1.5 active:scale-[0.97] transition-all cursor-pointer"
        >
          <ArrowRight className="w-7 h-7 text-amber-300" />
          <span className="text-sm sm:text-base font-black text-amber-200">Next Turn</span>
          <span className="text-[10px] font-mono text-slate-400">Commit / Pull Darts</span>
        </button>

        <button
          type="button"
          disabled={!canUndoNow}
          onClick={() => void dispatch({ type: 'undo_last_action' }, 'Undid Last Dart')}
          className={cn(
            'card-matte p-4 sm:p-5 rounded-2xl flex flex-col items-center justify-center gap-1.5 active:scale-[0.97] transition-all',
            canUndoNow
              ? 'border-sky-400/55 bg-sky-500/12 hover:bg-sky-500/20 text-sky-200 cursor-pointer'
              : 'opacity-45 text-slate-500 cursor-not-allowed'
          )}
        >
          <Undo2 className="w-7 h-7" />
          <span className="text-sm sm:text-base font-black">Undo Dart</span>
          <span className="text-[10px] font-mono text-slate-400">
            {activeGame ? (canUndoNow ? 'Tap to Undo' : 'No Moves Yet') : 'Active in Games'}
          </span>
        </button>
      </div>

      {/* Action Replay Trigger + Audio Strip */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={!camBuffering || camCapturing}
          onClick={() =>
            void dispatch(
              { type: 'trigger_manual_replay' },
              'Recording 20s Clip (15s back + 5s)!'
            )
          }
          className={cn(
            'p-3.5 rounded-2xl border flex items-center justify-center gap-2 text-xs sm:text-sm font-black transition-all active:scale-[0.97]',
            camCapturing
              ? 'bg-rose-500/25 border-rose-400/60 text-rose-200 animate-pulse'
              : camBuffering
              ? 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-400/45 text-rose-200 cursor-pointer'
              : 'card-matte opacity-45 text-slate-500 cursor-not-allowed'
          )}
        >
          <Clapperboard className="w-4 h-4" />
          <span>{camCapturing ? 'Capturing 5s...' : 'Clip That! (20s)'}</span>
        </button>

        <button
          type="button"
          onClick={() =>
            void dispatch(
              { type: 'toggle_sound' },
              state?.soundEnabled ? 'Sound Muted' : 'Sound Unmuted'
            )
          }
          className="card-matte p-3.5 rounded-2xl flex items-center justify-center gap-2 text-xs sm:text-sm font-bold text-slate-200 active:scale-[0.97] cursor-pointer"
        >
          {state?.soundEnabled ? (
            <>
              <Volume2 className="w-4 h-4 text-sky-400" />
              <span>Audio On</span>
            </>
          ) : (
            <>
              <VolumeX className="w-4 h-4 text-rose-400" />
              <span className="text-rose-300">Muted</span>
            </>
          )}
        </button>
      </div>

      {/* Contextual Game or Dashboard Utility Row */}
      <div className={cn('grid gap-3', activeGame ? 'grid-cols-3' : 'grid-cols-2')}>
        {activeGame ? (
          <>
            <button
              type="button"
              onClick={() =>
                void dispatch(
                  { type: 'toggle_rules_overlay' },
                  state?.isRulesOpen ? 'Closed Rules on TV' : 'Showing How To Play on TV'
                )
              }
              className={cn(
                'card-matte p-3 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold active:scale-[0.97] cursor-pointer transition-colors',
                state?.isRulesOpen
                  ? 'border-sky-400/65 bg-sky-500/20 text-sky-200'
                  : 'text-sky-300 hover:bg-sky-500/10'
              )}
            >
              <BookOpen className="w-4 h-4 shrink-0" />
              <span>{state?.isRulesOpen ? 'Close Rules' : 'How to Play'}</span>
            </button>
            <button
              type="button"
              onClick={() => void dispatch({ type: 'restart_match' }, 'Restarted Match')}
              className="card-matte p-3 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold text-slate-200 hover:bg-white/5 active:scale-[0.97] cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Restart</span>
            </button>
            <button
              type="button"
              onClick={() => void dispatch({ type: 'exit_game' }, 'Back to Lobby')}
              className="card-matte p-3 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/10 active:scale-[0.97] cursor-pointer"
            >
              <X className="w-4 h-4 shrink-0" />
              <span>Exit</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void dispatch({ type: 'clear_visit' }, 'Cleared Current Visit')}
              className="card-matte p-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-slate-200 hover:bg-white/5 active:scale-[0.97] cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-sky-400" />
              Clear Visit
            </button>
            <button
              type="button"
              onClick={() => void dispatch({ type: 'reset_session' }, 'Session Stats Reset')}
              className="card-matte p-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-rose-300 hover:bg-rose-500/10 active:scale-[0.97] cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              Reset Session
            </button>
          </>
        )}
      </div>
    </div>
  );

  const renderThrowPad = () => (
    <section className="card-matte rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Crosshair className="w-3.5 h-3.5 text-emerald-400" />
          Quick Throw / Correction Pad
        </span>
        <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-0.5 border border-white/10">
          {(['S', 'D', 'T'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setThrowMult(m)}
              className={cn(
                'px-2.5 py-1 rounded-md text-[11px] font-black uppercase transition-colors cursor-pointer',
                throwMult === m
                  ? m === 'T'
                    ? 'bg-amber-500 text-slate-950'
                    : m === 'D'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-sky-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              {m === 'S' ? 'Single' : m === 'D' ? 'Double' : 'Treble'}
            </button>
          ))}
        </div>
      </div>

      {/* Favorites Row */}
      <div className="grid grid-cols-3 sm:grid-cols-9 gap-1.5">
        {QUICK_TARGETS.map((target) => (
          <button
            key={target}
            type="button"
            onClick={() => void dispatch({ type: 'inject_dart', target }, `Threw ${target}`)}
            className={cn(
              'py-2.5 rounded-xl font-mono font-black text-xs border active:scale-95 transition-transform cursor-pointer',
              target === 'Miss'
                ? 'bg-rose-500/15 border-rose-400/40 text-rose-300'
                : target === 'Bull' || target.startsWith('T')
                ? 'bg-amber-500/15 border-amber-400/40 text-amber-200'
                : 'bg-slate-900/90 border-white/15 text-white'
            )}
          >
            {target}
          </button>
        ))}
      </div>

      {/* 1-20 Grid */}
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
        {BOARD_NUMBERS.map((num) => {
          const target = `${throwMult}${num}`;
          return (
            <button
              key={num}
              type="button"
              onClick={() => void dispatch({ type: 'inject_dart', target }, `Threw ${target}`)}
              className="py-2.5 rounded-xl bg-slate-900/80 border border-white/10 hover:border-white/30 font-mono font-black text-xs text-white active:scale-95 transition-transform cursor-pointer"
            >
              {throwMult}
              {num}
            </button>
          );
        })}
      </div>
    </section>
  );

  // =========================================================================
  // RIGHT PANEL 1 (CONTEXT-AWARE BY MODE):
  //   - Dashboard -> Daily & Weekly Objectives
  //   - Arcade    -> 8 Arcade Games & Match Setup
  //   - Practice  -> Solo Training Drills & Drill Setup
  // =========================================================================
  const renderObjectivesPanel = () => {
    const daily = state?.dailyObjectives || [];
    const weekly = state?.weeklyObjectives || [];
    const om = state?.onlineMatch;

    const hasDartCounterMatch = Boolean(om?.isActive && om.source === 'dartcounter');

    const renderOnlineMatchCard = () => (
      <section
        className={cn(
          'card-matte rounded-2xl p-4 space-y-3 transition-all',
          hasDartCounterMatch
            ? 'border-emerald-400/55 shadow-[0_0_24px_-6px_rgba(16,185,129,0.3)]'
            : 'border-white/10'
        )}
      >
        {/* Clean Red / Green DartCounter Status Pill */}
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-mono uppercase tracking-wider font-black text-slate-200 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-sky-400" />
            DartCounter Online
          </div>

          {hasDartCounterMatch ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/65 text-[11px] font-mono font-black text-emerald-200 shadow-[0_0_16px_-3px_rgba(16,185,129,0.55)]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Connected • Match Found
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/18 border border-rose-400/55 text-[11px] font-mono font-black text-rose-200">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              No Match Found
            </span>
          )}
        </div>

        {hasDartCounterMatch && om ? (
          <div className="space-y-3">
            {/* Compact Live DartCounter Match Summary */}
            <div className="p-3 rounded-xl bg-slate-900/90 border border-emerald-400/25 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1.5">
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full',
                      om.isPlayerTurn ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                    )}
                  />
                  <span>
                    {om.startScore} • {om.isPlayerTurn ? 'Your Throw' : `${om.opponentName}'s Turn`}
                  </span>
                </div>
                <div className="text-3xl font-black font-mono tabular-nums text-white leading-none mt-0.5">
                  {om.remaining}
                </div>
                <div className="text-[10px] font-mono text-slate-400 mt-1">
                  3DA {om.legThreeDartAvg.toFixed(1)} • {om.dartsInLeg} darts
                </div>
              </div>

              <div className="text-right space-y-1">
                <div className="text-xs font-mono font-black text-emerald-300 tabular-nums">
                  Legs {om.playerLegs} — {om.opponentLegs}
                </div>
                <div className="text-[10px] font-mono text-slate-300 truncate max-w-[140px]">
                  vs {om.opponentName}
                  {om.opponentRemaining !== null && (
                    <span className="text-sky-300 font-bold ml-1">({om.opponentRemaining})</span>
                  )}
                </div>
                {om.checkoutRoute && (
                  <div className="flex items-center justify-end gap-1 pt-0.5">
                    {om.checkoutRoute.map((step, i) => (
                      <span
                        key={`${step}-${i}`}
                        className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 text-[11px] font-mono font-black text-emerald-200"
                      >
                        {step}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Primary CTA: Play on Kiosk (Normal X01 Format with Live DartCounter Data) */}
            <button
              type="button"
              onClick={() =>
                void dispatch(
                  {
                    type: 'online_match_set_fullscreen',
                    enabled: !om.isFullscreenKiosk,
                  },
                  om.isFullscreenKiosk
                    ? 'Exited Kiosk X01 View'
                    : `Playing ${om.startScore} on Kiosk TV!`
                )
              }
              className={cn(
                'w-full py-3.5 px-4 rounded-xl border-2 font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer',
                om.isFullscreenKiosk
                  ? 'bg-slate-900 border-emerald-400/65 text-emerald-200'
                  : 'bg-emerald-500 hover:bg-emerald-400 border-emerald-300 text-slate-950 shadow-[0_0_24px_rgba(16,185,129,0.4)]'
              )}
            >
              {om.isFullscreenKiosk ? (
                <>
                  <Minimize2 className="w-4 h-4" />
                  <span>Exit Kiosk X01 View</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Play on Kiosk ({om.startScore})</span>
                </>
              )}
            </button>

            {/* 1-Tap Confirm Banner if a visit is waiting in Confirm mode */}
            {om.dcPendingVisit && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border-2 border-emerald-400/70 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono uppercase tracking-wider font-black text-emerald-300">
                      Ready for DartCounter
                    </div>
                    <div className="text-sm font-black text-white truncate">
                      {om.dcPendingVisit.isBust ? 'BUST (0)' : `${om.dcPendingVisit.score} pts`}{' '}
                      <span className="text-xs font-mono font-normal text-slate-300">
                        ({om.dcPendingVisit.throws.join(' • ')})
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void dispatch({ type: 'dc_discard_visit' }, 'Skipped Visit')}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-950/80 border border-white/15 text-[11px] font-bold text-slate-300 cursor-pointer"
                  >
                    Skip
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void dispatch(
                      { type: 'dc_confirm_visit' },
                      `Sent ${om.dcPendingVisit!.score} to DartCounter!`
                    )
                  }
                  className="w-full py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider cursor-pointer"
                >
                  Send {om.dcPendingVisit.score} to DartCounter
                </button>
              </div>
            )}

            {/* Compact Auto-Score Mode Switcher */}
            <div className="grid grid-cols-3 gap-1 pt-1">
              {(
                [
                  { id: 'auto', label: 'Auto-Score' },
                  { id: 'confirm', label: 'iPad Confirm' },
                  { id: 'read-only', label: 'Sync Only' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() =>
                    void dispatch(
                      { type: 'dc_set_mode', mode: m.id },
                      `DartCounter → ${m.label}`
                    )
                  }
                  className={cn(
                    'py-1.5 px-1.5 rounded-lg text-[10px] font-black border transition-colors cursor-pointer',
                    (om.dcMode || 'confirm') === m.id
                      ? m.id === 'auto'
                        ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                        : 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200'
                      : 'bg-slate-950/70 border-white/10 text-slate-400 hover:text-white'
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-[11px] font-mono text-slate-400 leading-snug">
            {om?.dcConnected
              ? 'Extension online — start an X01 match on app.dartcounter.net to play on Kiosk.'
              : 'Open app.dartcounter.net with the browser extension to detect a match.'}
          </p>
        )}
      </section>
    );

    const renderObjectiveCard = (
      title: string,
      period: 'daily' | 'weekly',
      items: RemoteKioskState['dailyObjectives'],
      accentText: string
    ) => (
      <section className="card-matte rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className={cn('text-xs font-mono uppercase tracking-wider font-black flex items-center gap-1.5', accentText)}>
            <Trophy className="w-3.5 h-3.5" />
            {title}
          </div>
          <button
            type="button"
            onClick={() =>
              void dispatch(
                { type: 'reroll_objectives', period },
                period === 'daily' ? 'Rerolled Daily Goals' : 'Rerolled Weekly Goals'
              )
            }
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-white/10 border border-white/10 text-[11px] font-bold text-slate-300 cursor-pointer"
          >
            <Dices className="w-3 h-3" />
            Reroll
          </button>
        </div>

        {items.length === 0 ? (
          <div className="py-4 text-center text-xs font-mono text-slate-500">
            Loading objectives from Career Vault...
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map((obj) => (
              <div
                key={obj.id}
                className={cn(
                  'p-3 rounded-xl border space-y-1.5 transition-colors',
                  obj.completed
                    ? 'bg-emerald-500/12 border-emerald-400/45'
                    : 'bg-slate-900/80 border-white/[0.08]'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
                      {obj.completed && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                      <span className="truncate">{obj.title}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                      {obj.description}
                    </div>
                  </div>
                  <span className="shrink-0 px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/10 text-[10px] font-mono uppercase text-slate-300">
                    {obj.flavor}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="h-2 rounded-full bg-slate-950 overflow-hidden border border-white/[0.07]">
                    <div
                      className={cn(
                        'h-full transition-all duration-300',
                        obj.completed
                          ? 'bg-emerald-400'
                          : period === 'daily'
                          ? 'bg-gradient-to-r from-emerald-500 to-sky-400'
                          : 'bg-gradient-to-r from-purple-500 to-amber-400'
                      )}
                      style={{ width: `${Math.min(100, Math.round(obj.pct))}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 tabular-nums">
                    <span>
                      {obj.current} / {obj.target} {obj.unitLabel}
                    </span>
                    <span className={obj.completed ? 'text-emerald-300 font-bold' : ''}>
                      {obj.completed ? 'COMPLETE' : `${Math.round(obj.pct)}%`}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    );

    return (
      <div className="space-y-4">
        {isPartyMode && (
          <div className="card-matte rounded-2xl p-3.5 border-amber-400/40 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-amber-300 shrink-0" />
            <div className="text-xs text-slate-200 leading-relaxed">
              <strong>Party Mode (Temp User):</strong> Full goals, stats &amp; games work live —
              nothing is saved except action replay clips!
            </div>
          </div>
        )}

        {renderObjectiveCard('Daily Objectives', 'daily', daily, 'text-emerald-300')}
        {renderObjectiveCard('Weekly Objectives', 'weekly', weekly, 'text-amber-300')}
        {renderOnlineMatchCard()}
      </div>
    );
  };

  const renderPracticeDrillsPanel = () => {
    const drills = getPracticeDrills();
    const isPracticeGame = activeGame?.mode === 'practice';

    return (
      <div className="space-y-4">
        {/* ACTIVE SOLO DRILL SETUP */}
        {isPracticeGame && activeGame && activeGame.phase === 'setup' && (
          <section className="card-matte rounded-2xl p-4 sm:p-5 border-sky-400/50 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-black text-white">
                  {activeGame.title} — Drill Setup
                </h2>
                <p className="text-xs text-slate-400 font-mono">
                  Solo Training • {activeGame.roster[0]?.name || state?.activePlayer.name || 'Player'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void dispatch({ type: 'exit_game' }, 'Back to Solo Drills')}
                className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-300 cursor-pointer"
              >
                All Drills
              </button>
            </div>

            {activeGameDef && (
              <p className="text-xs text-slate-300/90 leading-relaxed">
                {activeGameDef.description}
              </p>
            )}

            {/* Dynamic Drill Config Options */}
            {activeGameDef && activeGameDef.configOptions.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-white/10">
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                  Drill Settings
                </div>
                {activeGameDef.configOptions.map((opt) => {
                  const currentVal = activeGame.matchConfig?.[opt.key] ?? opt.defaultValue;
                  return (
                    <div
                      key={opt.key}
                      className="p-2.5 rounded-xl bg-slate-900/70 border border-white/[0.07] space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white">{opt.label}</span>
                        {opt.type === 'toggle' && (
                          <button
                            type="button"
                            onClick={() =>
                              void dispatch({
                                type: 'set_match_config',
                                key: opt.key,
                                value: !currentVal,
                              })
                            }
                            className={cn(
                              'w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer',
                              currentVal ? 'bg-sky-500' : 'bg-slate-700'
                            )}
                          >
                            <div
                              className={cn(
                                'w-5 h-5 rounded-full bg-white transition-transform',
                                currentVal ? 'translate-x-5' : 'translate-x-0'
                              )}
                            />
                          </button>
                        )}
                      </div>
                      {opt.type === 'select' && opt.options && (
                        <div className="flex flex-wrap gap-1.5">
                          {opt.options.map((choice) => (
                            <button
                              key={String(choice.value)}
                              type="button"
                              onClick={() =>
                                void dispatch({
                                  type: 'set_match_config',
                                  key: opt.key,
                                  value: choice.value,
                                })
                              }
                              className={cn(
                                'px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer',
                                currentVal === choice.value
                                  ? 'bg-sky-500/20 border-sky-400/60 text-sky-200'
                                  : 'bg-slate-950/60 border-white/10 text-slate-400 hover:text-white'
                              )}
                            >
                              {choice.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => void dispatch({ type: 'start_match' }, `Started ${activeGame.title}!`)}
              className="w-full py-4 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer shadow-[0_0_24px_rgba(56,189,248,0.35)]"
            >
              <Play className="w-4 h-4 fill-current" />
              Start {activeGame.title}
            </button>
          </section>
        )}

        {/* SOLO DRILL COMPLETE CARD */}
        {isPracticeGame && activeGame && activeGame.phase === 'finished' && (
          <section className="card-matte rounded-2xl p-5 border-sky-400/50 text-center space-y-3">
            <Trophy className="w-9 h-9 text-sky-400 mx-auto" />
            <div className="text-lg font-black text-white">
              {activeGame.winnerHeadline || `${activeGame.title} Complete`}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => void dispatch({ type: 'rematch' }, 'Restarted Drill!')}
                className="py-3 rounded-xl bg-sky-400 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wider cursor-pointer"
              >
                Run Again
              </button>
              <button
                type="button"
                onClick={() => void dispatch({ type: 'exit_game' }, 'Back to Solo Drills')}
                className="py-3 rounded-xl bg-slate-900 border border-white/15 text-white font-bold text-xs sm:text-sm uppercase tracking-wider cursor-pointer"
              >
                All Drills
              </button>
            </div>
          </section>
        )}

        {/* ALL SOLO TRAINING DRILLS GRID */}
        <div className="space-y-2.5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-sky-300 font-bold flex items-center gap-1.5 px-1">
            <Crosshair className="w-3.5 h-3.5" />
            Solo Training Drills ({drills.length})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {drills.map((d) => {
              const Icon = d.icon;
              const isActive = activeGame?.id === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => void dispatch({ type: 'launch_game', gameId: d.id }, `Loaded ${d.title}`)}
                  className={cn(
                    'card-matte p-4 rounded-2xl text-left flex flex-col justify-between gap-2.5 active:scale-[0.97] transition-all cursor-pointer',
                    isActive
                      ? 'border-sky-400/70 bg-sky-500/15'
                      : 'hover:border-sky-400/40'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <Icon className="w-5 h-5 text-sky-400" />
                    <span className="text-[10px] font-mono text-slate-400">
                      {d.estimatedMinutes}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-black text-white leading-tight">{d.title}</div>
                    <div className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-snug">
                      {d.tagline}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderGamesPanel = () => {
    const arcadeGames = getArcadeGames();
    const isArcadeGame = activeGame?.mode !== 'practice';

    return (
      <div className="space-y-4">
        {/* ACTIVE ARCADE GAME SETUP */}
        {isArcadeGame && activeGame && activeGame.phase === 'setup' && (
        <section className="card-matte rounded-2xl p-4 sm:p-5 border-emerald-400/45 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">
                {activeGame.title} — Setup
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                {activeGame.roster.length} / {activeGame.maxPlayers} players (min{' '}
                {activeGame.minPlayers})
              </p>
            </div>
            <button
              type="button"
              onClick={() => void dispatch({ type: 'exit_game' }, 'Back to Games Lobby')}
              className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-300 cursor-pointer"
            >
              Change Game
            </button>
          </div>

          {/* Active Roster Chips */}
          <div className="flex flex-wrap gap-2">
            {activeGame.roster.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-full bg-slate-900 border border-white/15 text-xs font-bold text-white"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: p.colorHex }}
                />
                {p.name}
                <button
                  type="button"
                  onClick={() =>
                    void dispatch(
                      { type: 'remove_roster_player', playerId: p.id },
                      `Removed ${p.name}`
                    )
                  }
                  className="p-0.5 text-slate-400 hover:text-rose-400 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>

          {/* Quick-Add Saved Profiles */}
          {(state?.players || []).some(
            (sp) => !activeGame.roster.some((r) => r.id === sp.id)
          ) && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-mono uppercase text-slate-400 mr-1">Saved:</span>
              {(state?.players || [])
                .filter((sp) => !activeGame.roster.some((r) => r.id === sp.id))
                .map((sp) => (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() =>
                      void dispatch(
                        { type: 'add_saved_to_roster', playerId: sp.id },
                        `Added ${sp.name}`
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-white/10 hover:border-emerald-400/50 text-xs font-bold text-slate-200 cursor-pointer"
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: sp.dartColor || DEFAULT_DART_COLOR }}
                    />
                    + {sp.name}
                  </button>
                ))}
            </div>
          )}

          {/* Add Guest + Darts Colour + Save Toggle */}
          <form onSubmit={handleAddPlayerSubmit} className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                placeholder="Add guest player..."
                maxLength={20}
                className="flex-1 rounded-xl bg-slate-900 border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400"
              />
              <button
                type="submit"
                className="px-3.5 py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold cursor-pointer"
              >
                + Add
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {DART_COLOR_OPTIONS.slice(0, 7).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setNewPlayerColor(opt.hex)}
                    className={cn(
                      'w-5 h-5 rounded-full cursor-pointer',
                      newPlayerColor === opt.hex ? 'ring-2 ring-white scale-110' : 'opacity-70'
                    )}
                    style={{ backgroundColor: opt.hex }}
                  />
                ))}
              </div>
              <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveNewPlayer}
                  onChange={(e) => setSaveNewPlayer(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-emerald-500"
                />
                Save profile
              </label>
            </div>
          </form>

          {/* Dynamic Match Config Options */}
          {activeGameDef && activeGameDef.configOptions.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                Match Rules
              </div>
              {activeGameDef.configOptions.map((opt) => {
                const currentVal = activeGame.matchConfig?.[opt.key] ?? opt.defaultValue;
                return (
                  <div
                    key={opt.key}
                    className="p-2.5 rounded-xl bg-slate-900/70 border border-white/[0.07] space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white">{opt.label}</span>
                      {opt.type === 'toggle' && (
                        <button
                          type="button"
                          onClick={() =>
                            void dispatch({
                              type: 'set_match_config',
                              key: opt.key,
                              value: !currentVal,
                            })
                          }
                          className={cn(
                            'w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer',
                            currentVal ? 'bg-emerald-500' : 'bg-slate-700'
                          )}
                        >
                          <div
                            className={cn(
                              'w-5 h-5 rounded-full bg-white transition-transform',
                              currentVal ? 'translate-x-5' : 'translate-x-0'
                            )}
                          />
                        </button>
                      )}
                    </div>
                    {opt.type === 'select' && opt.options && (
                      <div className="flex flex-wrap gap-1.5">
                        {opt.options.map((choice) => (
                          <button
                            key={String(choice.value)}
                            type="button"
                            onClick={() =>
                              void dispatch({
                                type: 'set_match_config',
                                key: opt.key,
                                value: choice.value,
                              })
                            }
                            className={cn(
                              'px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer',
                              currentVal === choice.value
                                ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
                                : 'bg-slate-950/60 border-white/10 text-slate-400 hover:text-white'
                            )}
                          >
                            {choice.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Start Game CTA */}
          <button
            type="button"
            disabled={activeGame.roster.length < activeGame.minPlayers}
            onClick={() => void dispatch({ type: 'start_match' }, `Started ${activeGame.title}!`)}
            className="w-full py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer shadow-[0_0_24px_rgba(16,185,129,0.35)]"
          >
            <Play className="w-4 h-4 fill-current" />
            {activeGame.roster.length < activeGame.minPlayers
              ? `Add at least ${activeGame.minPlayers} players`
              : `Start ${activeGame.title}`}
          </button>
        </section>
      )}

      {/* VICTORY REMATCH CARD */}
      {isArcadeGame && activeGame && activeGame.phase === 'finished' && (
        <section className="card-matte rounded-2xl p-5 border-amber-400/50 text-center space-y-3">
          <Trophy className="w-9 h-9 text-amber-400 mx-auto" />
          <div className="text-lg font-black text-white">
            {activeGame.winnerHeadline || `${activeGame.title} Complete`}
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => void dispatch({ type: 'rematch' }, 'Rematch Started!')}
              className="py-3 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wider cursor-pointer"
            >
              Play Rematch
            </button>
            <button
              type="button"
              onClick={() => void dispatch({ type: 'exit_game' }, 'Back to Lobby')}
              className="py-3 rounded-xl bg-slate-900 border border-white/15 text-white font-bold text-xs sm:text-sm uppercase tracking-wider cursor-pointer"
            >
              Change Game
            </button>
          </div>
        </section>
      )}

      {/* ALL 8 ARCADE GAMES LAUNCHER GRID */}
      <div className="grid grid-cols-2 gap-2.5">
        {arcadeGames.map((g) => {
          const Icon = g.icon;
          const isActive = activeGame?.id === g.id;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => void dispatch({ type: 'launch_game', gameId: g.id }, `Loaded ${g.title}`)}
              className={cn(
                'card-matte p-3.5 sm:p-4 rounded-2xl text-left flex flex-col justify-between gap-2 active:scale-[0.97] transition-all cursor-pointer',
                isActive && 'border-emerald-400/65 bg-emerald-500/12'
              )}
            >
              <div className="flex items-center justify-between">
                <Icon className="w-5 h-5 text-emerald-400" />
                <span className="text-[10px] font-mono text-slate-400">
                  {g.minPlayers}–{g.maxPlayers}P
                </span>
              </div>
              <div>
                <div className="text-sm font-black text-white leading-tight">{g.title}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{g.category}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
    );
  };

  const renderModePanel = () => {
    if (currentMode === 'dashboard') return renderObjectivesPanel();
    if (currentMode === 'practice') return renderPracticeDrillsPanel();
    return renderGamesPanel();
  };

  // =========================================================================
  // RIGHT PANEL 2: PLAYERS & DARTS COLOURS
  // =========================================================================
  const renderPlayersPanel = () => (
    <div className="space-y-3">
      {isPartyMode && (
        <div className="card-matte rounded-2xl p-4 border-amber-400/40 flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-amber-300 shrink-0" />
          <div className="text-xs text-slate-200 leading-relaxed">
            <strong>Party Mode (Temp Profiles):</strong> Switch or add temporary guests below with
            full stats &amp; games — zero data is saved except clips!
          </div>
        </div>
      )}

      <section className="card-matte rounded-2xl p-4 space-y-2.5">
        <div className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">
          {isPartyMode ? 'Temp Party Players (Unsaved)' : 'Saved Profiles & Theme Colours'}
        </div>
        {(state?.players || []).map((p) => {
          const isCurrent = state?.activePlayer.id === p.id;
          const inGameSetup = activeGame?.phase === 'setup';
          const alreadyInRoster = activeGame?.roster.some((r) => r.id === p.id);
          const isEditingColor = editingColorPlayerId === p.id;

          return (
            <div
              key={p.id}
              className={cn(
                'rounded-xl border transition-colors overflow-hidden',
                isCurrent
                  ? 'bg-emerald-500/15 border-emerald-400/50'
                  : 'bg-slate-900/80 border-white/10'
              )}
            >
              <div className="flex items-center justify-between p-2.5 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (inGameSetup && !alreadyInRoster) {
                      void dispatch(
                        { type: 'add_saved_to_roster', playerId: p.id },
                        `Added ${p.name} to lineup`
                      );
                    } else {
                      void dispatch({ type: 'switch_player', playerId: p.id }, `Switched to ${p.name}`);
                    }
                  }}
                  className="flex-1 flex items-center justify-between text-left cursor-pointer min-w-0"
                >
                  <span className="font-bold text-sm text-white flex items-center gap-2 truncate">
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/25"
                      style={{ backgroundColor: p.dartColor || DEFAULT_DART_COLOR }}
                    />
                    <span className="truncate">
                      {p.name} {p.isPrimary ? '(Primary)' : ''}
                    </span>
                  </span>
                  <span className="text-[11px] font-mono text-slate-400 ml-2 shrink-0">
                    {inGameSetup
                      ? alreadyInRoster
                        ? 'In Game'
                        : '+ Add'
                      : isCurrent
                      ? 'Active'
                      : 'Select'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setEditingColorPlayerId(isEditingColor ? null : p.id)}
                  title="Edit Darts Colour"
                  className={cn(
                    'p-1.5 rounded-lg border transition-colors cursor-pointer shrink-0',
                    isEditingColor
                      ? 'bg-white/15 border-white/30 text-white'
                      : 'bg-slate-950/70 border-white/10 text-slate-400 hover:text-white'
                  )}
                >
                  <Palette className="w-3.5 h-3.5" />
                </button>
              </div>

              {isEditingColor && (
                <div className="px-3 pb-3 pt-1.5 border-t border-white/10 flex flex-wrap items-center gap-2 bg-slate-950/60">
                  <span className="text-[10px] font-mono uppercase text-slate-400 mr-1">
                    Colour:
                  </span>
                  {DART_COLOR_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        void dispatch(
                          { type: 'update_player_color', playerId: p.id, dartColor: opt.hex },
                          `${p.name} theme -> ${opt.label}`
                        );
                        setEditingColorPlayerId(null);
                      }}
                      title={opt.label}
                      className={cn(
                        'w-6 h-6 rounded-full transition-transform cursor-pointer',
                        (p.dartColor || DEFAULT_DART_COLOR) === opt.hex
                          ? 'ring-2 ring-white scale-110'
                          : 'opacity-80 hover:opacity-100'
                      )}
                      style={{ backgroundColor: opt.hex }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <form onSubmit={handleAddPlayerSubmit} className="card-matte rounded-2xl p-4 space-y-3">
        <div className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
          <UserPlus className="w-3.5 h-3.5" />
          Add Player / Guest &amp; Darts Colour
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newPlayerName}
            onChange={(e) => setNewPlayerName(e.target.value)}
            placeholder="Enter player name..."
            maxLength={20}
            className="flex-1 rounded-xl bg-slate-900 border border-white/15 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-400"
          />
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs uppercase tracking-wider cursor-pointer"
          >
            Add
          </button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {DART_COLOR_OPTIONS.slice(0, 7).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setNewPlayerColor(opt.hex)}
                className={cn(
                  'w-5 h-5 rounded-full cursor-pointer',
                  newPlayerColor === opt.hex ? 'ring-2 ring-white scale-110' : 'opacity-70'
                )}
                style={{ backgroundColor: opt.hex }}
              />
            ))}
          </div>
          {isPartyMode ? (
            <span className="text-[11px] font-mono text-amber-300 font-bold">
              Temp Guest (Unsaved)
            </span>
          ) : (
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={saveNewPlayer}
                onChange={(e) => setSaveNewPlayer(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-emerald-500"
              />
              Save account
            </label>
          )}
        </div>
      </form>
    </div>
  );

  // =========================================================================
  // RIGHT PANEL 3: REPLAYS, SPLIT-CAM & SAVED CLIPS GALLERY
  // =========================================================================
  // Prefer live Kiosk synced clips when populated, falling back / merging with direct
  // `/api/replays/list` disk reads so saved clips ALWAYS appear right after an app restart!
  const allSavedClips = React.useMemo(() => {
    const map = new Map<string, RemoteKioskState['recentClips'][number]>();
    for (const c of diskClips) {
      const key = (c.relativePath || c.filename || c.id).toLowerCase();
      map.set(key, c);
    }
    for (const c of state?.recentClips || []) {
      const key = (c.relativePath || c.filename || c.id).toLowerCase();
      map.set(key, c);
    }
    return Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [diskClips, state?.recentClips]);

  const filteredClips = allSavedClips.filter((c) =>
    clipFilter === 'all' ? true : (c.category || 'game') === clipFilter
  );

  const renderReplaysPanel = () => (
    <div className="space-y-4">
      {/* Split-Cam Engine Card */}
      <section className="card-matte rounded-2xl p-4 space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Columns2 className="w-4 h-4 text-rose-400" />
            <span className="text-xs font-mono uppercase tracking-wider font-black text-white">
              Split-Cam Auto-Clipper
            </span>
          </div>
          <Badge
            variant={camCapturing ? 'rose' : camBuffering ? 'emerald' : 'slate'}
            size="sm"
            dot
          >
            {camCapturing ? 'CLIPPING' : camBuffering ? 'LIVE' : state?.replayStatus || 'IDLE'}
          </Badge>
        </div>

        {/* Start / Stop + Dev Arm */}
        <div className="grid grid-cols-2 gap-2">
          {camActive ? (
            <button
              type="button"
              onClick={() => void dispatch({ type: 'stop_cameras' }, 'Cameras Stopped')}
              className="py-2.5 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/45 text-rose-200 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <VideoOff className="w-4 h-4" />
              Stop Split-Cam
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void dispatch({ type: 'start_cameras' }, 'Starting Split-Cam...')}
              className="py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Video className="w-4 h-4" />
              Start Split-Cam
            </button>
          )}

          {state?.replayDevArmed ? (
            <button
              type="button"
              onClick={() => void dispatch({ type: 'cancel_dev_replay' }, 'Cancelled Dev Test')}
              className="py-2.5 px-3 rounded-xl bg-amber-500/25 border border-amber-400/60 text-amber-200 font-black text-xs flex items-center justify-center gap-1.5 animate-pulse cursor-pointer"
            >
              <X className="w-4 h-4" />
              Cancel Dev Test
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                void dispatch({ type: 'arm_dev_replay' }, 'Armed: Throw any dart to test!')
              }
              className="py-2.5 px-3 rounded-xl bg-amber-500/12 hover:bg-amber-500/20 border border-amber-400/35 text-amber-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <FlaskConical className="w-4 h-4" />
              Test Next Dart
            </button>
          )}
        </div>

        {/* Live Camera Error Alert inside Replays Panel */}
        {hasCameraIssue && (
          <div className="p-3 rounded-xl bg-amber-500/12 border border-amber-400/45 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
              <div className="min-w-0 text-xs text-amber-100 leading-snug">
                <div className="font-black text-amber-200 uppercase tracking-wider text-[11px]">
                  Camera Issue Detected
                </div>
                <div className="mt-0.5 break-words">
                  {state?.replayCameraIssueSummary ||
                    state?.replayError ||
                    state?.replayBoardFeedError ||
                    'Check camera USB cables or Autodarts Desktop.'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                void dispatch({ type: 'redetect_cameras' }, 'Scanning & restarting all cameras...')
              }
              className="w-full py-2 px-3 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 active:scale-[0.98] cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Auto-Detect &amp; Retry Cameras
            </button>
          </div>
        )}

        {/* Active Oche Webcam + Quick Camera Selector */}
        <div className="p-2.5 rounded-xl bg-slate-900/75 border border-white/10 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-mono uppercase text-rose-300 font-bold">
                Oche / Throwing Cam (Left)
              </div>
              <div className="text-xs font-bold text-slate-200 truncate">
                {state?.replayActiveCameraLabel ||
                  (camActive ? 'Oche Webcam Live' : 'Not Connected')}
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                void dispatch({ type: 'redetect_cameras' }, 'Auto-detecting cameras...')
              }
              title="Auto-detect & pick Oche webcam"
              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-white/10 border border-white/15 text-[10px] font-mono font-bold text-slate-200 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3 text-emerald-400" />
              Auto-Detect
            </button>
          </div>

          {(state?.replayAvailableCameras?.length || 0) > 1 && (
            <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/10">
              {state!.replayAvailableCameras.map((cam) => {
                const isSelected = state?.replaySelectedDeviceId === cam.deviceId;
                return (
                  <button
                    key={cam.deviceId}
                    type="button"
                    onClick={() =>
                      void dispatch(
                        { type: 'select_oche_camera', deviceId: cam.deviceId },
                        `Switched cam → ${cam.label}`
                      )
                    }
                    className={cn(
                      'px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer max-w-full truncate',
                      isSelected
                        ? 'bg-emerald-500/20 border-emerald-400/55 text-emerald-200'
                        : cam.isAutodartsBoardCam
                        ? 'bg-slate-950/50 border-white/5 text-slate-500 hover:text-slate-300'
                        : 'bg-slate-950/80 border-white/15 text-slate-300 hover:text-white'
                    )}
                    title={cam.label}
                  >
                    {cam.label}
                    {cam.isAutodartsBoardCam ? ' (Board)' : ''}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Locked Board Cam Source Indicator */}
        <div
          className={cn(
            'p-2.5 rounded-xl bg-slate-900/75 border flex items-center justify-between gap-2',
            state?.replayBoardFeedError ? 'border-amber-400/45' : 'border-emerald-400/25'
          )}
        >
          <div className="min-w-0">
            <div
              className={cn(
                'text-[10px] font-mono uppercase font-bold',
                state?.replayBoardFeedError ? 'text-amber-300' : 'text-emerald-300'
              )}
            >
              Board Cam (Locked)
            </div>
            <div className="text-xs font-bold text-slate-200 truncate">
              {state?.replayBoardFeedError || 'Virtual Straight-On Board Cam (Clips Only)'}
            </div>
          </div>
          <Badge variant={state?.replayBoardFeedError ? 'amber' : 'emerald'} size="sm">
            {state?.replayBoardFeedError ? 'Error' : 'Virtual'}
          </Badge>
        </div>

        {/* Auto-Start on Boot */}
        <div className="flex items-center justify-between pt-2 border-t border-white/10">
          <span className="text-xs font-bold text-slate-200">Auto-Start Cameras on Boot</span>
          <button
            type="button"
            onClick={() =>
              void dispatch(
                { type: 'set_auto_start_camera', enabled: !state?.replayAutoStartCamera },
                state?.replayAutoStartCamera ? 'Auto-Start Off' : 'Auto-Start On'
              )
            }
            className={cn(
              'w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer',
              state?.replayAutoStartCamera ? 'bg-emerald-500' : 'bg-slate-700'
            )}
          >
            <div
              className={cn(
                'w-5 h-5 rounded-full bg-white transition-transform',
                state?.replayAutoStartCamera ? 'translate-x-5' : 'translate-x-0'
              )}
            />
          </button>
        </div>

        {/* Auto-Clip Triggers */}
        <div className="space-y-1.5 pt-2 border-t border-white/10">
          <div className="text-[10px] font-mono uppercase text-slate-400 font-bold">
            Auto-Clip Triggers
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TRIGGER_ITEMS.map((item) => {
              const enabled = Boolean(state?.replayTriggers?.[item.key]);
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() =>
                    void dispatch({
                      type: 'update_replay_trigger',
                      key: item.key,
                      value: !enabled,
                    })
                  }
                  className={cn(
                    'px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer',
                    enabled
                      ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                      : 'bg-slate-900/80 border-white/10 text-slate-400'
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Saved Replays Gallery */}
      <section className="card-matte rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono uppercase tracking-wider font-black text-white">
              Saved Clips ({allSavedClips.length})
            </span>
            <button
              type="button"
              onClick={() => void pullSavedClipsFromServer()}
              title="Refresh Saved Clips from Disk"
              className="p-1 rounded-md bg-slate-900 border border-white/10 text-slate-400 hover:text-white cursor-pointer"
            >
              <RefreshCw className={cn('w-3 h-3', loadingClips && 'animate-spin')} />
            </button>
          </div>
          <div className="flex items-center gap-1">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'game', label: 'Game' },
                { id: 'user', label: 'Manual' },
                { id: 'dev', label: 'Dev' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setClipFilter(f.id)}
                className={cn(
                  'px-2 py-1 rounded-md text-[10px] font-bold transition-colors cursor-pointer',
                  clipFilter === f.id
                    ? 'bg-rose-500/25 text-rose-200 border border-rose-400/45'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filteredClips.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500 font-mono">
            No saved clips in this folder yet.
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {filteredClips.map((clip) => (
              <div
                key={clip.id}
                className="p-2.5 rounded-xl bg-slate-900/80 border border-white/10 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">
                    {clip.playerName} • {clip.reason}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5 mt-0.5">
                    <span className="text-amber-300 font-bold">{clip.segmentName}</span>
                    <span>•</span>
                    <span>{clip.durationSec.toFixed(1)}s</span>
                    {clip.subfolder && (
                      <>
                        <span>•</span>
                        <span className="truncate">{clip.subfolder}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      void dispatch(
                        { type: 'play_saved_clip', clipId: clip.relativePath || clip.id },
                        'Playing on TV'
                      )
                    }
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/45 text-emerald-200 text-[11px] font-black flex items-center gap-1 cursor-pointer"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    TV
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const targetPath = clip.relativePath || clip.filename;
                      void dispatch({ type: 'delete_saved_clip', path: targetPath }, 'Deleted Clip').then(
                        () => {
                          setDiskClips((prev) =>
                            prev.filter(
                              (c) => c.relativePath !== targetPath && c.filename !== targetPath
                            )
                          );
                          window.setTimeout(() => void pullSavedClipsFromServer(), 350);
                        }
                      );
                    }}
                    title="Delete Clip"
                    className="p-1.5 rounded-lg bg-slate-950/70 hover:bg-rose-500/20 border border-white/10 text-slate-400 hover:text-rose-300 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  // =========================================================================
  // RIGHT PANEL 4: DISPLAY, LAYOUT, DATA MODE & CAREER VAULT
  // =========================================================================
  const sortedWidgets = [...(state?.layoutWidgets || [])].sort((a, b) => a.order - b.order);
  const enabledWidgetCount = sortedWidgets.filter((w) => w.enabled).length;

  const renderDisplayPanel = () => (
    <div className="space-y-4">
      {/* Dashboard Modules Customizer (Show / Hide, Reorder & Width) */}
      <section className="card-matte rounded-2xl p-4 space-y-3 border-emerald-400/30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-xs font-mono uppercase tracking-wider font-black text-white">
              Dashboard Modules
            </span>
            <Badge variant="emerald" size="sm">
              {enabledWidgetCount}/{sortedWidgets.length} Shown
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                void dispatch({ type: 'set_all_widgets_enabled', enabled: true }, 'Showing All Modules')
              }
              className="px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/35 text-[10px] font-mono font-bold text-emerald-300 cursor-pointer"
            >
              Show All
            </button>
            <button
              type="button"
              onClick={() => void dispatch({ type: 'reset_layout' }, 'Layout Reset to Default')}
              className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-white/10 border border-white/10 text-[10px] font-mono font-bold text-slate-300 cursor-pointer"
            >
              Reset
            </button>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 leading-snug">
          Tap the <strong className="text-slate-200">Hide / Show</strong> icon to toggle modules on the
          vertical TV, or use <strong className="text-slate-200">▲ / ▼</strong> to change their order.
        </p>

        <div className="space-y-2">
          {sortedWidgets.map((w, idx) => (
            <div
              key={w.id}
              className={cn(
                'flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border transition-all',
                w.enabled
                  ? 'bg-slate-900/85 border-white/12 text-white'
                  : 'bg-slate-950/60 border-white/[0.05] text-slate-500'
              )}
            >
              {/* Left: Order Number + Module Name */}
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={cn(
                    'w-6 h-6 rounded-lg font-mono text-[10px] font-black flex items-center justify-center shrink-0 border',
                    w.enabled
                      ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300'
                      : 'bg-slate-900 border-white/10 text-slate-600'
                  )}
                >
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <div
                    className={cn(
                      'text-xs sm:text-sm font-bold truncate leading-tight',
                      !w.enabled && 'line-through decoration-slate-600 text-slate-500'
                    )}
                  >
                    {w.title}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">
                    {w.enabled ? (w.colSpan === 2 ? 'Full Width' : 'Half Width') : 'Hidden on TV'}
                  </div>
                </div>
              </div>

              {/* Right: Dedicated Hide/Show Button + Width + Move Up/Down */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    void dispatch(
                      { type: 'toggle_widget', widgetId: w.id },
                      w.enabled ? `Hid ${w.title}` : `Showing ${w.title}`
                    )
                  }
                  title={w.enabled ? 'Hide module on TV' : 'Show module on TV'}
                  className={cn(
                    'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-black uppercase tracking-wider active:scale-95 transition-all cursor-pointer',
                    w.enabled
                      ? 'bg-emerald-500/15 hover:bg-rose-500/20 border-emerald-400/45 hover:border-rose-400/50 text-emerald-200 hover:text-rose-200'
                      : 'bg-slate-900 hover:bg-emerald-500/20 border-white/15 hover:border-emerald-400/45 text-slate-400 hover:text-emerald-200'
                  )}
                >
                  {w.enabled ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5 shrink-0" />
                      <span>Hide</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5 shrink-0" />
                      <span>Show</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void dispatch(
                      {
                        type: 'set_widget_span',
                        widgetId: w.id,
                        colSpan: w.colSpan === 2 ? 1 : 2,
                      },
                      `${w.title} -> ${w.colSpan === 2 ? 'Half Width' : 'Full Width'}`
                    )
                  }
                  className="px-2 py-1.5 rounded-lg bg-slate-950 border border-white/12 text-[10px] font-mono font-bold text-slate-300 hover:text-white active:scale-95 cursor-pointer"
                  title="Toggle 1-col / 2-col width"
                >
                  {w.colSpan === 2 ? 'WIDE' : 'HALF'}
                </button>

                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() =>
                    void dispatch(
                      { type: 'move_widget', widgetId: w.id, direction: 'up' },
                      `Moved ${w.title} up`
                    )
                  }
                  title="Move module up"
                  className="p-1.5 rounded-lg bg-slate-950 hover:bg-white/10 border border-white/12 text-slate-200 disabled:opacity-25 active:scale-95 cursor-pointer"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  disabled={idx === sortedWidgets.length - 1}
                  onClick={() =>
                    void dispatch(
                      { type: 'move_widget', widgetId: w.id, direction: 'down' },
                      `Moved ${w.title} down`
                    )
                  }
                  title="Move module down"
                  className="p-1.5 rounded-lg bg-slate-950 hover:bg-white/10 border border-white/12 text-slate-200 disabled:opacity-25 active:scale-95 cursor-pointer"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Heatmap + Objectives + Fullscreen */}
      <section className="card-matte rounded-2xl p-4 space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-mono uppercase tracking-wider font-black text-white flex items-center gap-1.5">
            <Monitor className="w-4 h-4 text-sky-400" />
            Kiosk Display Controls
          </span>
          <button
            type="button"
            onClick={() => void dispatch({ type: 'toggle_fullscreen' }, 'Toggled Kiosk Fullscreen')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-white/10 border border-white/15 text-[11px] font-bold text-slate-200 cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
            Fullscreen
          </button>
        </div>

        {/* Heatmap Mode */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-mono uppercase text-slate-400 font-bold flex items-center gap-1">
            <Target className="w-3 h-3 text-emerald-400" />
            Dartboard Heatmap View
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { id: 'dots', label: 'Dots' },
                { id: 'density', label: 'Heat' },
                { id: 'both', label: 'Both' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() =>
                  void dispatch({ type: 'set_heatmap_mode', mode: opt.id }, `Heatmap -> ${opt.label}`)
                }
                className={cn(
                  'py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer',
                  state?.heatmapMode === opt.id
                    ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200'
                    : 'bg-slate-900/80 border-white/10 text-slate-400 hover:text-white'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Reroll Objectives */}
        <div className="space-y-1.5 pt-2 border-t border-white/10">
          <div className="text-[10px] font-mono uppercase text-slate-400 font-bold flex items-center gap-1">
            <Dices className="w-3 h-3 text-amber-400" />
            Practice Objectives
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() =>
                void dispatch({ type: 'reroll_objectives', period: 'daily' }, 'Rerolled Daily Goals')
              }
              className="py-2 rounded-lg bg-slate-900 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200 cursor-pointer"
            >
              Reroll Daily
            </button>
            <button
              type="button"
              onClick={() =>
                void dispatch(
                  { type: 'reroll_objectives', period: 'weekly' },
                  'Rerolled Weekly Goals'
                )
              }
              className="py-2 rounded-lg bg-slate-900 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200 cursor-pointer"
            >
              Reroll Weekly
            </button>
          </div>
        </div>
      </section>

      {/* Data Source & Demo Simulator */}
      <section className="card-matte rounded-2xl p-4 space-y-3">
        <div className="text-xs font-mono uppercase tracking-wider font-black text-white">
          Board Source &amp; Demo Mode
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              { id: 'local', label: 'Local 3180' },
              { id: 'demo', label: 'Demo Sim' },
              { id: 'cloud', label: 'Cloud' },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() =>
                void dispatch({ type: 'set_data_mode', mode: m.id }, `Mode -> ${m.label}`)
              }
              className={cn(
                'py-2 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer',
                state?.dataMode === m.id
                  ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200'
                  : 'bg-slate-900/80 border-white/10 text-slate-400 hover:text-white'
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {state?.dataMode === 'demo' && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => void dispatch({ type: 'simulate_visit' }, 'Simulated Visit')}
              className="py-2 rounded-lg bg-sky-500/20 border border-sky-400/45 text-sky-200 text-xs font-black cursor-pointer"
            >
              Sim 3-Dart Visit
            </button>
            <button
              type="button"
              onClick={() =>
                void dispatch(
                  { type: 'toggle_auto_sim' },
                  state.isAutoSimulating ? 'Auto-Sim Stopped' : 'Auto-Sim Running'
                )
              }
              className={cn(
                'py-2 rounded-lg border text-xs font-black cursor-pointer',
                state.isAutoSimulating
                  ? 'bg-amber-500/25 border-amber-400/60 text-amber-200'
                  : 'bg-slate-900 border-white/15 text-slate-200'
              )}
            >
              {state.isAutoSimulating ? 'Stop Auto-Sim' : 'Start Auto-Sim'}
            </button>
          </div>
        )}
      </section>

      {/* Career Vault Readout */}
      {state?.careerSummary && (
        <section className="card-matte rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider font-black text-white flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-400" />
              Career Vault
            </span>
            <Badge variant={state.careerSummary.isDiskSynced ? 'emerald' : 'slate'} size="sm">
              {state.careerSummary.isDiskSynced ? 'Disk Synced' : 'Local'}
            </Badge>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-xl bg-slate-900/80 border border-white/[0.07]">
              <div className="text-[10px] font-mono text-slate-400 uppercase">Streak</div>
              <div className="text-base font-black font-mono text-amber-300 tabular-nums">
                {state.careerSummary.currentStreak}d
              </div>
            </div>
            <div className="p-2 rounded-xl bg-slate-900/80 border border-white/[0.07]">
              <div className="text-[10px] font-mono text-slate-400 uppercase">Best 3DA</div>
              <div className="text-base font-black font-mono text-emerald-300 tabular-nums">
                {state.careerSummary.bestDay3DA.toFixed(1)}
              </div>
            </div>
            <div className="p-2 rounded-xl bg-slate-900/80 border border-white/[0.07]">
              <div className="text-[10px] font-mono text-slate-400 uppercase">Darts</div>
              <div className="text-base font-black font-mono text-white tabular-nums">
                {state.careerSummary.totalCareerDarts}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );

  return (
    <div
      data-theme={isDartCounterMode ? 'dartcounter' : isPartyMode ? 'party' : 'default'}
      data-player-tint={!isDartCounterMode && !isPartyMode && Boolean(activeTintHex) ? 'on' : 'off'}
      data-turn-tint={!isDartCounterMode && isTurnTint ? 'on' : 'off'}
      style={isDartCounterMode ? undefined : remoteStyle}
      className={cn(
        'min-h-screen flex flex-col font-sans select-none antialiased transition-colors duration-300',
        isDartCounterMode
          ? 'bg-[#F4F5F7] text-[#111827] pb-8'
          : 'bg-[#0B0F17] text-slate-100 pb-24 md:pb-8'
      )}
    >
      {/* Responsive iPad & Mobile Top Command Header (safe-area aware for iOS/iPadOS Home Screen Web App) */}
      <header
        className={cn(
          'sticky top-0 z-30 backdrop-blur-md border-b px-3.5 pb-2.5 sm:px-6 sm:pb-3 transition-colors',
          isDartCounterMode
            ? 'bg-white/95 border-slate-200 shadow-sm'
            : isPartyMode
            ? 'bg-[#120A20]/95 border-purple-400/25'
            : 'bg-[#0B0F17]/95 border-white/10'
        )}
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        <div className="max-w-6xl mx-auto space-y-2.5">
          {/* Row 1: Brand | Desktop 4-Mode Switcher | Party + Resync + Pairing */}
          <div className="flex items-center justify-between gap-2">
            {/* Left: Brand (Secret 5-tap on crest opens PIN 0161 Dev Console QR Modal) */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                onClick={handleSecretCrestTap}
                className={cn(
                  'w-9 h-9 rounded-xl flex items-center justify-center font-mono font-black text-sm select-none cursor-default shrink-0 transition-all',
                  isDartCounterMode
                    ? 'bg-gradient-to-tr from-[#E05600] to-[#F76505] text-white shadow-[0_4px_14px_rgba(247,101,5,0.35)]'
                    : isPartyMode
                    ? 'bg-gradient-to-tr from-purple-600 via-fuchsia-500 to-amber-300 text-slate-950'
                    : 'bg-gradient-to-tr from-emerald-500 to-emerald-300 text-slate-950'
                )}
              >
                {isDartCounterMode ? <DartCounterIcon className="w-5 h-5 text-white" /> : 'AD'}
              </div>
              <div className="min-w-0">
                <h1
                  className={cn(
                    'text-sm sm:text-base font-black tracking-tight leading-none truncate',
                    isDartCounterMode ? 'text-[#111827]' : 'text-white'
                  )}
                >
                  {isDartCounterMode ? 'DARTCOUNTER' : 'OCHE DECK'}
                </h1>
                <span
                  className={cn(
                    'text-[10px] font-mono uppercase tracking-wider block truncate font-bold',
                    isDartCounterMode
                      ? 'text-[#F76505]'
                      : 'text-slate-400'
                  )}
                >
                  {isDartCounterMode
                    ? 'Target Webapp Controller'
                    : isPartyMode
                    ? 'Vice Party Mode'
                    : state?.activePlayer.name || 'Connecting...'}
                </span>
              </div>
            </div>

            {/* Center (Wide iPad Landscape / Desktop lg+): Inline 4-Mode Switcher (hidden in dedicated Game/Practice Companion) */}
            {!activeGame && (
            <div
              className={cn(
                'hidden lg:flex items-center gap-1 p-1 rounded-xl border',
                isDartCounterMode
                  ? 'bg-slate-100 border-slate-200'
                  : 'bg-slate-900/90 border-white/10'
              )}
            >
              {(
                [
                  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, tone: 'bg-emerald-500/20 text-emerald-300', lightTone: 'bg-white text-slate-900 shadow-sm' },
                  { id: 'arcade', label: 'Arcade', icon: Gamepad2, tone: 'bg-emerald-500/20 text-emerald-300', lightTone: 'bg-white text-slate-900 shadow-sm' },
                  { id: 'practice', label: 'Practice', icon: Crosshair, tone: 'bg-sky-500/20 text-sky-300', lightTone: 'bg-white text-slate-900 shadow-sm' },
                  { id: 'dartcounter', label: 'DartCounter', icon: DartCounterIcon, tone: 'bg-[#F76505] text-white shadow-sm', lightTone: 'bg-[#F76505] text-white shadow-sm' },
                ] as const
              ).map((m) => {
                const Icon = m.icon;
                const active = currentMode === m.id;
                const showInviteDot = m.id === 'dartcounter' && pendingInviteCount > 0;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleSwitchMode(m.id)}
                    className={cn(
                      'relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer',
                      active
                        ? isDartCounterMode
                          ? m.lightTone
                          : m.tone
                        : isDartCounterMode
                        ? 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                        : 'text-slate-400 hover:text-white'
                    )}
                  >
                    <Icon className={cn('w-3.5 h-3.5', m.id === 'dartcounter' && !active && 'text-[#F76505]')} />
                    <span>{m.label}</span>
                    {showInviteDot && (
                      <span className="w-2 h-2 rounded-full bg-[#F76505] ring-2 ring-white animate-pulse" />
                    )}
                  </button>
                );
              })}
            </div>
            )}

            {/* Right: Camera Warning (if any error) + Party Mode Toggle + Resync + Pairing Badge */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {hasCameraIssue && (
                <button
                  type="button"
                  onClick={() => setIsCameraIssueModalOpen(true)}
                  title={state?.replayCameraIssueSummary || 'Camera Issues Detected — Tap for details'}
                  aria-label="Camera Issues Detected"
                  className={cn(
                    'relative inline-flex items-center gap-1 px-2.5 py-2 rounded-xl border active:scale-95 transition-all cursor-pointer',
                    isDartCounterMode
                      ? 'bg-amber-100 hover:bg-amber-200 border-amber-400 text-amber-800'
                      : 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-400/65 text-amber-200 shadow-[0_0_18px_-4px_rgba(245,158,11,0.65)]'
                  )}
                >
                  <span className="relative flex items-center justify-center">
                    <Camera className={cn('w-4 h-4', isDartCounterMode ? 'text-amber-700' : 'text-amber-300')} />
                    <AlertTriangle className="w-2.5 h-2.5 text-rose-500 fill-rose-950 absolute -top-1 -right-1.5 animate-pulse" />
                  </span>
                  <span className={cn('hidden sm:inline text-[11px] font-mono font-black uppercase tracking-wider ml-0.5', isDartCounterMode ? 'text-amber-800' : 'text-amber-200')}>
                    Cam
                  </span>
                </button>
              )}

              {!isDartCounterMode && (
              <button
                type="button"
                onClick={() =>
                  void dispatch(
                    { type: 'toggle_party_mode' },
                    isPartyMode
                      ? 'Party Mode Off — Personal Tracking Resumed'
                      : 'Vice Party Mode Live!'
                  )
                }
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer',
                  isPartyMode
                    ? 'bg-gradient-to-r from-purple-600/35 via-fuchsia-600/30 to-amber-500/25 text-amber-200 border-amber-400/60'
                    : 'bg-slate-900/80 text-purple-200 border-purple-400/25 hover:border-amber-400/40'
                )}
              >
                {isPartyMode ? (
                  <>
                    <Square className="w-3.5 h-3.5 fill-amber-300 text-amber-300 shrink-0" />
                    <span className="hidden xs:inline sm:inline">Stop Party</span>
                  </>
                ) : (
                  <>
                    <PartyPopper className="w-3.5 h-3.5 text-purple-300 shrink-0" />
                    <span>Party</span>
                  </>
                )}
              </button>
              )}

              <button
                type="button"
                disabled={syncing}
                onClick={() => void handleManualResync()}
                title="Resync Kiosk & Recalibrate Autodarts Cameras"
                className={cn(
                  'p-2 rounded-xl border disabled:opacity-60 cursor-pointer transition-colors',
                  isDartCounterMode
                    ? 'bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                    : 'bg-slate-900/80 border-white/10 text-slate-300 hover:text-white'
                )}
              >
                <RefreshCw className={cn('w-4 h-4', syncing && 'animate-spin text-[#F76505]')} />
              </button>

              <Badge
                variant={connected && kioskOnline ? 'emerald' : 'rose'}
                size="sm"
                dot
                className={
                  isDartCounterMode
                    ? connected && kioskOnline
                      ? 'bg-[#E6F5EC] border-[#107C41]/30 text-[#107C41]'
                      : 'bg-rose-50 border-rose-300 text-rose-700'
                    : undefined
                }
              >
                <Wifi className="w-3 h-3" />
                <span className="hidden sm:inline">
                  {connected && kioskOnline ? 'Paired' : connected ? 'No Kiosk' : 'Offline'}
                </span>
              </Badge>
            </div>
          </div>

          {/* Row 2 (iPad Portrait & Phone < lg): Crisp Full-Width 4-Mode Toggle Strip (hidden during dedicated Companion) */}
          {!activeGame && (
          <div
            className={cn(
              'lg:hidden grid grid-cols-4 gap-1 p-1 rounded-xl border',
              isDartCounterMode
                ? 'bg-slate-100 border-slate-200'
                : 'bg-slate-900/90 border-white/10'
            )}
          >
            {(
              [
                { id: 'dashboard', label: 'Stats', icon: LayoutDashboard, tone: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40', lightTone: 'bg-white text-slate-900 border-slate-200 shadow-sm' },
                { id: 'arcade', label: 'Arcade', icon: Gamepad2, tone: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40', lightTone: 'bg-white text-slate-900 border-slate-200 shadow-sm' },
                { id: 'practice', label: 'Practice', icon: Crosshair, tone: 'bg-sky-500/20 text-sky-300 border-sky-400/40', lightTone: 'bg-white text-slate-900 border-slate-200 shadow-sm' },
                { id: 'dartcounter', label: 'DC', icon: DartCounterIcon, tone: 'bg-[#F76505] text-white border-[#F76505]', lightTone: 'bg-[#F76505] text-white border-[#F76505] shadow-sm' },
              ] as const
            ).map((m) => {
              const Icon = m.icon;
              const active = currentMode === m.id;
              const showInviteDot = m.id === 'dartcounter' && pendingInviteCount > 0;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleSwitchMode(m.id)}
                  className={cn(
                    'relative inline-flex items-center justify-center gap-1 py-2 px-1.5 rounded-lg text-[11px] sm:text-xs font-bold border transition-colors cursor-pointer',
                    active
                      ? isDartCounterMode
                        ? m.lightTone
                        : m.tone
                      : isDartCounterMode
                      ? 'border-transparent text-slate-600 hover:text-slate-900'
                      : 'border-transparent text-slate-400 hover:text-white'
                  )}
                >
                  <Icon className={cn('w-3.5 h-3.5 shrink-0', m.id === 'dartcounter' && !active && 'text-[#F76505]')} />
                  <span className="truncate">{m.id === 'dartcounter' ? 'DartCounter' : m.label}</span>
                  {showInviteDot && (
                    <span className="w-2 h-2 rounded-full bg-[#F76505] ring-2 ring-white animate-pulse shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
          )}
        </div>
      </header>

      {/* Instant Feedback Toast */}
      {toast && (
        <div
          className={cn(
            'fixed top-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full border text-xs font-bold shadow-2xl animate-in fade-in zoom-in-95',
            isDartCounterMode
              ? 'bg-[#111827] border-[#F76505] text-white'
              : 'bg-slate-950/95 border-emerald-400/50 text-emerald-300'
          )}
        >
          {toast}
        </div>
      )}

      {/* =====================================================================
          DEDICATED GAME / PRACTICE COMPANION OR TARGET DARTCOUNTER CONTROLLER
         ===================================================================== */}
      {state && activeGame && activeGameDef ? (
        <GameCompanionScreen
          state={state}
          activeGame={activeGame}
          gameDef={activeGameDef}
          dispatch={dispatch}
          newPlayerName={newPlayerName}
          setNewPlayerName={setNewPlayerName}
          newPlayerColor={newPlayerColor}
          setNewPlayerColor={setNewPlayerColor}
          saveNewPlayer={saveNewPlayer}
          setSaveNewPlayer={setSaveNewPlayer}
          onAddPlayerSubmit={handleAddPlayerSubmit}
        />
      ) : isDartCounterMode ? (
        <DartCounterRemoteScreen state={state} dispatch={dispatch} />
      ) : (
        <>
          {/* =====================================================================
              IPAD / TABLET 2-COLUMN COMMAND DECK (md and above)
             ===================================================================== */}
          <main className="hidden md:grid max-w-6xl w-full mx-auto px-5 pt-5 grid-cols-12 gap-5 items-start">
            {/* LEFT COLUMN (7 cols): Live Telemetry + Primary Pads + Quick Throw Pad */}
            <div className="col-span-7 space-y-4">
              {renderLiveReadoutCard()}
              {renderPrimaryActions()}
              {renderThrowPad()}
            </div>

            {/* RIGHT COLUMN (5 cols): Context-Aware 1st Tab (Goals / Games / Drills) + Players + Replays + Display */}
            <div className="col-span-5 space-y-4">
              <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-slate-900/85 border border-white/10">
                {(
                  [
                    { id: 'mode', label: modeTabMeta.label, icon: modeTabMeta.icon },
                    { id: 'players', label: 'Players', icon: Users },
                    { id: 'replays', label: 'Replays', icon: Clapperboard },
                    { id: 'display', label: 'Display', icon: Monitor },
                  ] as const
                ).map((tab) => {
                  const Icon = tab.icon;
                  const active = tabletRightPanel === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setTabletRightPanel(tab.id)}
                      className={cn(
                        'py-2.5 px-1 rounded-xl text-[11px] font-black uppercase tracking-wider flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer',
                        active
                          ? currentMode === 'practice' && tab.id === 'mode'
                            ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                          : 'text-slate-400 hover:text-white'
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {tabletRightPanel === 'mode' && renderModePanel()}
              {tabletRightPanel === 'players' && renderPlayersPanel()}
              {tabletRightPanel === 'replays' && renderReplaysPanel()}
              {tabletRightPanel === 'display' && renderDisplayPanel()}
            </div>
          </main>

          {/* =====================================================================
              PHONE SINGLE-COLUMN FALLBACK (< md)
             ===================================================================== */}
          <main className="md:hidden flex-1 w-full max-w-lg mx-auto px-4 pt-4 space-y-4">
            {renderLiveReadoutCard()}

            {mobileTab === 'control' && (
              <div className="space-y-3">
                {renderPrimaryActions()}

                <button
                  type="button"
                  onClick={() => setShowMobileThrowPad((v) => !v)}
                  className={cn(
                    'w-full card-matte p-3 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold cursor-pointer',
                    showMobileThrowPad ? 'border-emerald-400/50 text-emerald-200' : 'text-slate-200'
                  )}
                >
                  <Crosshair className="w-4 h-4 text-emerald-400" />
                  {showMobileThrowPad ? 'Hide Quick Throw Pad' : 'Open Quick Throw / Correction Pad'}
                </button>

                {showMobileThrowPad && renderThrowPad()}
              </div>
            )}

            {mobileTab === 'mode' && renderModePanel()}
            {mobileTab === 'players' && renderPlayersPanel()}
            {mobileTab === 'replays' && renderReplaysPanel()}
            {mobileTab === 'display' && renderDisplayPanel()}
          </main>

          {/* Phone-Only Fixed Bottom Thumb Bar (< md) */}
          <nav
            className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0B0F17]/95 backdrop-blur-md border-t border-white/10 px-2 pt-2"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}
          >
            <div className="max-w-lg mx-auto grid grid-cols-5 gap-1">
              {(
                [
                  { id: 'control', label: 'Control', icon: Sliders },
                  { id: 'mode', label: modeTabMeta.label, icon: modeTabMeta.icon },
                  { id: 'players', label: 'Players', icon: Users },
                  { id: 'replays', label: 'Replays', icon: Clapperboard },
                  { id: 'display', label: 'Display', icon: Monitor },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                const active = mobileTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMobileTab(tab.id)}
                    className={cn(
                      'flex flex-col items-center justify-center py-2 rounded-xl transition-colors cursor-pointer',
                      active
                        ? isPartyMode
                          ? 'bg-purple-500/25 text-amber-300'
                          : 'bg-emerald-500/20 text-emerald-300'
                        : 'text-slate-400'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-[10px] font-bold mt-1">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        </>
      )}

      {/* Camera Issues Popup Modal (auto-opens on FIRST camera error, or when tapping Header Camera Warning icon) */}
      {isCameraIssueModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-label="Camera Issues Detected"
        >
          <div className="w-full max-w-md card-matte rounded-3xl border-2 border-amber-400/55 bg-[#0E1420] shadow-[0_0_50px_-10px_rgba(245,158,11,0.45)] overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 pt-5 pb-4 border-b border-white/10 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    'w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 relative',
                    hasCameraIssue
                      ? 'bg-amber-500/15 border-amber-400/50 text-amber-300'
                      : 'bg-emerald-500/15 border-emerald-400/50 text-emerald-300'
                  )}
                >
                  <Camera className="w-5 h-5" />
                  {hasCameraIssue && (
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400 fill-rose-950 absolute -top-1 -right-1" />
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-black text-white tracking-tight leading-tight">
                    {hasCameraIssue ? 'Camera Issues Detected' : 'All Cameras Online'}
                  </h2>
                  <p className="text-xs font-mono text-slate-400 mt-0.5">
                    {hasCameraIssue
                      ? 'Split-Cam Auto-Clipper needs attention'
                      : 'Oche Cam & 3 Board Cams are healthy'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCameraIssueModalOpen(false)}
                aria-label="Close camera warning"
                className="p-2 rounded-xl bg-slate-900/90 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Diagnostics Body */}
            <div className="p-5 space-y-3.5">
              {/* Oche Webcam Status Card */}
              <div
                className={cn(
                  'p-3.5 rounded-2xl border space-y-1',
                  state?.replayStatus === 'error' || state?.replayError
                    ? 'bg-rose-500/12 border-rose-400/45'
                    : 'bg-emerald-500/10 border-emerald-400/35'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider font-black text-slate-200">
                    Oche / Throwing Webcam
                  </span>
                  <Badge
                    variant={
                      state?.replayStatus === 'error' || state?.replayError ? 'rose' : 'emerald'
                    }
                    size="sm"
                    dot
                  >
                    {state?.replayStatus === 'error' || state?.replayError ? 'ERROR' : 'LIVE'}
                  </Badge>
                </div>
                <p className="text-xs text-slate-200 leading-snug break-words">
                  {state?.replayError
                    ? state.replayError
                    : state?.replayActiveCameraLabel
                    ? `Streaming from ${state.replayActiveCameraLabel}`
                    : state?.replayStatus === 'starting'
                    ? 'Starting Oche webcam...'
                    : 'Ready'}
                </p>
              </div>

              {/* Autodarts 3-Cam Board Feed Status Card */}
              <div
                className={cn(
                  'p-3.5 rounded-2xl border space-y-1',
                  state?.replayBoardFeedError
                    ? 'bg-amber-500/12 border-amber-400/45'
                    : 'bg-slate-900/75 border-white/10'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider font-black text-slate-200">
                    Autodarts 3 Board Cameras
                  </span>
                  <Badge
                    variant={
                      state?.replayBoardFeedError
                        ? 'amber'
                        : state?.replayBoardFeedActive
                        ? 'emerald'
                        : 'slate'
                    }
                    size="sm"
                    dot
                  >
                    {state?.replayBoardFeedError
                      ? 'ISSUE'
                      : state?.replayBoardFeedActive
                      ? 'LIVE'
                      : 'STANDBY'}
                  </Badge>
                </div>
                <p className="text-xs text-slate-300 leading-snug break-words">
                  {state?.replayBoardFeedError ||
                    (state?.replayBoardFeedActive
                      ? '3-camera live stack connected (port 3180).'
                      : 'Will connect automatically once Split-Cam starts.')}
                </p>
              </div>

              {/* Quick Camera Picker if multiple cameras are detected */}
              {(state?.replayAvailableCameras?.length || 0) > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                    Detected PC Cameras ({state!.replayAvailableCameras.length}) — Tap to try as Oche Cam
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                    {state!.replayAvailableCameras.map((cam) => {
                      const isSelected = state?.replaySelectedDeviceId === cam.deviceId;
                      return (
                        <button
                          key={cam.deviceId}
                          type="button"
                          onClick={() =>
                            void dispatch(
                              { type: 'select_oche_camera', deviceId: cam.deviceId },
                              `Switching Oche cam → ${cam.label}`
                            )
                          }
                          className={cn(
                            'px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer max-w-full truncate',
                            isSelected
                              ? 'bg-emerald-500/20 border-emerald-400/55 text-emerald-200'
                              : cam.isAutodartsBoardCam
                              ? 'bg-slate-900/60 border-white/10 text-slate-500 hover:text-slate-300'
                              : 'bg-slate-900 border-white/15 text-white hover:border-emerald-400/50'
                          )}
                        >
                          {cam.label}
                          {cam.isAutodartsBoardCam ? ' (Autodarts Board)' : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={() =>
                    void dispatch(
                      { type: 'redetect_cameras' },
                      'Auto-detecting all cameras & restarting Split-Cam...'
                    )
                  }
                  className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer shadow-[0_0_24px_rgba(16,185,129,0.3)]"
                >
                  <RefreshCw className="w-4 h-4" />
                  Auto-Detect &amp; Retry Cameras
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCameraIssueModalOpen(false);
                      setTabletRightPanel('replays');
                      setMobileTab('replays');
                    }}
                    className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-white/10 border border-white/15 text-slate-200 font-bold text-xs uppercase tracking-wider cursor-pointer"
                  >
                    Open Replays Tab
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCameraIssueModalOpen(false)}
                    className="py-2.5 px-3 rounded-xl bg-slate-900/70 hover:bg-white/10 border border-white/10 text-slate-300 font-bold text-xs uppercase tracking-wider cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden PIN-Protected Dev Console QR Modal (Code: 0161 — 5-tap AD crest) */}
      <DevConsoleQrModal
        isOpen={isDevQrOpen}
        onClose={() => setIsDevQrOpen(false)}
        connectedDevs={0}
      />
    </div>
  );
};
