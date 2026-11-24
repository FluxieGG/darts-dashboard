import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameModuleProps } from '../../types/games';
import { SvgDartboard, SegmentOverlayStyle } from '../../components/dartboard/SvgDartboard';
import { DartPlotOverlay } from '../../components/dartboard/DartPlotOverlay';
import { useGameBoardEvents } from '../hooks/useGameBoardEvents';
import { useActiveTurnTint } from '../hooks/useActiveTurnTint';
import { soundEngine } from '../utils/soundEngine';
import { getCheckoutRoute, injectBoardClickThrow } from '../utils/dartHelpers';
import { CalloutBanner, GameCallout, VisitPillsStrip } from '../components/ArcadePrimitives';
import { gameEventBus } from '../../services/gameEventBus';
import {
  advanceCheckout121Visit,
  applyDartToCheckout121,
  buildCheckout121Result,
  Checkout121State,
  createInitialCheckout121State,
} from './engine';
import { CheckCircle2, Flame, Target, Trophy, XCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

export const Checkout121Game: React.FC<GameModuleProps> = ({
  players,
  config,
  soundEnabled,
  isBoardConnected,
  boardStatus,
  onGameComplete,
  registerController,
  onCanUndoChange,
}) => {
  const [state, setState] = useState<Checkout121State>(() =>
    createInitialCheckout121State(players, config)
  );
  const [historyLen, setHistoryLen] = useState(0);
  const [callout, setCallout] = useState<GameCallout | null>(null);

  const stateRef = useRef(state);
  const turnStartRef = useRef(state);
  const historyRef = useRef<Array<{ state: Checkout121State; turnStartState: Checkout121State }>>([]);
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
    (finalState: Checkout121State) => {
      if (completedRef.current) return;
      completedRef.current = true;
      completeTimerRef.current = window.setTimeout(() => {
        onGameComplete(buildCheckout121Result(finalState, startedAtRef.current));
      }, 750);
    },
    [onGameComplete]
  );

  const handleUndo = useCallback(() => {
    const snap = historyRef.current.pop();
    if (!snap) return;
    clearTimers();
    completedRef.current = false;
    stateRef.current = snap.state;
    turnStartRef.current = snap.turnStartState;
    setState(snap.state);
    setHistoryLen(historyRef.current.length);
    setCallout(null);
    gameEventBus.resetVisitBuffer(snap.state.visitDarts);
  }, [clearTimers]);

  const handleRestart = useCallback(() => {
    clearTimers();
    completedRef.current = false;
    startedAtRef.current = Date.now();
    const fresh = createInitialCheckout121State(players, config);
    stateRef.current = fresh;
    turnStartRef.current = fresh;
    historyRef.current = [];
    setState(fresh);
    setHistoryLen(0);
    setCallout(null);
    gameEventBus.resetVisitBuffer([]);
  }, [players, config, clearTimers]);

  useEffect(() => {
    registerController({
      undoLastAction: handleUndo,
      canUndo: () => historyRef.current.length > 0,
      restartMatch: handleRestart,
    });
  }, [registerController, handleUndo, handleRestart]);

  useEffect(() => {
    onCanUndoChange?.(historyLen > 0);
  }, [historyLen, onCanUndoChange]);

  useGameBoardEvents({
    enabled: !state.isFinished,
    onDartThrown: (dart) => {
      const current = stateRef.current;
      if (current.isFinished || current.turnComplete) return;
      historyRef.current.push({ state: current, turnStartState: turnStartRef.current });
      const { nextState, feedback } = applyDartToCheckout121(current, dart);
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
      if (nextState.isFinished) scheduleFinish(nextState);
    },
    onDartCorrected: (_dart, _prev, _idx, visitThrows) => {
      let replay = turnStartRef.current;
      for (const d of visitThrows) {
        replay = applyDartToCheckout121(replay, d).nextState;
      }
      stateRef.current = replay;
      setState(replay);
      if (replay.isFinished) scheduleFinish(replay);
    },
    onVisitCompleted: () => {
      const current = stateRef.current;
      if (current.isFinished || current.visitDarts.length === 0) return;
      historyRef.current.push({ state: current, turnStartState: turnStartRef.current });
      const next = advanceCheckout121Visit(current);
      stateRef.current = next;
      turnStartRef.current = next;
      setState(next);
      setHistoryLen(historyRef.current.length);
      soundEngine.playTurnChange(soundEnabled);
    },
  });

  const dartsLeftInVisit = Math.max(1, 3 - state.visitDarts.length);
  const checkoutRoute = useMemo(() => {
    if (state.turnComplete || state.remaining <= 0 || state.remaining > 170) return null;
    return getCheckoutRoute(state.remaining, 'double', dartsLeftInVisit);
  }, [state.turnComplete, state.remaining, dartsLeftInVisit]);

  const segmentOverlays = useMemo<Record<string, SegmentOverlayStyle>>(() => {
    if (!checkoutRoute || checkoutRoute.length === 0) return {};
    const first = checkoutRoute[0];
    const overlays: Record<string, SegmentOverlayStyle> = {
      [first]: {
        fill: '#10B981',
        opacity: 0.92,
        stroke: '#FFFFFF',
        pulse: true,
        badge: first,
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

  const clearedCount = state.attempts.filter((a) => a.success).length;
  const recentAttempts = [...state.attempts].reverse().slice(0, 6);
  const dartsLeftUrgent = state.dartsLeftInTarget <= 3;
  const dartsLeftCritical = state.dartsLeftInTarget <= 1;

  return (
    <div className="space-y-4">
      <CalloutBanner callout={callout} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 xl:gap-5 items-start">
        {/* Left/Top: Hero Remaining, Darts Left, PDC Route, Visit Strip & Giant Dartboard */}
        <div className="xl:col-span-7 space-y-4">
          {/* Top 2-Column Hero: Remaining Score + Dedicated Huge Darts Left Card */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            {/* Giant Remaining Score Card */}
            <div className="sm:col-span-6 card-matte rounded-2xl p-5 sm:p-6 border-sky-400/40 flex flex-col justify-between">
              <div className="flex items-center gap-2 text-sm sm:text-base font-mono uppercase tracking-widest text-sky-300 font-black">
                <Target className="w-5 h-5 shrink-0 text-sky-400" />
                <span>
                  TARGET {state.attempts.length + 1} / {state.maxTargets} • START {state.currentTarget}
                </span>
              </div>
              <div className="text-8xl lg:text-9xl font-black font-mono tabular-nums text-white leading-none mt-2 tracking-tight">
                {state.remaining}
              </div>
            </div>

            {/* Dedicated HUGE DARTS LEFT Card with 9 Visual Dart Pips */}
            <div
              className={cn(
                'sm:col-span-6 card-matte rounded-2xl p-5 sm:p-6 flex flex-col justify-between transition-all',
                dartsLeftCritical
                  ? 'border-rose-400/75 shadow-[0_0_28px_-6px_rgba(244,63,94,0.45)]'
                  : dartsLeftUrgent
                  ? 'border-amber-400/70 shadow-[0_0_26px_-6px_rgba(245,158,11,0.4)]'
                  : 'border-emerald-400/40'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    'text-sm sm:text-base font-mono uppercase tracking-widest font-black',
                    dartsLeftCritical
                      ? 'text-rose-300'
                      : dartsLeftUrgent
                      ? 'text-amber-300'
                      : 'text-emerald-300'
                  )}
                >
                  DARTS LEFT
                </span>
                <span className="text-sm sm:text-base font-mono font-bold text-slate-400 uppercase">
                  9-DART LIMIT
                </span>
              </div>

              <div className="flex items-baseline gap-2 my-1">
                <span
                  className={cn(
                    'text-5xl sm:text-6xl lg:text-7xl font-black font-mono tabular-nums leading-none',
                    dartsLeftCritical
                      ? 'text-rose-400'
                      : dartsLeftUrgent
                      ? 'text-amber-300'
                      : 'text-emerald-300'
                  )}
                >
                  {state.dartsLeftInTarget}
                </span>
                <span className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-slate-500">
                  / 9
                </span>
              </div>

              {/* 9 Large Visual Dart Pip Indicators */}
              <div className="grid grid-cols-9 gap-1.5 sm:gap-2 mt-2" aria-label={`${state.dartsLeftInTarget} of 9 darts remaining`}>
                {Array.from({ length: 9 }).map((_, idx) => {
                  const isRemaining = idx < state.dartsLeftInTarget;
                  return (
                    <div
                      key={idx}
                      className={cn(
                        'h-6 sm:h-7 rounded-lg border transition-all duration-200',
                        isRemaining
                          ? dartsLeftCritical
                            ? 'bg-rose-500 border-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.75)]'
                            : dartsLeftUrgent
                            ? 'bg-amber-400 border-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.65)]'
                            : 'bg-emerald-400 border-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                          : 'bg-slate-900/75 border-white/10 opacity-35'
                      )}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Giant Suggested PDC Checkout Route Bar */}
          <div className="card-matte rounded-2xl px-5 py-4 sm:px-6 sm:py-4 flex flex-wrap items-center justify-between gap-4 border-emerald-400/35">
            <div className="text-sm sm:text-base font-mono uppercase tracking-widest text-slate-300 font-black">
              SUGGESTED PDC ROUTE
            </div>
            {checkoutRoute ? (
              <div className="flex items-center gap-3 flex-wrap">
                {checkoutRoute.map((step, i) => (
                  <span
                    key={`${step}-${i}`}
                    className={cn(
                      'px-5 py-3 rounded-2xl font-mono text-3xl sm:text-5xl font-black leading-none border-2 tabular-nums',
                      i === 0
                        ? 'bg-emerald-500/25 border-emerald-400 text-white shadow-[0_0_24px_rgba(16,185,129,0.45)]'
                        : 'bg-slate-900/90 border-sky-400/40 text-sky-200'
                    )}
                  >
                    {step}
                  </span>
                ))}
              </div>
            ) : (
              <div className="px-5 py-3 rounded-2xl bg-slate-900/80 border border-white/15 text-lg sm:text-2xl font-mono font-black uppercase tracking-wider text-slate-300">
                Setup to Double
              </div>
            )}
          </div>

          <VisitPillsStrip
            darts={state.visitDarts}
            boardStatus={boardStatus}
            turnComplete={state.turnComplete}
          />

          <div className="card-matte rounded-2xl p-3 sm:p-4 flex items-center justify-center">
            <SvgDartboard
              size={680}
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

        {/* Right/Bottom: Big 2-Col KPIs & Compact 8ft Recent Ladder Log */}
        <div className="xl:col-span-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="card-matte rounded-2xl p-5 border-amber-400/30">
              <div className="text-sm sm:text-base font-mono uppercase tracking-wider font-black text-slate-300 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
                Highest Cleared
              </div>
              <div className="text-4xl sm:text-5xl lg:text-6xl font-black font-mono tabular-nums text-amber-300 leading-none mt-2">
                {state.highestCleared || '—'}
              </div>
            </div>
            <div className="card-matte rounded-2xl p-5 border-emerald-400/30">
              <div className="text-sm sm:text-base font-mono uppercase tracking-wider font-black text-slate-300 flex items-center gap-2">
                <Flame className="w-5 h-5 text-emerald-400 shrink-0" />
                Checkouts Cleared
              </div>
              <div className="text-4xl sm:text-5xl lg:text-6xl font-black font-mono tabular-nums text-emerald-300 leading-none mt-2">
                {clearedCount}
                <span className="text-2xl sm:text-3xl text-slate-500">/{state.attempts.length}</span>
              </div>
            </div>
          </div>

          <div className="card-matte rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm sm:text-base font-mono uppercase tracking-widest text-slate-300 font-black">
                Recent Ladder Log
              </div>
              {state.attempts.length > 0 && (
                <div className="text-sm sm:text-base font-mono font-bold text-slate-400">
                  Last {recentAttempts.length} of {state.attempts.length}
                </div>
              )}
            </div>
            {recentAttempts.length === 0 ? (
              <div className="py-6 text-center text-base sm:text-lg font-mono font-bold text-slate-400">
                Check out <span className="text-white font-black">{state.currentTarget}</span> within 9 darts to climb to{' '}
                <span className="text-emerald-300 font-black">{state.currentTarget + 1}</span>!
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2.5">
                {recentAttempts.map((att, idx) => (
                  <div
                    key={`${att.target}-${state.attempts.length - idx}`}
                    className={cn(
                      'px-4 py-3 rounded-xl border-2 flex items-center justify-between gap-3 font-mono text-lg sm:text-xl',
                      att.success
                        ? 'bg-emerald-500/12 border-emerald-400/45 text-emerald-200'
                        : 'bg-rose-500/12 border-rose-400/40 text-rose-200'
                    )}
                  >
                    <div className="flex items-center gap-2.5 font-black tabular-nums">
                      {att.success ? (
                        <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-6 h-6 text-rose-400 shrink-0" />
                      )}
                      <span>{att.target}</span>
                    </div>
                    <span className="text-base sm:text-lg font-extrabold tabular-nums truncate">
                      {att.success
                        ? `${att.dartsUsed} darts (${att.finishSegment})`
                        : 'Missed (9)'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
