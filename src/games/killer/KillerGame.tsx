import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Crosshair, Heart, Shield, Skull, Target } from 'lucide-react';
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
} from './engine';
import { KillerDartFeedback, KillerGameState, KillerHistorySnapshot } from './types';

function createFreshSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
}

export const KillerGame: React.FC<GameModuleProps> = ({
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

  const [state, setState] = useState<KillerGameState>(initialGameState);
  const [historyCount, setHistoryCount] = useState<number>(0);
  const [callout, setCallout] = useState<GameCallout | null>(null);

  const stateRef = useRef<KillerGameState>(initialGameState);
  const turnStartRef = useRef<KillerGameState>(initialGameState);
  const historyRef = useRef<KillerHistorySnapshot[]>([]);

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
    (feedback: KillerDartFeedback) => {
      if (feedback.ignored) return;
      switch (feedback.sound) {
        case 'hit':
          soundEngine.playDartHit(soundEnabled);
          break;
        case 'bonus':
          soundEngine.playBonusHit(soundEnabled);
          break;
        case 'jackpot':
          soundEngine.playJackpot(soundEnabled);
          break;
        case 'hazard':
          soundEngine.playHazard(soundEnabled);
          break;
        case 'elimination':
          soundEngine.playElimination(soundEnabled);
          break;
        default:
          break;
      }
      if (feedback.callout) {
        showCallout(feedback.callout);
      }
    },
    [soundEnabled, showCallout]
  );

  const scheduleComplete = useCallback(
    (finishedState: KillerGameState) => {
      if (completedRef.current) return;
      completedRef.current = true;
      completeTimerRef.current = window.setTimeout(() => {
        onGameComplete(buildGameResult(finishedState, startedAtRef.current));
      }, 750);
    },
    [onGameComplete]
  );

  const commitState = useCallback(
    (
      nextState: KillerGameState,
      nextTurnStart: KillerGameState,
      nextHistory: KillerHistorySnapshot[]
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

    const prevSnapshot = stack[stack.length - 1];
    const nextHistory = stack.slice(0, -1);
    commitState(prevSnapshot.state, prevSnapshot.turnStartState, nextHistory);
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
      if (current.isFinished || current.turnEndedEarly || current.visitEntries.length >= 3) {
        return;
      }

      const { nextState, feedback } = applyDartToState(current, dart);
      if (feedback.ignored) return;

      const nextHistory = [
        ...historyRef.current,
        { state: current, turnStartState: turnStartRef.current },
      ];
      commitState(nextState, turnStartRef.current, nextHistory);
      triggerFeedback(feedback);

      if (nextState.isFinished) {
        scheduleComplete(nextState);
      }
    },
    onDartCorrected: (_dart, _prevDart, _dartIndex, visitThrows) => {
      let replayed = turnStartRef.current;
      let lastFeedback: KillerDartFeedback | null = null;

      for (const t of visitThrows) {
        const res = applyDartToState(replayed, t);
        replayed = res.nextState;
        if (!res.feedback.ignored) {
          lastFeedback = res.feedback;
        }
      }

      commitState(replayed, turnStartRef.current, historyRef.current);
      if (lastFeedback) {
        triggerFeedback(lastFeedback);
      }
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

      if (nextState.isFinished) {
        scheduleComplete(nextState);
      } else {
        soundEngine.playTurnChange(soundEnabled);
        if (current.phase === 'claiming' && nextState.phase === 'playing') {
          showCallout(
            {
              title: '⚔️ ALL NUMBERS LOCKED IN!',
              subtitle: 'Hit your home wedge to charge lives & unlock KILLER!',
              accent: 'amber',
            },
            2000
          );
        }
      }
    },
  });

  const activePlayer = state.players[state.activePlayerIndex] ?? state.players[0];
  useActiveTurnTint(activePlayer?.colorHex);
  const survivors = useMemo(
    () => state.players.filter((p) => !p.isEliminated),
    [state.players]
  );
  const rivals = useMemo(
    () => survivors.filter((p) => p.id !== activePlayer?.id),
    [survivors, activePlayer?.id]
  );
  const visitDarts: DartThrow[] = useMemo(
    () => state.visitEntries.map((e) => e.dart),
    [state.visitEntries]
  );

  // Build color-coded Killer dartboard overlays
  const segmentOverlays = useMemo<Record<string, SegmentOverlayStyle>>(() => {
    const overlays: Record<string, SegmentOverlayStyle> = {};

    if (state.phase === 'claiming') {
      state.players.forEach((p) => {
        if (p.assignedNumber === null) return;
        overlays[String(p.assignedNumber)] = {
          fill: p.colorHex,
          opacity: 0.72,
          stroke: '#FFFFFF',
          badge: p.shortTag,
          badgeColor: '#FFFFFF',
        };
      });
      return overlays;
    }

    // Playing phase: highlight surviving players' wedges & pulse active objectives
    const isActiveKiller = Boolean(activePlayer?.isKiller);

    state.players.forEach((p) => {
      if (p.isEliminated || p.assignedNumber === null) return;
      const isSelf = p.id === activePlayer?.id;

      if (isSelf) {
        if (isActiveKiller && state.config.suicideRule) {
          overlays[String(p.assignedNumber)] = {
            fill: '#F43F5E',
            opacity: 0.55,
            stroke: '#FDA4AF',
            badge: '⚠️',
            badgeColor: '#FFFFFF',
          };
        } else if (isActiveKiller) {
          overlays[String(p.assignedNumber)] = {
            fill: p.colorHex,
            opacity: 0.48,
            stroke: '#F59E0B',
            badge: '💀',
            badgeColor: '#FEF3C7',
          };
        } else {
          // Charge own wedge!
          overlays[String(p.assignedNumber)] = {
            fill: p.colorHex,
            opacity: 0.9,
            stroke: '#FFFFFF',
            pulse: true,
            badge: p.shortTag,
            badgeColor: '#FFFFFF',
          };
        }
      } else {
        // Rival wedge
        overlays[String(p.assignedNumber)] = {
          fill: p.colorHex,
          opacity: isActiveKiller ? 0.88 : 0.55,
          stroke: isActiveKiller ? '#F59E0B' : p.isKiller ? '#F59E0B' : p.colorHex,
          pulse: isActiveKiller,
          badge: p.isKiller ? '💀' : p.shortTag,
          badgeColor: '#FFFFFF',
        };
      }
    });

    return overlays;
  }, [state.phase, state.players, state.config.suicideRule, activePlayer]);

  const livesNeeded = activePlayer
    ? Math.max(0, state.config.maxLives - activePlayer.lives)
    : 0;

  return (
    <div className="space-y-4">
      {/* TOP SPOTLIGHT: Active Player, Objective & Visit Strip */}
      <div
        className="card-matte rounded-2xl p-4 sm:p-5 border-2 transition-all"
        style={{
          borderColor: activePlayer?.isKiller
            ? '#F59E0B'
            : activePlayer
            ? `${activePlayer.colorHex}85`
            : undefined,
          boxShadow: activePlayer?.isKiller
            ? '0 0 38px -8px rgba(245, 158, 11, 0.55)'
            : activePlayer
            ? `0 0 34px -10px ${activePlayer.colorHex}66`
            : undefined,
        }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          {/* Active Player Identity & Assigned Wedge */}
          <div className="lg:col-span-5 flex items-center gap-3.5 min-w-0">
            <div
              className="relative w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-2xl flex flex-col items-center justify-center font-black text-slate-950 shrink-0 shadow-lg"
              style={{ backgroundColor: activePlayer?.colorHex ?? '#F59E0B' }}
            >
              {state.phase === 'claiming' ? (
                <Target className="w-8 h-8 text-slate-950" />
              ) : (
                <>
                  <span className="text-[10px] font-mono font-black uppercase leading-none opacity-75">
                    WEDGE
                  </span>
                  <span className="text-3xl sm:text-4xl font-mono font-black tabular-nums leading-none mt-0.5">
                    {activePlayer?.assignedNumber ?? '?'}
                  </span>
                </>
              )}
              {activePlayer?.isKiller && (
                <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-amber-400 border-2 border-slate-950 flex items-center justify-center text-sm shadow-md">
                  💀
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'text-[11px] font-mono font-black uppercase tracking-widest px-2 py-0.5 rounded-md border',
                    state.phase === 'claiming'
                      ? 'bg-sky-500/20 border-sky-400/50 text-sky-200'
                      : activePlayer?.isKiller
                      ? 'bg-amber-500/25 border-amber-400/70 text-amber-200'
                      : 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                  )}
                >
                  {state.phase === 'claiming'
                    ? 'CLAIM PHASE'
                    : activePlayer?.isKiller
                    ? `ROUND ${state.round} • 💀 KILLER ARMED`
                    : `ROUND ${state.round} • CHARGE LIVES`}
                </span>
                <span className="text-[11px] font-mono font-bold text-slate-400">
                  {survivors.length} Standing
                </span>
              </div>

              <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight truncate mt-0.5">
                {activePlayer?.name}
              </h2>

              {/* Clear 8ft Objective Line */}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs sm:text-sm font-bold">
                {state.phase === 'claiming' ? (
                  <span className="text-sky-300">
                    Throw 1 dart at any unclaimed number (1–20)
                  </span>
                ) : activePlayer?.isKiller ? (
                  <span className="text-amber-300 flex items-center gap-1.5">
                    <Crosshair className="w-4 h-4 shrink-0" />
                    Hunt rival wedges! (S = -1, D = -2, T = -3)
                  </span>
                ) : (
                  <span className="text-emerald-300 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 shrink-0" />
                    Hit #{activePlayer?.assignedNumber} ({livesNeeded} more for 💀 KILLER)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Active Player Status / Life Pips Box */}
          <div className="lg:col-span-3 bg-slate-900/80 rounded-xl p-3 border border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                {state.phase === 'claiming' ? 'Claim Progress' : 'Killer Charge'}
              </span>
              {activePlayer?.isKiller ? (
                <span className="px-2 py-0.5 rounded-md bg-amber-500/25 border border-amber-400/60 text-amber-200 text-[11px] font-mono font-black">
                  💀 KILLER
                </span>
              ) : (
                <span className="text-xs font-mono font-black tabular-nums text-white">
                  {state.phase === 'claiming'
                    ? `${state.players.filter((p) => p.assignedNumber !== null).length}/${state.players.length}`
                    : `${activePlayer?.lives ?? 0} / ${state.config.maxLives}`}
                </span>
              )}
            </div>

            {state.phase === 'claiming' ? (
              <div className="text-xs text-slate-300 font-semibold">
                {activePlayer?.assignedNumber !== null
                  ? `Locked in #${activePlayer?.assignedNumber}!`
                  : 'Waiting for valid 1–20 hit...'}
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                {Array.from({ length: state.config.maxLives }).map((_, i) => {
                  const filled = i < (activePlayer?.lives ?? 0);
                  return (
                    <div
                      key={i}
                      className={cn(
                        'h-3.5 flex-1 rounded-full border transition-all',
                        filled
                          ? activePlayer?.isKiller
                            ? 'bg-amber-400 border-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.8)]'
                            : 'bg-emerald-400 border-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.65)]'
                          : 'bg-slate-950 border-white/10'
                      )}
                    />
                  );
                })}
              </div>
            )}

            {state.config.suicideRule && activePlayer?.isKiller && (
              <div className="flex items-center gap-1 text-[11px] font-bold text-rose-300">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Avoid #{activePlayer.assignedNumber} (Self-Hit Penalty ON)</span>
              </div>
            )}
          </div>

          {/* 3-Dart Visit Strip */}
          <div className="lg:col-span-4">
            <VisitPillsStrip
              darts={visitDarts}
              dartLabels={state.visitEntries.map((e) => e.label)}
              dartTones={state.visitEntries.map((e) => e.tone)}
              boardStatus={boardStatus}
              turnComplete={state.turnEndedEarly || state.visitEntries.length >= 3}
            />
          </div>
        </div>
      </div>

      {/* DRAMATIC CALLOUT BANNER */}
      <CalloutBanner callout={callout} />

      {/* MAIN STAGE: Dartboard + Fighter Roster */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 xl:gap-5 items-start">
        {/* CENTERPIECE: Color-Coded Killer Dartboard */}
        <div className="xl:col-span-7 card-matte rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {activePlayer?.isKiller ? (
                <Skull className="w-5 h-5 text-amber-400" />
              ) : (
                <Target className="w-5 h-5 text-emerald-400" />
              )}
              <span className="text-sm sm:text-base font-black text-white uppercase tracking-wide">
                {state.phase === 'claiming'
                  ? 'Claim Your Home Wedge'
                  : activePlayer?.isKiller
                  ? 'Hunting Grounds — Target Pulsing Rivals'
                  : `Aim For #${activePlayer?.assignedNumber} To Build Lives`}
              </span>
            </div>

            {!isBoardConnected && (
              <span className="text-xs font-mono text-slate-400">
                Click board to throw
              </span>
            )}
          </div>

          <div className="py-1">
            <SvgDartboard
              size={500}
              segmentOverlays={segmentOverlays}
              dimInactiveSegments={state.phase === 'playing'}
              onBoardClick={!isBoardConnected ? injectBoardClickThrow : undefined}
            >
              <DartPlotOverlay
                sessionThrows={[]}
                currentVisitThrows={visitDarts}
                mode="dots"
              />
            </SvgDartboard>
          </div>

          {/* Quick Target Summary Bar */}
          <div className="rounded-xl bg-slate-900/80 border border-white/10 p-3 flex flex-wrap items-center justify-between gap-2">
            {state.phase === 'claiming' ? (
              <div className="text-xs sm:text-sm font-bold text-sky-200">
                Claimed so far:{' '}
                {state.players.filter((p) => p.assignedNumber !== null).length === 0 ? (
                  <span className="text-slate-400">None yet — throw anywhere 1–20!</span>
                ) : (
                  state.players
                    .filter((p) => p.assignedNumber !== null)
                    .map((p) => `#${p.assignedNumber} (${p.shortTag})`)
                    .join(' • ')
                )}
              </div>
            ) : activePlayer?.isKiller ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono font-black uppercase tracking-wider text-amber-300">
                  Targets:
                </span>
                {rivals.map((r) => (
                  <span
                    key={r.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border text-xs sm:text-sm font-mono font-black text-white tabular-nums"
                    style={{ borderColor: r.colorHex }}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: r.colorHex }}
                    />
                    #{r.assignedNumber} {r.name} ({r.lives}❤️)
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-xs sm:text-sm font-bold text-emerald-200 font-mono">
                HOME TARGET: #{activePlayer?.assignedNumber} • Single = +1 • Double = +2 • Treble = +3
              </div>
            )}
          </div>
        </div>

        {/* MULTIPLAYER FIGHTER CARDS */}
        <div className="xl:col-span-5 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-slate-400">
              Players &amp; Killer Status
            </h3>
            <span className="text-xs font-mono text-slate-400">
              Max {state.config.maxLives} Lives
              {state.config.suicideRule ? ' • Suicide ON' : ''}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
            {state.players.map((p, idx) => {
              const isActive = idx === state.activePlayerIndex && !state.isFinished;
              const isPrey =
                state.phase === 'playing' &&
                !p.isEliminated &&
                !isActive &&
                Boolean(activePlayer?.isKiller);

              return (
                <div
                  key={p.id}
                  className={cn(
                    'card-matte rounded-2xl p-4 border-2 transition-all',
                    p.isEliminated && 'opacity-40 grayscale-[55%] border-rose-950/60',
                    !p.isEliminated && !isActive && !p.isKiller && 'border-white/10',
                    !p.isEliminated && !isActive && p.isKiller && 'border-amber-500/50',
                    isPrey && 'ring-1 ring-amber-400/40'
                  )}
                  style={
                    isActive && !p.isEliminated
                      ? {
                          borderColor: p.isKiller ? '#F59E0B' : p.colorHex,
                          boxShadow: p.isKiller
                            ? '0 0 28px -8px rgba(245, 158, 11, 0.7)'
                            : `0 0 28px -8px ${p.colorHex}80`,
                        }
                      : undefined
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    {/* Left: Wedge Badge + Name + Life Pips */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className="w-12 h-12 rounded-xl flex flex-col items-center justify-center font-black font-mono shrink-0 text-slate-950"
                        style={{ backgroundColor: p.isEliminated ? '#334155' : p.colorHex }}
                      >
                        {p.isEliminated ? (
                          <Skull className="w-6 h-6 text-rose-400" />
                        ) : p.assignedNumber !== null ? (
                          <span className="text-xl sm:text-2xl leading-none tabular-nums">
                            {p.assignedNumber}
                          </span>
                        ) : (
                          <span className="text-base leading-none opacity-70">?</span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              'text-lg sm:text-xl font-black truncate',
                              p.isEliminated ? 'text-slate-400 line-through' : 'text-white'
                            )}
                          >
                            {p.name}
                          </span>

                          {p.isKiller && !p.isEliminated && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/25 border border-amber-400/70 text-amber-200 text-[10px] font-mono font-black uppercase tracking-wider shadow-[0_0_12px_rgba(245,158,11,0.4)]">
                              💀 KILLER
                            </span>
                          )}

                          {isActive && !p.isEliminated && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-[10px] font-mono font-black uppercase tracking-wider">
                              UP NOW
                            </span>
                          )}

                          {isPrey && (
                            <span className="px-1.5 py-0.5 rounded-md bg-rose-500/20 border border-rose-400/50 text-rose-300 text-[10px] font-mono font-black uppercase">
                              TARGET
                            </span>
                          )}
                        </div>

                        {/* Life Pips Row or Elimination Caption */}
                        {p.isEliminated ? (
                          <div className="text-xs font-mono text-rose-300 mt-1">
                            ELIMINATED Rd {p.eliminatedOnRound ?? state.round}
                            {p.eliminatedBy ? ` • by ${p.eliminatedBy}` : ''}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 mt-2">
                            {Array.from({ length: state.config.maxLives }).map((_, pipIdx) => {
                              const filled = pipIdx < p.lives;
                              return (
                                <Heart
                                  key={pipIdx}
                                  className={cn(
                                    'w-4 h-4 sm:w-5 sm:h-5 transition-all',
                                    filled
                                      ? p.isKiller
                                        ? 'text-amber-400 fill-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.8)]'
                                        : 'text-emerald-400 fill-emerald-400'
                                      : 'text-slate-700'
                                  )}
                                />
                              );
                            })}
                            <span className="ml-1.5 text-xs font-mono font-bold tabular-nums text-slate-400">
                              {p.lives}/{state.config.maxLives}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: Kill Counter */}
                    <div className="text-right shrink-0">
                      <div className="text-xl sm:text-2xl font-black font-mono tabular-nums text-white leading-none">
                        {p.kills}
                      </div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mt-1">
                        {p.kills === 1 ? 'KILL' : 'KILLS'}
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
