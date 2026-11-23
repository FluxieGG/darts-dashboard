import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameModuleProps } from '../../types/games';
import { SvgDartboard, SegmentOverlayStyle } from '../../components/dartboard/SvgDartboard';
import { DartPlotOverlay } from '../../components/dartboard/DartPlotOverlay';
import { useGameBoardEvents } from '../hooks/useGameBoardEvents';
import { useActiveTurnTint } from '../hooks/useActiveTurnTint';
import { soundEngine } from '../utils/soundEngine';
import { getCheckoutRoute, injectBoardClickThrow } from '../utils/dartHelpers';
import { CalloutBanner, GameCallout, VisitPillsStrip } from '../components/ArcadePrimitives';
import {
  advanceCatch40Visit,
  applyDartToCatch40,
  buildCatch40Result,
  Catch40Attempt,
  Catch40State,
  createInitialCatch40State,
} from './engine';
import { Award, CheckCircle2, Flame, Target, Trophy } from 'lucide-react';
import { cn } from '../../lib/utils';

export const Catch40Game: React.FC<GameModuleProps> = ({
  players,
  config,
  soundEnabled,
  isBoardConnected,
  boardStatus,
  onGameComplete,
  registerController,
  onCanUndoChange,
}) => {
  const [state, setState] = useState<Catch40State>(() =>
    createInitialCatch40State(players, config)
  );
  const [historyLen, setHistoryLen] = useState(0);
  const [callout, setCallout] = useState<GameCallout | null>(null);

  const stateRef = useRef(state);
  const turnStartRef = useRef(state);
  const historyRef = useRef<Catch40State[]>([]);
  const startedAtRef = useRef(Date.now());
  const completedRef = useRef(false);
  const calloutTimerRef = useRef<number | null>(null);
  const completeTimerRef = useRef<number | null>(null);

  useActiveTurnTint(state.player.colorHex);

  const clearTimers = useCallback(() => {
    if (calloutTimerRef.current !== null) {
      window.clearTimeout(calloutTimerRef.current);
      calloutTimerRef.current = null;
    }
    if (completeTimerRef.current !== null) {
      window.clearTimeout(completeTimerRef.current);
      completeTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const showCallout = useCallback(
    (title: string, subtitle: string | undefined, accent: GameCallout['accent']) => {
      if (calloutTimerRef.current !== null) window.clearTimeout(calloutTimerRef.current);
      setCallout({ id: Date.now() + Math.random(), title, subtitle, accent });
      calloutTimerRef.current = window.setTimeout(() => setCallout(null), 1700);
    },
    []
  );

  const scheduleFinish = useCallback(
    (finalState: Catch40State) => {
      if (completedRef.current) return;
      completedRef.current = true;
      completeTimerRef.current = window.setTimeout(() => {
        onGameComplete(buildCatch40Result(finalState, startedAtRef.current));
      }, 750);
    },
    [onGameComplete]
  );

  const handleUndo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    clearTimers();
    completedRef.current = false;
    stateRef.current = prev;
    if (prev.visitDarts.length === 0) turnStartRef.current = prev;
    setState(prev);
    setHistoryLen(historyRef.current.length);
  }, [clearTimers]);

  const handleRestart = useCallback(() => {
    clearTimers();
    completedRef.current = false;
    startedAtRef.current = Date.now();
    const fresh = createInitialCatch40State(players, config);
    stateRef.current = fresh;
    turnStartRef.current = fresh;
    historyRef.current = [];
    setState(fresh);
    setHistoryLen(0);
    setCallout(null);
  }, [players, config, clearTimers]);

  useEffect(() => {
    registerController({
      undoLastAction: handleUndo,
      canUndo: () => historyRef.current.length > 0,
      restartMatch: handleRestart,
    });
  }, [registerController, handleUndo, handleRestart, historyLen]);

  useEffect(() => {
    onCanUndoChange?.(historyLen > 0);
  }, [historyLen, onCanUndoChange]);

  useGameBoardEvents({
    enabled: !state.isFinished,
    onDartThrown: (dart) => {
      const current = stateRef.current;
      if (current.isFinished || current.turnComplete) return;
      historyRef.current.push(current);
      const { nextState, feedback } = applyDartToCatch40(current, dart);
      stateRef.current = nextState;
      setState(nextState);
      setHistoryLen(historyRef.current.length);

      if (feedback.sound === 'jackpot') soundEngine.playJackpot(soundEnabled);
      else if (feedback.sound === 'bonusHit') soundEngine.playBonusHit(soundEnabled);
      else if (feedback.sound === 'hazard') soundEngine.playHazard(soundEnabled);
      else soundEngine.playDartHit(soundEnabled);

      if (feedback.title) {
        showCallout(feedback.title, feedback.subtitle, feedback.accent || 'emerald');
      }
      if (nextState.isFinished) {
        scheduleFinish(nextState);
      }
    },
    onDartCorrected: (_dart, _prev, _idx, visitThrows) => {
      let replay = turnStartRef.current;
      for (const d of visitThrows) {
        replay = applyDartToCatch40(replay, d).nextState;
      }
      stateRef.current = replay;
      setState(replay);
      if (replay.isFinished) scheduleFinish(replay);
    },
    onVisitCompleted: () => {
      const current = stateRef.current;
      if (current.isFinished || current.visitDarts.length === 0) return;
      historyRef.current.push(current);
      const next = advanceCatch40Visit(current);
      stateRef.current = next;
      turnStartRef.current = next;
      setState(next);
      setHistoryLen(historyRef.current.length);
      soundEngine.playTurnChange(soundEnabled);
      if (next.isFinished) scheduleFinish(next);
    },
  });

  const dartsLeftInVisit = Math.max(1, 3 - state.visitDarts.length);
  const hasSecondVisit = state.dartsLeftInTarget > dartsLeftInVisit;

  const checkoutRoute = useMemo(() => {
    if (state.remaining <= 0 || state.remaining > 170 || state.turnComplete) return null;
    const direct = getCheckoutRoute(state.remaining, 'double', dartsLeftInVisit);
    if (direct) return direct;
    if (hasSecondVisit) {
      return getCheckoutRoute(state.remaining, 'double');
    }
    return null;
  }, [state.remaining, dartsLeftInVisit, hasSecondVisit, state.turnComplete]);

  const segmentOverlays = useMemo<Record<string, SegmentOverlayStyle>>(() => {
    if (!checkoutRoute || checkoutRoute.length === 0) return {};
    const first = checkoutRoute[0];
    const overlays: Record<string, SegmentOverlayStyle> = {
      [first]: {
        fill: '#10B981',
        opacity: 0.92,
        stroke: '#FFFFFF',
        pulse: true,
        badge: first === 'Bull' || first === '25' ? undefined : first,
      },
    };
    if (checkoutRoute[1] && checkoutRoute[1] !== first) {
      overlays[checkoutRoute[1]] = {
        fill: '#38BDF8',
        opacity: 0.55,
      };
    }
    return overlays;
  }, [checkoutRoute]);

  const maxScore = state.length * 3;
  const clearedCount = state.attempts.filter((a) => a.success).length;
  const targetIndex = state.currentTarget - state.startTarget + 1;
  const currentVisitNumber = state.dartsLeftInTarget > 3 || (state.dartsLeftInTarget === 3 && state.visitDarts.length === 3) ? 1 : 2;
  const nextDartNumber = 6 - state.dartsLeftInTarget + 1;
  const liveTierText =
    nextDartNumber <= 2
      ? '+3 PTS (GOLD)'
      : nextDartNumber === 3
      ? '+2 PTS (EMERALD)'
      : '+1 PT (SKY)';
  const liveTierColor =
    nextDartNumber <= 2
      ? 'text-amber-300'
      : nextDartNumber === 3
      ? 'text-emerald-300'
      : 'text-sky-300';

  const attemptByTarget = useMemo(() => {
    const map = new Map<number, Catch40Attempt>();
    for (const att of state.attempts) {
      map.set(att.target, att);
    }
    return map;
  }, [state.attempts]);

  const allTargets = useMemo(() => {
    const list: number[] = [];
    for (let n = state.startTarget; n <= state.endTarget; n++) {
      list.push(n);
    }
    return list;
  }, [state.startTarget, state.endTarget]);

  return (
    <div className="space-y-4">
      <CalloutBanner callout={callout} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Left/Top: Target Checkout Spotlight & Board */}
        <div className="xl:col-span-7 space-y-4">
          <div className="card-matte rounded-2xl p-5 sm:p-6 border-2 border-amber-400/40 space-y-4">
            {/* Top Meta Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm sm:text-base font-mono uppercase tracking-widest text-amber-400 font-extrabold flex items-center gap-2">
                <Target className="w-5 h-5 shrink-0" />
                <span>
                  Target {Math.min(targetIndex, state.length)} of {state.length} •{' '}
                  {state.currentTarget} Checkout
                </span>
              </div>
              <div className="text-sm sm:text-base font-mono font-bold text-slate-300 tabular-nums">
                2d <span className="text-amber-300 font-black">+3</span> • 3d{' '}
                <span className="text-emerald-300 font-black">+2</span> • 4–6d{' '}
                <span className="text-sky-300 font-black">+1</span>
              </div>
            </div>

            {/* Hero Row: Remaining Score + HUGE Darts Left Tile + Oversized PDC Route */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-8xl lg:text-9xl font-black font-mono tabular-nums text-white leading-none tracking-tight">
                  {state.remaining}
                </div>
                <div className={cn('text-base sm:text-lg font-mono font-black mt-2', liveTierColor)}>
                  On Pace: {liveTierText}
                </div>
              </div>

              {/* HUGE Darts Left in Target Tile */}
              <div
                className={cn(
                  'rounded-2xl px-5 py-3.5 border-2 text-center min-w-[215px]',
                  state.dartsLeftInTarget <= 3
                    ? 'bg-amber-500/15 border-amber-400/60 shadow-[0_0_24px_-6px_rgba(245,158,11,0.45)]'
                    : 'bg-emerald-500/15 border-emerald-400/55 shadow-[0_0_24px_-6px_rgba(16,185,129,0.4)]'
                )}
              >
                <div className="text-sm sm:text-base font-mono uppercase tracking-wider text-slate-200 font-extrabold">
                  Darts Left • Visit {currentVisitNumber} / 2
                </div>
                <div
                  className={cn(
                    'text-4xl sm:text-5xl font-black font-mono tabular-nums leading-none mt-1.5',
                    state.dartsLeftInTarget <= 3 ? 'text-amber-300' : 'text-emerald-300'
                  )}
                >
                  {state.dartsLeftInTarget}
                  <span className="text-2xl sm:text-3xl text-slate-400"> / 6</span>
                </div>
                {/* 6 Visual Dart Pips (Visit 1 | Visit 2) */}
                <div className="flex items-center justify-center gap-2 mt-2.5">
                  {[0, 1, 2, 3, 4, 5].map((pipIdx) => {
                    const isAvailable = pipIdx < state.dartsLeftInTarget;
                    return (
                      <React.Fragment key={pipIdx}>
                        {pipIdx === 3 && (
                          <span className="w-0.5 h-5 bg-white/25 rounded-full mx-0.5" />
                        )}
                        <span
                          className={cn(
                            'w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 transition-all',
                            isAvailable
                              ? state.dartsLeftInTarget <= 3
                                ? 'bg-amber-400 border-amber-100 shadow-[0_0_12px_rgba(245,158,11,0.75)]'
                                : 'bg-emerald-400 border-emerald-100 shadow-[0_0_12px_rgba(16,185,129,0.75)]'
                              : 'bg-slate-900 border-slate-700'
                          )}
                        />
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              {/* Oversized Live PDC Checkout Route */}
              <div className="text-right space-y-2 ml-auto">
                <div className="text-sm sm:text-base font-mono uppercase tracking-wider text-slate-300 font-extrabold">
                  PDC Checkout Route
                </div>
                {checkoutRoute ? (
                  <div className="flex items-center justify-end gap-2.5">
                    {checkoutRoute.map((step, i) => (
                      <span
                        key={`${step}-${i}`}
                        className={cn(
                          'px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl font-mono text-3xl sm:text-4xl font-black border-2 leading-none',
                          i === 0
                            ? 'bg-emerald-500/25 border-emerald-400 text-emerald-100 shadow-[0_0_24px_rgba(16,185,129,0.45)]'
                            : 'bg-slate-900 border-white/20 text-white'
                        )}
                      >
                        {step}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="px-5 py-3 rounded-2xl bg-slate-900/85 border-2 border-white/15 text-lg sm:text-xl font-mono font-black text-slate-300">
                    {state.targetResolved === 'cleared'
                      ? 'Checked Out!'
                      : state.targetResolved === 'failed'
                      ? 'Target Missed'
                      : 'Setup to Double'}
                  </div>
                )}
              </div>
            </div>
          </div>

          <VisitPillsStrip
            darts={state.visitDarts}
            boardStatus={boardStatus}
            turnComplete={state.turnComplete}
          />

          <div className="card-matte rounded-2xl p-4 sm:p-5 flex items-center justify-center">
            <SvgDartboard
              size={640}
              segmentOverlays={segmentOverlays}
              dimInactiveSegments={Boolean(checkoutRoute)}
              onBoardClick={!isBoardConnected ? injectBoardClickThrow : undefined}
            >
              <DartPlotOverlay
                sessionThrows={[]}
                currentVisitThrows={state.visitDarts}
                mode="dots"
              />
            </SvgDartboard>
          </div>
        </div>

        {/* Right/Bottom: Big KPI Tiles & Catch 40 Target Grid */}
        <div className="xl:col-span-5 space-y-4">
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <div className="card-matte rounded-2xl p-4 sm:p-5">
              <div className="text-sm sm:text-base font-mono uppercase font-bold text-slate-300 flex items-center gap-1.5">
                <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
                <span>Points</span>
              </div>
              <div className="text-4xl sm:text-5xl font-black font-mono tabular-nums text-amber-300 leading-none mt-2">
                {state.totalScore}
                <span className="text-xl sm:text-2xl text-slate-400">/{maxScore}</span>
              </div>
            </div>

            <div className="card-matte rounded-2xl p-4 sm:p-5">
              <div className="text-sm sm:text-base font-mono uppercase font-bold text-slate-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>Checkouts</span>
              </div>
              <div className="text-4xl sm:text-5xl font-black font-mono tabular-nums text-emerald-300 leading-none mt-2">
                {clearedCount}
                <span className="text-xl sm:text-2xl text-slate-400">/{state.attempts.length}</span>
              </div>
            </div>

            <div className="card-matte rounded-2xl p-4 sm:p-5">
              <div className="text-sm sm:text-base font-mono uppercase font-bold text-slate-300 flex items-center gap-1.5">
                <Award className="w-5 h-5 text-amber-300 shrink-0" />
                <span>2-Dart</span>
              </div>
              <div className="text-4xl sm:text-5xl font-black font-mono tabular-nums text-white leading-none mt-2 flex items-center gap-2">
                <span>{state.twoDartFinishes}</span>
                <Flame className="w-7 h-7 text-amber-400 shrink-0" />
              </div>
            </div>
          </div>

          <div className="card-matte rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between text-sm sm:text-base font-mono uppercase tracking-wider text-slate-300 font-extrabold">
              <span>
                Catch {state.length} Board ({state.startTarget} → {state.endTarget})
              </span>
              <span className="text-white tabular-nums font-black text-base sm:text-lg">
                {state.attempts.length}/{state.length}
              </span>
            </div>

            <div className="grid grid-cols-5 sm:grid-cols-10 xl:grid-cols-5 gap-2">
              {allTargets.map((num) => {
                const att = attemptByTarget.get(num);
                const isCurrent = num === state.currentTarget && !state.isFinished;

                return (
                  <div
                    key={num}
                    className={cn(
                      'py-2 px-1 rounded-xl border-2 text-center font-mono transition-all',
                      isCurrent
                        ? 'bg-emerald-500/25 border-emerald-400 text-white shadow-[0_0_18px_rgba(16,185,129,0.45)] scale-[1.04]'
                        : att
                        ? att.points === 3
                          ? 'bg-amber-500/22 border-amber-400/65 text-amber-200'
                          : att.points === 2
                          ? 'bg-emerald-500/18 border-emerald-400/50 text-emerald-200'
                          : att.points === 1
                          ? 'bg-sky-500/18 border-sky-400/50 text-sky-200'
                          : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                        : 'bg-slate-900/65 border-white/[0.08] text-slate-500'
                    )}
                  >
                    <div className="text-base sm:text-lg font-black tabular-nums leading-none">
                      {num}
                    </div>
                    <div className="text-sm font-extrabold mt-1 tabular-nums leading-none">
                      {att
                        ? att.points > 0
                          ? `+${att.points}`
                          : '0'
                        : isCurrent
                        ? 'NOW'
                        : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
