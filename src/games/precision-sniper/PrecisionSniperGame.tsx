import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameModuleProps } from '../../types/games';
import { SvgDartboard, SegmentOverlayStyle } from '../../components/dartboard/SvgDartboard';
import { DartPlotOverlay } from '../../components/dartboard/DartPlotOverlay';
import { useGameBoardEvents } from '../hooks/useGameBoardEvents';
import { useActiveTurnTint } from '../hooks/useActiveTurnTint';
import { soundEngine } from '../utils/soundEngine';
import { injectBoardClickThrow } from '../utils/dartHelpers';
import { CalloutBanner, GameCallout, VisitPillsStrip } from '../components/ArcadePrimitives';
import { gameEventBus } from '../../services/gameEventBus';
import {
  advancePrecisionSniperVisit,
  applyDartToPrecisionSniper,
  buildPrecisionSniperResult,
  createInitialPrecisionSniperState,
  getCircuitDisplayName,
  PrecisionSniperState,
} from './engine';
import { CheckCircle2, Crosshair, Gauge, Target, TrendingUp } from 'lucide-react';
import { cn } from '../../lib/utils';

export const PrecisionSniperGame: React.FC<GameModuleProps> = ({
  players,
  config,
  soundEnabled,
  isBoardConnected,
  boardStatus,
  onGameComplete,
  registerController,
  onCanUndoChange,
}) => {
  const [state, setState] = useState<PrecisionSniperState>(() =>
    createInitialPrecisionSniperState(players, config)
  );
  const [historyLen, setHistoryLen] = useState(0);
  const [callout, setCallout] = useState<GameCallout | null>(null);

  const stateRef = useRef(state);
  const turnStartRef = useRef(state);
  const historyRef = useRef<
    Array<{ state: PrecisionSniperState; turnStartState: PrecisionSniperState }>
  >([]);
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
      calloutTimerRef.current = window.setTimeout(() => setCallout(null), 1550);
    },
    []
  );

  const scheduleFinish = useCallback(
    (finalState: PrecisionSniperState) => {
      if (completedRef.current) return;
      completedRef.current = true;
      completeTimerRef.current = window.setTimeout(() => {
        onGameComplete(buildPrecisionSniperResult(finalState, startedAtRef.current));
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
    const fresh = createInitialPrecisionSniperState(players, config);
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
      const { nextState, feedback } = applyDartToPrecisionSniper(current, dart);
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
        replay = applyDartToPrecisionSniper(replay, d).nextState;
      }
      stateRef.current = replay;
      setState(replay);
      if (replay.isFinished) scheduleFinish(replay);
    },
    onVisitCompleted: () => {
      const current = stateRef.current;
      if (current.isFinished || current.visitDarts.length === 0) return;
      historyRef.current.push({ state: current, turnStartState: turnStartRef.current });
      const next = advancePrecisionSniperVisit(current);
      stateRef.current = next;
      turnStartRef.current = next;
      setState(next);
      setHistoryLen(historyRef.current.length);
      soundEngine.playTurnChange(soundEnabled);
    },
  });

  const activeTarget = state.targets[state.targetIndex];
  const totalRequiredHits = state.targets.length * state.hitsPerTarget;
  const accuracyPct =
    state.totalDartsThrown > 0
      ? ((state.totalHits / state.totalDartsThrown) * 100).toFixed(1)
      : '0.0';
  const dartsPerHit =
    state.totalHits > 0 ? (state.totalDartsThrown / state.totalHits).toFixed(2) : '—';

  const segmentOverlays = useMemo<Record<string, SegmentOverlayStyle>>(() => {
    if (!activeTarget || state.isFinished) return {};
    return {
      [activeTarget.overlayKey]: {
        fill: '#10B981',
        opacity: 0.94,
        stroke: '#FFFFFF',
        pulse: true,
        badge: activeTarget.ring === 'bull' ? undefined : activeTarget.label,
      },
    };
  }, [activeTarget, state.isFinished]);

  const dartTones = state.visitOutcomes.map((o) => o.tone);
  const dartLabels = state.visitOutcomes.map((o) => o.label);

  const completedMap = useMemo(() => {
    const map = new Map<number, { hits: number; dartsTaken: number }>();
    for (const c of state.completedTargets) {
      map.set(c.targetIndex, { hits: c.hits, dartsTaken: c.dartsTaken });
    }
    return map;
  }, [state.completedTargets]);

  const hitPipIndices = useMemo(
    () => Array.from({ length: state.hitsPerTarget }, (_, i) => i),
    [state.hitsPerTarget]
  );

  return (
    <div className="space-y-4">
      <CalloutBanner callout={callout} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Left/Top: Giant Active Bed Target, Glowing Hit Pips & Dartboard */}
        <div className="xl:col-span-7 space-y-4">
          <div className="card-matte rounded-2xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 border-2 border-purple-400/40">
            <div>
              <div className="text-sm sm:text-base font-mono uppercase tracking-widest text-purple-300 font-extrabold flex items-center gap-2">
                <Crosshair className="w-5 h-5 shrink-0" />
                <span>
                  Target {Math.min(state.targetIndex + 1, state.targets.length)} of{' '}
                  {state.targets.length} • {getCircuitDisplayName(state.circuit)}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-5 mt-3">
                <div className="px-5 py-2.5 rounded-2xl bg-emerald-500/20 border-2 border-emerald-400 shadow-[0_0_28px_rgba(16,185,129,0.45)]">
                  <span className="text-8xl lg:text-9xl font-black font-mono tabular-nums text-white tracking-tight leading-none">
                    {activeTarget ? activeTarget.label.toUpperCase() : 'DONE'}
                  </span>
                </div>

                {/* Huge Glowing Hit Pips (● ● ○) */}
                <div className="space-y-2.5">
                  <div className="text-base sm:text-lg font-mono uppercase tracking-wider text-slate-300 font-extrabold">
                    Hits ({state.currentTargetHits}/{state.hitsPerTarget})
                  </div>
                  <div className="flex items-center gap-3.5">
                    {hitPipIndices.map((idx) => {
                      const filled = state.isFinished || idx < state.currentTargetHits;
                      return (
                        <span
                          key={idx}
                          className={cn(
                            'w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 transition-all',
                            filled
                              ? 'bg-emerald-400 border-emerald-100 shadow-[0_0_22px_rgba(16,185,129,0.85)] scale-110'
                              : 'bg-slate-900/90 border-slate-500'
                          )}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="text-right ml-auto">
              <div className="text-sm sm:text-base font-mono uppercase tracking-widest text-slate-400 font-bold">
                Accuracy
              </div>
              <div className="text-6xl sm:text-7xl lg:text-8xl font-black font-mono tabular-nums text-emerald-300 leading-none mt-1">
                {accuracyPct}%
              </div>
              <div className="text-base sm:text-lg font-mono font-bold text-slate-300 mt-2 tabular-nums">
                {state.totalHits}/{totalRequiredHits} Hits • {state.totalDartsThrown} Darts
              </div>
            </div>
          </div>

          <VisitPillsStrip
            darts={state.visitDarts}
            dartTones={dartTones}
            dartLabels={dartLabels}
            boardStatus={boardStatus}
            turnComplete={state.turnComplete}
          />

          <div className="card-matte rounded-2xl p-4 sm:p-5 flex items-center justify-center">
            <SvgDartboard
              size={660}
              segmentOverlays={segmentOverlays}
              dimInactiveSegments={true}
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

        {/* Right/Bottom: Big KPI Tiles & Full Circuit Checklist */}
        <div className="xl:col-span-5 space-y-4">
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <div className="card-matte rounded-2xl p-4 sm:p-5">
              <div className="text-sm sm:text-base font-mono uppercase font-bold text-slate-300 flex items-center gap-1.5">
                <Gauge className="w-5 h-5 text-purple-400 shrink-0" />
                <span>Darts/Hit</span>
              </div>
              <div className="text-4xl sm:text-5xl font-black font-mono tabular-nums text-white leading-none mt-2">
                {dartsPerHit}
              </div>
            </div>

            <div className="card-matte rounded-2xl p-4 sm:p-5">
              <div className="text-sm sm:text-base font-mono uppercase font-bold text-slate-300 flex items-center gap-1.5">
                <TrendingUp className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>Accuracy</span>
              </div>
              <div className="text-4xl sm:text-5xl font-black font-mono tabular-nums text-emerald-300 leading-none mt-2">
                {accuracyPct}%
              </div>
            </div>

            <div className="card-matte rounded-2xl p-4 sm:p-5">
              <div className="text-sm sm:text-base font-mono uppercase font-bold text-slate-300 flex items-center gap-1.5">
                <Target className="w-5 h-5 text-amber-400 shrink-0" />
                <span>Darts</span>
              </div>
              <div className="text-4xl sm:text-5xl font-black font-mono tabular-nums text-amber-300 leading-none mt-2">
                {state.totalDartsThrown}
              </div>
            </div>
          </div>

          <div className="card-matte rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between text-sm sm:text-base font-mono uppercase tracking-wider text-slate-300 font-extrabold">
              <span>Circuit Checklist</span>
              <span className="text-emerald-300 tabular-nums font-black text-base sm:text-lg">
                {state.completedTargets.length} / {state.targets.length} Locked
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2.5">
              {state.targets.map((t) => {
                const done = completedMap.get(t.index);
                const isCurrent = t.index === state.targetIndex && !state.isFinished;

                return (
                  <div
                    key={t.label}
                    className={cn(
                      'px-4 py-3 rounded-xl border-2 font-mono flex items-center justify-between gap-2 transition-all',
                      isCurrent
                        ? 'bg-emerald-500/22 border-emerald-400 text-white shadow-[0_0_18px_rgba(16,185,129,0.38)]'
                        : done
                        ? 'bg-emerald-500/12 border-emerald-500/40 text-emerald-200'
                        : 'bg-slate-900/65 border-white/[0.08] text-slate-400'
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      {done ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      ) : (
                        <span
                          className={cn(
                            'w-3.5 h-3.5 rounded-full shrink-0',
                            isCurrent ? 'bg-emerald-400 animate-pulse' : 'bg-slate-700'
                          )}
                        />
                      )}
                      <span className="text-lg sm:text-xl font-black tracking-tight">
                        {t.label.toUpperCase()}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Per-row hit pips */}
                      <div className="flex items-center gap-1.5">
                        {hitPipIndices.map((idx) => {
                          const filled = Boolean(done) || (isCurrent && idx < state.currentTargetHits);
                          return (
                            <span
                              key={idx}
                              className={cn(
                                'w-3.5 h-3.5 rounded-full border-2',
                                filled
                                  ? 'bg-emerald-400 border-emerald-200'
                                  : isCurrent
                                  ? 'bg-slate-900 border-slate-400'
                                  : 'bg-slate-900 border-slate-700'
                              )}
                            />
                          );
                        })}
                      </div>

                      <span className="text-sm sm:text-base font-bold tabular-nums min-w-[78px] text-right">
                        {done
                          ? `${done.dartsTaken}d`
                          : isCurrent
                          ? `${state.currentTargetDarts}d`
                          : 'Next'}
                      </span>
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
