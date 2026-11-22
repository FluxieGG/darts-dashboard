import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RemoteCommand, RemoteKioskState, RemotePresencePayload } from '../../types/remote';
import { sendRemoteCommand } from '../../services/remoteBridge';
import { GAME_REGISTRY, getGameDefinition } from '../../games/gameRegistry';
import { DART_COLOR_OPTIONS, DEFAULT_DART_COLOR, hexToRgbTriplet } from '../../lib/playerThemes';
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
} from 'lucide-react';
import { cn } from '../../lib/utils';

type MobileTab = 'control' | 'games' | 'players' | 'throw';
type TabletRightPanel = 'games' | 'players';

const QUICK_TARGETS = ['T20', 'S20', 'T19', 'T18', 'D20', 'D16', 'Bull', '25', 'Miss'] as const;
const BOARD_NUMBERS = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const;

/**
 * iPad-First Oche Command Deck (and responsive Phone Remote) at `/?remote=1`.
 *
 * Uses resilient SSE + instant HTTP pull recovery on iPadOS Safari wake/focus
 * plus a 3s fallback sync poll so the iPad NEVER stalls or loses sync at the oche.
 */
export const MobileRemoteView: React.FC = () => {
  const [state, setState] = useState<RemoteKioskState | null>(null);
  const [connected, setConnected] = useState(false);
  const [kioskOnline, setKioskOnline] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('control');
  const [tabletRightPanel, setTabletRightPanel] = useState<TabletRightPanel>('games');
  const [toast, setToast] = useState<string | null>(null);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerColor, setNewPlayerColor] = useState<string>(DART_COLOR_OPTIONS[2].hex);
  const [saveNewPlayer, setSaveNewPlayer] = useState<boolean>(true);
  const [throwMult, setThrowMult] = useState<'S' | 'D' | 'T'>('S');
  const [syncing, setSyncing] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const lastEventAtRef = useRef<number>(0);

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
    connectStream();

    // iPadOS Safari sleep/wake recovery: immediately refresh state & reopen SSE stream
    const handleWake = () => {
      if (document.visibilityState === 'visible') {
        void pullLatestState();
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
    }, 1500);
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

  const handleManualResync = async () => {
    setSyncing(true);
    connectStream();
    await pullLatestState();
    setSyncing(false);
    flashToast('Synced with Kiosk');
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
  const activeTintHex = state?.activeTintHex ?? null;
  const isTurnTint = Boolean(activeGame && activeTintHex);
  const canUndoNow = Boolean(activeGame && activeGame.phase === 'playing' && activeGame.canUndo);
  const camBuffering = state?.replayStatus === 'buffering';
  const camCapturing = state?.replayStatus === 'capturing';

  const remoteStyle = activeTintHex
    ? ({
        '--player-tint-rgb': hexToRgbTriplet(activeTintHex),
        '--player-tint-hex': activeTintHex,
      } as React.CSSProperties)
    : undefined;

  // Shared Sub-Sections (reused cleanly across both iPad 2-col deck & Phone tabs)
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
              : state?.activeView === 'games-lobby'
              ? 'Tech Darts Arcade Lobby'
              : `${state?.activePlayer.name || 'Player'} • Stats Dashboard`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {state && (
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/35 text-xs font-mono font-black text-emerald-300 tabular-nums">
              3DA {state.statsSnapshot.threeDartAvg.toFixed(1)}
            </span>
          )}
          <Badge
            variant={state?.boardStatus === 'takeout' ? 'amber' : state?.isLocalConnected ? 'emerald' : 'slate'}
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
      {/* SAVE LAST RECORDING CARD (Appears prominently whenever a replay was captured!) */}
      {state?.lastRecording && (
        <div
          className={cn(
            'rounded-2xl p-3.5 border-2 flex items-center justify-between gap-3 transition-all',
            state.lastRecording.isSaved
              ? 'bg-emerald-500/10 border-emerald-400/35'
              : 'bg-emerald-500/15 border-emerald-400/75 shadow-[0_0_24px_-4px_rgba(16,185,129,0.45)]'
          )}
        >
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

      {/* Action Replay Trigger / Dismiss Strip */}
      <div className="grid grid-cols-2 gap-3">
        {state?.hasActiveReplayOverlay ? (
          <button
            type="button"
            onClick={() => void dispatch({ type: 'dismiss_replay' }, 'Closed Replay Overlay')}
            className="col-span-2 p-3.5 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 border-2 border-rose-400/60 text-rose-100 font-black text-sm flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
          >
            <X className="w-5 h-5" />
            Dismiss Action Replay on Big Screen
          </button>
        ) : (
          <button
            type="button"
            disabled={!camBuffering || camCapturing}
            onClick={() =>
              void dispatch({ type: 'trigger_manual_replay' }, 'Recording 10s Split-Cam Clip!')
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
            <span>{camCapturing ? 'Capturing 5s...' : 'Clip That! (10s)'}</span>
          </button>
        )}

        {!state?.hasActiveReplayOverlay && (
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
        )}
      </div>

      {/* Contextual Game or Dashboard Utility Row */}
      <div className="grid grid-cols-2 gap-3">
        {activeGame ? (
          <>
            <button
              type="button"
              onClick={() => void dispatch({ type: 'restart_match' }, 'Restarted Match')}
              className="card-matte p-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-slate-200 hover:bg-white/5 active:scale-[0.97] cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-amber-400" />
              Restart Game
            </button>
            <button
              type="button"
              onClick={() => void dispatch({ type: 'exit_game' }, 'Back to Games Lobby')}
              className="card-matte p-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-rose-300 hover:bg-rose-500/10 active:scale-[0.97] cursor-pointer"
            >
              <X className="w-4 h-4" />
              Exit Game
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

  const renderGamesPanel = () => (
    <div className="space-y-4">
      {/* ACTIVE GAME SETUP (Full Roster + Saved Profiles + Dynamic Match Options!) */}
      {activeGame && activeGame.phase === 'setup' && (
        <section className="card-matte rounded-2xl p-4 sm:p-5 border-emerald-400/45 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">
                {activeGame.title} — Match Setup
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

          {/* Quick-Add Saved Profiles into Match Roster */}
          {(state?.players || []).some(
            (sp) => !activeGame.roster.some((r) => r.id === sp.id)
          ) && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-mono uppercase text-slate-400 mr-1">
                Saved:
              </span>
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

          {/* Dynamic Match Config Options synced live with Kiosk! */}
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
      {activeGame && activeGame.phase === 'finished' && (
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

      {/* ALL 8 GAMES LAUNCHER GRID */}
      <div className="grid grid-cols-2 gap-2.5">
        {GAME_REGISTRY.map((g) => {
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

  const renderPlayersPanel = () => (
    <div className="space-y-3">
      {isPartyMode && (
        <div className="card-matte rounded-2xl p-4 border-amber-400/40 flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-amber-300 shrink-0" />
          <div className="text-xs text-slate-200 leading-relaxed">
            <strong>Party Mode is active.</strong> Personal profiles are locked so guest darts
            never affect your saved 3-Dart Average.
          </div>
        </div>
      )}

      <section className="card-matte rounded-2xl p-4 space-y-2.5">
        <div className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">
          Saved Profiles
        </div>
        {(state?.players || []).map((p) => {
          const isCurrent = !isPartyMode && state?.activePlayer.id === p.id;
          const inGameSetup = activeGame?.phase === 'setup';
          const alreadyInRoster = activeGame?.roster.some((r) => r.id === p.id);

          return (
            <button
              key={p.id}
              type="button"
              disabled={isPartyMode && !inGameSetup}
              onClick={() => {
                if (inGameSetup && !alreadyInRoster) {
                  void dispatch(
                    { type: 'add_saved_to_roster', playerId: p.id },
                    `Added ${p.name} to lineup`
                  );
                } else if (!isPartyMode) {
                  void dispatch({ type: 'switch_player', playerId: p.id }, `Switched to ${p.name}`);
                }
              }}
              className={cn(
                'w-full flex items-center justify-between p-3 rounded-xl border transition-colors cursor-pointer',
                isCurrent
                  ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-200'
                  : 'bg-slate-900/80 border-white/10 text-white hover:border-white/25'
              )}
            >
              <span className="font-bold text-sm flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: p.dartColor || DEFAULT_DART_COLOR }}
                />
                {p.name} {p.isPrimary ? '(Primary)' : ''}
              </span>
              <span className="text-xs font-mono text-slate-400">
                {inGameSetup
                  ? alreadyInRoster
                    ? 'In Game'
                    : '+ Add to Game'
                  : isCurrent
                  ? 'Active'
                  : 'Select'}
              </span>
            </button>
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
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={saveNewPlayer}
              onChange={(e) => setSaveNewPlayer(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-emerald-500"
            />
            Save account
          </label>
        </div>
      </form>
    </div>
  );

  return (
    <div
      data-theme={isPartyMode ? 'party' : 'default'}
      data-player-tint={!isPartyMode && Boolean(activeTintHex) ? 'on' : 'off'}
      data-turn-tint={isTurnTint ? 'on' : 'off'}
      style={remoteStyle}
      className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col font-sans select-none antialiased pb-24 md:pb-8"
    >
      {/* iPad & Mobile Top Command Header */}
      <header
        className={cn(
          'sticky top-0 z-30 backdrop-blur-md border-b px-4 py-3 sm:px-6 transition-colors',
          isPartyMode
            ? 'bg-[#120A20]/95 border-purple-400/25'
            : 'bg-[#0B0F17]/95 border-white/10'
        )}
      >
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Left: Brand */}
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                'w-9 h-9 rounded-xl flex items-center justify-center font-mono font-black text-slate-950 text-sm',
                isPartyMode
                  ? 'bg-gradient-to-tr from-purple-600 via-fuchsia-500 to-amber-300'
                  : 'bg-gradient-to-tr from-emerald-500 to-emerald-300'
              )}
            >
              AD
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-black tracking-tight text-white leading-none">
                OCHE DECK
              </h1>
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                {isPartyMode ? 'Vice Party Mode' : state?.activePlayer.name || 'Connecting...'}
              </span>
            </div>
          </div>

          {/* Center (iPad): Instant View Switcher + Party Toggle */}
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-1 p-1 rounded-xl bg-slate-900/90 border border-white/10">
              <button
                type="button"
                onClick={() => void dispatch({ type: 'navigate', view: 'dashboard' }, 'Stats Dashboard')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer',
                  state?.activeView === 'dashboard'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'text-slate-400 hover:text-white'
                )}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                Dashboard
              </button>
              <button
                type="button"
                onClick={() => void dispatch({ type: 'navigate', view: 'games-lobby' }, 'Games Arcade')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer',
                  state?.activeView !== 'dashboard'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'text-slate-400 hover:text-white'
                )}
              >
                <Gamepad2 className="w-3.5 h-3.5" />
                Arcade
              </button>
            </div>

            {/* Dedicated Party Mode Toggle in Header */}
            <button
              type="button"
              onClick={() =>
                void dispatch(
                  { type: 'toggle_party_mode' },
                  isPartyMode ? 'Party Mode Stopped' : 'Vice Party Mode Live!'
                )
              }
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer',
                isPartyMode
                  ? 'bg-gradient-to-r from-purple-600/35 via-fuchsia-600/30 to-amber-500/25 text-amber-200 border-amber-400/60'
                  : 'bg-slate-900/80 text-purple-200 border-purple-400/25 hover:border-amber-400/40'
              )}
            >
              {isPartyMode ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
                  <span>Stop Party</span>
                </>
              ) : (
                <>
                  <PartyPopper className="w-3.5 h-3.5 text-purple-300" />
                  <span>Party Mode</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => void handleManualResync()}
              title="Force Resync with Kiosk"
              className="p-2 rounded-xl bg-slate-900/80 border border-white/10 text-slate-300 hover:text-white cursor-pointer"
            >
              <RefreshCw className={cn('w-4 h-4', syncing && 'animate-spin')} />
            </button>

            <Badge variant={connected && kioskOnline ? 'emerald' : 'rose'} size="sm" dot>
              <Wifi className="w-3 h-3" />
              {connected && kioskOnline ? 'Paired' : connected ? 'No Kiosk' : 'Offline'}
            </Badge>
          </div>
        </div>
      </header>

      {/* Instant Feedback Toast */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-slate-950/95 border border-emerald-400/50 text-emerald-300 text-xs font-bold shadow-2xl animate-in fade-in zoom-in-95">
          {toast}
        </div>
      )}

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

        {/* RIGHT COLUMN (5 cols): Games / Setup + Players Switcher */}
        <div className="col-span-5 space-y-4">
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-slate-900/85 border border-white/10">
            <button
              type="button"
              onClick={() => setTabletRightPanel('games')}
              className={cn(
                'py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer',
                tabletRightPanel === 'games'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              <Gamepad2 className="w-4 h-4" />
              Games &amp; Setup
            </button>
            <button
              type="button"
              onClick={() => setTabletRightPanel('players')}
              className={cn(
                'py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer',
                tabletRightPanel === 'players'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              <Users className="w-4 h-4" />
              Players
            </button>
          </div>

          {tabletRightPanel === 'games' ? renderGamesPanel() : renderPlayersPanel()}
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
              onClick={() =>
                void dispatch(
                  {
                    type: 'navigate',
                    view: state?.activeView === 'dashboard' ? 'games-lobby' : 'dashboard',
                  },
                  state?.activeView === 'dashboard' ? 'Opened Arcade Lobby' : 'Back to Dashboard'
                )
              }
              className="w-full card-matte p-3.5 rounded-2xl flex items-center justify-center gap-2 text-sm font-bold text-emerald-300"
            >
              {state?.activeView === 'dashboard' ? (
                <>
                  <Gamepad2 className="w-5 h-5" />
                  Open Games Arcade
                </>
              ) : (
                <>
                  <LayoutDashboard className="w-5 h-5" />
                  Back to Stats Dashboard
                </>
              )}
            </button>
          </div>
        )}

        {mobileTab === 'games' && renderGamesPanel()}
        {mobileTab === 'players' && renderPlayersPanel()}
        {mobileTab === 'throw' && renderThrowPad()}
      </main>

      {/* Phone-Only Fixed Bottom Thumb Bar (< md) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0B0F17]/95 backdrop-blur-md border-t border-white/10 px-2 py-2">
        <div className="max-w-lg mx-auto grid grid-cols-4 gap-1">
          {[
            { id: 'control' as const, label: 'Control', icon: Sliders },
            { id: 'games' as const, label: 'Games', icon: Gamepad2 },
            { id: 'players' as const, label: 'Players', icon: Users },
            { id: 'throw' as const, label: 'Throw', icon: Crosshair },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = mobileTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMobileTab(tab.id)}
                className={cn(
                  'flex flex-col items-center justify-center py-2 rounded-xl transition-colors',
                  active
                    ? isPartyMode
                      ? 'bg-purple-500/25 text-amber-300'
                      : 'bg-emerald-500/20 text-emerald-300'
                    : 'text-slate-400'
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-bold mt-1">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
