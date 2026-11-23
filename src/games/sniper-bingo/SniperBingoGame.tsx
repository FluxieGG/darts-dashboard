import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crosshair, Flame, Grid3X3, Sparkles, Target } from 'lucide-react';
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
  createInitialState,
  getMatchPointIndices,
  SniperBingoFeedback,
  SniperBingoGameState,
  SniperBingoHistorySnapshot,
} from './engine';

function createFreshSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
}

function playFeedbackSound(sound: SniperBingoFeedback['sound'], enabled: boolean): void {
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

export const SniperBingoGame: React.FC<GameModuleProps> = ({
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
    () => createInitialState(players, config, createFreshSeed()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [state, setState] = useState<SniperBingoGameState>(initialGameState);
  const [historyCount, setHistoryCount] = useState<number>(0);
  const [callout, setCallout] = useState<GameCallout | null>(null);

  const stateRef = useRef<SniperBingoGameState>(initialGameState);
  const turnStartRef = useRef<SniperBingoGameState>(initialGameState);
  const historyRef = useRef<SniperBingoHistorySnapshot[]>([]);

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
    (feedback: SniperBingoFeedback, isWin = false) => {
      playFeedbackSound(feedback.sound, soundEnabled);
      if (feedback.callout) {
        showCallout(feedback.callout, isWin ? 2400 : 1750);
      }
    },
    [soundEnabled, showCallout]
  );

  const scheduleComplete = useCallback(
    (finishedState: SniperBingoGameState) => {
      if (completedRef.current) return;
      completedRef.current = true;
      completeTimerRef.current = window.setTimeout(() => {
        onGameComplete(buildGameResult(finishedState, startedAtRef.current));
      }, 900);
    },
    [onGameComplete]
  );

  const commitState = useCallback(
    (
      nextState: SniperBingoGameState,
      nextTurnStart: SniperBingoGameState,
      nextHistory: SniperBingoHistorySnapshot[]
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
  }, [commitState]);

  const handleRestart = useCallback(() => {
    clearTimers();
    completedRef.current = false;
    startedAtRef.current = Date.now();
    gameEventBus.resetVisitBuffer([]);

    const fresh = createInitialState(players, config, createFreshSeed());
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
      let lastFeedback: SniperBingoFeedback = { sound: 'none', callout: null };

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

  const visitDarts: DartThrow[] = useMemo(
    () => state.visitEntries.map((e) => e.dart),
    [state.visitEntries]
  );

  const activeMatchPoints = useMemo(
    () => getMatchPointIndices(activePlayer.card, state.config.winPattern),
    [activePlayer.card, state.config.winPattern]
  );

  // Highlight ONLY the active player's remaining unstamped targets on SvgDartboard
  const segmentOverlays = useMemo<Record<string, SegmentOverlayStyle>>(() => {
    const overlays: Record<string, SegmentOverlayStyle> = {};

    for (const sq of activePlayer.card) {
      if (sq.stamped) continue;

      const isMatchPoint = activeMatchPoints.has(sq.index);
      const fill = isMatchPoint ? '#F59E0B' : sq.kind === 'double' ? '#38BDF8' : sq.kind === 'treble' ? '#A855F7' : '#10B981';
      const stroke = isMatchPoint ? '#FEF08A' : '#FFFFFF';
      const badge = isMatchPoint ? '🎯' : sq.kind === 'bull' ? undefined : sq.label;

      if (sq.kind === 'bull') {
        overlays['25'] = {
          fill: isMatchPoint ? '#F59E0B' : '#10B981',
          opacity: 0.82,
          stroke,
          pulse: isMatchPoint,
        };
        overlays['Bull'] = {
          fill: isMatchPoint ? '#F59E0B' : '#10B981',
          opacity: 0.94,
          stroke,
          pulse: true,
        };
      } else {
        overlays[sq.id] = {
          fill,
          opacity: sq.kind === 'number' ? 0.72 : 0.94,
          stroke,
          pulse: isMatchPoint,
          badge,
          badgeColor: '#FFFFFF',
        };
      }
    }

    return overlays;
  }, [activePlayer.card, activeMatchPoints]);

  const isPro = state.config.cardMode === 'pro';
  const isBlackout = state.config.winPattern === 'blackout';

  return (
    <div className="space-y-4">
      {/* TOP SPOTLIGHT: Giant Active Sniper Turn, Match Point Alert & Full-Width Visit Strip */}
      <div
        className="card-matte rounded-2xl p-5 sm:p-6 space-y-4 border-2 transition-all"
        style={{
          borderColor: activeMatchPoints.size > 0 ? '#F59E0B' : `${activePlayer.colorHex}85`,
          boxShadow:
            activeMatchPoints.size > 0
              ? '0 0 40px -6px rgba(245, 158, 11, 0.6)'
              : `0 0 38px -10px ${activePlayer.colorHex}65`,
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-5">
          {/* Active Sniper Identity */}
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center font-black text-3xl sm:text-4xl text-slate-950 shrink-0 shadow-lg"
              style={{ backgroundColor: activePlayer.colorHex }}
            >
              {activePlayer.avatarInitial}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm sm:text-base font-mono font-black uppercase tracking-widest px-3 py-0.5 rounded-lg border bg-emerald-500/20 border-emerald-400/50 text-emerald-200">
                  RD {state.round} • {isPro ? 'PRO BEDS' : 'CLASSIC'}
                </span>
                <span className="text-sm sm:text-base font-mono font-black uppercase px-3 py-0.5 rounded-lg bg-purple-500/20 border border-purple-400/50 text-purple-200">
                  {isBlackout ? 'BLACKOUT 9/9' : '3-IN-A-ROW'}
                </span>
              </div>

              <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight truncate leading-tight mt-1">
                {activePlayer.name}
              </h2>

              <div className="mt-2">
                {activeMatchPoints.size > 0 ? (
                  <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-xl bg-amber-500/25 border-2 border-amber-400 text-amber-200 text-base sm:text-xl font-black uppercase tracking-wide animate-pulse shadow-[0_0_20px_-4px_rgba(245,158,11,0.65)]">
                    <Flame className="w-5 h-5 shrink-0" />
                    MATCH POINT! HIT PULSING GOLD FOR BINGO!
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 text-base sm:text-lg font-bold text-emerald-300">
                    <Crosshair className="w-5 h-5 shrink-0" />
                    Stamp highlighted targets on your 3×3 card
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Card Progress Box */}
          <div className="bg-slate-900/90 rounded-2xl px-5 py-3.5 border border-white/15 space-y-2 min-w-[260px] sm:min-w-[300px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm sm:text-base font-mono uppercase tracking-wider text-slate-300 font-black">
                Stamped
              </span>
              {activeMatchPoints.size > 0 ? (
                <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/25 border border-amber-400/70 text-amber-200 text-sm font-mono font-black uppercase animate-pulse">
                  🎯 1 AWAY
                </span>
              ) : (
                <span className="text-sm sm:text-base font-mono font-black text-emerald-300 tabular-nums">
                  +{state.visitStamps} visit
                </span>
              )}
            </div>

            <div className="flex items-baseline justify-between gap-3">
              <span className="text-4xl sm:text-5xl font-black font-mono tabular-nums text-white leading-none">
                {activePlayer.stampedCount}
                <span className="text-xl sm:text-2xl text-slate-400 font-bold"> / 9</span>
              </span>
              <span className="text-sm sm:text-base font-mono font-bold text-slate-300 tabular-nums">
                {9 - activePlayer.stampedCount} left
              </span>
            </div>

            <div className="h-3 w-full rounded-full bg-slate-950 overflow-hidden border border-white/15">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-300 transition-all duration-300"
                style={{ width: `${Math.round((activePlayer.stampedCount / 9) * 100)}%` }}
              />
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

      {/* MAIN STAGE: Huge 3x3 Neon Bingo Card + Interactive Sniper Dartboard */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* ACTIVE PLAYER HUGE 3x3 NEON BINGO CARD */}
        <div className="xl:col-span-6 card-matte rounded-2xl p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Grid3X3 className="w-6 h-6 text-emerald-400" />
              <span className="text-lg sm:text-xl font-black text-white uppercase tracking-wide">
                {activePlayer.name}&apos;s Sniper Card
              </span>
            </div>
            <span className="text-sm sm:text-base font-mono font-bold text-slate-300">
              {isBlackout ? 'Stamp All 9 Squares' : 'Any Row, Col, or Diagonal'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:gap-4 max-w-[680px] mx-auto">
            {activePlayer.card.map((sq) => {
              const isMatchPoint = !sq.stamped && activeMatchPoints.has(sq.index);
              const isWinningCell = Boolean(activePlayer.winningLine?.includes(sq.index));

              return (
                <div
                  key={sq.index}
                  className={cn(
                    'relative h-24 sm:h-28 rounded-2xl border-2 flex flex-col items-center justify-center px-2 py-2 transition-all select-none',
                    isWinningCell
                      ? 'bg-emerald-500/35 border-amber-300 shadow-[0_0_28px_rgba(16,185,129,0.75)] scale-[1.03]'
                      : sq.stamped
                      ? 'bg-emerald-500/22 border-emerald-400/80 shadow-[0_0_22px_-4px_rgba(16,185,129,0.6)]'
                      : isMatchPoint
                      ? 'bg-amber-500/20 border-amber-400 shadow-[0_0_26px_-4px_rgba(245,158,11,0.75)] animate-pulse'
                      : 'bg-slate-900/90 border-white/15'
                  )}
                >
                  {/* Top-right status badge */}
                  {sq.stamped ? (
                    <span className="absolute top-2 right-2 w-7 h-7 rounded-full bg-emerald-400 text-slate-950 flex items-center justify-center shadow-md">
                      <Check className="w-4 h-4 stroke-[3.5]" />
                    </span>
                  ) : isMatchPoint ? (
                    <span className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 text-sm font-mono font-black uppercase leading-none">
                      WIN
                    </span>
                  ) : sq.kind === 'bull' ? (
                    <span className="absolute top-2 right-2 text-rose-400">
                      <Target className="w-5 h-5" />
                    </span>
                  ) : null}

                  {/* Main Target Label */}
                  <span
                    className={cn(
                      'font-mono font-black tabular-nums leading-none tracking-tight text-3xl sm:text-4xl',
                      sq.stamped
                        ? 'text-emerald-200'
                        : isMatchPoint
                        ? 'text-amber-200'
                        : sq.kind === 'double'
                        ? 'text-sky-300'
                        : sq.kind === 'treble'
                        ? 'text-purple-300'
                        : 'text-white'
                    )}
                  >
                    {sq.label}
                  </span>

                  {/* Sublabel */}
                  <span
                    className={cn(
                      'text-sm font-mono font-bold uppercase tracking-wider mt-1.5 leading-none',
                      sq.stamped
                        ? 'text-emerald-300'
                        : isMatchPoint
                        ? 'text-amber-200'
                        : 'text-slate-400'
                    )}
                  >
                    {sq.stamped ? 'STAMPED' : sq.sublabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* INTERACTIVE SNIPER DARTBOARD */}
        <div className="xl:col-span-6 card-matte rounded-2xl p-4 sm:p-5 flex flex-col items-center space-y-3">
          <div className="w-full flex items-center justify-between gap-2">
            <span className="text-base sm:text-lg font-mono uppercase tracking-wider text-slate-200 font-black flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              Remaining Needed Targets
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

          {/* Compact Legend */}
          <div className="w-full rounded-xl bg-slate-900/85 border border-white/10 px-4 py-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm sm:text-base font-mono font-bold text-slate-200">
            {isPro ? (
              <>
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-sky-400" />
                  Double Target
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-purple-500" />
                  Treble Target
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-emerald-500" />
                  Bull (25/50)
                </span>
              </>
            ) : (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full bg-emerald-500" />
                Needed Wedge / Bull
              </span>
            )}
            <span className="flex items-center gap-2 text-amber-300">
              <span className="w-3.5 h-3.5 rounded-full bg-amber-400" />
              🎯 Match-Point Bingo
            </span>
          </div>
        </div>
      </div>

      {/* ALL SNIPERS 8FT-READABLE MINI-PROGRESS ROSTER */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm sm:text-base font-mono font-black uppercase tracking-widest text-slate-300">
            All Sniper Cards ({state.players.length} Players)
          </h3>
          <span className="text-sm sm:text-base font-mono font-bold text-slate-400">
            First to {isBlackout ? '9/9 Blackout' : '3-in-a-Row'} wins
          </span>
        </div>

        <div
          className={cn(
            'grid gap-3',
            state.players.length <= 2
              ? 'grid-cols-2'
              : state.players.length <= 3
              ? 'grid-cols-3'
              : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-6'
          )}
        >
          {state.players.map((p, idx) => {
            const isActive = idx === state.activePlayerIndex && !state.isFinished;
            const mp = getMatchPointIndices(p.card, state.config.winPattern);

            return (
              <div
                key={p.id}
                className={cn(
                  'card-matte rounded-2xl p-3.5 sm:p-4 border-2 transition-all space-y-3',
                  !isActive && 'border-white/10 opacity-90'
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
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-base font-black text-slate-950 shrink-0"
                      style={{ backgroundColor: p.colorHex }}
                    >
                      {p.avatarInitial}
                    </span>
                    <span className="text-base sm:text-lg font-black text-white truncate">
                      {p.name}
                    </span>
                  </div>
                  <span className="text-xl sm:text-2xl font-mono font-black tabular-nums text-emerald-300 shrink-0">
                    {p.stampedCount}/9
                  </span>
                </div>

                {/* High-Contrast Mini 3x3 Visual Pattern Grid */}
                <div className="grid grid-cols-3 gap-1.5">
                  {p.card.map((sq) => {
                    const isMp = !sq.stamped && mp.has(sq.index);
                    return (
                      <div
                        key={sq.index}
                        className={cn(
                          'h-6 sm:h-7 rounded-lg border-2 flex items-center justify-center font-mono text-sm font-black tabular-nums',
                          sq.stamped
                            ? 'bg-emerald-500/40 border-emerald-400 text-emerald-100'
                            : isMp
                            ? 'bg-amber-500/30 border-amber-400 text-amber-200 animate-pulse'
                            : 'bg-slate-950/80 border-white/10 text-slate-400'
                        )}
                      >
                        {sq.stamped ? '✓' : isMp ? '★' : ''}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between text-sm font-mono font-bold">
                  {mp.size > 0 ? (
                    <span className="font-black text-amber-300 uppercase">🎯 1 AWAY!</span>
                  ) : (
                    <span className="text-slate-400 tabular-nums">{p.dartsThrown} darts</span>
                  )}
                  {isActive && (
                    <span className="font-black text-emerald-300 uppercase">UP NOW</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
