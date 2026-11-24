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
  advanceJdcRound,
  applyDartToJdc,
  buildJdcResult,
  createInitialJdcState,
  getJdcBelt,
  JdcState,
} from './engine';
import { Award, Crown, Target } from 'lucide-react';
import { cn } from '../../lib/utils';

const JDC_BELT_TIERS = [
  { name: 'White', min: 0, barClass: 'bg-slate-300' },
  { name: 'Yellow', min: 150, barClass: 'bg-amber-300' },
  { name: 'Orange', min: 250, barClass: 'bg-orange-400' },
  { name: 'Green', min: 350, barClass: 'bg-emerald-400' },
  { name: 'Blue', min: 450, barClass: 'bg-sky-400' },
  { name: 'Purple', min: 550, barClass: 'bg-purple-400' },
  { name: 'Red', min: 650, barClass: 'bg-rose-400' },
  { name: 'Black', min: 750, barClass: 'bg-white' },
] as const;

const JDC_STAGE_META = [
  { key: 'shanghai-low' as const, label: 'Stage 1', subtitle: 'Shanghai 10–15', startIdx: 0, endIdx: 5 },
  { key: 'doubles' as const, label: 'Stage 2', subtitle: 'Doubles D1–Bull', startIdx: 6, endIdx: 12 },
  { key: 'shanghai-high' as const, label: 'Stage 3', subtitle: 'Shanghai 15–20', startIdx: 13, endIdx: 18 },
];

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
  const historyRef = useRef<Array<{ state: JdcState; turnStartState: JdcState }>>([]);
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
    const fresh = createInitialJdcState(players, config);
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
      historyRef.current.push({ state: current, turnStartState: turnStartRef.current });
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

  const nextBelt = JDC_BELT_TIERS.find((tier) => tier.min > state.score) ?? null;
  const activeStageKey = activeRound?.stage ?? 'shanghai-high';
  const activeStageRounds = state.rounds
    .map((round, idx) => ({ round, idx }))
    .filter((entry) => entry.round.stage === activeStageKey);

  return (
    <div className="space-y-4">
      <CalloutBanner callout={callout} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 xl:gap-5 items-start">
        {/* Left/Top: Giant Stage/Target, Giant Score + Belt, Visit Strip & Giant Dartboard */}
        <div className="xl:col-span-7 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            {/* Giant Active Stage / Target Card */}
            <div className="sm:col-span-7 card-matte rounded-2xl p-5 sm:p-6 border-purple-400/45 flex flex-col justify-between">
              <div className="text-sm sm:text-base font-mono uppercase tracking-widest text-purple-300 font-black flex items-center gap-2">
                <Target className="w-5 h-5 shrink-0 text-purple-400" />
                <span>
                  {activeRound?.stageLabel} • VISIT {state.roundIndex + 1}/{state.rounds.length}
                </span>
              </div>

              {activeRound?.doubleTargets ? (
                <div className="mt-2 space-y-2.5">
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-7xl sm:text-8xl lg:text-9xl font-black font-mono tabular-nums text-white leading-none tracking-tight">
                      {activeRound.doubleTargets[currentDartIdx]?.label ?? 'DONE'}
                    </span>
                    <span className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 border-2 border-emerald-400/60 text-emerald-200 font-mono text-base sm:text-lg font-black uppercase">
                      DART {currentDartIdx + 1} OF 3
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {activeRound.doubleTargets.map((t, idx) => (
                      <span
                        key={`${t.label}-${idx}`}
                        className={cn(
                          'px-3.5 py-1.5 rounded-xl font-mono text-base sm:text-lg font-black border-2',
                          idx === currentDartIdx && !state.turnComplete
                            ? 'bg-emerald-500/25 border-emerald-400 text-white shadow-[0_0_16px_rgba(16,185,129,0.45)]'
                            : idx < state.visitDarts.length
                            ? 'bg-slate-900/90 border-white/15 text-slate-400'
                            : 'bg-slate-900/60 border-sky-400/35 text-sky-200'
                        )}
                      >
                        D{idx + 1}: {t.label}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-2 space-y-2.5">
                  <div className="text-6xl sm:text-7xl lg:text-8xl font-black font-mono tabular-nums text-white tracking-tight leading-none">
                    {activeRound?.title || 'COMPLETE'}
                  </div>
                  {activeRound?.shanghaiNumber !== undefined && (
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {[
                        { label: 'S', hit: state.hitS },
                        { label: 'D', hit: state.hitD },
                        { label: 'T', hit: state.hitT },
                      ].map((b) => (
                        <span
                          key={b.label}
                          className={cn(
                            'px-4 py-1.5 rounded-xl text-base sm:text-xl font-mono font-black border-2 tabular-nums',
                            b.hit
                              ? 'bg-purple-500/30 border-purple-400 text-white shadow-[0_0_16px_rgba(168,85,247,0.45)]'
                              : 'bg-slate-900/80 border-white/15 text-slate-400'
                          )}
                        >
                          {b.label}
                          {activeRound.shanghaiNumber}
                        </span>
                      ))}
                      <span className="text-sm sm:text-base font-mono font-bold text-purple-200">
                        ALL 3 = +100
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Giant Total Score + Current Belt Card */}
            <div className="sm:col-span-5 card-matte rounded-2xl p-5 sm:p-6 border-white/15 flex flex-col justify-between">
              <div className="text-sm sm:text-base font-mono uppercase tracking-widest text-slate-300 font-black">
                TOTAL SCORE
              </div>
              <div className="text-7xl sm:text-8xl lg:text-9xl font-black font-mono tabular-nums text-white leading-none mt-2">
                {state.score}
              </div>
              <div className="mt-3">
                <div
                  className={cn(
                    'inline-flex items-center gap-2 px-4 py-1.5 rounded-full border-2 text-base sm:text-lg font-mono font-black uppercase tracking-wide',
                    belt.colorClass
                  )}
                >
                  <Award className="w-5 h-5 shrink-0" />
                  <span>{belt.name}</span>
                </div>
              </div>
            </div>
          </div>

          <VisitPillsStrip
            darts={state.visitDarts}
            boardStatus={boardStatus}
            turnComplete={state.turnComplete}
          />

          <div className="card-matte rounded-2xl p-3 sm:p-4 flex items-center justify-center">
            <SvgDartboard
              size={640}
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

        {/* Right/Bottom: Big KPIs, 3-Stage Progress Strip & Belt Meter */}
        <div className="xl:col-span-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="card-matte rounded-2xl p-5 border-purple-400/30">
              <div className="text-sm sm:text-base font-mono uppercase tracking-wider font-black text-slate-300 flex items-center gap-2">
                <Crown className="w-5 h-5 text-purple-400 shrink-0" />
                Shanghais
              </div>
              <div className="text-4xl sm:text-5xl lg:text-6xl font-black font-mono tabular-nums text-purple-300 leading-none mt-2">
                {state.shanghaiCount}
              </div>
            </div>
            <div className="card-matte rounded-2xl p-5 border-emerald-400/30">
              <div className="text-sm sm:text-base font-mono uppercase tracking-wider font-black text-slate-300">
                Stage 2 Doubles
              </div>
              <div className="text-4xl sm:text-5xl lg:text-6xl font-black font-mono tabular-nums text-emerald-300 leading-none mt-2">
                {state.doublesHit}
                <span className="text-2xl sm:text-3xl text-slate-500">/21</span>
              </div>
            </div>
          </div>

          {/* 3-Stage Progress Strip + Active Stage Rounds */}
          <div className="card-matte rounded-2xl p-5 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm sm:text-base font-mono uppercase tracking-widest text-slate-300 font-black">
                3-Stage Routine Progress
              </div>
              <div className="text-sm sm:text-base font-mono font-bold text-slate-400 tabular-nums">
                {state.logs.length} / {state.rounds.length} visits
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {JDC_STAGE_META.map((stage) => {
                const totalInStage = stage.endIdx - stage.startIdx + 1;
                const stageLogs = state.logs.filter(
                  (l) => l.roundIndex >= stage.startIdx && l.roundIndex <= stage.endIdx
                );
                const stagePts = stageLogs.reduce((acc, l) => acc + l.points, 0);
                const isActive = !state.isFinished && activeRound?.stage === stage.key;
                const isDone = stageLogs.length >= totalInStage;

                return (
                  <div
                    key={stage.key}
                    className={cn(
                      'p-3.5 rounded-xl border-2 font-mono transition-all',
                      isActive
                        ? 'bg-purple-500/20 border-purple-400 text-white shadow-[0_0_20px_rgba(168,85,247,0.3)]'
                        : isDone
                        ? 'bg-emerald-500/12 border-emerald-400/45 text-emerald-200'
                        : 'bg-slate-900/65 border-white/10 text-slate-400'
                    )}
                  >
                    <div className="text-sm sm:text-base font-black uppercase tracking-wide">
                      {stage.label}
                    </div>
                    <div className="text-sm font-bold opacity-85 truncate">{stage.subtitle}</div>
                    <div className="flex items-baseline justify-between mt-2">
                      <span className="text-xl sm:text-2xl font-black tabular-nums text-white">
                        +{stagePts}
                      </span>
                      <span className="text-sm font-bold tabular-nums opacity-80">
                        {stageLogs.length}/{totalInStage}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Active Stage Round Strip */}
            <div
              className={cn(
                'grid gap-2',
                activeStageRounds.length === 7 ? 'grid-cols-7' : 'grid-cols-6'
              )}
            >
              {activeStageRounds.map(({ round, idx }) => {
                const log = state.logs.find((l) => l.roundIndex === idx);
                const isCurrent = idx === state.roundIndex && !state.isFinished;
                const shortTitle =
                  round.shanghaiNumber !== undefined
                    ? `SH ${round.shanghaiNumber}`
                    : round.doubleTargets
                    ? `${round.doubleTargets[0].label}–${round.doubleTargets[round.doubleTargets.length - 1].label}`
                    : round.title;

                return (
                  <div
                    key={idx}
                    className={cn(
                      'px-2 py-2 rounded-xl border-2 text-center font-mono',
                      isCurrent
                        ? 'bg-purple-500/25 border-purple-400 text-white'
                        : log
                        ? 'bg-slate-900/90 border-white/20 text-slate-200'
                        : 'bg-slate-950/60 border-white/[0.07] text-slate-500'
                    )}
                  >
                    <div className="text-sm font-black truncate">{shortTitle}</div>
                    <div className="text-sm sm:text-base font-black tabular-nums text-emerald-300 mt-0.5">
                      {log ? `+${log.points}${log.shanghaiBonus ? '★' : ''}` : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* JDC Belt Meter */}
          <div className="card-matte rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-sm sm:text-base font-mono uppercase tracking-widest text-slate-300 font-black flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400 shrink-0" />
                JDC Belt Meter
              </div>
              <div className="text-sm sm:text-base font-mono font-black text-amber-300 tabular-nums">
                {nextBelt
                  ? `${nextBelt.min - state.score} PTS TO ${nextBelt.name.toUpperCase()}`
                  : 'MAX BLACK BELT ACHIEVED!'}
              </div>
            </div>

            <div className="grid grid-cols-8 gap-1.5">
              {JDC_BELT_TIERS.map((tier) => {
                const unlocked = state.score >= tier.min;
                const isCurrentTier = belt.name.startsWith(tier.name);
                return (
                  <div key={tier.name} className="space-y-1.5 text-center font-mono">
                    <div
                      className={cn(
                        'h-5 rounded-md border transition-all',
                        unlocked
                          ? cn(
                              tier.barClass,
                              isCurrentTier
                                ? 'border-white shadow-[0_0_14px_rgba(255,255,255,0.65)] scale-[1.03]'
                                : 'border-white/40 opacity-90'
                            )
                          : 'bg-slate-900/80 border-white/10 opacity-35'
                      )}
                    />
                    <div
                      className={cn(
                        'text-sm font-black tabular-nums leading-none',
                        isCurrentTier
                          ? 'text-white'
                          : unlocked
                          ? 'text-slate-300'
                          : 'text-slate-500'
                      )}
                    >
                      {tier.min}
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
