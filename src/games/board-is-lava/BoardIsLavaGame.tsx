import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Heart, Shield, Snowflake, Skull, Zap } from 'lucide-react';
import { GameModuleProps } from '../../types/games';
import { DartThrow } from '../../types/darts';
import { SvgDartboard, SegmentOverlayStyle } from '../../components/dartboard/SvgDartboard';
import { DartPlotOverlay } from '../../components/dartboard/DartPlotOverlay';
import { useGameBoardEvents } from '../hooks/useGameBoardEvents';
import { useActiveTurnTint } from '../hooks/useActiveTurnTint';
import { soundEngine } from '../utils/soundEngine';
import { injectBoardClickThrow } from '../utils/dartHelpers';
import { CalloutBanner, GameCallout, VisitPillsStrip } from '../components/ArcadePrimitives';
import { gameEventBus } from '../../services/gameEventBus';
import { cn } from '../../lib/utils';
import {
  advanceTurn,
  applyDartToState,
  buildGameResult,
  createInitialState,
  getHeatLevelMeta,
} from './engine';
import { LavaDartFeedback, LavaGameState, LavaHistorySnapshot } from './types';

function createFreshSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
}

export const BoardIsLavaGame: React.FC<GameModuleProps> = ({
  players,
  config,
  soundEnabled,
  isBoardConnected,
  boardStatus,
  onGameComplete,
  registerController,
  onCanUndoChange,
}) => {
  const startedAtRef = useRef<number>(Date.now());
  const completedRef = useRef<boolean>(false);
  const completeTimerRef = useRef<number | null>(null);
  const calloutTimerRef = useRef<number | null>(null);
  const calloutIdRef = useRef<number>(1);

  const initialGameState = useMemo(
    () => createInitialState(players, config, createFreshSeed()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [state, setState] = useState<LavaGameState>(initialGameState);
  const [historyCount, setHistoryCount] = useState<number>(0);
  const [callout, setCallout] = useState<GameCallout | null>(null);

  const stateRef = useRef<LavaGameState>(initialGameState);
  const turnStartRef = useRef<LavaGameState>(initialGameState);
  const historyRef = useRef<LavaHistorySnapshot[]>([]);

  const clearTimers = useCallback(() => {
    if (completeTimerRef.current !== null) {
      window.clearTimeout(completeTimerRef.current);
      completeTimerRef.current = null;
    }
    if (calloutTimerRef.current !== null) {
      window.clearTimeout(calloutTimerRef.current);
      calloutTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const showCallout = useCallback((next: Omit<GameCallout, 'id'>, durationMs = 1700) => {
    if (calloutTimerRef.current !== null) {
      window.clearTimeout(calloutTimerRef.current);
    }
    calloutIdRef.current += 1;
    setCallout({ id: calloutIdRef.current, ...next });
    calloutTimerRef.current = window.setTimeout(() => {
      setCallout(null);
      calloutTimerRef.current = null;
    }, durationMs);
  }, []);

  const triggerFeedback = useCallback(
    (feedback: LavaDartFeedback) => {
      if (feedback.ignored) return;
      switch (feedback.sound) {
        case 'hit':
          soundEngine.playDartHit(soundEnabled);
          break;
        case 'bonus':
          soundEngine.playBonusHit(soundEnabled);
          break;
        case 'jackpot':
          soundEngine.playJackpot(soundEnabled);
          break;
        case 'hazard':
          soundEngine.playHazard(soundEnabled);
          break;
        case 'elimination':
          soundEngine.playElimination(soundEnabled);
          break;
        default:
          break;
      }
      if (feedback.callout) {
        showCallout(feedback.callout);
      }
    },
    [soundEnabled, showCallout]
  );

  const scheduleComplete = useCallback(
    (finishedState: LavaGameState) => {
      if (completedRef.current) return;
      completedRef.current = true;
      completeTimerRef.current = window.setTimeout(() => {
        onGameComplete(buildGameResult(finishedState, startedAtRef.current));
      }, 750);
    },
    [onGameComplete]
  );

  const commitState = useCallback(
    (
      nextState: LavaGameState,
      nextTurnStart: LavaGameState,
      nextHistory: LavaHistorySnapshot[]
    ) => {
      stateRef.current = nextState;
      turnStartRef.current = nextTurnStart;
      historyRef.current = nextHistory;
      setState(nextState);
      setHistoryCount(nextHistory.length);
    },
    []
  );

  const handleUndo = useCallback(() => {
    const stack = historyRef.current;
    if (stack.length === 0) return;

    if (completeTimerRef.current !== null) {
      window.clearTimeout(completeTimerRef.current);
      completeTimerRef.current = null;
    }
    completedRef.current = false;

    const prevSnapshot = stack[stack.length - 1];
    const nextHistory = stack.slice(0, -1);
    commitState(prevSnapshot.state, prevSnapshot.turnStartState, nextHistory);
    setCallout(null);
  }, [commitState]);

  const handleRestart = useCallback(() => {
    clearTimers();
    completedRef.current = false;
    startedAtRef.current = Date.now();
    gameEventBus.resetVisitBuffer([]);

    const fresh = createInitialState(players, config, createFreshSeed());
    commitState(fresh, fresh, []);
    setCallout(null);
  }, [clearTimers, players, config, commitState]);

  useEffect(() => {
    registerController({
      undoLastAction: handleUndo,
      canUndo: () => historyRef.current.length > 0,
      restartMatch: handleRestart,
    });
  }, [registerController, handleUndo, handleRestart]);

  useEffect(() => {
    onCanUndoChange?.(historyCount > 0);
  }, [historyCount, onCanUndoChange]);

  useGameBoardEvents({
    enabled: !state.isFinished,
    onDartThrown: (dart) => {
      const current = stateRef.current;
      if (current.isFinished || current.turnEndedEarly || current.visitEntries.length >= 3) {
        return;
      }

      const { nextState, feedback } = applyDartToState(current, dart);
      if (feedback.ignored) return;

      const nextHistory = [
        ...historyRef.current,
        { state: current, turnStartState: turnStartRef.current },
      ];
      commitState(nextState, turnStartRef.current, nextHistory);
      triggerFeedback(feedback);

      if (nextState.isFinished) {
        scheduleComplete(nextState);
      }
    },
    onDartCorrected: (_dart, _prevDart, _dartIndex, visitThrows) => {
      // Clean replay from turnStartState so mid-visit camera revisions never cause drift
      let replayed = turnStartRef.current;
      let lastFeedback: LavaDartFeedback | null = null;

      for (const t of visitThrows) {
        const res = applyDartToState(replayed, t);
        replayed = res.nextState;
        if (!res.feedback.ignored) {
          lastFeedback = res.feedback;
        }
      }

      commitState(replayed, turnStartRef.current, historyRef.current);
      if (lastFeedback) {
        triggerFeedback(lastFeedback);
      }
      if (replayed.isFinished) {
        scheduleComplete(replayed);
      }
    },
    onVisitCompleted: () => {
      const current = stateRef.current;
      if (current.isFinished) return;

      const nextHistory = [
        ...historyRef.current,
        { state: current, turnStartState: turnStartRef.current },
      ];
      const nextState = advanceTurn(current);
      commitState(nextState, nextState, nextHistory);

      if (nextState.isFinished) {
        soundEngine.playJackpot(soundEnabled);
        scheduleComplete(nextState);
      } else {
        soundEngine.playTurnChange(soundEnabled);
        if (nextState.round > current.round) {
          showCallout(
            {
              title: `🌋 ROUND ${nextState.round} ERUPTION!`,
              subtitle: `${nextState.lavaSegments.length} wedges are now molten lava!`,
              accent: 'rose',
            },
            1800
          );
        }
      }
    },
  });

  const activePlayer = state.players[state.activePlayerIndex] ?? state.players[0];
  useActiveTurnTint(activePlayer?.colorHex);
  const heat = getHeatLevelMeta(state.lavaSegments.length);
  const survivorsCount = state.players.filter((p) => !p.isEliminated).length;

  const visitDarts: DartThrow[] = useMemo(
    () => state.visitEntries.map((e) => e.dart),
    [state.visitEntries]
  );

  // Build dynamic glowing lava & cool-down overlays on SvgDartboard
  const segmentOverlays = useMemo<Record<string, SegmentOverlayStyle>>(() => {
    const overlays: Record<string, SegmentOverlayStyle> = {};

    state.lavaSegments.forEach((num, idx) => {
      overlays[String(num)] = {
        fill: idx % 2 === 0 ? '#F43F5E' : '#F97316',
        opacity: 0.8,
        stroke: '#FDBA74',
        pulse: true,
        badge: '🔥',
        badgeColor: '#FFFFFF',
      };
    });

    state.extinguishedSegments.forEach((num) => {
      overlays[String(num)] = {
        fill: '#0EA5E9',
        opacity: 0.28,
        stroke: '#38BDF8',
        badge: '❄️',
        badgeColor: '#E0F2FE',
      };
    });

    if (state.config.bullCoolsLava && state.lavaSegments.length > 0) {
      overlays['Bull'] = {
        fill: '#38BDF8',
        opacity: 0.92,
        stroke: '#FFFFFF',
        pulse: true,
      };
      overlays['25'] = {
        fill: '#0EA5E9',
        opacity: 0.68,
        stroke: '#BAE6FD',
      };
    }

    return overlays;
  }, [state.lavaSegments, state.extinguishedSegments, state.config.bullCoolsLava]);

  return (
    <div className="space-y-4">
      {/* TOP SPOTLIGHT: Active Thrower + Heat Meter + Visit Strip */}
      <div
        className="card-matte rounded-2xl p-4 sm:p-5 border-2 transition-colors"
        style={{
          borderColor: activePlayer ? `${activePlayer.colorHex}80` : undefined,
          boxShadow: activePlayer ? `0 0 36px -10px ${activePlayer.colorHex}66` : undefined,
        }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          {/* Active Player Identity */}
          <div className="lg:col-span-5 flex items-center gap-3.5 min-w-0">
            <div
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center font-black text-2xl sm:text-3xl text-slate-950 shrink-0 shadow-lg"
              style={{ backgroundColor: activePlayer?.colorHex ?? '#F43F5E' }}
            >
              {activePlayer?.avatarInitial ?? '?'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-mono font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-rose-500/20 border border-rose-400/50 text-rose-300">
                  ROUND {state.round} / {state.maxRounds}
                </span>
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400">
                  {survivorsCount} Alive
                </span>
              </div>
              <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight truncate mt-0.5">
                {activePlayer?.name}
              </h2>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1">
                  {Array.from({ length: activePlayer?.maxLives ?? 3 }).map((_, idx) => {
                    const filled = idx < (activePlayer?.lives ?? 0);
                    return (
                      <Heart
                        key={idx}
                        className={cn(
                          'w-5 h-5 transition-all',
                          filled
                            ? 'text-rose-500 fill-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.75)]'
                            : 'text-slate-700'
                        )}
                      />
                    );
                  })}
                </div>
                <span className="text-lg sm:text-xl font-black font-mono tabular-nums text-emerald-300">
                  {activePlayer?.score ?? 0} pts
                </span>
              </div>
            </div>
          </div>

          {/* Heat Escalation Meter */}
          <div className="lg:col-span-3 bg-slate-900/80 rounded-xl p-3 border border-white/10 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-orange-300">
                <Flame className="w-4 h-4 text-rose-500 fill-orange-500" />
                Board Heat
              </span>
              <span className={cn('text-xs font-mono font-black uppercase', heat.textClass)}>
                {heat.label}
              </span>
            </div>

            <div className="h-3 w-full rounded-full bg-slate-950 overflow-hidden border border-white/10">
              <div
                className={cn(
                  'h-full rounded-full bg-gradient-to-r transition-all duration-500',
                  heat.barClass
                )}
                style={{ width: `${heat.percent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 tabular-nums">
              <span className="text-rose-300 font-bold">{state.lavaSegments.length} Lava</span>
              <span className="text-emerald-300 font-bold">{20 - state.lavaSegments.length} Safe</span>
            </div>
          </div>

          {/* 3-Dart Visit Strip */}
          <div className="lg:col-span-4">
            <VisitPillsStrip
              darts={visitDarts}
              dartLabels={state.visitEntries.map((e) => e.label)}
              dartTones={state.visitEntries.map((e) => e.tone)}
              boardStatus={boardStatus}
              turnComplete={state.turnEndedEarly || state.visitEntries.length >= 3}
            />
          </div>
        </div>
      </div>

      {/* DRAMATIC CALLOUT BANNER */}
      <CalloutBanner callout={callout} />

      {/* MAIN STAGE: Portrait-First Dartboard + Responsive Landscape Side Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 xl:gap-5 items-start">
        {/* CENTERPIECE: Interactive Molten Dartboard */}
        <div className="xl:col-span-7 card-matte rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-rose-400" />
              <span className="text-sm sm:text-base font-black text-white uppercase tracking-wide">
                Dodge The Lava Wedges
              </span>
            </div>

            {state.config.bullCoolsLava && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/15 border border-sky-400/40 text-sky-200 text-xs font-bold">
                <Snowflake className="w-3.5 h-3.5 text-sky-300" />
                <span>Bull / 25 = Cool 1 Lava + 50 pts</span>
              </div>
            )}
          </div>

          <div className="py-1">
            <SvgDartboard
              size={500}
              segmentOverlays={segmentOverlays}
              dimInactiveSegments={false}
              onBoardClick={!isBoardConnected ? injectBoardClickThrow : undefined}
            >
              <DartPlotOverlay
                sessionThrows={[]}
                currentVisitThrows={visitDarts}
                mode="dots"
              />
            </SvgDartboard>
          </div>

          {/* Active Lava Wedge Summary Strip (8ft glanceable) */}
          <div className="rounded-xl bg-slate-900/80 border border-white/10 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider">
              <span className="text-rose-300 font-bold flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                Active Lava ({state.lavaSegments.length})
              </span>
              {!isBoardConnected && (
                <span className="text-slate-400">Click board to throw</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {state.lavaSegments.length > 0 ? (
                state.lavaSegments.map((num) => (
                  <span
                    key={num}
                    className="px-2.5 py-1 rounded-lg bg-rose-500/20 border border-rose-400/50 text-rose-200 font-mono font-black text-xs sm:text-sm tabular-nums"
                  >
                    🔥 {num}
                  </span>
                ))
              ) : (
                <span className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                  <Shield className="w-4 h-4" />
                  All lava wedges cooled for this round!
                </span>
              )}
            </div>
          </div>
        </div>

        {/* SCOREBOARD CARDS: 2-col on portrait, side column on xl: */}
        <div className="xl:col-span-5 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-slate-400">
              Survivors &amp; Scoreboard
            </h3>
            <span className="text-xs font-mono text-slate-400 tabular-nums">
              Visit: +{state.visitScore} pts
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
            {state.players.map((p, idx) => {
              const isActive = idx === state.activePlayerIndex && !state.isFinished;
              return (
                <div
                  key={p.id}
                  className={cn(
                    'card-matte rounded-2xl p-4 border-2 transition-all',
                    p.isEliminated && 'opacity-45 grayscale-[45%] border-rose-900/40',
                    !p.isEliminated && !isActive && 'border-white/10'
                  )}
                  style={
                    isActive && !p.isEliminated
                      ? {
                          borderColor: p.colorHex,
                          boxShadow: `0 0 28px -8px ${p.colorHex}80`,
                        }
                      : undefined
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-lg text-slate-950 shrink-0"
                        style={{ backgroundColor: p.isEliminated ? '#475569' : p.colorHex }}
                      >
                        {p.isEliminated ? <Skull className="w-5 h-5 text-rose-300" /> : p.avatarInitial}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'text-lg sm:text-xl font-black truncate',
                              p.isEliminated ? 'text-slate-400 line-through' : 'text-white'
                            )}
                          >
                            {p.name}
                          </span>
                          {isActive && !p.isEliminated && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-[10px] font-mono font-black uppercase tracking-wider shrink-0">
                              UP NOW
                            </span>
                          )}
                          {p.isEliminated && (
                            <span className="px-2 py-0.5 rounded-md bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-mono font-black uppercase tracking-wider shrink-0">
                              BURNED RD {p.eliminatedOnRound}
                            </span>
                          )}
                        </div>

                        {/* Hearts Row */}
                        <div className="flex items-center gap-1.5 mt-1.5">
                          {Array.from({ length: p.maxLives }).map((_, heartIdx) => {
                            const alive = heartIdx < p.lives;
                            return (
                              <Heart
                                key={heartIdx}
                                className={cn(
                                  'w-4 h-4 sm:w-5 sm:h-5 transition-all',
                                  alive
                                    ? 'text-rose-500 fill-rose-500'
                                    : 'text-slate-700'
                                )}
                              />
                            );
                          })}
                          <span className="ml-2 text-xs font-mono text-slate-400 tabular-nums">
                            {p.safeHits} safe
                            {p.bullCools > 0 && (
                              <span className="text-sky-300 ml-1.5">• ❄️{p.bullCools}</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Massive Tabular Score */}
                    <div className="text-right shrink-0">
                      <div className="text-3xl sm:text-4xl font-black font-mono tabular-nums text-white leading-none">
                        {p.score}
                      </div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mt-1 flex items-center justify-end gap-1">
                        <Zap className="w-3 h-3 text-amber-400" />
                        PTS
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
