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
  advanceDartsGolfTurn,
  applyDartToDartsGolf,
  buildDartsGolfResult,
  createInitialDartsGolfState,
  DartsGolfState,
  formatGolfScore,
  getProvisionalShot,
  sortDartsGolfStandings,
} from './engine';
import { Flag, Trophy, Sparkles, Target, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';

function getScoreBadgeClasses(delta: number): string {
  if (delta <= -2) {
    return 'bg-amber-500/25 border-amber-300 text-amber-200 ring-1 ring-amber-400/50 rounded-full';
  }
  if (delta === -1) {
    return 'bg-emerald-500/25 border-emerald-400/80 text-emerald-200 rounded-full';
  }
  if (delta === 0) {
    return 'bg-sky-500/15 border-sky-400/40 text-sky-200 rounded-lg';
  }
  if (delta === 1) {
    return 'bg-slate-800/80 border-amber-500/35 text-amber-200/85 rounded-md';
  }
  return 'bg-rose-500/20 border-rose-400/60 text-rose-200 rounded-md';
}

function getTotalScoreTextClass(total: number): string {
  if (total < 0) return 'text-emerald-300';
  if (total === 0) return 'text-amber-300';
  return 'text-rose-300';
}

export const DartsGolfGame: React.FC<GameModuleProps> = ({
  players,
  config,
  soundEnabled,
  isBoardConnected,
  boardStatus,
  onGameComplete,
  registerController,
  onCanUndoChange,
}) => {
  const [state, setState] = useState<DartsGolfState>(() =>
    createInitialDartsGolfState(players, config)
  );
  const [historyLen, setHistoryLen] = useState(0);
  const [callout, setCallout] = useState<GameCallout | null>(null);

  const stateRef = useRef(state);
  const turnStartRef = useRef(state);
  const historyRef = useRef<DartsGolfState[]>([]);
  const startedAtRef = useRef(Date.now());
  const completedRef = useRef(false);
  const calloutTimerRef = useRef<number | null>(null);
  const completeTimerRef = useRef<number | null>(null);

  const activePlayerEntry = state.players[state.activePlayerIndex];
  useActiveTurnTint(activePlayerEntry?.player.colorHex);

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
      calloutTimerRef.current = window.setTimeout(() => setCallout(null), 1750);
    },
    []
  );

  const scheduleFinish = useCallback(
    (finalState: DartsGolfState) => {
      if (completedRef.current) return;
      completedRef.current = true;
      completeTimerRef.current = window.setTimeout(() => {
        onGameComplete(buildDartsGolfResult(finalState, startedAtRef.current));
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
    const fresh = createInitialDartsGolfState(players, config);
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
      const { nextState, feedback } = applyDartToDartsGolf(current, dart);
      stateRef.current = nextState;
      setState(nextState);
      setHistoryLen(historyRef.current.length);

      if (feedback.sound === 'jackpot') soundEngine.playJackpot(soundEnabled);
      else if (feedback.sound === 'bonusHit') soundEngine.playBonusHit(soundEnabled);
      else if (feedback.sound === 'hazard') soundEngine.playHazard(soundEnabled);
      else soundEngine.playDartHit(soundEnabled);

      if (feedback.title) {
        showCallout(feedback.title, feedback.subtitle, feedback.accent || 'emerald');
      }
      if (nextState.isFinished) {
        scheduleFinish(nextState);
      }
    },
    onDartCorrected: (_dart, _prev, _idx, visitThrows) => {
      let replay = turnStartRef.current;
      for (const d of visitThrows) {
        replay = applyDartToDartsGolf(replay, d).nextState;
      }
      stateRef.current = replay;
      setState(replay);
      if (replay.isFinished) scheduleFinish(replay);
    },
    onVisitCompleted: () => {
      const current = stateRef.current;
      if (current.isFinished || current.visitDarts.length === 0) return;
      historyRef.current.push(current);
      const next = advanceDartsGolfTurn(current);
      stateRef.current = next;
      turnStartRef.current = next;
      setState(next);
      setHistoryLen(historyRef.current.length);
      soundEngine.playTurnChange(soundEnabled);
      if (next.isFinished) scheduleFinish(next);
    },
  });

  const activeTarget = state.holes[state.holeIndex] ?? state.holes[state.holes.length - 1];
  const activeHoleOrder = state.holeIndex + 1;
  const provisionalShot = getProvisionalShot(state.visitShots, state.scoringRule);
  const leaderboard = useMemo(() => sortDartsGolfStandings(state.players), [state.players]);

  const segmentOverlays = useMemo<Record<string, SegmentOverlayStyle>>(() => {
    const overlays: Record<string, SegmentOverlayStyle> = {
      [`S${activeTarget}`]: {
        fill: '#10B981',
        opacity: 0.52,
        stroke: '#34D399',
      },
      [`D${activeTarget}`]: {
        fill: '#34D399',
        opacity: 0.88,
        stroke: '#FDE68A',
        badge: `H${activeHoleOrder}`,
        badgeColor: '#FEF3C7',
      },
      [`T${activeTarget}`]: {
        fill: '#F59E0B',
        opacity: 0.96,
        stroke: '#FFFFFF',
        pulse: true,
      },
    };

    if (state.gimmeBull) {
      overlays['Bull'] = {
        fill: '#FACC15',
        opacity: 0.9,
        stroke: '#FFFFFF',
      };
    }

    return overlays;
  }, [activeTarget, activeHoleOrder, state.gimmeBull]);

  const dartTones = state.visitShots.map((s) => s.tone);
  const dartLabels = state.visitShots.map((s) => s.shortLabel);

  // Split 20-hole courses into Front 10 + Back 10 blocks so every cell stays 8ft-readable
  const holeBlocks = useMemo(() => {
    const indexedHoles = state.holes.map((targetNumber, holeIndex) => ({
      holeIndex,
      holeOrder: holeIndex + 1,
      targetNumber,
    }));
    if (indexedHoles.length <= 10) {
      return [
        {
          label: `9-HOLE RANDOM CHALLENGE (HOLES 1–${indexedHoles.length})`,
          holes: indexedHoles,
        },
      ];
    }
    return [
      { label: 'OUT — FRONT 10 (HOLES 1–10)', holes: indexedHoles.slice(0, 10) },
      { label: 'IN — BACK 10 (HOLES 11–20)', holes: indexedHoles.slice(10, 20) },
    ];
  }, [state.holes]);

  return (
    <div className="space-y-4">
      <CalloutBanner callout={callout} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Left/Top: Masters Hole Spotlight, Visit Pills & Dartboard */}
        <div className="xl:col-span-6 space-y-4">
          {/* Active Hole Clubhouse Banner */}
          <div className="card-matte rounded-2xl p-5 sm:p-6 border-2 border-emerald-400/45 bg-gradient-to-br from-emerald-950/65 via-[#111C24] to-amber-950/25 shadow-[0_0_32px_-12px_rgba(16,185,129,0.35)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/60 text-emerald-100 text-sm sm:text-base font-mono font-black uppercase tracking-widest">
                    <Flag className="w-4 h-4 text-amber-300 shrink-0" />
                    Hole {state.holeIndex + 1} of {state.holes.length}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/50 text-amber-200 text-sm sm:text-base font-mono font-bold uppercase tracking-wider">
                    {state.scoringRule === 'lastDart' ? 'Last Dart Counts' : 'Best Dart Counts'}
                  </span>
                </div>

                <div className="flex items-baseline gap-3">
                  <span className="text-7xl sm:text-8xl font-black font-mono tabular-nums text-white tracking-tight leading-none">
                    TARGET {activeTarget}
                  </span>
                </div>

                {activePlayerEntry && (
                  <div className="flex items-center gap-3 pt-1">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center font-black text-base text-slate-950 shadow shrink-0"
                      style={{ backgroundColor: activePlayerEntry.player.colorHex }}
                    >
                      {activePlayerEntry.player.avatarInitial}
                    </div>
                    <span className="text-xl sm:text-2xl font-black text-white">
                      {activePlayerEntry.player.name}
                    </span>
                    <span className="text-sm sm:text-base font-mono text-slate-300">at the tee</span>
                  </div>
                )}
              </div>

              {/* Active Player Total & Provisional Hole Readout */}
              <div className="text-right ml-auto">
                <div className="text-sm sm:text-base font-mono uppercase tracking-widest text-amber-300 font-extrabold">
                  Clubhouse Score
                </div>
                <div
                  className={cn(
                    'text-7xl sm:text-8xl font-black font-mono tabular-nums leading-none mt-1',
                    getTotalScoreTextClass(activePlayerEntry?.totalToPar ?? 0)
                  )}
                >
                  {formatGolfScore(activePlayerEntry?.totalToPar ?? 0)}
                </div>
                <div className="text-sm sm:text-base font-mono text-slate-200 mt-2">
                  {provisionalShot ? (
                    <span>
                      Hole {activeHoleOrder} (#{activeTarget}):{' '}
                      <strong className="text-amber-300">
                        {provisionalShot.term} ({formatGolfScore(provisionalShot.scoreDelta)})
                      </strong>
                    </span>
                  ) : (
                    <span className="text-slate-300">
                      Aim <strong className="text-amber-300">T{activeTarget} (-2)</strong> or{' '}
                      <strong className="text-emerald-300">D{activeTarget} (-1)</strong>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Readable Masters Scoring Legend */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-4 pt-3.5 border-t border-white/10 text-center font-mono">
              <div className="rounded-xl bg-amber-500/18 border border-amber-400/45 px-2 py-1.5">
                <div className="text-base sm:text-lg font-black text-amber-300 leading-tight">
                  T{activeTarget}
                </div>
                <div className="text-sm font-bold text-amber-100/90 leading-tight mt-0.5">
                  Eagle -2
                </div>
              </div>
              <div className="rounded-xl bg-emerald-500/18 border border-emerald-400/45 px-2 py-1.5">
                <div className="text-base sm:text-lg font-black text-emerald-300 leading-tight">
                  D{activeTarget}
                </div>
                <div className="text-sm font-bold text-emerald-100/90 leading-tight mt-0.5">
                  Birdie -1
                </div>
              </div>
              <div className="rounded-xl bg-sky-500/18 border border-sky-400/45 px-2 py-1.5">
                <div className="text-base sm:text-lg font-black text-sky-300 leading-tight">
                  S{activeTarget}
                </div>
                <div className="text-sm font-bold text-sky-100/90 leading-tight mt-0.5">
                  Par E
                </div>
              </div>
              <div className="rounded-xl bg-slate-800/80 border border-white/15 px-2 py-1.5">
                <div className="text-base sm:text-lg font-black text-slate-100 leading-tight">
                  Miss
                </div>
                <div className="text-sm font-bold text-slate-300 leading-tight mt-0.5">
                  Bogey +1
                </div>
              </div>
              <div className="rounded-xl bg-rose-500/18 border border-rose-400/45 px-2 py-1.5">
                <div className="text-base sm:text-lg font-black text-rose-300 leading-tight">
                  Out
                </div>
                <div className="text-sm font-bold text-rose-100/90 leading-tight mt-0.5">
                  Dbl +2
                </div>
              </div>
              <div
                className={cn(
                  'rounded-xl border px-2 py-1.5',
                  state.gimmeBull
                    ? 'bg-yellow-500/18 border-yellow-400/50'
                    : 'bg-slate-900/50 border-white/10 opacity-45'
                )}
              >
                <div className="text-base sm:text-lg font-black text-yellow-300 leading-tight">
                  Bull
                </div>
                <div className="text-sm font-bold text-yellow-100/90 leading-tight mt-0.5">
                  {state.gimmeBull ? 'Gimme E' : 'Off'}
                </div>
              </div>
            </div>

            {/* Risk/Reward Early Takeout Callout in Last Dart Mode */}
            {state.scoringRule === 'lastDart' &&
              provisionalShot &&
              provisionalShot.scoreDelta <= 0 &&
              !state.turnComplete && (
                <div className="mt-3.5 rounded-xl bg-amber-500/18 border-2 border-amber-400/55 px-4 py-2.5 flex items-center gap-2.5 text-sm sm:text-base font-extrabold text-amber-100">
                  <Sparkles className="w-5 h-5 text-amber-300 shrink-0" />
                  <span>
                    Pull darts now to lock{' '}
                    <span className="font-mono text-white">
                      {provisionalShot.term} ({formatGolfScore(provisionalShot.scoreDelta)})
                    </span>{' '}
                    — or throw again to chase better!
                  </span>
                </div>
              )}
          </div>

          <VisitPillsStrip
            darts={state.visitDarts}
            dartTones={dartTones}
            dartLabels={dartLabels}
            boardStatus={boardStatus}
            turnComplete={state.turnComplete}
          />

          <div className="card-matte rounded-2xl p-3.5 sm:p-4 flex items-center justify-center border border-emerald-500/25">
            <SvgDartboard
              size={620}
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

        {/* Right/Bottom: Masters Leaderboard & Full Hole-by-Hole Scorecard */}
        <div className="xl:col-span-6 space-y-4">
          {/* Masters Green Jacket Leaderboard */}
          <div className="card-matte rounded-2xl p-4 sm:p-5 border border-amber-400/30 bg-gradient-to-b from-emerald-950/35 to-[#121B28]">
            <div className="flex items-center justify-between mb-3">
              <div className="text-base sm:text-lg font-mono uppercase tracking-widest text-amber-300 font-black flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                Masters Leaderboard
              </div>
              <span className="text-sm sm:text-base font-mono font-bold text-emerald-300 uppercase">
                Lowest Score Wins
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {leaderboard.map((entry, idx) => {
                const isActive = entry.player.id === activePlayerEntry?.player.id && !state.isFinished;
                const holesPlayed = Object.keys(entry.holeScores).length;
                return (
                  <div
                    key={entry.player.id}
                    className={cn(
                      'rounded-xl p-3.5 border-2 transition-all flex items-center justify-between gap-3',
                      isActive
                        ? 'bg-emerald-500/18 border-emerald-400/80 shadow-[0_0_22px_-6px_rgba(16,185,129,0.55)]'
                        : 'bg-slate-900/75 border-white/10'
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center font-mono text-base font-black shrink-0',
                          idx === 0
                            ? 'bg-amber-400 text-slate-950'
                            : 'bg-slate-800 text-slate-200'
                        )}
                      >
                        {idx + 1}
                      </span>
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center font-black text-base text-slate-950 shrink-0"
                        style={{ backgroundColor: entry.player.colorHex }}
                      >
                        {entry.player.avatarInitial}
                      </div>
                      <div className="min-w-0">
                        <div className="text-lg sm:text-xl font-black text-white truncate">
                          {entry.player.name}
                        </div>
                        <div className="text-sm sm:text-base font-mono text-slate-300 tabular-nums">
                          Thru {holesPlayed} • {entry.eagles}E {entry.birdies}B {entry.pars}P
                        </div>
                      </div>
                    </div>

                    <div
                      className={cn(
                        'text-3xl sm:text-4xl font-black font-mono tabular-nums shrink-0',
                        getTotalScoreTextClass(entry.totalToPar)
                      )}
                    >
                      {formatGolfScore(entry.totalToPar)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Hole-by-Hole Masters Scorecard */}
          <div className="card-matte rounded-2xl p-4 sm:p-5 border border-emerald-500/30 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-base sm:text-lg font-mono uppercase tracking-widest text-emerald-300 font-black flex items-center gap-2">
                <Target className="w-5 h-5 text-emerald-400" />
                Official Clubhouse Scorecard
              </div>
              <div className="flex items-center gap-3 text-sm sm:text-base font-mono font-bold text-slate-300">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded-full bg-amber-400/80 inline-block" /> Eagle
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded-full bg-emerald-400/80 inline-block" /> Birdie
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded-sm bg-rose-400/80 inline-block" /> +2
                </span>
              </div>
            </div>

            {holeBlocks.map((block) => (
              <div key={block.label} className="space-y-2">
                <div className="text-sm sm:text-base font-mono uppercase tracking-widest text-amber-300 font-extrabold">
                  {block.label}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse font-mono text-base sm:text-lg">
                    <thead>
                      <tr className="border-b border-white/15 text-slate-300">
                        <th className="py-2 pr-2 text-left text-sm sm:text-base font-extrabold min-w-[110px]">
                          PLAYER
                        </th>
                        {block.holes.map(({ holeIndex, holeOrder, targetNumber }) => {
                          const isCurrentHole = holeIndex === state.holeIndex && !state.isFinished;
                          return (
                            <th
                              key={holeIndex}
                              className={cn(
                                'py-2 px-1 text-center font-black leading-tight',
                                isCurrentHole
                                  ? 'text-amber-300 bg-emerald-500/25 rounded-t-xl'
                                  : 'text-slate-200'
                              )}
                            >
                              <div className="text-sm font-bold text-slate-400">H{holeOrder}</div>
                              <div className="text-base sm:text-lg font-black">#{targetNumber}</div>
                            </th>
                          );
                        })}
                        <th className="py-2 pl-2 text-right text-base sm:text-lg font-black text-amber-300">
                          TOT
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.08]">
                      {state.players.map((entry, pIdx) => {
                        const isActivePlayer = pIdx === state.activePlayerIndex && !state.isFinished;
                        const blockSubtotal = block.holes.reduce((sum, h) => {
                          const v = entry.holeScores[h.holeIndex];
                          return v !== undefined ? sum + v : sum;
                        }, 0);
                        const hasAnyBlockHole = block.holes.some(
                          (h) => entry.holeScores[h.holeIndex] !== undefined
                        );

                        return (
                          <tr
                            key={entry.player.id}
                            className={cn(isActivePlayer && 'bg-emerald-500/[0.10]')}
                          >
                            <td className="py-2.5 pr-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-3.5 h-3.5 rounded-full shrink-0"
                                  style={{ backgroundColor: entry.player.colorHex }}
                                />
                                <span
                                  className={cn(
                                    'font-sans font-extrabold text-base sm:text-lg truncate max-w-[120px]',
                                    isActivePlayer ? 'text-white' : 'text-slate-200'
                                  )}
                                >
                                  {entry.player.name}
                                </span>
                              </div>
                            </td>

                            {block.holes.map(({ holeIndex }) => {
                              const committedVal = entry.holeScores[holeIndex];
                              const isActiveCell =
                                isActivePlayer && holeIndex === state.holeIndex && !state.isFinished;
                              const showProvisional =
                                isActiveCell && committedVal === undefined && provisionalShot;

                              return (
                                <td key={holeIndex} className="py-2 px-0.5 text-center">
                                  {committedVal !== undefined ? (
                                    <span
                                      className={cn(
                                        'inline-flex items-center justify-center w-10 h-10 border-2 text-base sm:text-lg font-black tabular-nums',
                                        getScoreBadgeClasses(committedVal)
                                      )}
                                    >
                                      {formatGolfScore(committedVal)}
                                    </span>
                                  ) : showProvisional ? (
                                    <span
                                      className={cn(
                                        'inline-flex items-center justify-center w-10 h-10 border-2 border-dashed text-base sm:text-lg font-black tabular-nums animate-pulse',
                                        getScoreBadgeClasses(provisionalShot.scoreDelta)
                                      )}
                                    >
                                      {formatGolfScore(provisionalShot.scoreDelta)}
                                    </span>
                                  ) : (
                                    <span
                                      className={cn(
                                        'inline-flex items-center justify-center w-10 h-10 rounded-lg text-base sm:text-lg',
                                        isActiveCell
                                          ? 'bg-emerald-500/25 border-2 border-emerald-400/80 text-emerald-100 font-black'
                                          : 'text-slate-600'
                                      )}
                                    >
                                      {isActiveCell ? '•' : '—'}
                                    </span>
                                  )}
                                </td>
                              );
                            })}

                            <td
                              className={cn(
                                'py-2 pl-2 text-right font-black tabular-nums text-lg sm:text-xl',
                                hasAnyBlockHole
                                  ? getTotalScoreTextClass(blockSubtotal)
                                  : 'text-slate-500'
                              )}
                            >
                              {hasAnyBlockHole ? formatGolfScore(blockSubtotal) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {state.scoringRule === 'lastDart' && (
              <div className="rounded-xl bg-slate-900/75 border border-white/10 px-4 py-3 flex items-center gap-3 text-sm sm:text-base text-slate-200">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                <span>
                  <strong className="text-amber-300">Last Dart Risk:</strong> Throwing another dart
                  overwrites your earlier score on this hole. Pull darts early to bank a Birdie or
                  Eagle!
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
