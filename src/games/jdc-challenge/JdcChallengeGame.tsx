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
  advanceJdcRound,
  applyDartToJdc,
  buildJdcResult,
  createInitialJdcState,
  getJdcBelt,
  JdcState,
} from './engine';
import { Award, Crown, Target } from 'lucide-react';
import { cn } from '../../lib/utils';

export const JdcChallengeGame: React.FC<GameModuleProps> = ({
  players,
  config,
  soundEnabled,
  isBoardConnected,
  boardStatus,
  onGameComplete,
  registerController,
  onCanUndoChange,
}) => {
  const [state, setState] = useState<JdcState>(() => createInitialJdcState(players, config));
  const [historyLen, setHistoryLen] = useState(0);
  const [callout, setCallout] = useState<GameCallout | null>(null);

  const stateRef = useRef(state);
  const turnStartRef = useRef(state);
  const historyRef = useRef<JdcState[]>([]);
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
    (finalState: JdcState) => {
      if (completedRef.current) return;
      completedRef.current = true;
      completeTimerRef.current = window.setTimeout(() => {
        onGameComplete(buildJdcResult(finalState, startedAtRef.current));
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
    const fresh = createInitialJdcState(players, config);
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
      const { nextState, feedback } = applyDartToJdc(current, dart);
      stateRef.current = nextState;
      setState(nextState);
      setHistoryLen(historyRef.current.length);

      if (feedback.sound === 'jackpot') soundEngine.playJackpot(soundEnabled);
      else if (feedback.sound === 'bonusHit') soundEngine.playBonusHit(soundEnabled);
      else if (feedback.sound === 'hazard') soundEngine.playHazard(soundEnabled);
      else soundEngine.playDartHit(soundEnabled);

      if (feedback.title) {
        showCallout(feedback.title, feedback.subtitle, feedback.accent || 'purple');
      }
      if (nextState.isFinished) scheduleFinish(nextState);
    },
    onDartCorrected: (_dart, _prev, _idx, visitThrows) => {
      let replay = turnStartRef.current;
      for (const d of visitThrows) {
        replay = applyDartToJdc(replay, d).nextState;
      }
      stateRef.current = replay;
      setState(replay);
      if (replay.isFinished) scheduleFinish(replay);
    },
    onVisitCompleted: () => {
      const current = stateRef.current;
      if (current.isFinished || current.visitDarts.length === 0) return;
      historyRef.current.push(current);
      const next = advanceJdcRound(current);
      stateRef.current = next;
      turnStartRef.current = next;
      setState(next);
      setHistoryLen(historyRef.current.length);
      soundEngine.playTurnChange(soundEnabled);
      if (next.isFinished) scheduleFinish(next);
    },
  });

  const activeRound = state.rounds[state.roundIndex];
  const belt = getJdcBelt(state.score);
  const currentDartIdx = Math.min(2, state.visitDarts.length);

  const segmentOverlays = useMemo<Record<string, SegmentOverlayStyle>>(() => {
    if (!activeRound) return {};
    if (activeRound.shanghaiNumber !== undefined) {
      return {
        [String(activeRound.shanghaiNumber)]: {
          fill: '#A855F7',
          opacity: 0.85,
          stroke: '#FFFFFF',
          pulse: true,
          badge: String(activeRound.shanghaiNumber),
        },
      };
    }
    if (activeRound.doubleTargets) {
      const overlays: Record<string, SegmentOverlayStyle> = {};
      activeRound.doubleTargets.forEach((t, idx) => {
        overlays[t.label] =
          idx === currentDartIdx
            ? { fill: '#10B981', opacity: 0.95, stroke: '#FFFFFF', pulse: true, badge: t.label }
            : { fill: '#38BDF8', opacity: 0.45 };
      });
      return overlays;
    }
    return {};
  }, [activeRound, currentDartIdx]);

  return (
    <div className="space-y-4">
      <CalloutBanner callout={callout} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div className="xl:col-span-7 space-y-4">
          <div className="card-matte rounded-2xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 border-purple-400/35">
            <div>
              <div className="text-xs font-mono uppercase tracking-widest text-purple-300 font-bold flex items-center gap-1.5">
                <Target className="w-4 h-4" />
                {activeRound?.stageLabel} • Visit {state.roundIndex + 1}/{state.rounds.length}
              </div>
              <div className="text-4xl sm:text-5xl font-black font-mono text-white tracking-tight mt-1">
                {activeRound?.doubleTargets
                  ? `Dart ${currentDartIdx + 1}: ${activeRound.doubleTargets[currentDartIdx]?.label}`
                  : activeRound?.title || 'Complete'}
              </div>
              {activeRound?.shanghaiNumber !== undefined && (
                <div className="flex items-center gap-2 mt-2">
                  {[
                    { label: 'S', hit: state.hitS },
                    { label: 'D', hit: state.hitD },
                    { label: 'T', hit: state.hitT },
                  ].map((b) => (
                    <span
                      key={b.label}
                      className={cn(
                        'px-2.5 py-0.5 rounded-md text-xs font-mono font-black border',
                        b.hit
                          ? 'bg-purple-500/30 border-purple-400 text-purple-200'
                          : 'bg-slate-900 border-white/10 text-slate-500'
                      )}
                    >
                      {b.label}
                      {activeRound.shanghaiNumber}
                    </span>
                  ))}
                  <span className="text-[11px] font-mono text-slate-400">
                    All 3 = +100 Shanghai
                  </span>
                </div>
              )}
            </div>

            <div className="text-right space-y-1.5">
              <div className="text-5xl sm:text-7xl font-black font-mono tabular-nums text-white leading-none">
                {state.score}
              </div>
              <div
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-mono font-black uppercase',
                  belt.colorClass
                )}
              >
                <Award className="w-3.5 h-3.5" />
                {belt.name}
              </div>
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

        <div className="xl:col-span-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="card-matte rounded-2xl p-4">
              <div className="text-[11px] font-mono uppercase text-slate-400 flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5 text-purple-400" />
                Shanghais
              </div>
              <div className="text-3xl font-black font-mono tabular-nums text-purple-300 mt-1">
                {state.shanghaiCount}
              </div>
            </div>
            <div className="card-matte rounded-2xl p-4">
              <div className="text-[11px] font-mono uppercase text-slate-400">
                Stage 2 Doubles
              </div>
              <div className="text-3xl font-black font-mono tabular-nums text-emerald-300 mt-1">
                {state.doublesHit}
                <span className="text-base text-slate-500">/21</span>
              </div>
            </div>
          </div>

          <div className="card-matte rounded-2xl p-4 sm:p-5 space-y-2.5">
            <div className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">
              Routine Progress ({state.logs.length}/{state.rounds.length})
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[420px] overflow-y-auto pr-1">
              {state.rounds.map((r, idx) => {
                const log = state.logs.find((l) => l.roundIndex === idx);
                const isCurrent = idx === state.roundIndex && !state.isFinished;
                return (
                  <div
                    key={idx}
                    className={cn(
                      'p-2.5 rounded-xl border font-mono text-xs',
                      isCurrent
                        ? 'bg-purple-500/20 border-purple-400/70 text-white'
                        : log
                        ? 'bg-slate-900/90 border-white/15 text-slate-200'
                        : 'bg-slate-950/50 border-white/[0.05] text-slate-500'
                    )}
                  >
                    <div className="font-bold truncate">{r.title}</div>
                    <div className="text-[11px] mt-0.5 tabular-nums text-emerald-300">
                      {log ? `+${log.points}${log.shanghaiBonus ? ' ★' : ''}` : '—'}
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
