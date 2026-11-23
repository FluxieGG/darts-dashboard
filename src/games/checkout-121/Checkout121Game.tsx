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
  const historyRef = useRef<Checkout121State[]>([]);
  const startedAtRef = useRef(Date.now());
  const completedRef = useRef(false);
  const calloutTimerRef = useRef<number | null>(null);
  const completeTimerRef = useRef<number | null>(null);

  useActiveTurnTint(state.player.colorHex);

  const clearTimers = useCallback(() => {
    if (calloutTimerRef.current !== null) window.clearTimeout(calloutTimerRef.current);
    if (completeTimerRef.current !== null) window.clearTimeout(completeTimerRef.current);
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
    const fresh = createInitialCheckout121State(players, config);
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
      historyRef.current.push(current);
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
    if (state.remaining <= 0 || state.remaining > 170) return null;
    const route = getCheckoutRoute(state.remaining, 'double');
    if (!route || route.length > dartsLeftInVisit) return null;
    return route;
  }, [state.remaining, dartsLeftInVisit]);

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

  return (
    <div className="space-y-4">
      <CalloutBanner callout={callout} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div className="xl:col-span-7 space-y-4">
          {/* Big Remaining Checkout Hero */}
          <div className="card-matte rounded-2xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 border-sky-400/35">
            <div>
              <div className="text-xs font-mono uppercase tracking-widest text-sky-400 font-bold flex items-center gap-1.5">
                <Target className="w-4 h-4" />
                Target {state.attempts.length + 1} of {state.maxTargets} • {state.currentTarget} Checkout
              </div>
              <div className="text-6xl sm:text-7xl font-black font-mono tabular-nums text-white leading-none mt-1">
                {state.remaining}
              </div>
              <div className="text-xs font-mono text-slate-400 mt-2">
                Darts Left in Target:{' '}
                <strong
                  className={cn(
                    'text-sm',
                    state.dartsLeftInTarget <= 3 ? 'text-amber-300' : 'text-emerald-300'
                  )}
                >
                  {state.dartsLeftInTarget} / 9
                </strong>
              </div>
            </div>

            {/* Live Suggested PDC Checkout Route */}
            <div className="text-right space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Suggested Route
              </div>
              {checkoutRoute ? (
                <div className="flex items-center justify-end gap-2">
                  {checkoutRoute.map((step, i) => (
                    <span
                      key={`${step}-${i}`}
                      className={cn(
                        'px-3.5 py-2 rounded-xl font-mono text-lg sm:text-2xl font-black border',
                        i === 0
                          ? 'bg-emerald-500/20 border-emerald-400/70 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.35)]'
                          : 'bg-slate-900 border-white/15 text-slate-200'
                      )}
                    >
                      {step}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-xs font-mono text-slate-400">
                  Setup to Double
                </div>
              )}
            </div>
          </div>

          <VisitPillsStrip
            darts={state.visitDarts}
            boardStatus={boardStatus}
            turnComplete={state.turnComplete}
          />

          <div className="card-matte rounded-2xl p-4 sm:p-6 flex items-center justify-center">
            <SvgDartboard
              size={460}
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

        {/* Right: Ladder Progress & History */}
        <div className="xl:col-span-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="card-matte rounded-2xl p-4">
              <div className="text-[11px] font-mono uppercase text-slate-400 flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                Highest Cleared
              </div>
              <div className="text-3xl font-black font-mono tabular-nums text-amber-300 mt-1">
                {state.highestCleared || '—'}
              </div>
            </div>
            <div className="card-matte rounded-2xl p-4">
              <div className="text-[11px] font-mono uppercase text-slate-400 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-emerald-400" />
                Checkouts
              </div>
              <div className="text-3xl font-black font-mono tabular-nums text-emerald-300 mt-1">
                {clearedCount}
                <span className="text-base text-slate-500">/{state.attempts.length}</span>
              </div>
            </div>
          </div>

          <div className="card-matte rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">
              Ladder Log
            </div>
            {state.attempts.length === 0 ? (
              <div className="py-8 text-center text-xs font-mono text-slate-500">
                Check out {state.currentTarget} within 9 darts to climb to {state.currentTarget + 1}!
              </div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {[...state.attempts].reverse().map((att, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'p-3 rounded-xl border flex items-center justify-between font-mono text-sm',
                      att.success
                        ? 'bg-emerald-500/12 border-emerald-400/40 text-emerald-200'
                        : 'bg-rose-500/10 border-rose-400/30 text-rose-300'
                    )}
                  >
                    <div className="flex items-center gap-2 font-black">
                      {att.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400" />
                      )}
                      <span>{att.target}</span>
                    </div>
                    <span className="text-xs">
                      {att.success
                        ? `Out in ${att.dartsUsed} (${att.finishSegment})`
                        : 'Missed (9 darts)'}
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
