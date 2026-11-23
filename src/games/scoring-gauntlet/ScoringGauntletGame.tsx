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
  advanceGauntletVisit,
  applyDartToGauntlet,
  buildGauntletResult,
  createInitialGauntletState,
  GauntletState,
  isGauntletFocusHit,
} from './engine';
import { Flame, Gauge, Target, Zap } from 'lucide-react';

export const ScoringGauntletGame: React.FC<GameModuleProps> = ({
  players,
  config,
  soundEnabled,
  isBoardConnected,
  boardStatus,
  onGameComplete,
  registerController,
  onCanUndoChange,
}) => {
  const [state, setState] = useState<GauntletState>(() => createInitialGauntletState(players, config));
  const [historyLen, setHistoryLen] = useState(0);
  const [callout, setCallout] = useState<GameCallout | null>(null);

  const stateRef = useRef(state);
  const turnStartRef = useRef(state);
  const historyRef = useRef<GauntletState[]>([]);
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
      calloutTimerRef.current = window.setTimeout(() => setCallout(null), 1600);
    },
    []
  );

  const scheduleFinish = useCallback(
    (finalState: GauntletState) => {
      if (completedRef.current) return;
      completedRef.current = true;
      completeTimerRef.current = window.setTimeout(() => {
        onGameComplete(buildGauntletResult(finalState, startedAtRef.current));
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
    const fresh = createInitialGauntletState(players, config);
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
      const { nextState, feedback } = applyDartToGauntlet(current, dart);
      stateRef.current = nextState;
      setState(nextState);
      setHistoryLen(historyRef.current.length);

      if (feedback.sound === 'jackpot') soundEngine.playJackpot(soundEnabled);
      else if (feedback.sound === 'bonusHit') soundEngine.playBonusHit(soundEnabled);
      else soundEngine.playDartHit(soundEnabled);

      if (feedback.title) {
        showCallout(feedback.title, feedback.subtitle, feedback.accent || 'amber');
      }
      if (nextState.isFinished) scheduleFinish(nextState);
    },
    onDartCorrected: (_dart, _prev, _idx, visitThrows) => {
      let replay = turnStartRef.current;
      for (const d of visitThrows) {
        replay = applyDartToGauntlet(replay, d).nextState;
      }
      stateRef.current = replay;
      setState(replay);
      if (replay.isFinished) scheduleFinish(replay);
    },
    onVisitCompleted: () => {
      const current = stateRef.current;
      if (current.isFinished || current.visitDarts.length === 0) return;
      historyRef.current.push(current);
      const next = advanceGauntletVisit(current);
      stateRef.current = next;
      turnStartRef.current = next;
      setState(next);
      setHistoryLen(historyRef.current.length);
      soundEngine.playTurnChange(soundEnabled);
    },
  });

  const threeDartAvg =
    state.totalDartsThrown > 0 ? (state.totalPoints / state.totalDartsThrown) * 3 : 0;
  const focusPct =
    state.totalDartsThrown > 0 ? (state.targetHits / state.totalDartsThrown) * 100 : 0;
  const progressPct = Math.min(100, (state.totalDartsThrown / state.targetDarts) * 100);

  const segmentOverlays = useMemo<Record<string, SegmentOverlayStyle>>(() => {
    if (state.focus === 'free') return {};
    return {
      [state.focus]: {
        fill: '#F59E0B',
        opacity: 0.9,
        stroke: '#FFFFFF',
        pulse: true,
        badge: state.focus,
      },
    };
  }, [state.focus]);

  const dartTones = state.visitDarts.map((d) =>
    isGauntletFocusHit(d, state.focus) ? ('amber' as const) : ('slate' as const)
  );

  return (
    <div className="space-y-4">
      <CalloutBanner callout={callout} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div className="xl:col-span-7 space-y-4">
          <div className="card-matte rounded-2xl p-5 sm:p-6 space-y-4 border-amber-400/35">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs font-mono uppercase tracking-widest text-amber-300 font-bold flex items-center gap-1.5">
                  <Target className="w-4 h-4" />
                  {state.targetDarts}-Dart Gauntlet •{' '}
                  {state.focus === 'free' ? 'Free Scoring' : `Focus: ${state.focus}`}
                </div>
                <div className="text-5xl sm:text-7xl font-black font-mono tabular-nums text-white leading-none mt-1">
                  {threeDartAvg.toFixed(1)}
                  <span className="text-lg sm:text-2xl text-slate-400 ml-2">3DA</span>
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs font-mono uppercase text-slate-400">Darts Left</div>
                <div className="text-4xl sm:text-5xl font-black font-mono tabular-nums text-emerald-300">
                  {Math.max(0, state.targetDarts - state.totalDartsThrown)}
                </div>
                <div className="text-xs font-mono text-slate-400">
                  {state.totalPoints} pts total
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1">
              <div className="h-3 rounded-full bg-slate-900 overflow-hidden border border-white/10">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-amber-400 transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] font-mono text-slate-400 tabular-nums">
                <span>
                  {state.totalDartsThrown} / {state.targetDarts} darts
                </span>
                <span>{progressPct.toFixed(0)}%</span>
              </div>
            </div>
          </div>

          <VisitPillsStrip
            darts={state.visitDarts}
            dartTones={dartTones}
            boardStatus={boardStatus}
            turnComplete={state.turnComplete}
          />

          <div className="card-matte rounded-2xl p-4 sm:p-6 flex items-center justify-center">
            <SvgDartboard
              size={460}
              segmentOverlays={segmentOverlays}
              dimInactiveSegments={state.focus !== 'free'}
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

        <div className="xl:col-span-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="card-matte rounded-2xl p-4">
              <div className="text-[11px] font-mono uppercase text-slate-400 flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-amber-400" />
                {state.focus === 'free' ? '20+ Rate' : `${state.focus} Hit Rate`}
              </div>
              <div className="text-3xl font-black font-mono tabular-nums text-amber-300 mt-1">
                {focusPct.toFixed(1)}%
              </div>
              <div className="text-xs font-mono text-slate-400 mt-0.5">
                {state.targetHits} hits
              </div>
            </div>

            <div className="card-matte rounded-2xl p-4">
              <div className="text-[11px] font-mono uppercase text-slate-400 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-emerald-400" />
                High Visit
              </div>
              <div className="text-3xl font-black font-mono tabular-nums text-emerald-300 mt-1">
                {state.highestVisit}
              </div>
              <div className="text-xs font-mono text-slate-400 mt-0.5">
                100+: {state.ton100Plus + state.ton140Plus + state.ton180s}
              </div>
            </div>
          </div>

          <div className="card-matte rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Scoring Power Breakdown
            </div>
            <div className="grid grid-cols-4 gap-2 text-center font-mono">
              {[
                { label: '60+', val: state.ton60Plus, tone: 'text-slate-200' },
                { label: '100+', val: state.ton100Plus, tone: 'text-emerald-300' },
                { label: '140+', val: state.ton140Plus, tone: 'text-amber-300' },
                { label: '180', val: state.ton180s, tone: 'text-rose-300' },
              ].map((b) => (
                <div
                  key={b.label}
                  className="p-3 rounded-xl bg-slate-900/80 border border-white/[0.08]"
                >
                  <div className="text-[10px] text-slate-400">{b.label}</div>
                  <div className={`text-2xl font-black tabular-nums mt-0.5 ${b.tone}`}>
                    {b.val}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {state.recentVisits.length > 0 && (
            <div className="card-matte rounded-2xl p-4 sm:p-5 space-y-2.5">
              <div className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">
                Recent Visits
              </div>
              <div className="flex flex-wrap gap-2">
                {state.recentVisits.map((v, i) => (
                  <span
                    key={i}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 border border-white/10 font-mono text-sm font-black tabular-nums text-white"
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
