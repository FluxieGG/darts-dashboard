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
  advanceGauntletVisit,
  applyDartToGauntlet,
  buildGauntletResult,
  createInitialGauntletState,
  GauntletState,
  isGauntletFocusHit,
} from './engine';
import { Flame, Gauge, Target, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';

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
  const historyRef = useRef<Array<{ state: GauntletState; turnStartState: GauntletState }>>([]);
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
    const fresh = createInitialGauntletState(players, config);
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
      historyRef.current.push({ state: current, turnStartState: turnStartRef.current });
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

  const dartsRemaining = Math.max(0, state.targetDarts - state.totalDartsThrown);
  const recentVisitsCompact = state.recentVisits.slice(0, 6);

  return (
    <div className="space-y-4">
      <CalloutBanner callout={callout} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 xl:gap-5 items-start">
        {/* Left/Top: Giant Live 3DA + Darts Remaining + Visit Strip + Giant Dartboard */}
        <div className="xl:col-span-7 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            {/* Giant Live 3DA + Focus Target Badge */}
            <div className="sm:col-span-7 card-matte rounded-2xl p-5 sm:p-6 border-amber-400/45 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-sm sm:text-base font-mono uppercase tracking-widest text-amber-300 font-black flex items-center gap-2">
                  <Target className="w-5 h-5 shrink-0 text-amber-400" />
                  <span>{state.targetDarts}-DART GAUNTLET</span>
                </div>
                <span className="px-3.5 py-1 rounded-full bg-amber-500/20 border-2 border-amber-400/60 text-amber-200 font-mono text-sm sm:text-base font-black uppercase tracking-wide">
                  {state.focus === 'free' ? 'FREE SCORING' : `FOCUS: ${state.focus}`}
                </span>
              </div>

              <div className="flex items-baseline gap-3 mt-2">
                <span className="text-7xl sm:text-8xl lg:text-9xl font-black font-mono tabular-nums text-white leading-none tracking-tight">
                  {threeDartAvg.toFixed(1)}
                </span>
                <span className="text-2xl sm:text-3xl font-black font-mono text-amber-300 uppercase">
                  3DA
                </span>
              </div>
            </div>

            {/* Giant Darts Remaining Card with Visual Progress Bar */}
            <div
              className={cn(
                'sm:col-span-5 card-matte rounded-2xl p-5 sm:p-6 flex flex-col justify-between',
                dartsRemaining <= 9
                  ? 'border-amber-400/65 shadow-[0_0_24px_-6px_rgba(245,158,11,0.4)]'
                  : 'border-emerald-400/40'
              )}
            >
              <div className="text-sm sm:text-base font-mono uppercase tracking-widest font-black text-emerald-300">
                DARTS REMAINING
              </div>

              <div className="flex items-baseline gap-2 my-1">
                <span
                  className={cn(
                    'text-6xl sm:text-7xl font-black font-mono tabular-nums leading-none',
                    dartsRemaining <= 9 ? 'text-amber-300' : 'text-emerald-300'
                  )}
                >
                  {dartsRemaining}
                </span>
                <span className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-slate-500">
                  / {state.targetDarts}
                </span>
              </div>

              <div className="space-y-1.5 mt-2">
                <div className="h-4 rounded-full bg-slate-900 overflow-hidden border border-white/15">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-amber-400 transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="flex justify-between text-sm sm:text-base font-mono font-bold text-slate-300 tabular-nums">
                  <span>{state.totalDartsThrown} thrown</span>
                  <span>{progressPct.toFixed(0)}%</span>
                </div>
              </div>
            </div>
          </div>

          <VisitPillsStrip
            darts={state.visitDarts}
            dartTones={dartTones}
            boardStatus={boardStatus}
            turnComplete={state.turnComplete}
          />

          <div className="card-matte rounded-2xl p-3 sm:p-4 flex items-center justify-center">
            <SvgDartboard
              size={680}
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

        {/* Right/Bottom: Huge Hit %, Total Points, High Visit & Ton+ Breakdown */}
        <div className="xl:col-span-5 space-y-4">
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <div className="card-matte rounded-2xl p-4 sm:p-5 border-amber-400/30">
              <div className="text-sm sm:text-base font-mono uppercase tracking-wider font-black text-slate-300 flex items-center gap-1.5">
                <Gauge className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 shrink-0" />
                <span className="truncate">{state.focus === 'free' ? '20+ %' : `${state.focus} %`}</span>
              </div>
              <div className="text-3xl sm:text-5xl font-black font-mono tabular-nums text-amber-300 leading-none mt-2">
                {focusPct.toFixed(0)}%
              </div>
              <div className="text-sm sm:text-base font-mono font-bold text-slate-400 mt-1.5 tabular-nums">
                {state.targetHits} hits
              </div>
            </div>

            <div className="card-matte rounded-2xl p-4 sm:p-5 border-sky-400/30">
              <div className="text-sm sm:text-base font-mono uppercase tracking-wider font-black text-slate-300 truncate">
                Total Pts
              </div>
              <div className="text-3xl sm:text-5xl font-black font-mono tabular-nums text-white leading-none mt-2">
                {state.totalPoints}
              </div>
              <div className="text-sm sm:text-base font-mono font-bold text-slate-400 mt-1.5 tabular-nums">
                {Math.ceil(state.totalDartsThrown / 3)} visits
              </div>
            </div>

            <div className="card-matte rounded-2xl p-4 sm:p-5 border-emerald-400/30">
              <div className="text-sm sm:text-base font-mono uppercase tracking-wider font-black text-slate-300 flex items-center gap-1.5">
                <Flame className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 shrink-0" />
                <span className="truncate">Best Visit</span>
              </div>
              <div className="text-3xl sm:text-5xl font-black font-mono tabular-nums text-emerald-300 leading-none mt-2">
                {state.highestVisit}
              </div>
              <div className="text-sm sm:text-base font-mono font-bold text-slate-400 mt-1.5 tabular-nums">
                100+: {state.ton100Plus + state.ton140Plus + state.ton180s}
              </div>
            </div>
          </div>

          <div className="card-matte rounded-2xl p-5 space-y-3.5">
            <div className="text-sm sm:text-base font-mono uppercase tracking-widest text-amber-300 font-black flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400 shrink-0" />
              Scoring Power Breakdown
            </div>
            <div className="grid grid-cols-4 gap-3 text-center font-mono">
              {[
                { label: '60+', val: state.ton60Plus, tone: 'text-slate-100', border: 'border-white/15' },
                { label: '100+', val: state.ton100Plus, tone: 'text-emerald-300', border: 'border-emerald-400/35' },
                { label: '140+', val: state.ton140Plus, tone: 'text-amber-300', border: 'border-amber-400/40' },
                { label: '180', val: state.ton180s, tone: 'text-rose-300', border: 'border-rose-400/45' },
              ].map((b) => (
                <div
                  key={b.label}
                  className={cn(
                    'py-4 px-2 rounded-2xl bg-slate-900/85 border-2',
                    b.border
                  )}
                >
                  <div className="text-base sm:text-lg font-black text-slate-300">{b.label}</div>
                  <div className={cn('text-3xl sm:text-5xl font-black tabular-nums leading-none mt-2', b.tone)}>
                    {b.val}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {recentVisitsCompact.length > 0 && (
            <div className="card-matte rounded-2xl p-5 space-y-3">
              <div className="text-sm sm:text-base font-mono uppercase tracking-widest text-slate-300 font-black">
                Recent Visits
              </div>
              <div className="flex flex-wrap gap-2.5">
                {recentVisitsCompact.map((v, i) => (
                  <span
                    key={i}
                    className={cn(
                      'px-4 py-2 rounded-xl border-2 font-mono text-xl sm:text-2xl font-black tabular-nums',
                      v >= 140
                        ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                        : v >= 100
                        ? 'bg-emerald-500/20 border-emerald-400/55 text-emerald-200'
                        : 'bg-slate-900 border-white/15 text-white'
                    )}
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
