import React, { useCallback, useRef } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { useLiveBoardStore } from '../../store/useLiveBoardStore';
import { useReplayStore } from '../../store/useReplayStore';
import { getGameDefinition } from '../gameRegistry';
import { GameModuleController, GameResult } from '../../types/games';
import { soundEngine } from '../utils/soundEngine';
import { Badge } from '../../components/common/Badge';
import {
  Volume2,
  VolumeX,
  Trophy,
  Sliders,
  Sparkles,
  Users,
  Wifi,
  Tablet,
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface GameHostProps {
  isLocalConnected: boolean;
}

/**
 * The Plug-In Broadcast Game Socket ("GameHost").
 *
 * Pure Kiosk Display Mode (8-foot glanceable, zero on-screen controls):
 * 1. Setup Phase: Large Match Lineup & Rules Showcase driven live by the iPad Oche Deck
 * 2. Live Arena: Clean Broadcast Header + Active Game Cartridge
 * 3. Victory Podium: Celebratory Standings Screen (Rematch / Exit driven from iPad)
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
    completeMatch,
    setActiveController,
    setCanUndoActiveGame,
  } = useGameStore();

  const currentVisitThrows = useLiveBoardStore((s) => s.currentVisitThrows);
  const boardStatus = useLiveBoardStore((s) => s.boardStatus);

  const controllerRef = useRef<GameModuleController>({});

  const game = activeGameId ? getGameDefinition(activeGameId) : undefined;

  const registerController = useCallback(
    (controller: GameModuleController) => {
      controllerRef.current = controller;
      setActiveController(controller);
      if (controller.canUndo) {
        setCanUndoActiveGame(controller.canUndo());
      }
    },
    [setActiveController, setCanUndoActiveGame]
  );

  const handleCanUndoChange = useCallback(
    (nextCanUndo: boolean) => {
      setCanUndoActiveGame(nextCanUndo);
    },
    [setCanUndoActiveGame]
  );

  const handleGameComplete = useCallback(
    (result: GameResult) => {
      if (!game) return;
      soundEngine.playVictory(soundEnabled);
      completeMatch(game.title, result);

      // Automatically clip & save the game-winning shot / checkout for EVERY game!
      const winnerName =
        result.winnerName?.trim() || result.standings[0]?.playerName || 'Winner';
      const visitThrows = useLiveBoardStore.getState().currentVisitThrows;
      const winningDart = visitThrows[visitThrows.length - 1];
      const clipTitle = `${game.title} - Game Winning Shot - ${winnerName}`;

      void useReplayStore.getState().triggerActionReplay({
        playerName: winnerName,
        segmentName: winningDart?.segment.name || 'WIN',
        score: winningDart?.score ?? 0,
        reason: clipTitle,
        customFileName: clipTitle,
        coords: winningDart?.coords,
        category: 'game',
        forceAutoSave: true,
      });
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
            Select an available Tech Darts game from the iPad Oche Deck.
          </p>
        </div>
      </main>
    );
  }

  const GameComponent = game.component;
  const Icon = game.icon;
  const canStartMatch = roster.length >= game.minPlayers && roster.length <= game.maxPlayers;

  return (
    <main className="w-full max-w-[1600px] mx-auto px-4 py-4 sm:px-6 sm:py-5 space-y-4">
      {/* Pure Broadcast Arena Header */}
      <div className="card-matte rounded-2xl px-4 py-3 sm:px-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-emerald-400 shrink-0">
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-white leading-tight tracking-tight">
              {game.title}
            </h2>
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
              {matchPhase === 'setup'
                ? 'Match Lineup & Setup'
                : matchPhase === 'finished'
                ? 'Match Complete'
                : boardStatus === 'takeout'
                ? 'Pull Darts From Board'
                : 'Live Match'}
            </span>
          </div>
        </div>

        {/* Passive Status Indicators */}
        <div className="flex items-center gap-2">
          <Badge
            variant={
              matchPhase === 'playing'
                ? boardStatus === 'takeout'
                  ? 'amber'
                  : 'emerald'
                : matchPhase === 'finished'
                ? 'purple'
                : 'sky'
            }
            size="sm"
            dot
          >
            {matchPhase === 'setup'
              ? 'Waiting for iPad Start'
              : matchPhase === 'finished'
              ? 'Final Result'
              : boardStatus === 'takeout'
              ? 'Pull Darts'
              : 'Live'}
          </Badge>

          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/80 border border-white/10 text-[11px] font-mono text-slate-300"
            title={soundEnabled ? 'Arcade SFX Enabled' : 'Arcade SFX Muted'}
          >
            {soundEnabled ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden sm:inline">SFX</span>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden sm:inline text-rose-300">Muted</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* PHASE 1: BROADCAST MATCH SETUP SHOWCASE (Driven live by iPad Oche Deck) */}
      {matchPhase === 'setup' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Left: Large 8ft-Glanceable Player Lineup */}
          <div className="xl:col-span-7 card-matte rounded-2xl p-6 sm:p-7 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2.5">
                  <Users className="w-6 h-6 text-emerald-400" />
                  Player Lineup
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                  {game.minPlayers}–{game.maxPlayers} players • Turn order shown below
                </p>
              </div>
              <Badge variant={canStartMatch ? 'emerald' : 'amber'} size="md">
                {roster.length} / {game.maxPlayers} Players
              </Badge>
            </div>

            {roster.length === 0 ? (
              <div className="py-12 rounded-2xl border border-dashed border-white/15 bg-slate-900/40 text-center text-slate-400 text-sm">
                Add players to the lineup from the iPad Oche Deck
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {roster.map((player, idx) => (
                  <div
                    key={player.id}
                    className="flex items-center gap-4 p-4 rounded-2xl bg-slate-900/80 border border-white/10"
                    style={{
                      borderColor: `${player.colorHex}55`,
                      boxShadow: `0 0 24px -10px ${player.colorHex}66`,
                    }}
                  >
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center font-black text-lg text-slate-950 shrink-0 shadow-lg"
                      style={{ backgroundColor: player.colorHex }}
                    >
                      {player.avatarInitial}
                    </div>
                    <div className="min-w-0">
                      <div className="text-lg sm:text-xl font-black text-white truncate">
                        {player.name}
                      </div>
                      <div className="text-xs font-mono uppercase tracking-wider text-slate-400">
                        Throwing #{idx + 1}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Live Selected Match Rules + iPad Start Cue */}
          <div className="xl:col-span-5 card-matte rounded-2xl p-6 sm:p-7 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <h3 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2.5">
                <Sliders className="w-6 h-6 text-sky-400" />
                {game.mode === 'practice' ? 'Drill Rules' : 'Match Rules'}
              </h3>

              {game.configOptions.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-900/70 border border-white/[0.08] text-sm text-slate-300 leading-relaxed">
                  {game.description}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {game.configOptions.map((opt) => {
                    const value = matchConfig[opt.key] ?? opt.defaultValue;
                    const displayValue =
                      opt.type === 'toggle'
                        ? value
                          ? 'ON'
                          : 'OFF'
                        : opt.options?.find((c) => c.value === value)?.label ?? String(value);

                    return (
                      <div
                        key={opt.key}
                        className="p-4 rounded-xl bg-slate-900/70 border border-white/[0.08] flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-bold text-white">{opt.label}</div>
                          {opt.description && (
                            <div className="text-xs text-slate-400 mt-0.5">{opt.description}</div>
                          )}
                        </div>
                        <span
                          className={cn(
                            'shrink-0 px-3 py-1 rounded-lg font-mono text-xs sm:text-sm font-black border',
                            opt.type === 'toggle' && !value
                              ? 'bg-slate-950/70 border-white/10 text-slate-400'
                              : 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                          )}
                        >
                          {displayValue}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-3 pt-3 border-t border-white/10">
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span className="flex items-center gap-1.5">
                  <Wifi
                    className={cn(
                      'w-3.5 h-3.5',
                      isLocalConnected ? 'text-emerald-400' : 'text-amber-400'
                    )}
                  />
                  {isLocalConnected ? 'Autodarts Board Armed' : 'Board Offline'}
                </span>
              </div>

              <div
                className={cn(
                  'w-full py-4 px-5 rounded-2xl border-2 text-center flex items-center justify-center gap-3',
                  canStartMatch
                    ? 'bg-emerald-500/15 border-emerald-400/55 text-emerald-200 shadow-[0_0_28px_-6px_rgba(16,185,129,0.4)]'
                    : 'bg-amber-500/12 border-amber-400/45 text-amber-200'
                )}
              >
                <Tablet className="w-5 h-5 shrink-0 animate-pulse" />
                <span className="font-black text-sm sm:text-base uppercase tracking-wider">
                  {canStartMatch
                    ? `Tap Start ${game.title} on iPad`
                    : `Add at least ${game.minPlayers} players on iPad`}
                </span>
              </div>
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

      {/* PHASE 3: CELEBRATORY VICTORY PODIUM (Zero Kiosk Buttons) */}
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

          {/* Passive iPad Cue */}
          <div className="pt-2 flex items-center justify-center">
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-slate-900/90 border border-white/10 text-xs sm:text-sm font-mono text-slate-300">
              <Tablet className="w-4 h-4 text-emerald-400" />
              <span>Tap Play Rematch or Change Game on iPad Oche Deck</span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
