import React, { useCallback, useRef, useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useLiveBoardStore } from '../../store/useLiveBoardStore';
import { getGameDefinition } from '../gameRegistry';
import { GameModuleController, GameResult } from '../../types/games';
import { gameEventBus } from '../../services/gameEventBus';
import { generateSimulatedThrow } from '../../services/simulator';
import { soundEngine } from '../utils/soundEngine';
import { DART_COLOR_OPTIONS, DEFAULT_DART_COLOR } from '../../lib/playerThemes';
import { Badge } from '../../components/common/Badge';
import {
  ArrowLeft,
  Volume2,
  VolumeX,
  Undo2,
  RotateCcw,
  Play,
  UserPlus,
  X,
  Trophy,
  Terminal,
  Sliders,
  Sparkles,
  Users,
  Wifi,
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface GameHostProps {
  isLocalConnected: boolean;
}

const QUICK_SIM_TARGETS = ['T20', 'S20', 'T19', 'D16', 'Bull', '25', 'D20', 'Miss'] as const;

/**
 * The Plug-In Game Socket ("GameHost").
 *
 * Wraps every playable modular game cartridge and provides:
 * 1. Setup Lobby (Player Roster picker, Guest creator, dynamic Config Options from GameDefinition)
 * 2. Live Arcade Chrome (Back to Lobby, Sound toggle, Undo, Restart, Board status, Dev/Demo Throw Injector)
 * 3. Unified Victory Podium & Rematch Flow
 */
export const GameHost: React.FC<GameHostProps> = ({ isLocalConnected }) => {
  const {
    activeGameId,
    matchPhase,
    roster,
    matchConfig,
    lastResult,
    matchInstanceKey,
    soundEnabled,
    exitGameToLobby,
    setMatchConfigValue,
    addRosterPlayer,
    removeRosterPlayer,
    startMatch,
    completeMatch,
    rematch,
    toggleSound,
    setActiveController,
    setCanUndoActiveGame,
  } = useGameStore();

  const savedPlayers = usePlayerStore((s) => s.players);
  const addPlayerProfile = usePlayerStore((s) => s.addPlayer);
  const currentVisitThrows = useLiveBoardStore((s) => s.currentVisitThrows);
  const boardStatus = useLiveBoardStore((s) => s.boardStatus);

  const [guestName, setGuestName] = useState('');
  const [guestDartColor, setGuestDartColor] = useState<string>(DART_COLOR_OPTIONS[2].hex);
  const [saveGuestAccount, setSaveGuestAccount] = useState<boolean>(false);
  const [canUndo, setCanUndo] = useState(false);
  const [showSimBar, setShowSimBar] = useState(false);

  const controllerRef = useRef<GameModuleController>({});

  const game = activeGameId ? getGameDefinition(activeGameId) : undefined;

  const registerController = useCallback(
    (controller: GameModuleController) => {
      controllerRef.current = controller;
      setActiveController(controller);
      if (controller.canUndo) {
        const nextCanUndo = controller.canUndo();
        setCanUndo(nextCanUndo);
        setCanUndoActiveGame(nextCanUndo);
      }
    },
    [setActiveController, setCanUndoActiveGame]
  );

  const handleCanUndoChange = useCallback(
    (nextCanUndo: boolean) => {
      setCanUndo(nextCanUndo);
      setCanUndoActiveGame(nextCanUndo);
    },
    [setCanUndoActiveGame]
  );

  const handleGameComplete = useCallback(
    (result: GameResult) => {
      if (!game) return;
      soundEngine.playVictory(soundEnabled);
      completeMatch(game.title, result);
    },
    [game, soundEnabled, completeMatch]
  );

  if (!game || !game.component) {
    return (
      <main className="w-full max-w-[1600px] mx-auto px-4 py-12 text-center">
        <div className="card-matte rounded-2xl p-8 max-w-lg mx-auto space-y-4">
          <Sparkles className="w-10 h-10 text-amber-400 mx-auto" />
          <h2 className="text-2xl font-black text-white">Game Module Not Installed Yet</h2>
          <p className="text-sm text-slate-400">
            This cartridge is currently marked as Coming Soon. Follow{' '}
            <code className="text-emerald-400 font-mono">GAMES_DEVELOPMENT_GUIDE.md</code> to
            plug it into the socket.
          </p>
          <button
            type="button"
            onClick={exitGameToLobby}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-sm hover:bg-emerald-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Games Lobby
          </button>
        </div>
      </main>
    );
  }

  const GameComponent = game.component;
  const Icon = game.icon;
  const canStartMatch = roster.length >= game.minPlayers && roster.length <= game.maxPlayers;

  const handleAddGuest = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = guestName.trim();
    if (!trimmed) return;
    if (saveGuestAccount) {
      const newId = addPlayerProfile(trimmed, {
        dartColor: guestDartColor,
        isSaved: true,
      });
      addRosterPlayer(trimmed, newId, undefined, guestDartColor);
    } else {
      addRosterPlayer(trimmed, undefined, undefined, guestDartColor);
    }
    setGuestName('');
    setSaveGuestAccount(false);
    // Advance default swatch so the next guest gets a distinct darts colour automatically
    const nextIdx =
      (DART_COLOR_OPTIONS.findIndex((c) => c.hex === guestDartColor) + 1) %
      DART_COLOR_OPTIONS.length;
    setGuestDartColor(DART_COLOR_OPTIONS[nextIdx].hex);
  };

  const handleQuickThrow = (target: string) => {
    if (target === 'Miss') {
      gameEventBus.injectManualDart({
        id: `sim-miss-${Date.now()}`,
        visitDartIndex: 0,
        segment: { name: 'Miss', number: 0, bed: 'Outside', multiplier: 0 },
        score: 0,
        coords: { x: 1.12, y: 0.15 },
        timestamp: Date.now(),
      });
      return;
    }
    const dart = generateSimulatedThrow(target, 0, 0.015);
    gameEventBus.injectManualDart(dart);
  };

  return (
    <main className="w-full max-w-[1600px] mx-auto px-4 py-4 sm:px-6 sm:py-5 space-y-4">
      {/* Shared Arcade Top Bar */}
      <div className="card-matte rounded-2xl px-4 py-3 sm:px-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={exitGameToLobby}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-white/10 border border-white/10 text-slate-200 text-xs sm:text-sm font-bold transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Lobby</span>
          </button>

          <div className="h-6 w-px bg-white/10" />

          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-emerald-400">
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white leading-tight">
                {game.title}
              </h2>
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                {matchPhase === 'setup'
                  ? 'Match Setup'
                  : matchPhase === 'finished'
                  ? 'Match Complete'
                  : boardStatus === 'takeout'
                  ? 'Pull Darts From Board'
                  : 'Live Match'}
              </span>
            </div>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2">
          {matchPhase === 'playing' && (
            <>
              <button
                type="button"
                onClick={() => controllerRef.current.undoLastAction?.()}
                disabled={!canUndo}
                title="Undo Last Dart"
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-colors',
                  canUndo
                    ? 'bg-slate-900/90 border-white/15 text-slate-200 hover:bg-white/10'
                    : 'bg-slate-900/40 border-white/5 text-slate-600 cursor-not-allowed'
                )}
              >
                <Undo2 className="w-4 h-4" />
                <span className="hidden sm:inline">Undo</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (controllerRef.current.restartMatch) {
                    controllerRef.current.restartMatch();
                  } else {
                    rematch();
                  }
                }}
                title="Restart Match"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-white/10 border border-white/15 text-slate-200 text-xs font-bold transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="hidden sm:inline">Restart</span>
              </button>

              <button
                type="button"
                onClick={() => setShowSimBar((v) => !v)}
                title="Toggle Virtual Throw Bar (Testing)"
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-colors',
                  showSimBar
                    ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                    : 'bg-slate-900/90 border-white/15 text-slate-300 hover:bg-white/10'
                )}
              >
                <Terminal className="w-4 h-4" />
                <span className="hidden sm:inline">Test Throws</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={toggleSound}
            title={soundEnabled ? 'Mute Arcade SFX' : 'Unmute Arcade SFX'}
            className="p-2 rounded-xl bg-slate-900/90 hover:bg-white/10 border border-white/15 text-slate-300 hover:text-white transition-colors"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-rose-400" />}
          </button>
        </div>
      </div>

      {/* Collapsible Virtual Throw Test Bar (works even without physical Autodarts board) */}
      {matchPhase === 'playing' && showSimBar && (
        <div className="card-matte rounded-2xl px-4 py-3 border-amber-500/30 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-mono uppercase tracking-wider text-amber-400 font-bold mr-1">
              Inject Dart:
            </span>
            {QUICK_SIM_TARGETS.map((target) => (
              <button
                key={target}
                type="button"
                onClick={() => handleQuickThrow(target)}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-400/40 text-xs font-mono font-bold text-slate-200 transition-colors"
              >
                {target}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => gameEventBus.injectManualTakeout()}
            className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-xs font-bold text-amber-300 transition-colors"
          >
            Simulate Pull Darts (Next Turn)
          </button>
        </div>
      )}

      {/* PHASE 1: MATCH SETUP */}
      {matchPhase === 'setup' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Left: Player Roster Picker */}
          <div className="xl:col-span-7 card-matte rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-emerald-400" />
                  Player Lineup
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                  Requires {game.minPlayers}–{game.maxPlayers} players. Order shown is turn order.
                </p>
              </div>
              <Badge variant={canStartMatch ? 'emerald' : 'amber'} size="sm">
                {roster.length} / {game.maxPlayers} Players
              </Badge>
            </div>

            {/* Active Roster List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {roster.map((player, idx) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/80 border border-white/10"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm text-slate-950 shrink-0"
                      style={{ backgroundColor: player.colorHex }}
                    >
                      {player.avatarInitial}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white truncate">{player.name}</div>
                      <div className="text-[11px] font-mono text-slate-400">Player {idx + 1}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRosterPlayer(player.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    title="Remove from match"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Saved Profiles Quick Add */}
            {savedPlayers.some((sp) => !roster.some((r) => r.id === sp.id)) && (
              <div className="space-y-2">
                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
                  Add Saved Profile
                </span>
                <div className="flex flex-wrap gap-2">
                  {savedPlayers
                    .filter((sp) => !roster.some((r) => r.id === sp.id))
                    .map((sp) => (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={() =>
                          addRosterPlayer(sp.name, sp.id, sp.nickname, sp.dartColor)
                        }
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-white/10 hover:border-emerald-400/50 text-xs font-bold text-slate-200 transition-colors"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: sp.dartColor || DEFAULT_DART_COLOR }}
                        />
                        + {sp.name}
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Quick Add Guest Player with Darts Colour + Optional Save */}
            <form onSubmit={handleAddGuest} className="space-y-3 p-3.5 rounded-xl bg-slate-900/60 border border-white/[0.08]">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Add player / guest name..."
                  maxLength={20}
                  className="flex-1 rounded-xl bg-slate-950/70 border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={!guestName.trim() || roster.length >= game.maxPlayers}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-40 text-emerald-300 border border-emerald-500/30 text-sm font-bold transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  Add
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono text-slate-400 mr-1">Darts colour:</span>
                  {DART_COLOR_OPTIONS.slice(0, 7).map((opt) => {
                    const active = guestDartColor === opt.hex;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setGuestDartColor(opt.hex)}
                        title={opt.label}
                        className={cn(
                          'w-5 h-5 rounded-full transition-transform cursor-pointer',
                          active ? 'scale-125 ring-2 ring-white' : 'opacity-70 hover:opacity-100'
                        )}
                        style={{ backgroundColor: opt.hex }}
                      />
                    );
                  })}
                </div>

                <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={saveGuestAccount}
                    onChange={(e) => setSaveGuestAccount(e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-emerald-500 cursor-pointer"
                  />
                  <span>Save account &amp; theme</span>
                </label>
              </div>
            </form>
          </div>

          {/* Right: Game Options & Start CTA */}
          <div className="xl:col-span-5 card-matte rounded-2xl p-5 sm:p-6 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-sky-400" />
                Match Settings
              </h3>

              {game.configOptions.map((opt) => {
                const value = matchConfig[opt.key] ?? opt.defaultValue;
                return (
                  <div
                    key={opt.key}
                    className="p-3.5 rounded-xl bg-slate-900/70 border border-white/[0.07] space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold text-white">{opt.label}</div>
                        {opt.description && (
                          <div className="text-xs text-slate-400">{opt.description}</div>
                        )}
                      </div>

                      {opt.type === 'toggle' && (
                        <button
                          type="button"
                          onClick={() => setMatchConfigValue(opt.key, !value)}
                          className={cn(
                            'w-12 h-6 rounded-full transition-colors p-0.5 shrink-0',
                            value ? 'bg-emerald-500' : 'bg-slate-700'
                          )}
                        >
                          <div
                            className={cn(
                              'w-5 h-5 rounded-full bg-white transition-transform',
                              value ? 'translate-x-6' : 'translate-x-0'
                            )}
                          />
                        </button>
                      )}
                    </div>

                    {opt.type === 'select' && opt.options && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {opt.options.map((choice) => {
                          const active = value === choice.value;
                          return (
                            <button
                              key={String(choice.value)}
                              type="button"
                              onClick={() => setMatchConfigValue(opt.key, choice.value)}
                              className={cn(
                                'px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors',
                                active
                                  ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
                                  : 'bg-slate-950/60 border-white/10 text-slate-400 hover:text-white'
                              )}
                            >
                              {choice.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-3 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span className="flex items-center gap-1.5">
                  <Wifi className={cn('w-3.5 h-3.5', isLocalConnected ? 'text-emerald-400' : 'text-amber-400')} />
                  {isLocalConnected ? 'Autodarts Board Ready' : 'Board Offline (Test Mode Ready)'}
                </span>
              </div>

              <button
                type="button"
                disabled={!canStartMatch}
                onClick={startMatch}
                className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-black text-base sm:text-lg uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-[0_0_24px_rgba(16,185,129,0.35)] disabled:shadow-none"
              >
                <Play className="w-5 h-5 fill-current" />
                {canStartMatch
                  ? `Start ${game.title}`
                  : `Add at least ${game.minPlayers} players`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 2: ACTIVE GAME SOCKET */}
      {matchPhase === 'playing' && (
        <div key={matchInstanceKey} className="w-full">
          <GameComponent
            players={roster}
            config={matchConfig}
            soundEnabled={soundEnabled}
            isBoardConnected={isLocalConnected}
            boardStatus={boardStatus}
            currentVisitThrows={currentVisitThrows}
            onGameComplete={handleGameComplete}
            registerController={registerController}
            onCanUndoChange={handleCanUndoChange}
          />
        </div>
      )}

      {/* PHASE 3: VICTORY PODIUM */}
      {matchPhase === 'finished' && lastResult && (
        <div className="card-matte rounded-2xl p-6 sm:p-10 max-w-3xl mx-auto text-center space-y-6 border-emerald-500/40 shadow-[0_0_40px_-8px_rgba(16,185,129,0.3)]">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center mx-auto">
            <Trophy className="w-9 h-9 text-amber-400" />
          </div>

          <div>
            <Badge variant="emerald" size="md" className="mb-3">
              Match Complete
            </Badge>
            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
              {lastResult.headline}
            </h2>
            <p className="text-sm sm:text-base text-slate-400 mt-2 font-mono">
              {lastResult.totalDartsThrown} darts thrown •{' '}
              {Math.max(1, Math.round(lastResult.durationMs / 60000))} min
            </p>
          </div>

          {/* Standings Table */}
          <div className="space-y-2.5 text-left">
            {lastResult.standings.map((row) => (
              <div
                key={row.playerId}
                className={cn(
                  'flex items-center justify-between gap-4 p-4 rounded-xl border',
                  row.rank === 1
                    ? 'bg-amber-500/10 border-amber-400/40'
                    : 'bg-slate-900/70 border-white/10'
                )}
              >
                <div className="flex items-center gap-3.5">
                  <span className="text-xl font-black font-mono text-slate-400 w-7">
                    #{row.rank}
                  </span>
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0"
                    style={{ backgroundColor: row.colorHex }}
                  />
                  <div>
                    <div className="text-base sm:text-lg font-extrabold text-white">
                      {row.playerName}
                    </div>
                    {row.secondaryStat && (
                      <div className="text-xs text-slate-400 font-mono">{row.secondaryStat}</div>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xl sm:text-2xl font-black font-mono tabular-nums text-white">
                    {row.primaryStatValue}
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                    {row.primaryStatLabel}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Highlights */}
          {lastResult.highlights && lastResult.highlights.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {lastResult.highlights.map((h) => (
                <Badge key={h} variant="sky" size="sm">
                  {h}
                </Badge>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={rematch}
              className="px-6 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm uppercase tracking-wider transition-colors"
            >
              Play Rematch
            </button>
            <button
              type="button"
              onClick={exitGameToLobby}
              className="px-6 py-3.5 rounded-xl bg-slate-900 hover:bg-white/10 border border-white/15 text-white font-bold text-sm uppercase tracking-wider transition-colors"
            >
              Back to Games Lobby
            </button>
          </div>
        </div>
      )}
    </main>
  );
};
