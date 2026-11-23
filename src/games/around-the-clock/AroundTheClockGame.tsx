import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameModuleProps } from '../../types/games';
import { SvgDartboard, SegmentOverlayStyle } from '../../components/dartboard/SvgDartboard';
import { DartPlotOverlay } from '../../components/dartboard/DartPlotOverlay';
import { useGameBoardEvents } from '../hooks/useGameBoardEvents';
import { useActiveTurnTint } from '../hooks/useActiveTurnTint';
import { soundEngine } from '../utils/soundEngine';
import { injectBoardClickThrow } from '../utils/dartHelpers';
import { CalloutBanner, GameCallout, VisitPillsStrip } from '../components/ArcadePrimitives';
import {
  advanceAroundTheClockVisit,
  applyDartToAroundTheClock,
  AroundTheClockState,
  buildAroundTheClockResult,
  createInitialAroundTheClockState,
} from './engine';
import { CheckCircle2, Clock, Crosshair, TrendingUp, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';

export const AroundTheClockGame: React.FC<GameModuleProps> = ({
  players,
  config,
  soundEnabled,
  isBoardConnected,
  boardStatus,
  onGameComplete,
  registerController,
  onCanUndoChange,
}) => {
  const [state, setState] = useState<AroundTheClockState>(() =>
    createInitialAroundTheClockState(players, config)
  );
  const [historyLen, setHistoryLen] = useState(0);
  const [callout, setCallout] = useState<GameCallout | null>(null);

  const stateRef = useRef(state);
  const turnStartRef = useRef(state);
  const historyRef = useRef<AroundTheClockState[]>([]);
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
      calloutTimerRef.current = window.setTimeout(() => setCallout(null), 1500);
    },
    []
  );

  const scheduleFinish = useCallback(
    (finalState: AroundTheClockState) => {
      if (completedRef.current) return;
      completedRef.current = true;
      completeTimerRef.current = window.setTimeout(() => {
        onGameComplete(buildAroundTheClockResult(finalState, startedAtRef.current));
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
    const fresh = createInitialAroundTheClockState(players, config);
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
      const { nextState, feedback } = applyDartToAroundTheClock(current, dart);
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
        replay = applyDartToAroundTheClock(replay, d).nextState;
      }
      stateRef.current = replay;
      setState(replay);
      if (replay.isFinished) scheduleFinish(replay);
    },
    onVisitCompleted: () => {
      const current = stateRef.current;
      if (current.isFinished || current.visitDarts.length === 0) return;
      historyRef.current.push(current);
      const next = advanceAroundTheClockVisit(current);
      stateRef.current = next;
      turnStartRef.current = next;
      setState(next);
      setHistoryLen(historyRef.current.length);
      soundEngine.playTurnChange(soundEnabled);
    },
  });

  const activeTarget = state.targets[state.targetIndex];
  const clearedCount = Object.keys(state.tileStatuses).length;
  const hitRate =
    state.totalDartsThrown > 0
      ? ((state.totalHits / state.totalDartsThrown) * 100).toFixed(1)
      : '0.0';

  const segmentOverlays = useMemo<Record<string, SegmentOverlayStyle>>(() => {
    if (!activeTarget || state.isFinished) return {};
    if (activeTarget.isBull && state.ringMode === 'any') {
      return {
        Bull: {
          fill: '#10B981',
          opacity: 0.94,
          stroke: '#FFFFFF',
          pulse: true,
        },
        '25': {
          fill: '#10B981',
          opacity: 0.78,
          stroke: '#FFFFFF',
          pulse: true,
        },
      };
    }
    return {
      [activeTarget.overlayKey]: {
        fill: '#10B981',
        opacity: 0.92,
        stroke: '#FFFFFF',
        pulse: true,
        badge: activeTarget.isBull ? undefined : activeTarget.label,
      },
    };
  }, [activeTarget, state.isFinished, state.ringMode]);

  const dartTones = state.visitOutcomes.map((o) => o.tone);
  const dartLabels = state.visitOutcomes.map((o) => o.label);

  const modeBadge =
    state.ringMode === 'doubles'
      ? 'DOUBLES ONLY'
      : state.ringMode === 'trebles'
      ? 'TREBLES ONLY'
      : state.turboSkip
      ? 'ANY BED • TURBO ×2/×3'
      : 'ANY BED';

  return (
    <div className="space-y-4">
      <CalloutBanner callout={callout} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Left/Top: Giant Target Spotlight & Board */}
        <div className="xl:col-span-7 space-y-4">
          <div className="card-matte rounded-2xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 border-2 border-emerald-400/40">
            <div className="min-w-0">
              <div className="text-sm sm:text-base font-mono uppercase tracking-widest text-emerald-400 font-extrabold flex items-center gap-2">
                <Clock className="w-5 h-5 shrink-0" />
                <span>
                  Target {Math.min(state.targetIndex + 1, state.targets.length)} of{' '}
                  {state.targets.length} • {modeBadge}
                </span>
              </div>
              <div className="text-8xl lg:text-9xl font-black font-mono tabular-nums text-white tracking-tight leading-none mt-2">
                {activeTarget ? activeTarget.label.toUpperCase() : 'DONE'}
              </div>
              <div className="text-base sm:text-lg font-mono text-slate-300 mt-2">
                {activeTarget?.isBull ? (
                  state.ringMode === 'any' ? (
                    <span>
                      Hit <strong className="text-emerald-300">Outer or Inner Bull</strong> to finish!
                    </span>
                  ) : (
                    <span>
                      Hit <strong className="text-emerald-300">Inner Bull (50)</strong> to finish!
                    </span>
                  )
                ) : state.ringMode === 'any' && state.turboSkip ? (
                  <span>
                    Single <strong className="text-emerald-300">+1</strong> • Double{' '}
                    <strong className="text-amber-300">+2</strong> • Treble{' '}
                    <strong className="text-amber-300">+3</strong>
                  </span>
                ) : (
                  <span>
                    Hit <strong className="text-emerald-300">{activeTarget?.label}</strong> to advance
                  </span>
                )}
              </div>
            </div>

            <div className="text-right">
              <div className="text-sm sm:text-base font-mono uppercase tracking-widest text-slate-400 font-bold">
                Darts Used
              </div>
              <div className="text-7xl sm:text-8xl lg:text-9xl font-black font-mono tabular-nums text-white leading-none mt-1">
                {state.totalDartsThrown}
              </div>
              <div className="text-base sm:text-lg font-mono font-bold text-emerald-300 mt-2 tabular-nums">
                {clearedCount}/{state.targets.length} Cleared • {hitRate}%
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

        {/* Right/Bottom: Big KPI Metrics & 7×3 21-Tile Progress Grid */}
        <div className="xl:col-span-5 space-y-4">
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <div className="card-matte rounded-2xl p-4 sm:p-5">
              <div className="text-sm sm:text-base font-mono uppercase font-bold text-slate-300 flex items-center gap-1.5">
                <TrendingUp className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>Hit %</span>
              </div>
              <div className="text-4xl sm:text-5xl font-black font-mono tabular-nums text-emerald-300 leading-none mt-2">
                {hitRate}%
              </div>
            </div>

            <div className="card-matte rounded-2xl p-4 sm:p-5">
              <div className="text-sm sm:text-base font-mono uppercase font-bold text-slate-300 flex items-center gap-1.5">
                <Crosshair className="w-5 h-5 text-sky-400 shrink-0" />
                <span>Hits</span>
              </div>
              <div className="text-4xl sm:text-5xl font-black font-mono tabular-nums text-white leading-none mt-2">
                {state.totalHits}
                <span className="text-xl sm:text-2xl text-slate-400">/{state.totalDartsThrown}</span>
              </div>
            </div>

            <div className="card-matte rounded-2xl p-4 sm:p-5">
              <div className="text-sm sm:text-base font-mono uppercase font-bold text-slate-300 flex items-center gap-1.5">
                <Zap className="w-5 h-5 text-amber-400 shrink-0" />
                <span>{state.ringMode === 'any' && state.turboSkip ? 'Skips' : 'Streak'}</span>
              </div>
              <div className="text-4xl sm:text-5xl font-black font-mono tabular-nums text-amber-300 leading-none mt-2">
                {state.ringMode === 'any' && state.turboSkip
                  ? `+${state.turboSkipsEarned}`
                  : state.bestStreak}
              </div>
            </div>
          </div>

          <div className="card-matte rounded-2xl p-4 sm:p-5 space-y-3.5">
            <div className="flex items-center justify-between text-sm sm:text-base font-mono uppercase tracking-wider text-slate-300 font-extrabold">
              <span>
                Clock Progress ({state.targets[0]?.label} →{' '}
                {state.targets[state.targets.length - 1]?.label})
              </span>
              <span className="text-emerald-300 tabular-nums font-black text-base sm:text-lg">
                {Math.round((clearedCount / state.targets.length) * 100)}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="h-3 w-full rounded-full bg-slate-900 overflow-hidden border border-white/10">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-300 transition-all duration-300"
                style={{ width: `${(clearedCount / state.targets.length) * 100}%` }}
              />
            </div>

            {/* 7-col × 3-row 21-Tile Progress Board */}
            <div className="grid grid-cols-7 xl:grid-cols-4 gap-2 sm:gap-2.5 pt-1">
              {state.targets.map((t) => {
                const status = state.tileStatuses[t.index];
                const isCurrent = t.index === state.targetIndex && !state.isFinished;

                return (
                  <div
                    key={t.label}
                    className={cn(
                      'py-2.5 px-1.5 rounded-xl border-2 text-center font-mono transition-all flex flex-col items-center justify-center min-h-[74px]',
                      t.isBull && 'xl:col-span-2',
                      isCurrent
                        ? 'bg-emerald-500/25 border-emerald-400 text-white shadow-[0_0_20px_rgba(16,185,129,0.45)] scale-[1.03]'
                        : status === 'hit'
                        ? 'bg-emerald-500/15 border-emerald-500/45 text-emerald-200'
                        : status === 'skipped'
                        ? 'bg-amber-500/15 border-amber-400/45 text-amber-200'
                        : 'bg-slate-900/65 border-white/[0.08] text-slate-500'
                    )}
                  >
                    <div className="text-xl sm:text-2xl font-black tabular-nums flex items-center justify-center gap-1 leading-none">
                      <span>{t.label.toUpperCase()}</span>
                      {status === 'hit' && <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 shrink-0" />}
                      {status === 'skipped' && <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 shrink-0" />}
                    </div>
                    <div className="text-sm font-extrabold uppercase tracking-wider mt-1.5 leading-none opacity-85">
                      {isCurrent
                        ? 'NOW'
                        : status === 'hit'
                        ? 'HIT'
                        : status === 'skipped'
                        ? 'SKIP'
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
