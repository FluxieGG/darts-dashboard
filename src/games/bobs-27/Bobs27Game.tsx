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

  const dartsLeftInVisit = state.turnComplete ? 0 : Math.max(0, 3 - state.visitDarts.length);

  return (
    <div className="space-y-4">
      <CalloutBanner callout={callout} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 xl:gap-5 items-start">
        {/* Left/Top: Giant Double Target, Giant Score, Visit Strip & Giant Dartboard */}
        <div className="xl:col-span-7 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            {/* Giant Current Double Target */}
            <div className="sm:col-span-6 card-matte rounded-2xl p-5 sm:p-6 border-emerald-400/45 flex flex-col justify-between">
              <div className="text-sm sm:text-base font-mono uppercase tracking-widest text-emerald-400 font-black flex items-center gap-2">
                <Target className="w-5 h-5 shrink-0" />
                <span>
                  ROUND {state.roundIndex + 1} / {state.targets.length} • DOUBLE
                </span>
              </div>
              <div className="text-7xl sm:text-8xl lg:text-9xl font-black font-mono tabular-nums text-white tracking-tight leading-none mt-2">
                {activeTarget?.label || 'DONE'}
              </div>
              <div className="text-base sm:text-lg font-mono font-bold text-slate-300 mt-2">
                Hit{' '}
                <span className="text-emerald-300 font-black">+{activeTarget?.value ?? 0}</span>
                <span className="text-slate-600 mx-2">•</span>
                Miss All{' '}
                <span className="text-rose-400 font-black">-{activeTarget?.value ?? 0}</span>
              </div>
            </div>

            {/* Giant Current Score */}
            <div className="sm:col-span-6 card-matte rounded-2xl p-5 sm:p-6 border-white/15 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm sm:text-base font-mono uppercase tracking-widest text-slate-300 font-black">
                  SCORE
                </span>
                <span className="text-sm sm:text-base font-mono font-bold text-slate-400">
                  PEAK <strong className="text-amber-300 font-black">{state.highestScore}</strong>
                </span>
              </div>
              <div
                className={cn(
                  'text-7xl sm:text-8xl lg:text-9xl font-black font-mono tabular-nums leading-none mt-2',
                  state.score < 0
                    ? 'text-rose-400'
                    : state.score >= 100
                    ? 'text-emerald-300'
                    : 'text-white'
                )}
              >
                {state.score}
              </div>
              <div className="text-base sm:text-lg font-mono font-bold text-slate-400 mt-2">
                Hit Rate <strong className="text-emerald-300 font-black">{hitRate}%</strong>
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

          <div className="card-matte rounded-2xl p-3 sm:p-4 flex items-center justify-center">
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

        {/* Right/Bottom: Big Round/Hits/Darts Left Tiles & Compact 7-Col 21-Double Grid */}
        <div className="xl:col-span-5 space-y-4">
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <div className="card-matte rounded-2xl p-4 sm:p-5 border-amber-400/30">
              <div className="text-sm sm:text-base font-mono uppercase tracking-wider font-black text-slate-300">
                Darts Left
              </div>
              <div
                className={cn(
                  'text-4xl sm:text-5xl font-black font-mono tabular-nums leading-none mt-2',
                  dartsLeftInVisit === 1
                    ? 'text-amber-300'
                    : dartsLeftInVisit === 0
                    ? 'text-slate-500'
                    : 'text-white'
                )}
              >
                {dartsLeftInVisit}
                <span className="text-xl sm:text-2xl text-slate-500">/3</span>
              </div>
            </div>

            <div className="card-matte rounded-2xl p-4 sm:p-5 border-emerald-400/30">
              <div className="text-sm sm:text-base font-mono uppercase tracking-wider font-black text-slate-300 flex items-center gap-1.5">
                <Crosshair className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 shrink-0" />
                <span>Hits</span>
              </div>
              <div className="text-4xl sm:text-5xl font-black font-mono tabular-nums text-white leading-none mt-2">
                {state.totalDoublesHit}
                <span className="text-xl sm:text-2xl text-slate-500">/{state.totalDartsThrown}</span>
              </div>
            </div>

            <div className="card-matte rounded-2xl p-4 sm:p-5 border-sky-400/30">
              <div className="text-sm sm:text-base font-mono uppercase tracking-wider font-black text-slate-300 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400 shrink-0" />
                <span>Hit %</span>
              </div>
              <div className="text-4xl sm:text-5xl font-black font-mono tabular-nums text-emerald-300 leading-none mt-2">
                {hitRate}%
              </div>
            </div>
          </div>

          <div className="card-matte rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm sm:text-base font-mono uppercase tracking-widest text-slate-300 font-black">
                Doubles Ladder (D1 → {state.targets[state.targets.length - 1]?.label})
              </div>
              <div className="text-sm sm:text-base font-mono font-bold text-slate-400 tabular-nums">
                {state.history.length} / {state.targets.length}
              </div>
            </div>
            <div className="grid grid-cols-7 xl:grid-cols-4 gap-2">
              {state.targets.map((t, idx) => {
                const record = state.history.find((h) => h.targetIndex === idx);
                const isCurrent = idx === state.roundIndex && !state.isFinished;
                return (
                  <div
                    key={t.label}
                    className={cn(
                      'px-2 py-2.5 rounded-xl border-2 text-center font-mono transition-all',
                      isCurrent
                        ? 'bg-emerald-500/25 border-emerald-400 text-white shadow-[0_0_18px_rgba(16,185,129,0.45)]'
                        : record
                        ? record.hits > 0
                          ? 'bg-emerald-500/12 border-emerald-500/40 text-emerald-200'
                          : 'bg-rose-500/12 border-rose-500/40 text-rose-200'
                        : 'bg-slate-900/65 border-white/[0.08] text-slate-400'
                    )}
                  >
                    <div className="text-base sm:text-lg font-black flex items-center justify-center gap-1 leading-tight">
                      <span>{t.label}</span>
                      {record &&
                        (record.hits > 0 ? (
                          <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-rose-400 shrink-0" />
                        ))}
                    </div>
                    <div
                      className={cn(
                        'text-sm sm:text-base font-bold mt-0.5 tabular-nums leading-tight',
                        isCurrent
                          ? 'text-emerald-200'
                          : record
                          ? record.delta >= 0
                            ? 'text-emerald-300'
                            : 'text-rose-300'
                          : 'text-slate-500'
                      )}
                    >
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
