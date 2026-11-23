import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameModuleProps } from '../../types/games';
import { SvgDartboard, SegmentOverlayStyle } from '../../components/dartboard/SvgDartboard';
import { DartPlotOverlay } from '../../components/dartboard/DartPlotOverlay';
import { CalloutBanner, GameCallout, VisitPillsStrip } from '../components/ArcadePrimitives';
import { useGameBoardEvents } from '../hooks/useGameBoardEvents';
import { useActiveTurnTint } from '../hooks/useActiveTurnTint';
import { soundEngine } from '../utils/soundEngine';
import { injectBoardClickThrow } from '../utils/dartHelpers';
import { cn } from '../../lib/utils';
import { Flag, Zap, Target, Trophy, AlertTriangle } from 'lucide-react';
import {
  advanceTurn,
  applyDartToState,
  buildGameResult,
  createInitialState,
} from './engine';
import { DerbyHistorySnapshot, DerbySoundCue, DonkeyDerbyState } from './types';

function playSoundCue(cue: DerbySoundCue, enabled: boolean): void {
  switch (cue) {
    case 'jackpot':
      soundEngine.playJackpot(enabled);
      break;
    case 'bonus':
      soundEngine.playBonusHit(enabled);
      break;
    case 'hazard':
      soundEngine.playHazard(enabled);
      break;
    default:
      soundEngine.playDartHit(enabled);
      break;
  }
}

function formatOrdinal(rank: number): string {
  if (rank === 1) return '1ST';
  if (rank === 2) return '2ND';
  if (rank === 3) return '3RD';
  return `${rank}TH`;
}

export const DonkeyDerbyGame: React.FC<GameModuleProps> = ({
  players,
  config,
  soundEnabled,
  isBoardConnected,
  boardStatus,
  onGameComplete,
  registerController,
  onCanUndoChange,
}) => {
  const [state, setState] = useState<DonkeyDerbyState>(() =>
    createInitialState(players, config)
  );
  const [history, setHistory] = useState<DerbyHistorySnapshot[]>([]);
  const [callout, setCallout] = useState<GameCallout | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;

  const turnStartStateRef = useRef<DonkeyDerbyState>(state);
  const historyRef = useRef<DerbyHistorySnapshot[]>(history);
  historyRef.current = history;

  const startedAtRef = useRef<number>(Date.now());
  const calloutTimerRef = useRef<number | null>(null);
  const winTimerRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (calloutTimerRef.current !== null) {
      window.clearTimeout(calloutTimerRef.current);
      calloutTimerRef.current = null;
    }
    if (winTimerRef.current !== null) {
      window.clearTimeout(winTimerRef.current);
      winTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return clearTimers;
  }, [clearTimers]);

  const showBanner = useCallback(
    (title: string | null, accent: GameCallout['accent'], subtitle?: string) => {
      if (!title) return;
      if (calloutTimerRef.current !== null) {
        window.clearTimeout(calloutTimerRef.current);
      }
      setCallout({ id: Date.now() + Math.random(), title, subtitle, accent });
      calloutTimerRef.current = window.setTimeout(() => {
        setCallout(null);
        calloutTimerRef.current = null;
      }, 2000);
    },
    []
  );

  const scheduleWinCompletion = useCallback(
    (finishedState: DonkeyDerbyState) => {
      if (winTimerRef.current !== null) {
        window.clearTimeout(winTimerRef.current);
      }
      winTimerRef.current = window.setTimeout(() => {
        winTimerRef.current = null;
        onGameComplete(buildGameResult(finishedState, startedAtRef.current));
      }, 850);
    },
    [onGameComplete]
  );

  const handleUndo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    if (winTimerRef.current !== null) {
      window.clearTimeout(winTimerRef.current);
      winTimerRef.current = null;
    }
    const nextHistory = historyRef.current.slice(0, -1);
    const prev = historyRef.current[historyRef.current.length - 1];
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    stateRef.current = prev.state;
    turnStartStateRef.current = prev.turnStartState;
    setState(prev.state);
    setCallout(null);
  }, []);

  const handleRestart = useCallback(() => {
    clearTimers();
    const fresh = createInitialState(players, config);
    startedAtRef.current = Date.now();
    stateRef.current = fresh;
    turnStartStateRef.current = fresh;
    historyRef.current = [];
    setHistory([]);
    setState(fresh);
    setCallout(null);
  }, [clearTimers, players, config]);

  useEffect(() => {
    registerController({
      undoLastAction: handleUndo,
      canUndo: () => historyRef.current.length > 0,
      restartMatch: handleRestart,
    });
  }, [registerController, handleUndo, handleRestart, history.length]);

  useEffect(() => {
    onCanUndoChange?.(history.length > 0);
  }, [history.length, onCanUndoChange]);

  const handleAdvanceTurn = useCallback(() => {
    const current = stateRef.current;
    if (current.isFinished) return;

    const snapshot: DerbyHistorySnapshot = {
      state: current,
      turnStartState: turnStartStateRef.current,
    };
    const nextHistory = [...historyRef.current, snapshot];
    historyRef.current = nextHistory;
    setHistory(nextHistory);

    const next = advanceTurn(current);
    stateRef.current = next;
    turnStartStateRef.current = next;
    setState(next);
    soundEngine.playTurnChange(soundEnabled);
  }, [soundEnabled]);

  useGameBoardEvents({
    enabled: !state.isFinished,
    onDartThrown: (dart) => {
      const current = stateRef.current;
      if (current.isFinished || current.turnComplete || current.currentVisit.length >= 3) {
        return;
      }

      const snapshot: DerbyHistorySnapshot = {
        state: current,
        turnStartState: turnStartStateRef.current,
      };
      const nextHistory = [...historyRef.current, snapshot];
      historyRef.current = nextHistory;
      setHistory(nextHistory);

      const { nextState, feedback } = applyDartToState(current, dart);
      stateRef.current = nextState;
      setState(nextState);

      playSoundCue(feedback.sound, soundEnabled);
      showBanner(feedback.calloutTitle, feedback.calloutAccent, feedback.calloutSubtitle);

      if (nextState.isFinished) {
        scheduleWinCompletion(nextState);
      }
    },
    onDartCorrected: (_dart, _prevDart, _dartIndex, visitThrows) => {
      if (winTimerRef.current !== null) {
        window.clearTimeout(winTimerRef.current);
        winTimerRef.current = null;
      }
      let replayed = turnStartStateRef.current;
      let lastFeedback = null;
      for (const t of visitThrows) {
        if (replayed.isFinished) break;
        const res = applyDartToState(replayed, t);
        replayed = res.nextState;
        lastFeedback = res.feedback;
      }
      stateRef.current = replayed;
      setState(replayed);
      showBanner('Board Corrected Visit', 'sky', lastFeedback?.calloutSubtitle);
      if (replayed.isFinished) {
        scheduleWinCompletion(replayed);
      }
    },
    onVisitCompleted: () => {
      handleAdvanceTurn();
    },
  });

  const activeRacer = state.racers[state.activePlayerIndex];
  useActiveTurnTint(activeRacer?.player.colorHex);

  const activeVisitDarts = useMemo(
    () => state.currentVisit.map((v) => v.dart),
    [state.currentVisit]
  );
  const visitLabels = useMemo(
    () => state.currentVisit.map((v) => v.label),
    [state.currentVisit]
  );
  const visitTones = useMemo(
    () => state.currentVisit.map((v) => v.tone),
    [state.currentVisit]
  );

  // Live rank map (1-indexed, ties share rank)
  const rankByPlayerId = useMemo(() => {
    const sorted = [...state.racers].sort((a, b) => b.position - a.position);
    const map = new Map<string, number>();
    sorted.forEach((r, idx) => {
      if (idx > 0 && sorted[idx - 1].position === r.position) {
        map.set(r.player.id, map.get(sorted[idx - 1].player.id) ?? idx + 1);
      } else {
        map.set(r.player.id, idx + 1);
      }
    });
    return map;
  }, [state.racers]);

  // Furlong ruler tick positions
  const furlongMarkers = useMemo(() => {
    const step = state.trackLength === 20 ? 4 : state.trackLength === 12 ? 2 : 2;
    const markers: number[] = [];
    for (let f = 0; f <= state.trackLength; f += step) {
      markers.push(f);
    }
    if (markers[markers.length - 1] !== state.trackLength) {
      markers.push(state.trackLength);
    }
    return markers;
  }, [state.trackLength]);

  // Dartboard overlays: every player's assigned wedge + glowing Bullseye turbo
  const segmentOverlays = useMemo<Record<string, SegmentOverlayStyle>>(() => {
    const overlays: Record<string, SegmentOverlayStyle> = {
      Bull: {
        fill: '#A855F7',
        opacity: 0.9,
        stroke: '#FFFFFF',
        pulse: true,
      },
      '25': {
        fill: '#38BDF8',
        opacity: 0.72,
        stroke: '#BAE6FD',
      },
    };

    state.racers.forEach((racer, idx) => {
      const isActive = idx === state.activePlayerIndex;
      overlays[String(racer.targetSegment)] = {
        fill: racer.player.colorHex,
        opacity: isActive ? 0.85 : 0.48,
        stroke: isActive ? '#FFFFFF' : racer.player.colorHex,
        pulse: isActive,
        badge: `P${racer.laneNumber}`,
        badgeColor: '#FFFFFF',
      };
    });

    return overlays;
  }, [state.racers, state.activePlayerIndex]);

  const furlongsToWin = Math.max(0, state.trackLength - activeRacer.position);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ACTIVE RACER SPOTLIGHT STRIP (8ft glanceable) */}
      <div
        className="card-matte rounded-2xl p-5 sm:p-6 border-2 transition-colors"
        style={{
          borderColor: `${activeRacer.player.colorHex}85`,
          boxShadow: `0 0 38px -8px ${activeRacer.player.colorHex}60`,
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex flex-col items-center justify-center font-black text-slate-950 shrink-0 shadow-lg"
              style={{ backgroundColor: activeRacer.player.colorHex }}
            >
              <span className="text-2xl sm:text-3xl leading-none">🐴</span>
              <span className="text-sm font-mono font-black leading-none mt-1">
                P{activeRacer.laneNumber}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-sm sm:text-base font-mono uppercase tracking-widest text-sky-400 font-black">
                  Round {state.round} • On The Oche
                </span>
                {state.helpRivals && (
                  <span className="inline-flex items-center gap-1.5 text-sm font-mono font-black px-3 py-0.5 rounded-full bg-rose-500/20 text-rose-200 border border-rose-400/50">
                    <AlertTriangle className="w-4 h-4" />
                    Rival Boost ON
                  </span>
                )}
              </div>
              <h3 className="text-4xl sm:text-5xl font-black text-white tracking-tight truncate mt-1 leading-none">
                {activeRacer.player.name}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-4 sm:gap-6 shrink-0">
            <div
              className="px-6 py-3 rounded-2xl border-2 text-center"
              style={{
                backgroundColor: `${activeRacer.player.colorHex}25`,
                borderColor: activeRacer.player.colorHex,
              }}
            >
              <div className="text-sm sm:text-base font-mono uppercase tracking-widest text-slate-100 font-black">
                TARGET
              </div>
              <div className="text-6xl sm:text-7xl font-black font-mono tabular-nums text-white leading-none mt-0.5">
                #{activeRacer.targetSegment}
              </div>
            </div>

            <div className="text-right">
              <div className="text-sm sm:text-base font-mono font-bold uppercase tracking-wider text-slate-400">
                To Finish
              </div>
              <div className="text-5xl sm:text-6xl font-black font-mono tabular-nums text-emerald-400 leading-none mt-0.5">
                {furlongsToWin}
                <span className="text-xl sm:text-2xl text-slate-400 ml-1">f</span>
              </div>
            </div>
          </div>
        </div>

        {/* Scoring Legend */}
        <div className="mt-4 pt-3.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-sm sm:text-base font-mono">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/45 text-emerald-200 font-black">
              Single #{activeRacer.targetSegment}: +1
            </span>
            <span className="px-3 py-1 rounded-lg bg-emerald-500/25 border border-emerald-400/55 text-emerald-100 font-black">
              Double: +2
            </span>
            <span className="px-3 py-1 rounded-lg bg-amber-500/25 border border-amber-400/55 text-amber-100 font-black">
              Treble: +3
            </span>
            <span className="px-3 py-1 rounded-lg bg-purple-500/25 border border-purple-400/55 text-purple-100 font-black">
              ⚡ Bull: +2
            </span>
            <span className="px-3 py-1 rounded-lg bg-sky-500/20 border border-sky-400/45 text-sky-200 font-black">
              ⚡ 25: +1
            </span>
          </div>
          {state.helpRivals && (
            <span className="text-rose-300 font-bold">
              Hit a rival’s wedge = THEY gallop!
            </span>
          )}
        </div>
      </div>

      {/* DRAMATIC CALLOUT BANNER */}
      <CalloutBanner callout={callout} />

      {/* WIDE, BOLD NEON RACE TRACK CENTERPIECE */}
      <div className="card-matte rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Flag className="w-6 h-6 text-sky-400" />
            <h4 className="text-lg sm:text-xl font-black uppercase tracking-wider text-white">
              Neon Derby Track • {state.trackLength} Furlongs
            </h4>
          </div>
          <div className="flex items-center gap-2 text-sm sm:text-base font-mono font-bold text-slate-300">
            <Trophy className="w-5 h-5 text-amber-400" />
            <span>First across finish wins!</span>
          </div>
        </div>

        {/* Furlong Ruler */}
        <div className="hidden sm:grid grid-cols-12 items-center gap-3 px-1">
          <div className="col-span-3 text-sm font-mono uppercase tracking-wider text-slate-400 font-black">
            Racer / Target
          </div>
          <div className="col-span-7 relative h-6 flex items-center">
            {furlongMarkers.map((f) => {
              const pct = (f / state.trackLength) * 100;
              return (
                <span
                  key={f}
                  className={cn(
                    'absolute -translate-x-1/2 text-sm font-mono font-black tabular-nums',
                    f === state.trackLength ? 'text-amber-300' : 'text-slate-400'
                  )}
                  style={{ left: `${pct}%` }}
                >
                  {f === 0 ? 'START' : f === state.trackLength ? 'FINISH' : `${f}F`}
                </span>
              );
            })}
          </div>
          <div className="col-span-2 text-right text-sm font-mono uppercase tracking-wider text-slate-400 font-black">
            Furlongs
          </div>
        </div>

        {/* Bold Horizontal Racing Lanes */}
        <div className="space-y-3">
          {state.racers.map((racer, idx) => {
            const isActive = idx === state.activePlayerIndex;
            const pct = Math.min(100, (racer.position / state.trackLength) * 100);
            const rank = rankByPlayerId.get(racer.player.id) ?? idx + 1;
            const justBoosted =
              state.lastBoost?.moverId === racer.player.id &&
              state.currentVisit.length > 0;

            return (
              <div
                key={racer.player.id}
                className={cn(
                  'rounded-2xl p-3 sm:p-4 border-2 transition-all',
                  isActive
                    ? 'bg-slate-900/95'
                    : 'bg-slate-950/80 border-white/[0.08]'
                )}
                style={
                  isActive
                    ? {
                        borderColor: racer.player.colorHex,
                        boxShadow: `0 0 28px -8px ${racer.player.colorHex}80`,
                      }
                    : undefined
                }
              >
                <div className="grid grid-cols-12 items-center gap-3">
                  {/* Left: Racer Identity & Big Target Badge */}
                  <div className="col-span-5 sm:col-span-3 flex items-center gap-3 min-w-0">
                    <div
                      className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center font-black text-slate-950 shrink-0 shadow-md"
                      style={{ backgroundColor: racer.player.colorHex }}
                    >
                      <span className="text-xs font-mono font-black leading-none opacity-80">
                        P{racer.laneNumber}
                      </span>
                      <span className="text-xl sm:text-2xl font-mono font-black leading-none mt-0.5 tabular-nums">
                        #{racer.targetSegment}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-xl sm:text-2xl font-black text-white truncate leading-tight">
                        {racer.player.name}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm sm:text-base font-mono mt-0.5">
                        <span
                          className="font-black"
                          style={{ color: racer.player.colorHex }}
                        >
                          Target #{racer.targetSegment}
                        </span>
                        {isActive && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-sm font-black uppercase">
                            UP
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Center: Wide Bold Horizontal Neon Track Lane (h-16 sm:h-20) */}
                  <div className="col-span-7 sm:col-span-7">
                    <div className="relative h-16 sm:h-20 rounded-2xl bg-[#0A101C] border-2 border-white/10 overflow-hidden flex items-center">
                      {/* Furlong Vertical Grid Lines */}
                      {Array.from({ length: state.trackLength - 1 }, (_, i) => i + 1).map(
                        (tick) => (
                          <div
                            key={tick}
                            className="absolute top-0 bottom-0 w-px bg-white/[0.08]"
                            style={{ left: `${(tick / state.trackLength) * 100}%` }}
                          />
                        )
                      )}

                      {/* Checkered Finish Strip on Right Edge */}
                      <div
                        className="absolute top-0 bottom-0 right-0 w-5 opacity-95 border-l-2 border-white/40"
                        style={{
                          backgroundImage:
                            'repeating-conic-gradient(#F8FAFC 0% 25%, #0F172A 0% 50%)',
                          backgroundSize: '10px 10px',
                        }}
                      />

                      {/* Neon Progress Trail */}
                      <div
                        className="absolute left-0 top-0 bottom-0 transition-all duration-500 ease-out"
                        style={{
                          width: `${pct}%`,
                          background: `linear-gradient(90deg, ${racer.player.colorHex}22 0%, ${racer.player.colorHex}66 100%)`,
                          borderRight:
                            pct > 0 ? `3px solid ${racer.player.colorHex}` : undefined,
                        }}
                      />

                      {/* Oversized Glowing Racer Token */}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 transition-all duration-500 ease-out z-10"
                        style={{
                          left: `clamp(38px, ${pct}%, calc(100% - 42px))`,
                          transform: 'translate(-50%, -50%)',
                        }}
                      >
                        <div
                          className={cn(
                            'relative flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border-[3px]',
                            justBoosted
                              ? 'scale-110 border-white'
                              : isActive
                              ? 'border-white'
                              : 'border-slate-950/90'
                          )}
                          style={{
                            backgroundColor: racer.player.colorHex,
                            boxShadow: justBoosted
                              ? `0 0 28px ${racer.player.colorHex}, 0 0 12px #FFFFFF`
                              : isActive
                              ? `0 0 22px ${racer.player.colorHex}AA`
                              : `0 3px 12px rgba(0,0,0,0.85)`,
                          }}
                        >
                          <span className="text-2xl sm:text-3xl leading-none">🐴</span>
                          <span className="text-base sm:text-lg font-mono font-black text-slate-950 leading-none tabular-nums">
                            #{racer.targetSegment}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: Big Furlong Count + Rank */}
                  <div className="col-span-12 sm:col-span-2 flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1.5">
                    <div className="text-3xl sm:text-4xl font-black font-mono tabular-nums text-white leading-none">
                      {racer.position}
                      <span className="text-base sm:text-lg text-slate-400 font-bold">
                        /{state.trackLength}
                      </span>
                    </div>
                    <span
                      className={cn(
                        'text-sm font-mono font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider',
                        rank === 1 && racer.position > 0
                          ? 'bg-amber-500/25 text-amber-200 border border-amber-400/60'
                          : 'bg-white/[0.08] text-slate-300 border border-white/15'
                      )}
                    >
                      {formatOrdinal(rank)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* LOWER SECTION: Paired Color-Coded SvgDartboard (580px) + Current Visit & Lane Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Shared SvgDartboard with Every Racer's Color Wedge + Glowing Bullseye */}
        <div className="lg:col-span-7 card-matte rounded-2xl p-5 space-y-3 flex flex-col items-center">
          <div className="w-full flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-emerald-400" />
              <span className="text-base sm:text-lg font-black uppercase tracking-wider text-white">
                Color-Coded Target Board
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400/55 text-sm sm:text-base font-mono font-bold text-purple-200">
                <Zap className="w-4 h-4" />
                Bull +2 • 25 +1
              </span>
              {!isBoardConnected && (
                <span className="text-sm font-mono font-bold text-slate-400 hidden sm:inline">
                  Click to throw
                </span>
              )}
            </div>
          </div>

          <SvgDartboard
            size={580}
            segmentOverlays={segmentOverlays}
            dimInactiveSegments={true}
            onBoardClick={!isBoardConnected ? injectBoardClickThrow : undefined}
          >
            {/* Subtle lightning badge on Bullseye */}
            <text
              x={200}
              y={201}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#FFFFFF"
              className="text-xs font-black pointer-events-none select-none"
            >
              ⚡
            </text>
            <DartPlotOverlay
              sessionThrows={[]}
              currentVisitThrows={activeVisitDarts}
              mode="dots"
            />
          </SvgDartboard>
        </div>

        {/* Right Column: 3-Dart Visit Strip + Race Telemetry */}
        <div className="lg:col-span-5 space-y-4">
          <div className="card-matte rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm sm:text-base font-mono uppercase tracking-wider text-slate-300 font-black truncate">
                Current Visit ({activeRacer.player.name})
              </span>
              <span className="text-sm sm:text-base font-mono font-black text-sky-400 tabular-nums shrink-0">
                Target #{activeRacer.targetSegment}
              </span>
            </div>
            <VisitPillsStrip
              darts={activeVisitDarts}
              dartLabels={visitLabels}
              dartTones={visitTones}
              boardStatus={boardStatus}
              turnComplete={state.turnComplete}
              onManualNextTurn={handleAdvanceTurn}
            />
          </div>

          {/* Racer Breakdown Cards */}
          <div className="card-matte rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm sm:text-base font-mono uppercase tracking-wider text-slate-300 font-black">
                Race Telemetry
              </span>
              <span className="text-sm sm:text-base font-mono font-bold text-slate-400 tabular-nums">
                {state.totalDartsThrown} darts
              </span>
            </div>

            <div className="space-y-2.5">
              {state.racers.map((racer) => (
                <div
                  key={racer.player.id}
                  className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-white/[0.08]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{ backgroundColor: racer.player.colorHex }}
                    />
                    <span className="text-base sm:text-lg font-black text-white truncate">
                      {racer.player.name}
                    </span>
                    <span className="text-sm sm:text-base font-mono font-bold text-slate-400">
                      (#{racer.targetSegment})
                    </span>
                  </div>
                  <div className="text-sm sm:text-base font-mono font-bold text-slate-300 shrink-0 tabular-nums">
                    {racer.selfHits} hits • {racer.bullBoosts}⚡
                    {state.helpRivals && racer.rivalsHelped > 0
                      ? ` • ${racer.rivalsHelped}🎁`
                      : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
