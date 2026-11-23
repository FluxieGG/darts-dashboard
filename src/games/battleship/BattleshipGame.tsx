import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Anchor, Crosshair, Radar, Shield, Skull } from 'lucide-react';
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
  BattleshipFeedback,
  BattleshipGameState,
  BattleshipHistorySnapshot,
  buildGameResult,
  createInitialState,
  getRemainingFleetHull,
  getTargetDefenderIndex,
  getTotalFleetHull,
} from './engine';

function createFreshSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
}

function playFeedbackSound(sound: BattleshipFeedback['sound'], enabled: boolean): void {
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
    case 'elimination':
      soundEngine.playElimination(enabled);
      break;
    default:
      break;
  }
}

export const BattleshipGame: React.FC<GameModuleProps> = ({
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

  const [state, setState] = useState<BattleshipGameState>(initialGameState);
  const [historyCount, setHistoryCount] = useState<number>(0);
  const [callout, setCallout] = useState<GameCallout | null>(null);

  const stateRef = useRef<BattleshipGameState>(initialGameState);
  const turnStartRef = useRef<BattleshipGameState>(initialGameState);
  const historyRef = useRef<BattleshipHistorySnapshot[]>([]);

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

  const showCallout = useCallback((next: Omit<GameCallout, 'id'>, durationMs = 1850) => {
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
    (feedback: BattleshipFeedback, isWin = false) => {
      playFeedbackSound(feedback.sound, soundEnabled);
      if (feedback.callout) {
        showCallout(feedback.callout, isWin ? 2400 : 1850);
      }
    },
    [soundEnabled, showCallout]
  );

  const scheduleComplete = useCallback(
    (finishedState: BattleshipGameState) => {
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
      nextState: BattleshipGameState,
      nextTurnStart: BattleshipGameState,
      nextHistory: BattleshipHistorySnapshot[]
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
      let lastFeedback: BattleshipFeedback = { sound: 'none', callout: null };

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
  const defenderIndex = getTargetDefenderIndex(state.players.length, state.activePlayerIndex);
  const targetDefender = state.players[defenderIndex] ?? activePlayer;

  useActiveTurnTint(activePlayer?.colorHex);

  const visitDarts: DartThrow[] = useMemo(
    () => state.visitEntries.map((e) => e.dart),
    [state.visitEntries]
  );

  // Build Defender's Sea Grid Overlays:
  // Sunk = Dark Rose (☠️), Hit = Pulsing Crimson (💥), Sonar = Pulsing Amber (📡), Miss = Slate/Sky (💦)
  const segmentOverlays = useMemo<Record<string, SegmentOverlayStyle>>(() => {
    const overlays: Record<string, SegmentOverlayStyle> = {};
    if (!targetDefender) return overlays;

    // 1. Splashes / Water misses
    for (const wedge of targetDefender.missWedges) {
      overlays[String(wedge)] = {
        fill: '#38BDF8',
        opacity: 0.34,
        stroke: '#7DD3FC',
        badge: '💦',
        badgeColor: '#E0F2FE',
      };
    }

    // 2. Sonar Pings (revealed unhit ship wedges)
    for (const wedge of targetDefender.sonarWedges) {
      overlays[String(wedge)] = {
        fill: '#F59E0B',
        opacity: 0.84,
        stroke: '#FEF08A',
        pulse: true,
        badge: '📡',
        badgeColor: '#FFFFFF',
      };
    }

    // 3. Confirmed Hits & Sunk Ships
    const sunkWedges = new Set<number>();
    for (const ship of targetDefender.fleet) {
      if (ship.sunk) {
        for (const w of ship.wedges) {
          sunkWedges.add(w);
        }
      }
    }

    for (const wedge of targetDefender.hitWedges) {
      if (sunkWedges.has(wedge)) {
        overlays[String(wedge)] = {
          fill: '#9F1239',
          opacity: 0.92,
          stroke: '#FDA4AF',
          pulse: false,
          badge: '☠️',
          badgeColor: '#FFE4E6',
        };
      } else {
        overlays[String(wedge)] = {
          fill: '#F43F5E',
          opacity: 0.88,
          stroke: '#FFFFFF',
          pulse: true,
          badge: '💥',
          badgeColor: '#FFFFFF',
        };
      }
    }

    // Subtle radar highlight on Bull / 25
    overlays['25'] = {
      fill: '#0EA5E9',
      opacity: 0.55,
      stroke: '#7DD3FC',
    };
    overlays['Bull'] = {
      fill: '#F59E0B',
      opacity: 0.72,
      stroke: '#FEF08A',
      pulse: true,
    };

    return overlays;
  }, [targetDefender]);

  const enemyTotalHull = getTotalFleetHull(targetDefender.fleet);
  const enemyRemainingHull = getRemainingFleetHull(targetDefender.fleet);
  const enemySunkCount = targetDefender.fleet.filter((s) => s.sunk).length;

  return (
    <div className="space-y-4">
      {/* TOP SPOTLIGHT: Giant Commander Turn Banner, Enemy Hull Integrity Meter & Visit Strip */}
      <div
        className="card-matte rounded-2xl p-5 sm:p-6 space-y-4 border-2 transition-all"
        style={{
          borderColor: `${activePlayer.colorHex}85`,
          boxShadow: `0 0 38px -10px ${activePlayer.colorHex}65`,
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-5">
          {/* Active Commander Identity + Target Rival Badge */}
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center font-black text-3xl sm:text-4xl text-slate-950 shrink-0 shadow-lg"
              style={{ backgroundColor: activePlayer.colorHex }}
            >
              {activePlayer.avatarInitial}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm sm:text-base font-mono font-black uppercase tracking-widest px-3 py-0.5 rounded-lg border bg-sky-500/20 border-sky-400/50 text-sky-200">
                  ROUND {state.round} • FIRE SALVO
                </span>
                {state.config.sonarOnMulti && (
                  <span className="text-sm font-mono font-black uppercase px-3 py-0.5 rounded-lg bg-amber-500/20 border border-amber-400/50 text-amber-200 flex items-center gap-1.5">
                    <Radar className="w-4 h-4" />
                    D/T SONAR ON
                  </span>
                )}
              </div>

              <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight truncate leading-tight mt-1">
                {activePlayer.name}
              </h2>

              <div className="mt-2 inline-flex items-center gap-2 px-3.5 py-1 rounded-xl bg-rose-500/20 border border-rose-400/50 text-base sm:text-lg font-black text-rose-200 max-w-full">
                <Crosshair className="w-5 h-5 text-rose-400 shrink-0" />
                <span className="truncate">
                  TARGET: <span className="text-white">{targetDefender.name}&apos;s Sea Grid</span>
                </span>
              </div>
            </div>
          </div>

          {/* Enemy Hull Integrity Big Meter */}
          <div className="bg-slate-900/90 rounded-2xl px-5 py-3.5 border-2 border-rose-500/40 space-y-2.5 min-w-[280px] sm:min-w-[330px] shadow-[0_0_24px_-8px_rgba(244,63,94,0.45)]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm sm:text-base font-mono uppercase tracking-wider text-slate-300 font-black">
                Enemy Hull
              </span>
              <span className="text-sm sm:text-base font-mono font-black text-rose-300 tabular-nums">
                {enemySunkCount}/{targetDefender.fleet.length} SUNK
              </span>
            </div>

            <div className="flex items-baseline justify-between gap-3">
              <span className="text-4xl sm:text-5xl font-black font-mono tabular-nums text-white leading-none">
                {enemyRemainingHull}
                <span className="text-xl sm:text-2xl text-slate-400 font-bold">
                  {' '}
                  / {enemyTotalHull}
                </span>
              </span>
              <span className="text-sm sm:text-base font-mono font-black text-amber-300 tabular-nums">
                📡 {targetDefender.sonarWedges.length} Sonar
              </span>
            </div>

            <div className="h-3.5 w-full rounded-full bg-slate-950 overflow-hidden border border-white/15">
              <div
                className="h-full bg-gradient-to-r from-rose-600 via-rose-500 to-amber-400 transition-all duration-300"
                style={{
                  width: `${Math.round((enemyRemainingHull / Math.max(1, enemyTotalHull)) * 100)}%`,
                }}
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

      {/* MAIN STAGE: Defender Sea Grid Dartboard + Naval Fleet Status Cards */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* CENTERPIECE: Sea Grid Dartboard */}
        <div className="xl:col-span-7 card-matte rounded-2xl p-4 sm:p-5 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Anchor className="w-6 h-6 text-sky-400" />
              <span className="text-lg sm:text-xl font-black text-white uppercase tracking-wide">
                {targetDefender.name}&apos;s Sea Grid
              </span>
            </div>

            {!isBoardConnected && (
              <span className="text-sm sm:text-base font-mono font-bold text-amber-300">
                Click board to fire
              </span>
            )}
          </div>

          <div className="py-1">
            <SvgDartboard
              size={640}
              segmentOverlays={segmentOverlays}
              dimInactiveSegments={false}
              onBoardClick={!isBoardConnected ? injectBoardClickThrow : undefined}
            >
              <DartPlotOverlay
                sessionThrows={[]}
                currentVisitThrows={visitDarts}
                mode="dots"
              />
            </SvgDartboard>
          </div>

          {/* Sea Grid Legend */}
          <div className="rounded-xl bg-slate-900/85 border border-white/10 px-4 py-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm sm:text-base font-mono font-bold text-slate-200">
            <span className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
              💥 Direct Hit
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full bg-rose-900 border border-rose-300" />
              ☠️ Sunk
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
              📡 Sonar
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full bg-sky-400/60 border border-sky-300" />
              💦 Splash
            </span>
            <span className="text-amber-300 font-black">Bull = Radar Sweep</span>
          </div>
        </div>

        {/* NAVAL FLEET STATUS CARDS */}
        <div className="xl:col-span-5 space-y-4">
          {/* Active Target Enemy Fleet Integrity Card */}
          <div className="card-matte rounded-2xl p-4 sm:p-5 border-2 border-rose-500/45 bg-gradient-to-b from-rose-950/25 to-transparent space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <Crosshair className="w-6 h-6 text-rose-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-mono uppercase tracking-widest text-rose-300 font-black">
                    Active Target Fleet
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-white truncate">
                    {targetDefender.name}&apos;s Armada
                  </div>
                </div>
              </div>
              <span className="px-3.5 py-1.5 rounded-xl bg-rose-500/20 border border-rose-400/50 text-rose-200 font-mono text-base font-black tabular-nums shrink-0">
                {enemyRemainingHull} HP LEFT
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
              {targetDefender.fleet.map((ship) => {
                const hitsTaken = ship.hits.length;
                const hullLeft = Math.max(0, ship.size - hitsTaken);
                return (
                  <div
                    key={ship.id}
                    className={cn(
                      'rounded-2xl border-2 p-3.5 sm:p-4 transition-all',
                      ship.sunk
                        ? 'bg-rose-950/45 border-rose-500/45 opacity-80'
                        : hitsTaken > 0
                        ? 'bg-slate-900/95 border-rose-400/60 shadow-[0_0_18px_-6px_rgba(244,63,94,0.5)]'
                        : 'bg-slate-900/80 border-white/15'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {ship.sunk ? (
                          <Skull className="w-5 h-5 text-rose-400 shrink-0" />
                        ) : (
                          <Shield className="w-5 h-5 text-sky-400 shrink-0" />
                        )}
                        <span
                          className={cn(
                            'text-lg sm:text-xl font-black uppercase tracking-wide truncate',
                            ship.sunk ? 'text-rose-300 line-through' : 'text-white'
                          )}
                        >
                          {ship.name}
                        </span>
                      </div>

                      <span
                        className={cn(
                          'text-sm sm:text-base font-mono font-black uppercase px-2.5 py-0.5 rounded-lg tabular-nums shrink-0',
                          ship.sunk
                            ? 'bg-rose-900/80 text-rose-200 border border-rose-400/50'
                            : hitsTaken > 0
                            ? 'bg-amber-500/20 text-amber-200 border border-amber-400/45'
                            : 'bg-sky-500/15 text-sky-200 border border-sky-400/35'
                        )}
                      >
                        {ship.sunk ? '☠️ SUNK' : `${hullLeft}/${ship.size} HP`}
                      </span>
                    </div>

                    {/* Large Hull Pip Blocks */}
                    <div
                      className="grid gap-2"
                      style={{ gridTemplateColumns: `repeat(${ship.size}, minmax(0, 1fr))` }}
                    >
                      {Array.from({ length: ship.size }).map((_, segIdx) => {
                        const isDamaged = segIdx < hitsTaken;
                        return (
                          <div
                            key={segIdx}
                            className={cn(
                              'h-5 sm:h-6 rounded-lg border-2 transition-all',
                              ship.sunk
                                ? 'bg-rose-900 border-rose-400/70'
                                : isDamaged
                                ? 'bg-rose-500 border-rose-200 shadow-[0_0_12px_rgba(244,63,94,0.85)]'
                                : 'bg-sky-500/35 border-sky-400/60'
                            )}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* All Commanders Roster & Fleet Health */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm sm:text-base font-mono font-black uppercase tracking-widest text-slate-300">
                Fleet Commanders
              </h3>
              <span className="text-sm sm:text-base font-mono font-bold text-slate-400">
                {state.config.fleetSize === 'blitz' ? 'Blitz (4 Hull)' : 'Standard (7 Hull)'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
              {state.players.map((p, idx) => {
                const isActive = idx === state.activePlayerIndex && !state.isFinished;
                const isCurrentTarget =
                  idx === defenderIndex && !state.isFinished && state.players.length > 1;
                const ownTotal = getTotalFleetHull(p.fleet);
                const ownRemaining = getRemainingFleetHull(p.fleet);
                const ownSunk = p.fleet.filter((s) => s.sunk).length;

                return (
                  <div
                    key={p.id}
                    className={cn(
                      'card-matte rounded-2xl p-4 border-2 transition-all',
                      !isActive && 'border-white/10'
                    )}
                    style={
                      isActive
                        ? {
                            borderColor: p.colorHex,
                            boxShadow: `0 0 26px -8px ${p.colorHex}85`,
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl text-slate-950 shrink-0"
                          style={{ backgroundColor: p.colorHex }}
                        >
                          {p.avatarInitial}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xl sm:text-2xl font-black text-white truncate">
                              {p.name}
                            </span>
                            {isActive && (
                              <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-sm font-mono font-black uppercase">
                                FIRING
                              </span>
                            )}
                            {isCurrentTarget && (
                              <span className="px-2.5 py-0.5 rounded-lg bg-rose-500/20 border border-rose-400/50 text-rose-300 text-sm font-mono font-black uppercase">
                                TARGET
                              </span>
                            )}
                          </div>
                          <div className="text-sm sm:text-base font-mono text-slate-300 mt-1 tabular-nums">
                            {p.hitsLanded} Hits • {p.shipsSunk} Sunk • {ownRemaining}/{ownTotal} HP
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-3xl sm:text-4xl font-black font-mono tabular-nums text-white leading-none">
                          {p.fleet.length - ownSunk}/{p.fleet.length}
                        </div>
                        <div className="text-sm font-mono uppercase tracking-wider text-slate-400 font-bold mt-1">
                          AFLOAT
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
    </div>
  );
};
