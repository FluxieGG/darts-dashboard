import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Crosshair, Crown, Heart, Shield, Skull, Target } from 'lucide-react';
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
    gameEventBus.resetVisitBuffer(prevSnapshot.state.visitEntries.map((e) => e.dart));
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
    <div className="space-y-4 sm:space-y-5">
      {/* TOP SPOTLIGHT: Giant Active Player + Phase/Role Hero + Giant Home Wedge + Visit Strip */}
      <div
        className="card-matte rounded-2xl p-5 sm:p-6 border-2 transition-all space-y-4"
        style={{
          borderColor: activePlayer?.isKiller
            ? '#F59E0B'
            : activePlayer
            ? `${activePlayer.colorHex}90`
            : undefined,
          boxShadow: activePlayer?.isKiller
            ? '0 0 42px -8px rgba(245, 158, 11, 0.6)'
            : activePlayer
            ? `0 0 38px -10px ${activePlayer.colorHex}66`
            : undefined,
        }}
      >
        {/* Row 1: Giant Home Wedge Badge + Player & Role Hero */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 sm:gap-5 min-w-0 flex-1">
            {/* Giant Home Wedge Badge */}
            <div
              className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl flex flex-col items-center justify-center font-black text-slate-950 shrink-0 shadow-xl"
              style={{ backgroundColor: activePlayer?.colorHex ?? '#F59E0B' }}
            >
              {state.phase === 'claiming' ? (
                <Target className="w-12 h-12 text-slate-950" />
              ) : (
                <>
                  <span className="text-xs sm:text-sm font-mono font-black uppercase leading-none opacity-80">
                    WEDGE
                  </span>
                  <span className="text-6xl sm:text-7xl font-mono font-black tabular-nums leading-none mt-0.5">
                    {activePlayer?.assignedNumber ?? '?'}
                  </span>
                </>
              )}
              {activePlayer?.isKiller && (
                <span className="absolute -top-3 -right-3 w-10 h-10 rounded-full bg-amber-400 border-2 border-slate-950 flex items-center justify-center shadow-lg">
                  <Crown className="w-6 h-6 text-slate-950 fill-slate-950" />
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-sm sm:text-base font-mono font-black uppercase tracking-wider px-3 py-0.5 rounded-lg bg-white/10 text-slate-200 tabular-nums">
                  ROUND {state.round}
                </span>
                <span className="text-sm sm:text-base font-mono font-bold text-slate-300 tabular-nums">
                  {survivors.length} STANDING
                </span>
                {state.config.suicideRule && activePlayer?.isKiller && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-lg bg-rose-500/20 border border-rose-400/60 text-sm sm:text-base font-bold text-rose-200">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Avoid #{activePlayer.assignedNumber}
                  </span>
                )}
              </div>

              <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight truncate mt-1 leading-none">
                {activePlayer?.name}
              </h2>

              {/* Giant Phase / Role Hero */}
              <div
                className={cn(
                  'mt-2 text-3xl sm:text-4xl font-black uppercase tracking-tight leading-none flex items-center gap-2.5',
                  state.phase === 'claiming'
                    ? 'text-sky-300'
                    : activePlayer?.isKiller
                    ? 'text-amber-300'
                    : 'text-emerald-300'
                )}
              >
                {state.phase === 'claiming' ? (
                  <>
                    <Target className="w-8 h-8 shrink-0" />
                    <span>CLAIM NUMBER</span>
                  </>
                ) : activePlayer?.isKiller ? (
                  <>
                    <Crosshair className="w-8 h-8 shrink-0" />
                    <span>KILLER HUNTING!</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-8 h-8 shrink-0" />
                    <span>CHARGE LIVES</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Active Player Charge / Claim Status Box */}
          <div className="w-full lg:w-72 bg-slate-900/85 rounded-2xl p-4 border border-white/10 space-y-2.5 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm sm:text-base font-mono uppercase tracking-wider text-slate-300 font-bold">
                {state.phase === 'claiming' ? 'Claim Progress' : 'Killer Charge'}
              </span>
              {activePlayer?.isKiller ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-lg bg-amber-500/25 border border-amber-400/70 text-amber-200 text-sm sm:text-base font-mono font-black">
                  <Crown className="w-4 h-4 text-amber-300" />
                  KILLER
                </span>
              ) : (
                <span className="text-lg sm:text-xl font-mono font-black tabular-nums text-white">
                  {state.phase === 'claiming'
                    ? `${state.players.filter((p) => p.assignedNumber !== null).length}/${state.players.length}`
                    : `${activePlayer?.lives ?? 0} / ${state.config.maxLives}`}
                </span>
              )}
            </div>

            {state.phase === 'claiming' ? (
              <div className="text-sm sm:text-base text-sky-200 font-bold">
                {activePlayer?.assignedNumber !== null
                  ? `Locked in #${activePlayer?.assignedNumber}!`
                  : 'Throw 1 dart at any unclaimed 1–20'}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  {Array.from({ length: state.config.maxLives }).map((_, i) => {
                    const filled = i < (activePlayer?.lives ?? 0);
                    return (
                      <div
                        key={i}
                        className={cn(
                          'h-5 flex-1 rounded-full border-2 transition-all',
                          filled
                            ? activePlayer?.isKiller
                              ? 'bg-amber-400 border-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.85)]'
                              : 'bg-emerald-400 border-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.7)]'
                            : 'bg-slate-950 border-white/15'
                        )}
                      />
                    );
                  })}
                </div>
                <div className="text-sm sm:text-base font-bold text-slate-300">
                  {activePlayer?.isKiller
                    ? 'S = -1 • D = -2 • T = -3 on rivals'
                    : `Hit #${activePlayer?.assignedNumber} (${livesNeeded} more for KILLER)`}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Row 2: 3-Dart Visit Strip */}
        <VisitPillsStrip
          darts={visitDarts}
          dartLabels={state.visitEntries.map((e) => e.label)}
          dartTones={state.visitEntries.map((e) => e.tone)}
          boardStatus={boardStatus}
          turnComplete={state.turnEndedEarly || state.visitEntries.length >= 3}
        />
      </div>

      {/* DRAMATIC CALLOUT BANNER */}
      <CalloutBanner callout={callout} />

      {/* MAIN STAGE: Giant Dartboard + Big 2-Column Fighter Roster */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* CENTERPIECE: Color-Coded Killer Dartboard */}
        <div className="xl:col-span-7 card-matte rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              {activePlayer?.isKiller ? (
                <Skull className="w-6 h-6 text-amber-400" />
              ) : (
                <Target className="w-6 h-6 text-emerald-400" />
              )}
              <span className="text-lg sm:text-xl font-black text-white uppercase tracking-wide">
                {state.phase === 'claiming'
                  ? 'Claim Your Home Wedge'
                  : activePlayer?.isKiller
                  ? 'Hunting Grounds — Target Pulsing Rivals'
                  : `Aim For #${activePlayer?.assignedNumber} To Build Lives`}
              </span>
            </div>

            {!isBoardConnected && (
              <span className="text-sm sm:text-base font-mono font-bold text-slate-400">
                Click board to throw
              </span>
            )}
          </div>

          <div className="flex justify-center py-1">
            <SvgDartboard
              size={660}
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
          <div className="rounded-xl bg-slate-900/85 border border-white/10 p-3.5 flex flex-wrap items-center justify-between gap-2">
            {state.phase === 'claiming' ? (
              <div className="text-sm sm:text-base font-bold text-sky-200">
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
                <span className="text-sm sm:text-base font-mono font-black uppercase tracking-wider text-amber-300">
                  Targets:
                </span>
                {rivals.map((r) => (
                  <span
                    key={r.id}
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-950 border-2 text-sm sm:text-base font-mono font-black text-white tabular-nums"
                    style={{ borderColor: r.colorHex }}
                  >
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: r.colorHex }}
                    />
                    #{r.assignedNumber} {r.name} ({r.lives}❤️)
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-sm sm:text-base font-bold text-emerald-200 font-mono">
                HOME TARGET: #{activePlayer?.assignedNumber} • Single = +1 • Double = +2 • Treble = +3
              </div>
            )}
          </div>
        </div>

        {/* BIG 2-COLUMN PLAYER ROSTER */}
        <div className="xl:col-span-5 space-y-3.5">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm sm:text-base font-mono font-black uppercase tracking-widest text-slate-300">
              Player Roster
            </h3>
            <span className="text-sm sm:text-base font-mono font-bold text-slate-400">
              Max {state.config.maxLives} Lives
              {state.config.suicideRule ? ' • Suicide ON' : ''}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3.5">
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
                    'card-matte rounded-2xl p-4 sm:p-5 border-2 transition-all',
                    p.isEliminated && 'opacity-40 grayscale-[55%] border-rose-950/60',
                    !p.isEliminated && !isActive && !p.isKiller && 'border-white/10',
                    !p.isEliminated && !isActive && p.isKiller && 'border-amber-500/60',
                    isPrey && 'ring-2 ring-amber-400/45'
                  )}
                  style={
                    isActive && !p.isEliminated
                      ? {
                          borderColor: p.isKiller ? '#F59E0B' : p.colorHex,
                          boxShadow: p.isKiller
                            ? '0 0 32px -8px rgba(245, 158, 11, 0.75)'
                            : `0 0 32px -8px ${p.colorHex}85`,
                        }
                      : undefined
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    {/* Left: Huge #Wedge Badge + Name + Large Life Pips */}
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div
                        className="w-16 h-16 rounded-2xl flex flex-col items-center justify-center font-black font-mono shrink-0 text-slate-950 shadow-md"
                        style={{ backgroundColor: p.isEliminated ? '#334155' : p.colorHex }}
                      >
                        {p.isEliminated ? (
                          <Skull className="w-8 h-8 text-rose-400" />
                        ) : p.assignedNumber !== null ? (
                          <span className="text-3xl leading-none tabular-nums">
                            #{p.assignedNumber}
                          </span>
                        ) : (
                          <span className="text-2xl leading-none opacity-75">?</span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              'text-xl sm:text-2xl font-black truncate',
                              p.isEliminated ? 'text-slate-400 line-through' : 'text-white'
                            )}
                          >
                            {p.name}
                          </span>

                          {p.isKiller && !p.isEliminated && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-500/25 border border-amber-400/80 text-amber-200 text-sm font-mono font-black uppercase tracking-wider shadow-[0_0_14px_rgba(245,158,11,0.45)]">
                              <Crown className="w-4 h-4 text-amber-300 fill-amber-300/30" />
                              KILLER
                            </span>
                          )}

                          {isActive && !p.isEliminated && (
                            <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/20 border border-emerald-400/60 text-emerald-300 text-sm font-mono font-black uppercase tracking-wider">
                              UP NOW
                            </span>
                          )}

                          {isPrey && (
                            <span className="px-2 py-0.5 rounded-lg bg-rose-500/20 border border-rose-400/60 text-rose-200 text-sm font-mono font-black uppercase">
                              TARGET
                            </span>
                          )}
                        </div>

                        {/* Large Life Pips Row or Elimination Caption */}
                        {p.isEliminated ? (
                          <div className="text-sm sm:text-base font-mono font-bold text-rose-300 mt-1.5">
                            ELIMINATED Rd {p.eliminatedOnRound ?? state.round}
                            {p.eliminatedBy ? ` • by ${p.eliminatedBy}` : ''}
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {Array.from({ length: state.config.maxLives }).map((_, pipIdx) => {
                              const filled = pipIdx < p.lives;
                              return (
                                <Heart
                                  key={pipIdx}
                                  className={cn(
                                    'w-6 h-6 sm:w-7 sm:h-7 transition-all',
                                    filled
                                      ? p.isKiller
                                        ? 'text-amber-400 fill-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.85)]'
                                        : 'text-emerald-400 fill-emerald-400'
                                      : 'text-slate-700'
                                  )}
                                />
                              );
                            })}
                            <span className="ml-1.5 text-sm sm:text-base font-mono font-black tabular-nums text-slate-300">
                              {p.lives}/{state.config.maxLives}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: Kill Counter */}
                    <div className="text-right shrink-0">
                      <div className="text-3xl sm:text-4xl font-black font-mono tabular-nums text-white leading-none">
                        {p.kills}
                      </div>
                      <div className="text-sm font-mono font-bold uppercase tracking-widest text-slate-400 mt-1">
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
