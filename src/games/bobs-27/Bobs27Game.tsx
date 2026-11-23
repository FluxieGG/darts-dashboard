import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameModuleProps } from '../../types/games';
import { SvgDartboard, SegmentOverlayStyle } from '../../components/dartboard/SvgDartboard';
import { DartPlotOverlay } from '../../components/dartboard/DartPlotOverlay';
import { useGameBoardEvents } from '../hooks/useGameBoardEvents';
import { useActiveTurnTint } from '../hooks/useActiveTurnTint';
import { soundEngine } from '../utils/soundEngine';
import { injectBoardClickThrow, isInnerBull } from '../utils/dartHelpers';
import { CalloutBanner, GameCallout, VisitPillsStrip } from '../components/ArcadePrimitives';
import {
  advanceBobs27Round,
  applyDartToBobs27,
  Bobs27State,
  buildBobs27Result,
  createInitialBobs27State,
} from './engine';
import { Target, TrendingUp, Crosshair, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

export const Bobs27Game: React.FC<GameModuleProps> = ({
  players,
  config,
  soundEnabled,
  isBoardConnected,
  boardStatus,
  onGameComplete,
  registerController,
  onCanUndoChange,
}) => {
  const [state, setState] = useState<Bobs27State>(() => createInitialBobs27State(players, config));
  const [historyLen, setHistoryLen] = useState(0);
  const [callout, setCallout] = useState<GameCallout | null>(null);

  const stateRef = useRef(state);
  const turnStartRef = useRef(state);
  const historyRef = useRef<Bobs27State[]>([]);
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
      calloutTimerRef.current = window.setTimeout(() => setCallout(null), 1600);
    },
    []
  );

  const scheduleFinish = useCallback(
    (finalState: Bobs27State) => {
      if (completedRef.current) return;
      completedRef.current = true;
      completeTimerRef.current = window.setTimeout(() => {
        onGameComplete(buildBobs27Result(finalState, startedAtRef.current));
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
    const fresh = createInitialBobs27State(players, config);
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
      const { nextState, feedback } = applyDartToBobs27(current, dart);
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
        replay = applyDartToBobs27(replay, d).nextState;
      }
      stateRef.current = replay;
      setState(replay);
      if (replay.isFinished) scheduleFinish(replay);
    },
    onVisitCompleted: () => {
      const current = stateRef.current;
      if (current.isFinished) return;
      if (current.visitDarts.length === 0) return;
      historyRef.current.push(current);
      const next = advanceBobs27Round(current);
      stateRef.current = next;
      turnStartRef.current = next;
      setState(next);
      setHistoryLen(historyRef.current.length);
      soundEngine.playTurnChange(soundEnabled);
      if (next.isFinished) scheduleFinish(next);
    },
  });

  const activeTarget = state.targets[state.roundIndex];
  const hitRate =
    state.totalDartsThrown > 0
      ? ((state.totalDoublesHit / state.totalDartsThrown) * 100).toFixed(1)
      : '0.0';

  const segmentOverlays = useMemo<Record<string, SegmentOverlayStyle>>(() => {
    if (!activeTarget) return {};
    return {
      [activeTarget.label]: {
        fill: '#10B981',
        opacity: 0.92,
        stroke: '#FFFFFF',
        pulse: true,
        badge: activeTarget.label,
      },
    };
  }, [activeTarget]);

  const dartTones = state.visitDarts.map((d) => {
    if (!activeTarget) return 'slate' as const;
    const hit = activeTarget.isBull
      ? isInnerBull(d)
      : d.segment.number === activeTarget.number && d.segment.multiplier === 2;
    return hit ? ('emerald' as const) : ('rose' as const);
  });

  const dartLabels = state.visitDarts.map((d) => {
    if (!activeTarget) return undefined;
    const hit = activeTarget.isBull
      ? isInnerBull(d)
      : d.segment.number === activeTarget.number && d.segment.multiplier === 2;
    return hit ? `+${activeTarget.value} HIT` : 'MISS';
  });

  return (
    <div className="space-y-4">
      <CalloutBanner callout={callout} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left/Top: Target Spotlight & Dartboard */}
        <div className="xl:col-span-7 space-y-4">
          <div className="card-matte rounded-2xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 border-emerald-400/35">
            <div>
              <div className="text-xs font-mono uppercase tracking-widest text-emerald-400 font-bold flex items-center gap-1.5">
                <Target className="w-4 h-4" />
                Round {state.roundIndex + 1} of {state.targets.length} • Active Double
              </div>
              <div className="text-5xl sm:text-6xl font-black font-mono text-white tracking-tight mt-1">
                {activeTarget?.label || 'DONE'}
              </div>
              <div className="text-xs sm:text-sm font-mono text-slate-400 mt-1">
                Hit = <span className="text-emerald-300 font-bold">+{activeTarget?.value ?? 0}</span> •
                Miss all 3 = <span className="text-rose-400 font-bold">-{activeTarget?.value ?? 0}</span>
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs font-mono uppercase tracking-widest text-slate-400">
                Score
              </div>
              <div
                className={cn(
                  'text-5xl sm:text-7xl font-black font-mono tabular-nums leading-none',
                  state.score < 0
                    ? 'text-rose-400'
                    : state.score >= 100
                    ? 'text-emerald-300'
                    : 'text-white'
                )}
              >
                {state.score}
              </div>
              <div className="text-xs font-mono text-slate-400 mt-1">
                Peak {state.highestScore} • Hit Rate {hitRate}%
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

          <div className="card-matte rounded-2xl p-4 sm:p-6 flex items-center justify-center">
            <SvgDartboard
              size={460}
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

        {/* Right: Double Progression Ladder & Metrics */}
        <div className="xl:col-span-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="card-matte rounded-2xl p-4">
              <div className="text-[11px] font-mono uppercase text-slate-400 flex items-center gap-1.5">
                <Crosshair className="w-3.5 h-3.5 text-emerald-400" />
                Doubles Hit
              </div>
              <div className="text-3xl font-black font-mono tabular-nums text-white mt-1">
                {state.totalDoublesHit}
                <span className="text-base text-slate-500">/{state.totalDartsThrown}</span>
              </div>
            </div>
            <div className="card-matte rounded-2xl p-4">
              <div className="text-[11px] font-mono uppercase text-slate-400 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
                Accuracy
              </div>
              <div className="text-3xl font-black font-mono tabular-nums text-emerald-300 mt-1">
                {hitRate}%
              </div>
            </div>
          </div>

          <div className="card-matte rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">
              Doubles Ladder (D1 → {state.targets[state.targets.length - 1]?.label})
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {state.targets.map((t, idx) => {
                const record = state.history.find((h) => h.targetIndex === idx);
                const isCurrent = idx === state.roundIndex && !state.isFinished;
                return (
                  <div
                    key={t.label}
                    className={cn(
                      'p-2.5 rounded-xl border text-center font-mono transition-all',
                      isCurrent
                        ? 'bg-emerald-500/20 border-emerald-400/70 shadow-[0_0_16px_rgba(16,185,129,0.35)]'
                        : record
                        ? record.hits > 0
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                        : 'bg-slate-900/60 border-white/[0.06] text-slate-500'
                    )}
                  >
                    <div className="text-sm font-black flex items-center justify-center gap-1">
                      <span>{t.label}</span>
                      {record &&
                        (record.hits > 0 ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <XCircle className="w-3 h-3 text-rose-400" />
                        ))}
                    </div>
                    <div className="text-[10px] mt-0.5 tabular-nums">
                      {record ? (record.delta >= 0 ? `+${record.delta}` : record.delta) : `±${t.value}`}
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
