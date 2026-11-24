import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crown, Flame, Swords, Target } from 'lucide-react';
import { GameModuleProps } from '../../types/games';
import { DartThrow } from '../../types/darts';
import { SvgDartboard, SegmentOverlayStyle } from '../../components/dartboard/SvgDartboard';
import { DartPlotOverlay } from '../../components/dartboard/DartPlotOverlay';
import { useGameBoardEvents } from '../hooks/useGameBoardEvents';
import { useActiveTurnTint } from '../hooks/useActiveTurnTint';
import { soundEngine } from '../utils/soundEngine';
import { injectBoardClickThrow } from '../utils/dartHelpers';
import { CalloutBanner, GameCallout, VisitPillsStrip } from '../components/ArcadePrimitives';
import { gameEventBus } from '../../services/gameEventBus';
import { cn } from '../../lib/utils';
import {
  advanceTurn,
  applyDartToState,
  buildGameResult,
  CRICKET_TARGETS,
  CricketFeedback,
  CricketGameState,
  CricketHistorySnapshot,
  createInitialState,
  formatTargetLabel,
  getClosedCount,
  isTargetDead,
} from './engine';

function playFeedbackSound(sound: CricketFeedback['sound'], enabled: boolean): void {
  switch (sound) {
    case 'hit':
      soundEngine.playDartHit(enabled);
      break;
    case 'bonus':
      soundEngine.playBonusHit(enabled);
      break;
    case 'jackpot':
      soundEngine.playJackpot(enabled);
      break;
    case 'hazard':
      soundEngine.playHazard(enabled);
      break;
    default:
      break;
  }
}

/**
 * Crisp neon Cricket mark glyph: 0 = dot, 1 = /, 2 = X, 3 = ⊗ (circle + X)
 */
const CricketMarkGlyph: React.FC<{
  marks: number;
  colorHex: string;
  dead: boolean;
}> = ({ marks, colorHex, dead }) => {
  const clamped = Math.max(0, Math.min(3, marks));
  const strokeColor = dead ? '#64748B' : clamped === 3 ? '#10B981' : colorHex;

  if (clamped === 0) {
    return (
      <div className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center">
        <span className="w-2.5 h-2.5 rounded-full bg-slate-700/80" />
      </div>
    );
  }

  return (
    <svg
      viewBox="0 0 36 36"
      className={cn(
        'w-10 h-10 sm:w-11 sm:h-11 transition-transform',
        !dead && clamped === 3 && 'drop-shadow-[0_0_10px_rgba(16,185,129,0.8)]'
      )}
      aria-label={`${clamped} marks`}
    >
      {/* Closed ring for 3 marks (⊗) */}
      {clamped >= 3 && (
        <circle
          cx="18"
          cy="18"
          r="13.5"
          fill={dead ? 'rgba(100,116,139,0.12)' : 'rgba(16,185,129,0.2)'}
          stroke={strokeColor}
          strokeWidth="3.2"
        />
      )}
      {/* First slash (/) */}
      {clamped >= 1 && (
        <line
          x1="9"
          y1="27"
          x2="27"
          y2="9"
          stroke={strokeColor}
          strokeWidth="3.8"
          strokeLinecap="round"
        />
      )}
      {/* Second slash (\) to form X */}
      {clamped >= 2 && (
        <line
          x1="9"
          y1="9"
          x2="27"
          y2="27"
          stroke={strokeColor}
          strokeWidth="3.8"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
};

export const CricketGame: React.FC<GameModuleProps> = ({
  players,
  config,
  soundEnabled,
  isBoardConnected,
  boardStatus,
  onGameComplete,
  registerController,
  onCanUndoChange,
}) => {
  const startedAtRef = useRef<number>(Date.now());
  const completedRef = useRef<boolean>(false);
  const completeTimerRef = useRef<number | null>(null);
  const calloutTimerRef = useRef<number | null>(null);
  const calloutIdRef = useRef<number>(1);

  const initialGameState = useMemo(
    () => createInitialState(players, config),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [state, setState] = useState<CricketGameState>(initialGameState);
  const [historyCount, setHistoryCount] = useState<number>(0);
  const [callout, setCallout] = useState<GameCallout | null>(null);

  const stateRef = useRef<CricketGameState>(initialGameState);
  const turnStartRef = useRef<CricketGameState>(initialGameState);
  const historyRef = useRef<CricketHistorySnapshot[]>([]);

  const clearTimers = useCallback(() => {
    if (completeTimerRef.current !== null) {
      window.clearTimeout(completeTimerRef.current);
      completeTimerRef.current = null;
    }
    if (calloutTimerRef.current !== null) {
      window.clearTimeout(calloutTimerRef.current);
      calloutTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const showCallout = useCallback((next: Omit<GameCallout, 'id'>, durationMs = 1750) => {
    if (calloutTimerRef.current !== null) {
      window.clearTimeout(calloutTimerRef.current);
    }
    calloutIdRef.current += 1;
    setCallout({ id: calloutIdRef.current, ...next });
    calloutTimerRef.current = window.setTimeout(() => {
      setCallout(null);
      calloutTimerRef.current = null;
    }, durationMs);
  }, []);

  const triggerFeedback = useCallback(
    (feedback: CricketFeedback, isWin = false) => {
      playFeedbackSound(feedback.sound, soundEnabled);
      if (feedback.callout) {
        showCallout(feedback.callout, isWin ? 2400 : 1750);
      }
    },
    [soundEnabled, showCallout]
  );

  const scheduleComplete = useCallback(
    (finishedState: CricketGameState) => {
      if (completedRef.current) return;
      completedRef.current = true;
      completeTimerRef.current = window.setTimeout(() => {
        onGameComplete(buildGameResult(finishedState, startedAtRef.current));
      }, 850);
    },
    [onGameComplete]
  );

  const commitState = useCallback(
    (
      nextState: CricketGameState,
      nextTurnStart: CricketGameState,
      nextHistory: CricketHistorySnapshot[]
    ) => {
      stateRef.current = nextState;
      turnStartRef.current = nextTurnStart;
      historyRef.current = nextHistory;
      setState(nextState);
      setHistoryCount(nextHistory.length);
    },
    []
  );

  const handleUndo = useCallback(() => {
    const stack = historyRef.current;
    if (stack.length === 0) return;

    if (completeTimerRef.current !== null) {
      window.clearTimeout(completeTimerRef.current);
      completeTimerRef.current = null;
    }
    completedRef.current = false;

    const prev = stack[stack.length - 1];
    commitState(prev.state, prev.turnStartState, stack.slice(0, -1));
    setCallout(null);
    gameEventBus.resetVisitBuffer(prev.state.visitEntries.map((e) => e.dart));
  }, [commitState]);

  const handleRestart = useCallback(() => {
    clearTimers();
    completedRef.current = false;
    startedAtRef.current = Date.now();
    gameEventBus.resetVisitBuffer([]);

    const fresh = createInitialState(players, config);
    commitState(fresh, fresh, []);
    setCallout(null);
  }, [clearTimers, players, config, commitState]);

  useEffect(() => {
    registerController({
      undoLastAction: handleUndo,
      canUndo: () => historyRef.current.length > 0,
      restartMatch: handleRestart,
    });
  }, [registerController, handleUndo, handleRestart]);

  useEffect(() => {
    onCanUndoChange?.(historyCount > 0);
  }, [historyCount, onCanUndoChange]);

  useGameBoardEvents({
    enabled: !state.isFinished,
    onDartThrown: (dart) => {
      const current = stateRef.current;
      if (current.isFinished || current.turnComplete || current.visitEntries.length >= 3) {
        return;
      }

      const nextHistory = [
        ...historyRef.current,
        { state: current, turnStartState: turnStartRef.current },
      ];
      const { nextState, feedback } = applyDartToState(current, dart);
      commitState(nextState, turnStartRef.current, nextHistory);
      triggerFeedback(feedback, nextState.isFinished);

      if (nextState.isFinished) {
        scheduleComplete(nextState);
      }
    },
    onDartCorrected: (_dart, _prevDart, _dartIndex, visitThrows) => {
      let replayed = turnStartRef.current;
      let lastFeedback: CricketFeedback = { sound: 'none', callout: null };

      for (const t of visitThrows.slice(0, 3)) {
        const res = applyDartToState(replayed, t);
        replayed = res.nextState;
        lastFeedback = res.feedback;
        if (replayed.isFinished) break;
      }

      commitState(replayed, turnStartRef.current, historyRef.current);
      triggerFeedback(lastFeedback, replayed.isFinished);
      if (replayed.isFinished) {
        scheduleComplete(replayed);
      }
    },
    onVisitCompleted: () => {
      const current = stateRef.current;
      if (current.isFinished) return;

      const nextHistory = [
        ...historyRef.current,
        { state: current, turnStartState: turnStartRef.current },
      ];
      const nextState = advanceTurn(current);
      commitState(nextState, nextState, nextHistory);
      soundEngine.playTurnChange(soundEnabled);
    },
  });

  const activePlayer = state.players[state.activePlayerIndex] ?? state.players[0];
  useActiveTurnTint(activePlayer?.colorHex);

  const isCutthroat = state.config.variant === 'cutthroat';

  const visitDarts: DartThrow[] = useMemo(
    () => state.visitEntries.map((e) => e.dart),
    [state.visitEntries]
  );

  // Determine current score leader
  const leadingScore = useMemo(() => {
    if (state.players.length === 0) return 0;
    const scores = state.players.map((p) => p.score);
    return isCutthroat ? Math.min(...scores) : Math.max(...scores);
  }, [state.players, isCutthroat]);

  // Highlight active still-open Cricket numbers on SvgDartboard
  const segmentOverlays = useMemo<Record<string, SegmentOverlayStyle>>(() => {
    const overlays: Record<string, SegmentOverlayStyle> = {};
    if (!activePlayer) return overlays;

    for (const target of CRICKET_TARGETS) {
      if (isTargetDead(state.players, target)) continue;

      const myMarks = activePlayer.marks[target];
      const canScoreHere = myMarks >= 3;
      const badgeText = canScoreHere
        ? isCutthroat
          ? '⚔️'
          : '+$'
        : myMarks === 2
        ? 'X'
        : myMarks === 1
        ? '/'
        : String(target === 25 ? 'B' : target);

      const style: SegmentOverlayStyle = canScoreHere
        ? {
            fill: isCutthroat ? '#F43F5E' : '#10B981',
            opacity: 0.84,
            stroke: '#FFFFFF',
            pulse: true,
            badge: badgeText,
            badgeColor: '#FFFFFF',
          }
        : {
            fill: '#38BDF8',
            opacity: 0.62,
            stroke: '#E0F2FE',
            pulse: false,
            badge: badgeText,
            badgeColor: '#FFFFFF',
          };

      if (target === 25) {
        overlays['25'] = {
          fill: style.fill,
          opacity: canScoreHere ? 0.84 : 0.72,
          stroke: '#FFFFFF',
          pulse: style.pulse,
        };
        overlays['Bull'] = {
          fill: canScoreHere ? style.fill : '#F59E0B',
          opacity: 0.9,
          stroke: '#FFFFFF',
          pulse: style.pulse,
        };
      } else {
        overlays[String(target)] = style;
      }
    }

    return overlays;
  }, [state.players, activePlayer, isCutthroat]);

  if (!activePlayer) return null;

  const activeClosedCount = getClosedCount(activePlayer);

  return (
    <div className="space-y-4">
      {/* TOP SPOTLIGHT: Giant Active Player Banner, Variant Badge, Score & Full-Width Visit Strip */}
      <div
        className="card-matte rounded-2xl p-5 sm:p-6 space-y-4 border-2 transition-all"
        style={{
          borderColor: `${activePlayer.colorHex}85`,
          boxShadow: `0 0 38px -10px ${activePlayer.colorHex}65`,
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-5">
          {/* Active Player Identity + Variant Badge */}
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center font-black text-3xl sm:text-4xl text-slate-950 shrink-0 shadow-lg"
              style={{ backgroundColor: activePlayer.colorHex }}
            >
              {activePlayer.avatarInitial}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <span
                  className={cn(
                    'text-sm sm:text-base font-mono font-black uppercase tracking-widest px-3 py-0.5 rounded-lg border flex items-center gap-1.5',
                    isCutthroat
                      ? 'bg-rose-500/20 border-rose-400/60 text-rose-200'
                      : 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200'
                  )}
                >
                  {isCutthroat ? <Swords className="w-4 h-4" /> : <Target className="w-4 h-4" />}
                  {isCutthroat ? 'CUT-THROAT' : 'STANDARD'} • RD {state.round}
                </span>
                <span className="text-sm sm:text-base font-mono font-black text-slate-300 tabular-nums">
                  {activeClosedCount}/7 Closed
                </span>
              </div>

              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight truncate leading-tight mt-1">
                {activePlayer.name}
              </h2>

              <div className="mt-1 text-sm sm:text-base font-bold text-slate-300">
                {isCutthroat
                  ? 'Close 20–15 & Bull • Dump points on open rivals • Lowest wins!'
                  : 'Close 20–15 & Bull • Score overflow on open targets • Highest wins!'}
              </div>
            </div>
          </div>

          {/* Giant Score + Visit Marks Box */}
          <div className="bg-slate-900/90 rounded-2xl px-5 py-3.5 border border-white/15 flex items-center gap-6 shrink-0">
            <div>
              <div className="text-sm sm:text-base font-mono uppercase tracking-wider text-slate-400 font-black">
                {isCutthroat ? 'Penalty' : 'Score'}
              </div>
              <div className="text-5xl sm:text-6xl font-black font-mono tabular-nums text-white leading-none mt-1">
                {activePlayer.score}
              </div>
            </div>

            <div className="border-l border-white/15 pl-5 text-right">
              <div className="text-sm sm:text-base font-mono uppercase tracking-wider text-slate-400 font-black">
                Visit Marks
              </div>
              <div className="text-3xl sm:text-4xl font-black font-mono tabular-nums text-amber-300 leading-none mt-1 flex items-center justify-end gap-1.5">
                {state.visitMarks >= 4 && <Flame className="w-6 h-6 text-amber-400" />}
                {state.visitMarks}
              </div>
              {state.visitPointsDelta > 0 && (
                <div
                  className={cn(
                    'text-sm font-mono font-black mt-1 tabular-nums',
                    isCutthroat ? 'text-rose-300' : 'text-emerald-300'
                  )}
                >
                  {isCutthroat
                    ? `Dumped +${state.visitPointsDelta}`
                    : `+${state.visitPointsDelta} pts`}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Full-Width 3-Dart Visit Strip */}
        <VisitPillsStrip
          darts={visitDarts}
          dartLabels={state.visitEntries.map((e) => e.label)}
          dartTones={state.visitEntries.map((e) => e.tone)}
          boardStatus={boardStatus}
          turnComplete={state.turnComplete}
        />
      </div>

      {/* HIGH-DRAMA CALLOUT BANNER */}
      <CalloutBanner callout={callout} />

      {/* MAIN STAGE: Crisp 8-Foot Cricket Matrix + Interactive Dartboard */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* CRICKET SCOREBOARD MATRIX */}
        <div className="xl:col-span-7 card-matte rounded-2xl p-4 sm:p-5 space-y-3 overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-lg sm:text-xl font-black text-white uppercase tracking-wide flex items-center gap-2">
              <Target className="w-6 h-6 text-emerald-400" />
              Cricket Scoreboard Matrix
            </span>
            <span className="text-sm sm:text-base font-mono font-bold text-slate-300">
              / = 1 • X = 2 • ⊗ = Closed
            </span>
          </div>

          <div className="min-w-[380px] space-y-2">
            {/* Player Column Headers */}
            <div
              className="grid gap-2 items-stretch"
              style={{
                gridTemplateColumns: `112px repeat(${state.players.length}, minmax(0, 1fr))`,
              }}
            >
              <div className="rounded-xl bg-slate-950/80 border border-white/15 flex flex-col items-center justify-center p-2.5">
                <span className="text-sm font-mono uppercase tracking-widest text-slate-400 font-black">
                  TARGET
                </span>
                <span className="text-base font-mono font-black text-slate-200 mt-0.5">
                  20–15 • B
                </span>
              </div>

              {state.players.map((p, idx) => {
                const isActive = idx === state.activePlayerIndex && !state.isFinished;
                const isLeader =
                  p.score === leadingScore && (state.totalDartsThrown > 0 || !isCutthroat);
                const closed = getClosedCount(p);

                return (
                  <div
                    key={p.id}
                    className={cn(
                      'rounded-xl border-2 p-3 text-center transition-all flex flex-col items-center justify-between',
                      isActive ? 'bg-slate-900/95' : 'bg-slate-950/65 border-white/10'
                    )}
                    style={
                      isActive
                        ? {
                            borderColor: p.colorHex,
                            boxShadow: `0 0 24px -6px ${p.colorHex}85`,
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-center justify-center gap-1.5 max-w-full">
                      {isLeader && <Crown className="w-5 h-5 text-amber-400 shrink-0" />}
                      <span
                        className="text-xl sm:text-2xl font-black truncate"
                        style={{ color: isActive ? '#FFFFFF' : p.colorHex }}
                      >
                        {p.name}
                      </span>
                    </div>

                    <div className="text-3xl sm:text-4xl font-black font-mono tabular-nums text-white leading-none my-1">
                      {p.score}
                    </div>

                    <div className="text-sm font-mono font-bold text-slate-300 tabular-nums">
                      {closed}/7 ⊗
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 7 Target Rows: 20, 19, 18, 17, 16, 15, BULL */}
            {CRICKET_TARGETS.map((target) => {
              const dead = isTargetDead(state.players, target);
              const activeClosed = activePlayer.marks[target] >= 3;
              const activeCanScore = !dead && activeClosed;

              return (
                <div
                  key={target}
                  className={cn(
                    'grid gap-2 items-center rounded-xl transition-all',
                    dead && 'opacity-45'
                  )}
                  style={{
                    gridTemplateColumns: `112px repeat(${state.players.length}, minmax(0, 1fr))`,
                  }}
                >
                  {/* Target Number Cell */}
                  <div
                    className={cn(
                      'h-16 sm:h-[68px] rounded-xl border-2 flex flex-col items-center justify-center font-mono font-black transition-all',
                      dead
                        ? 'bg-slate-950/60 border-slate-800 text-slate-500 line-through'
                        : activeCanScore
                        ? isCutthroat
                          ? 'bg-rose-500/20 border-rose-400/75 text-rose-200 shadow-[0_0_16px_-4px_rgba(244,63,94,0.6)]'
                          : 'bg-emerald-500/20 border-emerald-400/75 text-emerald-200 shadow-[0_0_16px_-4px_rgba(16,185,129,0.6)]'
                        : 'bg-slate-900/90 border-sky-400/45 text-white'
                    )}
                  >
                    <span className="text-2xl sm:text-3xl leading-none tabular-nums">
                      {formatTargetLabel(target)}
                    </span>
                    <span className="text-sm uppercase tracking-wider mt-0.5 font-black leading-none opacity-85">
                      {dead
                        ? 'DEAD'
                        : activeCanScore
                        ? isCutthroat
                          ? 'ATTACK'
                          : 'SCORE'
                        : 'OPEN'}
                    </span>
                  </div>

                  {/* Player Mark Cells */}
                  {state.players.map((p, pIdx) => {
                    const isActive = pIdx === state.activePlayerIndex && !state.isFinished;
                    const marks = p.marks[target];
                    const isClosed = marks >= 3;

                    return (
                      <div
                        key={p.id}
                        className={cn(
                          'h-16 sm:h-[68px] rounded-xl border-2 flex items-center justify-center transition-all',
                          dead
                            ? 'bg-slate-950/40 border-white/5'
                            : isActive
                            ? isClosed
                              ? 'bg-emerald-500/15 border-emerald-400/50'
                              : 'bg-slate-900/95 border-white/25'
                            : 'bg-slate-900/60 border-white/10'
                        )}
                      >
                        <CricketMarkGlyph marks={marks} colorHex={p.colorHex} dead={dead} />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* INTERACTIVE CRICKET DARTBOARD */}
        <div className="xl:col-span-5 card-matte rounded-2xl p-4 sm:p-5 flex flex-col items-center space-y-3">
          <div className="w-full flex items-center justify-between gap-2">
            <span className="text-base sm:text-lg font-mono uppercase tracking-wider text-slate-200 font-black">
              Live Open Targets
            </span>
            {!isBoardConnected && (
              <span className="text-sm sm:text-base font-mono font-bold text-amber-300">
                Click board to throw
              </span>
            )}
          </div>

          <SvgDartboard
            size={600}
            segmentOverlays={segmentOverlays}
            dimInactiveSegments={true}
            onBoardClick={!isBoardConnected ? injectBoardClickThrow : undefined}
          >
            <DartPlotOverlay
              sessionThrows={[]}
              currentVisitThrows={visitDarts}
              mode="dots"
            />
          </SvgDartboard>

          {/* Board Legend */}
          <div className="w-full rounded-xl bg-slate-900/85 border border-white/10 px-4 py-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm sm:text-base font-mono font-bold text-slate-200">
            <span className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full bg-sky-400" />
              Need Marks
            </span>
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  'w-3.5 h-3.5 rounded-full',
                  isCutthroat ? 'bg-rose-500' : 'bg-emerald-500'
                )}
              />
              {isCutthroat ? '⚔️ Dump Points' : '+$ Score Points'}
            </span>
            <span className="text-slate-300 font-black">25 = 1 • Bull = 2</span>
          </div>
        </div>
      </div>
    </div>
  );
};
