import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameModuleProps } from '../../types/games';
import { SvgDartboard, SegmentOverlayStyle } from '../../components/dartboard/SvgDartboard';
import { DartPlotOverlay } from '../../components/dartboard/DartPlotOverlay';
import { useGameBoardEvents } from '../hooks/useGameBoardEvents';
import { useActiveTurnTint } from '../hooks/useActiveTurnTint';
import { soundEngine } from '../utils/soundEngine';
import { getCheckoutRoute, injectBoardClickThrow } from '../utils/dartHelpers';
import { CalloutBanner, GameCallout, VisitPillsStrip } from '../components/ArcadePrimitives';
import { gameEventBus } from '../../services/gameEventBus';
import { cn } from '../../lib/utils';
import { ArrowRight, Flame, ShieldAlert, Target, Zap } from 'lucide-react';
import {
  advanceTurn,
  applyDartToState,
  buildGameResult,
  createInitialState,
  getThreeDartAverage,
} from './engine';
import { DemolitionDartFeedback, DemolitionState } from './types';

export const DemolitionGame: React.FC<GameModuleProps> = ({
  players,
  config,
  soundEnabled,
  isBoardConnected,
  boardStatus,
  onGameComplete,
  registerController,
  onCanUndoChange,
}) => {
  const [state, setState] = useState<DemolitionState>(() => createInitialState(players, config));
  const [historyLen, setHistoryLen] = useState(0);
  const [callout, setCallout] = useState<GameCallout | null>(null);

  const stateRef = useRef<DemolitionState>(state);
  const turnStartStateRef = useRef<DemolitionState>(state);
  const historyRef = useRef<DemolitionState[]>([]);
  const startedAtRef = useRef<number>(Date.now());
  const hasCompletedRef = useRef<boolean>(false);
  const calloutTimerRef = useRef<number | null>(null);
  const completionTimerRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (calloutTimerRef.current !== null) {
      window.clearTimeout(calloutTimerRef.current);
      calloutTimerRef.current = null;
    }
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const triggerCallout = useCallback(
    (title: string, subtitle: string | undefined, accent: GameCallout['accent'], persist = false) => {
      if (calloutTimerRef.current !== null) {
        window.clearTimeout(calloutTimerRef.current);
        calloutTimerRef.current = null;
      }
      setCallout({ id: Date.now() + Math.random(), title, subtitle, accent });
      if (!persist) {
        calloutTimerRef.current = window.setTimeout(() => {
          setCallout(null);
        }, 1700);
      }
    },
    []
  );

  const playFeedback = useCallback(
    (feedback: DemolitionDartFeedback, isFinished: boolean) => {
      switch (feedback.sound) {
        case 'dartHit':
          soundEngine.playDartHit(soundEnabled);
          break;
        case 'bonusHit':
          soundEngine.playBonusHit(soundEnabled);
          break;
        case 'jackpot':
          soundEngine.playJackpot(soundEnabled);
          break;
        case 'hazard':
          soundEngine.playHazard(soundEnabled);
          break;
        case 'turnChange':
          soundEngine.playTurnChange(soundEnabled);
          break;
        default:
          break;
      }

      if (feedback.calloutTitle) {
        triggerCallout(
          feedback.calloutTitle,
          feedback.calloutSubtitle,
          feedback.calloutAccent ?? 'sky',
          isFinished
        );
      }
    },
    [soundEnabled, triggerCallout]
  );

  const scheduleVictoryIfFinished = useCallback(
    (next: DemolitionState) => {
      if (!next.isFinished || hasCompletedRef.current) return;
      hasCompletedRef.current = true;
      completionTimerRef.current = window.setTimeout(() => {
        onGameComplete(buildGameResult(next, startedAtRef.current));
      }, 850);
    },
    [onGameComplete]
  );

  const handleUndo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (!prev) return;

    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
    hasCompletedRef.current = false;

    stateRef.current = prev;
    if (prev.currentVisitDarts.length === 0) {
      turnStartStateRef.current = prev;
    }
    setState(prev);
    setHistoryLen(historyRef.current.length);
    setCallout(null);
    gameEventBus.resetVisitBuffer(prev.currentVisitDarts);
  }, []);

  const handleRestart = useCallback(() => {
    clearTimers();
    hasCompletedRef.current = false;
    const fresh = createInitialState(players, config);
    stateRef.current = fresh;
    turnStartStateRef.current = fresh;
    historyRef.current = [];
    startedAtRef.current = Date.now();
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
      setHistoryLen(historyRef.current.length);

      const { nextState, feedback } = applyDartToState(current, dart);
      stateRef.current = nextState;
      setState(nextState);

      if (!feedback.ignored) {
        playFeedback(feedback, nextState.isFinished);
      }
      scheduleVictoryIfFinished(nextState);
    },
    onDartCorrected: (_dart, _prevDart, _dartIndex, visitThrows) => {
      if (hasCompletedRef.current) return;

      let replayed = turnStartStateRef.current;
      let latestFeedback: DemolitionDartFeedback = { sound: 'none' };

      for (const d of visitThrows) {
        const res = applyDartToState(replayed, d);
        replayed = res.nextState;
        latestFeedback = res.feedback;
      }

      stateRef.current = replayed;
      setState(replayed);
      if (latestFeedback.calloutTitle) {
        triggerCallout(
          latestFeedback.calloutTitle,
          latestFeedback.calloutSubtitle,
          latestFeedback.calloutAccent ?? 'sky',
          replayed.isFinished
        );
      }
      scheduleVictoryIfFinished(replayed);
    },
    onVisitCompleted: () => {
      const current = stateRef.current;
      if (current.isFinished) return;
      if (current.currentVisitDarts.length === 0 && !current.turnComplete) return;

      historyRef.current.push(current);
      setHistoryLen(historyRef.current.length);

      const next = advanceTurn(current);
      stateRef.current = next;
      turnStartStateRef.current = next;
      setState(next);
      soundEngine.playTurnChange(soundEnabled);
    },
  });

  const activePlayer = state.players[state.currentPlayerIndex];
  useActiveTurnTint(activePlayer?.colorHex);
  const dartsLeft = state.turnComplete ? 0 : Math.max(0, 3 - state.currentVisitDarts.length);

  // Live optimal checkout route for active player with exact dartsLeft
  const checkoutRoute = useMemo(() => {
    if (state.isFinished || state.turnComplete || dartsLeft === 0) return null;
    return getCheckoutRoute(activePlayer.score, state.outRule, dartsLeft);
  }, [state.isFinished, state.turnComplete, dartsLeft, activePlayer.score, state.outRule]);

  // Highlight recommended next target bed directly on SvgDartboard
  const segmentOverlays = useMemo<Record<string, SegmentOverlayStyle>>(() => {
    if (!checkoutRoute || checkoutRoute.length === 0) return {};

    const overlays: Record<string, SegmentOverlayStyle> = {};
    const primaryBed = checkoutRoute[0];
    overlays[primaryBed] = {
      fill: '#10B981',
      opacity: 0.92,
      stroke: '#FFFFFF',
      pulse: true,
      badge: primaryBed,
      badgeColor: '#FFFFFF',
    };

    if (checkoutRoute.length >= 2) {
      const secondBed = checkoutRoute[1];
      if (secondBed !== primaryBed) {
        overlays[secondBed] = {
          fill: '#38BDF8',
          opacity: 0.45,
          stroke: '#BAE6FD',
          pulse: false,
          badge: secondBed,
          badgeColor: '#FFFFFF',
        };
      }
    }

    return overlays;
  }, [checkoutRoute]);

  const activeAvg = getThreeDartAverage(activePlayer, state.startScore);
  const hasCheckoutHighlight = Boolean(checkoutRoute && checkoutRoute.length > 0);

  return (
    <div className="space-y-4">
      {/* TOP SPOTLIGHT: Active Thrower, Remaining Score, Mode Pill, Visit Strip */}
      <div
        className="card-matte rounded-2xl p-4 sm:p-5 space-y-4 border-2 transition-colors"
        style={{
          borderColor: state.isBust ? '#F43F5E' : `${activePlayer.colorHex}66`,
          boxShadow: state.isBust
            ? '0 0 36px -8px rgba(244,63,94,0.65)'
            : `0 0 32px -12px ${activePlayer.colorHex}66`,
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Active Player Identity */}
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center font-black text-xl sm:text-2xl text-slate-950 shrink-0 shadow-lg"
              style={{ backgroundColor: activePlayer.colorHex }}
            >
              {activePlayer.avatarInitial}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-mono uppercase tracking-widest text-sky-400 font-bold">
                  Round {state.round} • {state.startScore} Demolition
                </span>
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase border',
                    state.outRule === 'double'
                      ? 'bg-amber-500/15 border-amber-400/40 text-amber-300'
                      : 'bg-sky-500/15 border-sky-400/40 text-sky-300'
                  )}
                >
                  {state.outRule === 'double' ? 'Single In • Double Out' : 'Single In • Straight Out'}
                </span>
              </div>
              <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight truncate leading-tight">
                {activePlayer.name}
              </h2>
            </div>
          </div>

          {/* Active Stats: Visit Sum, 3DA, Massive Remaining Score */}
          <div className="flex items-center gap-3 sm:gap-5">
            <div className="hidden sm:block px-3.5 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-right">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                3-Dart Avg
              </div>
              <div className="text-2xl font-black font-mono tabular-nums text-sky-300 leading-none mt-0.5">
                {activeAvg.toFixed(1)}
              </div>
            </div>

            <div className="px-3.5 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-right">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                Visit
              </div>
              <div
                className={cn(
                  'text-2xl sm:text-3xl font-black font-mono tabular-nums leading-none mt-0.5',
                  state.isBust
                    ? 'text-rose-400'
                    : state.visitRunningScore >= 100
                    ? 'text-amber-300'
                    : 'text-emerald-300'
                )}
              >
                {state.isBust ? 'BUST' : state.visitRunningScore}
              </div>
            </div>

            <div className="text-right">
              <div className="text-[10px] sm:text-xs font-mono uppercase tracking-wider text-slate-400">
                Remaining
              </div>
              <div
                className={cn(
                  'text-4xl sm:text-6xl font-black font-mono tabular-nums leading-none mt-0.5',
                  hasCheckoutHighlight ? 'text-emerald-300' : 'text-white'
                )}
              >
                {activePlayer.score}
              </div>
            </div>
          </div>
        </div>

        {/* LIVE CHECKOUT ROUTE BANNER */}
        {checkoutRoute ? (
          <div className="rounded-xl border-2 border-emerald-400/60 bg-emerald-500/15 px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-[0_0_24px_-6px_rgba(16,185,129,0.5)]">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-emerald-300 shrink-0" />
              <div>
                <div className="text-xs sm:text-sm font-black uppercase tracking-wider text-emerald-200 leading-tight">
                  Checkout Route ({activePlayer.score})
                </div>
                <div className="text-[11px] font-mono text-emerald-300/80">
                  {state.outRule === 'double' ? 'Double or Bullseye to finish' : 'Target highlighted on board'} • {dartsLeft} dart{dartsLeft === 1 ? '' : 's'} in hand
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              {checkoutRoute.map((step, i) => (
                <React.Fragment key={`${step}-${i}`}>
                  {i > 0 && <ArrowRight className="w-4 h-4 text-emerald-400/70" />}
                  <span
                    className={cn(
                      'px-3 sm:px-4 py-1.5 rounded-lg font-mono font-black text-base sm:text-xl tabular-nums border-2',
                      i === 0
                        ? 'bg-emerald-400 text-slate-950 border-white shadow-[0_0_16px_rgba(16,185,129,0.75)]'
                        : 'bg-slate-950/80 text-sky-200 border-sky-400/40'
                    )}
                  >
                    {step}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>
        ) : state.isBust ? (
          <div className="rounded-xl border border-rose-400/50 bg-rose-500/15 px-4 py-2.5 flex items-center justify-between gap-2 text-rose-200">
            <span className="text-xs sm:text-sm font-black uppercase tracking-wider flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              Turn Busted — Score Restored to {activePlayer.turnStartScore}
            </span>
            <span className="text-xs font-mono opacity-80">Pull darts to continue</span>
          </div>
        ) : null}

        {/* 3-Dart Visit Pills + Takeout Prompt */}
        <VisitPillsStrip
          darts={state.currentVisitDarts}
          dartLabels={state.currentVisitLabels}
          dartTones={state.currentVisitTones}
          boardStatus={boardStatus}
          turnComplete={state.turnComplete}
        />
      </div>

      {/* DRAMATIC CALLOUT BANNER */}
      <CalloutBanner callout={callout} />

      {/* MAIN ARENA: SvgDartboard + Animated Demolition Score Towers */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Interactive Dartboard with Live Checkout Highlight */}
        <div className="xl:col-span-6 card-matte rounded-2xl p-4 sm:p-5 flex flex-col items-center space-y-3">
          <div className="w-full flex items-center justify-between text-xs font-mono text-slate-400">
            <span className="flex items-center gap-1.5 font-bold text-sky-400 uppercase tracking-wider">
              <Target className="w-4 h-4" />
              {hasCheckoutHighlight
                ? `Checkout Guide: Aim ${checkoutRoute?.[0]}`
                : 'Demolition Target Board'}
            </span>
            {!isBoardConnected && (
              <span className="text-amber-300/90">Click any bed to test throw</span>
            )}
          </div>

          <SvgDartboard
            size={470}
            segmentOverlays={segmentOverlays}
            dimInactiveSegments={hasCheckoutHighlight}
            onBoardClick={!isBoardConnected ? injectBoardClickThrow : undefined}
          >
            <DartPlotOverlay
              sessionThrows={[]}
              currentVisitThrows={state.currentVisitDarts}
              mode="dots"
            />
          </SvgDartboard>

          <div className="w-full text-center text-xs sm:text-sm font-mono text-slate-400 pt-1">
            {state.lastEventSummary}
          </div>
        </div>

        {/* VERTICAL ANIMATED SCORE TOWERS */}
        <div className="xl:col-span-6 card-matte rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-widest text-sky-400 font-bold">
                Demolition Arena
              </div>
              <h3 className="text-lg sm:text-xl font-black text-white">
                Score Towers ({state.startScore} → 0)
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-400">
              {state.players.length} Player{state.players.length === 1 ? '' : 's'}
            </span>
          </div>

          <div
            className={cn(
              'grid gap-3',
              state.players.length === 1
                ? 'grid-cols-1'
                : state.players.length === 2
                ? 'grid-cols-2'
                : state.players.length === 3
                ? 'grid-cols-3'
                : state.players.length === 4
                ? 'grid-cols-2 sm:grid-cols-4'
                : 'grid-cols-2 sm:grid-cols-3'
            )}
          >
            {state.players.map((p, idx) => {
              const isCurrent = idx === state.currentPlayerIndex && !state.isFinished;
              const pctRemaining = Math.max(0, Math.min(100, (p.score / state.startScore) * 100));
              const pctDemolished = Math.round(100 - pctRemaining);
              const avg = getThreeDartAverage(p, state.startScore);
              const canCheckoutIn3 = p.score > 0 && getCheckoutRoute(p.score, state.outRule, 3) !== null;
              const isBustedActive = isCurrent && state.isBust;

              return (
                <div
                  key={p.id}
                  className={cn(
                    'rounded-2xl p-3 sm:p-3.5 border-2 flex flex-col justify-between gap-3 transition-all',
                    isCurrent
                      ? 'bg-slate-900/95 scale-[1.01]'
                      : 'bg-slate-950/60 border-white/10 opacity-85'
                  )}
                  style={
                    isCurrent
                      ? {
                          borderColor: isBustedActive ? '#F43F5E' : p.colorHex,
                          boxShadow: isBustedActive
                            ? '0 0 26px -6px rgba(244,63,94,0.6)'
                            : `0 0 24px -8px ${p.colorHex}80`,
                        }
                      : undefined
                  }
                >
                  {/* Tower Header */}
                  <div className="space-y-1 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: p.colorHex }}
                      />
                      <span className="text-xs sm:text-sm font-black text-white truncate">
                        {p.name}
                      </span>
                    </div>

                    <div
                      className={cn(
                        'text-3xl sm:text-4xl font-black font-mono tabular-nums leading-none',
                        p.score === 0
                          ? 'text-emerald-400'
                          : canCheckoutIn3
                          ? 'text-emerald-300'
                          : 'text-white'
                      )}
                    >
                      {p.score}
                    </div>

                    <div className="h-4 flex items-center justify-center">
                      {p.score === 0 ? (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/50">
                          DEMOLISHED!
                        </span>
                      ) : canCheckoutIn3 ? (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 flex items-center gap-1">
                          <Flame className="w-2.5 h-2.5" />
                          Checkout
                        </span>
                      ) : isCurrent ? (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase bg-sky-500/20 text-sky-300 border border-sky-400/40">
                          Throwing
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                          {pctDemolished}% down
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Animated Vertical Demolition Tower Shaft */}
                  <div className="relative h-44 sm:h-52 w-full rounded-xl bg-slate-950/90 border border-white/10 overflow-hidden flex items-end p-1">
                    {/* Structural Floor Guide Lines (25%, 50%, 75%) */}
                    <div className="pointer-events-none absolute inset-x-1 bottom-1/4 border-t border-dashed border-white/10 z-10" />
                    <div className="pointer-events-none absolute inset-x-1 bottom-1/2 border-t border-dashed border-white/15 z-10" />
                    <div className="pointer-events-none absolute inset-x-1 bottom-3/4 border-t border-dashed border-white/10 z-10" />

                    {/* Animated Remaining Score Block */}
                    <div
                      className={cn(
                        'w-full rounded-lg transition-all duration-500 ease-out relative overflow-hidden',
                        isBustedActive && 'animate-pulse'
                      )}
                      style={{
                        height: `${pctRemaining}%`,
                        background: isBustedActive
                          ? 'linear-gradient(180deg, #F43F5E 0%, #9F1239 100%)'
                          : canCheckoutIn3
                          ? 'linear-gradient(180deg, #34D399 0%, #059669 100%)'
                          : `linear-gradient(180deg, ${p.colorHex} 0%, ${p.colorHex}88 100%)`,
                        boxShadow:
                          pctRemaining > 0
                            ? `0 -4px 16px -2px ${
                                isBustedActive
                                  ? 'rgba(244,63,94,0.65)'
                                  : canCheckoutIn3
                                  ? 'rgba(16,185,129,0.6)'
                                  : `${p.colorHex}66`
                              }`
                            : 'none',
                      }}
                    >
                      {/* Subtle Demolition Floor Stripes */}
                      <div
                        className="absolute inset-0 opacity-20"
                        style={{
                          backgroundImage:
                            'repeating-linear-gradient(0deg, transparent, transparent 14px, rgba(0,0,0,0.45) 14px, rgba(0,0,0,0.45) 16px)',
                        }}
                      />
                    </div>

                    {/* Zero-level baseline badge when completely demolished */}
                    {p.score === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center text-xs font-mono font-black text-emerald-300 uppercase tracking-widest">
                        ZERO!
                      </div>
                    )}
                  </div>

                  {/* Tower Footer Stats: 3DA & Last Visit */}
                  <div className="grid grid-cols-2 gap-1.5 text-center pt-0.5">
                    <div className="rounded-lg bg-slate-950/80 border border-white/5 py-1.5 px-1">
                      <div className="text-[9px] font-mono uppercase text-slate-500">3DA</div>
                      <div className="text-xs sm:text-sm font-black font-mono tabular-nums text-sky-300">
                        {avg.toFixed(1)}
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-950/80 border border-white/5 py-1.5 px-1">
                      <div className="text-[9px] font-mono uppercase text-slate-500">Last</div>
                      <div
                        className={cn(
                          'text-xs sm:text-sm font-black font-mono tabular-nums',
                          p.lastVisitWasBust
                            ? 'text-rose-400'
                            : (p.lastVisitScore ?? 0) >= 100
                            ? 'text-amber-300'
                            : 'text-slate-200'
                        )}
                      >
                        {p.lastVisitWasBust
                          ? 'BUST'
                          : p.lastVisitScore !== null
                          ? p.lastVisitScore
                          : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
