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
    <div className="space-y-4 sm:space-y-5">
      {/* TOP SPOTLIGHT: Giant Active Thrower + Lives & Score + Heat Meter + Visit Strip */}
      <div
        className="card-matte rounded-2xl p-5 sm:p-6 border-2 transition-colors space-y-4"
        style={{
          borderColor: activePlayer ? `${activePlayer.colorHex}85` : undefined,
          boxShadow: activePlayer ? `0 0 40px -10px ${activePlayer.colorHex}66` : undefined,
        }}
      >
        {/* Row 1: Giant Player Identity, Round/Lava Count, Giant Hearts & Score */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center font-black text-3xl sm:text-4xl text-slate-950 shrink-0 shadow-lg"
              style={{ backgroundColor: activePlayer?.colorHex ?? '#F43F5E' }}
            >
              {activePlayer?.avatarInitial ?? '?'}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-sm sm:text-base font-mono font-black uppercase tracking-widest px-3 py-1 rounded-lg bg-rose-500/20 border border-rose-400/60 text-rose-200 tabular-nums">
                  ROUND {state.round} / {state.maxRounds}
                </span>
                <span className="text-sm sm:text-base font-mono font-black uppercase tracking-wider px-3 py-1 rounded-lg bg-orange-500/20 border border-orange-400/50 text-orange-200 tabular-nums">
                  🔥 {state.lavaSegments.length} LAVA
                </span>
                <span className="text-sm sm:text-base font-mono font-bold uppercase tracking-wider text-slate-300 tabular-nums">
                  {survivorsCount} ALIVE
                </span>
              </div>

              <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight truncate mt-1 leading-none">
                {activePlayer?.name}
              </h2>

              {/* Giant Lives Hearts Row */}
              <div className="flex items-center gap-2 mt-2.5">
                {Array.from({ length: activePlayer?.maxLives ?? 3 }).map((_, idx) => {
                  const filled = idx < (activePlayer?.lives ?? 0);
                  return (
                    <Heart
                      key={idx}
                      className={cn(
                        'w-8 h-8 transition-all',
                        filled
                          ? 'text-rose-500 fill-rose-500 drop-shadow-[0_0_12px_rgba(244,63,94,0.85)]'
                          : 'text-slate-700'
                      )}
                    />
                  );
                })}
                <span className="ml-2 text-sm sm:text-base font-mono font-bold text-slate-300 tabular-nums">
                  {activePlayer?.lives ?? 0} / {activePlayer?.maxLives ?? 3} LIVES
                </span>
              </div>
            </div>
          </div>

          {/* Giant Score Readout */}
          <div className="text-right shrink-0 pl-2">
            <div className="text-sm sm:text-base font-mono font-bold uppercase tracking-widest text-slate-400">
              SCORE
            </div>
            <div className="text-6xl sm:text-7xl font-black font-mono tabular-nums text-emerald-300 leading-none mt-0.5">
              {activePlayer?.score ?? 0}
            </div>
            <div className="text-sm sm:text-base font-mono font-bold text-slate-300 mt-1 tabular-nums">
              +{state.visitScore} this visit
            </div>
          </div>
        </div>

        {/* Row 2: Full-Width Board Heat Escalation Meter */}
        <div className="bg-slate-900/85 rounded-xl px-4 py-3 border border-white/10 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm sm:text-base font-black uppercase tracking-wider text-orange-300">
              <Flame className="w-5 h-5 text-rose-500 fill-orange-500" />
              Board Heat: <span className={cn('font-mono', heat.textClass)}>{heat.label}</span>
            </span>
            <div className="flex items-center gap-4 text-sm sm:text-base font-mono font-black tabular-nums">
              <span className="text-rose-300">{state.lavaSegments.length} LAVA</span>
              <span className="text-slate-600">•</span>
              <span className="text-emerald-300">{20 - state.lavaSegments.length} SAFE</span>
            </div>
          </div>

          <div className="h-3.5 w-full rounded-full bg-slate-950 overflow-hidden border border-white/10">
            <div
              className={cn(
                'h-full rounded-full bg-gradient-to-r transition-all duration-500',
                heat.barClass
              )}
              style={{ width: `${heat.percent}%` }}
            />
          </div>
        </div>

        {/* Row 3: 3-Dart Visit Strip */}
        <VisitPillsStrip
          darts={visitDarts}
          dartLabels={state.visitEntries.map((e) => e.label)}
          dartTones={state.visitEntries.map((e) => e.tone)}
          boardStatus={boardStatus}
          turnComplete={state.turnEndedEarly || state.visitEntries.length >= 3}
        />
      </div>

      {/* DRAMATIC CALLOUT BANNER */}
      <CalloutBanner callout={callout} />

      {/* MAIN STAGE: Portrait-First Giant Dartboard + Responsive Landscape Side Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* CENTERPIECE: Interactive Molten Dartboard */}
        <div className="xl:col-span-7 card-matte rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Flame className="w-6 h-6 text-rose-400" />
              <span className="text-lg sm:text-xl font-black text-white uppercase tracking-wide">
                Dodge The Lava Wedges
              </span>
            </div>

            {state.config.bullCoolsLava && (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-sky-500/15 border border-sky-400/50 text-sky-200 text-sm sm:text-base font-bold">
                <Snowflake className="w-4 h-4 text-sky-300" />
                <span>Bull / 25 = Cool 1 Lava + 50 pts</span>
              </div>
            )}
          </div>

          <div className="flex justify-center py-1">
            <SvgDartboard
              size={660}
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
          <div className="rounded-xl bg-slate-900/85 border border-white/10 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-sm sm:text-base font-mono uppercase tracking-wider">
              <span className="text-rose-300 font-black flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-400" />
                Active Lava ({state.lavaSegments.length})
              </span>
              {!isBoardConnected && (
                <span className="text-slate-400 font-bold">Click board to throw</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {state.lavaSegments.length > 0 ? (
                state.lavaSegments.map((num) => (
                  <span
                    key={num}
                    className="px-3 py-1 rounded-lg bg-rose-500/20 border border-rose-400/60 text-rose-100 font-mono font-black text-sm sm:text-base tabular-nums"
                  >
                    🔥 {num}
                  </span>
                ))
              ) : (
                <span className="text-sm sm:text-base font-bold text-sky-300 flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  All lava wedges cooled for this round!
                </span>
              )}
            </div>
          </div>
        </div>

        {/* SURVIVAL STANDINGS: Big 2-col on portrait, side column on xl: */}
        <div className="xl:col-span-5 space-y-3.5">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm sm:text-base font-mono font-black uppercase tracking-widest text-slate-300">
              Survival Standings
            </h3>
            <span className="text-sm sm:text-base font-mono font-bold text-emerald-300 tabular-nums">
              Visit: +{state.visitScore} pts
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3.5">
            {state.players.map((p, idx) => {
              const isActive = idx === state.activePlayerIndex && !state.isFinished;
              return (
                <div
                  key={p.id}
                  className={cn(
                    'card-matte rounded-2xl p-4 sm:p-5 border-2 transition-all',
                    p.isEliminated && 'opacity-45 grayscale-[45%] border-rose-900/40',
                    !p.isEliminated && !isActive && 'border-white/10'
                  )}
                  style={
                    isActive && !p.isEliminated
                      ? {
                          borderColor: p.colorHex,
                          boxShadow: `0 0 32px -8px ${p.colorHex}85`,
                        }
                      : undefined
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center font-black text-xl sm:text-2xl text-slate-950 shrink-0"
                        style={{ backgroundColor: p.isEliminated ? '#475569' : p.colorHex }}
                      >
                        {p.isEliminated ? <Skull className="w-6 h-6 text-rose-300" /> : p.avatarInitial}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              'text-xl sm:text-2xl font-black truncate',
                              p.isEliminated ? 'text-slate-400 line-through' : 'text-white'
                            )}
                          >
                            {p.name}
                          </span>
                          {isActive && !p.isEliminated && (
                            <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/60 text-emerald-300 text-sm font-mono font-black uppercase tracking-wider shrink-0">
                              UP NOW
                            </span>
                          )}
                          {p.isEliminated && (
                            <span className="px-2.5 py-0.5 rounded-md bg-rose-500/20 border border-rose-500/50 text-rose-300 text-sm font-mono font-black uppercase tracking-wider shrink-0">
                              BURNED RD {p.eliminatedOnRound}
                            </span>
                          )}
                        </div>

                        {/* Large Hearts Row */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          {Array.from({ length: p.maxLives }).map((_, heartIdx) => {
                            const alive = heartIdx < p.lives;
                            return (
                              <Heart
                                key={heartIdx}
                                className={cn(
                                  'w-6 h-6 sm:w-7 sm:h-7 transition-all',
                                  alive
                                    ? 'text-rose-500 fill-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.6)]'
                                    : 'text-slate-700'
                                )}
                              />
                            );
                          })}
                          <span className="ml-2 text-sm sm:text-base font-mono font-bold text-slate-300 tabular-nums">
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
                      <div className="text-sm font-mono font-bold uppercase tracking-widest text-slate-400 mt-1 flex items-center justify-end gap-1">
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
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
