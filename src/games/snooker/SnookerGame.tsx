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
import { cn } from '../../lib/utils';
import { Award, Check, CircleDot, Flame, Sparkles } from 'lucide-react';
import {
  SNOOKER_COLOURS,
  SNOOKER_RED_SEGMENTS,
  advanceTurn,
  applyDartToState,
  buildGameResult,
  createInitialState,
  getActiveClearanceColour,
} from './engine';
import { SnookerDartFeedback, SnookerState } from './types';

export const SnookerGame: React.FC<GameModuleProps> = ({
  players,
  config,
  soundEnabled,
  isBoardConnected,
  boardStatus,
  onGameComplete,
  registerController,
  onCanUndoChange,
}) => {
  const [state, setState] = useState<SnookerState>(() => createInitialState(players, config));
  const [historyLen, setHistoryLen] = useState(0);
  const [callout, setCallout] = useState<GameCallout | null>(null);

  const stateRef = useRef<SnookerState>(state);
  const turnStartStateRef = useRef<SnookerState>(state);
  const historyRef = useRef<SnookerState[]>([]);
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

  const triggerCallout = useCallback((title: string, subtitle: string | undefined, accent: GameCallout['accent'], persist = false) => {
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
  }, []);

  const playFeedback = useCallback(
    (feedback: SnookerDartFeedback, isFinished: boolean) => {
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
          feedback.calloutAccent ?? 'emerald',
          isFinished
        );
      }
    },
    [soundEnabled, triggerCallout]
  );

  const scheduleVictoryIfFinished = useCallback(
    (next: SnookerState) => {
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
      let latestFeedback: SnookerDartFeedback = { sound: 'none' };

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
  const clearanceColour = getActiveClearanceColour(state);

  // Build rich dartboard overlays for the exact Snooker target phase
  const segmentOverlays = useMemo<Record<string, SegmentOverlayStyle>>(() => {
    const overlays: Record<string, SegmentOverlayStyle> = {};

    if (state.targetPhase === 'red') {
      for (const seg of SNOOKER_RED_SEGMENTS) {
        overlays[String(seg)] = {
          fill: '#E11D48',
          opacity: 0.62,
          stroke: '#FDA4AF',
          pulse: false,
          badge: '1',
          badgeColor: '#FFFFFF',
        };
      }
    } else if (state.targetPhase === 'colour') {
      for (const c of SNOOKER_COLOURS) {
        overlays[String(c.segment)] = {
          fill: c.hex,
          opacity: c.id === 'black' ? 0.92 : 0.78,
          stroke: c.strokeHex,
          pulse: true,
          badge: `${c.points}`,
          badgeColor: c.badgeTextColor,
        };
        if (c.acceptsBull) {
          overlays['Bull'] = {
            fill: '#1E293B',
            opacity: 0.94,
            stroke: '#FBBF24',
            pulse: true,
          };
        }
      }
    } else if (state.targetPhase === 'clearance' && clearanceColour) {
      overlays[String(clearanceColour.segment)] = {
        fill: clearanceColour.hex,
        opacity: clearanceColour.id === 'black' ? 0.94 : 0.85,
        stroke: clearanceColour.strokeHex,
        pulse: true,
        badge: `${clearanceColour.shortName} ${clearanceColour.points}`,
        badgeColor: clearanceColour.badgeTextColor,
      };
      if (clearanceColour.acceptsBull) {
        overlays['Bull'] = {
          fill: '#1E293B',
          opacity: 0.95,
          stroke: '#FBBF24',
          pulse: true,
        };
      }
    }

    return overlays;
  }, [state.targetPhase, clearanceColour]);

  const targetBanner = useMemo(() => {
    if (state.targetPhase === 'red') {
      return {
        label: 'POT A RED (1 PT)',
        hint: 'Hit any crimson wedge (1, 8–20)',
        chipClass: 'bg-rose-500/20 border-rose-400/60 text-rose-200',
        dotColor: '#E11D48',
      };
    }
    if (state.targetPhase === 'colour') {
      return {
        label: 'NOMINATE A COLOUR (2–7 PTS)',
        hint: 'Y:#2 • G:#3 • Br:#4 • Bl:#5 • P:#6 • Bk:#7 or Bull',
        chipClass: 'bg-amber-500/20 border-amber-400/60 text-amber-200',
        dotColor: '#F59E0B',
      };
    }
    if (clearanceColour) {
      return {
        label: `CLEARANCE: ${clearanceColour.name.toUpperCase()} (${clearanceColour.points} PTS)`,
        hint: `Hit segment #${clearanceColour.segment}${clearanceColour.acceptsBull ? ' or Inner Bull' : ''} to clear`,
        chipClass: 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200',
        dotColor: clearanceColour.hex,
      };
    }
    return {
      label: 'FRAME COMPLETE',
      hint: 'All balls cleared',
      chipClass: 'bg-purple-500/20 border-purple-400/60 text-purple-200',
      dotColor: '#A855F7',
    };
  }, [state.targetPhase, clearanceColour]);

  return (
    <div className="space-y-4">
      {/* TOP SPOTLIGHT: Active Turn, Giant Current Break, Target Ball Pill, Reds Remaining, Visit Pills */}
      <div
        className="card-matte rounded-2xl p-5 sm:p-6 space-y-4 border-2 transition-colors"
        style={{
          borderColor: `${activePlayer.colorHex}80`,
          boxShadow: `0 0 36px -10px ${activePlayer.colorHex}66`,
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Active Player Identity */}
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center font-black text-3xl sm:text-4xl text-slate-950 shrink-0 shadow-lg"
              style={{ backgroundColor: activePlayer.colorHex }}
            >
              {activePlayer.avatarInitial}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm sm:text-base font-mono uppercase tracking-widest text-emerald-400 font-black">
                  At the Table • Frame RD {state.round}
                </span>
              </div>
              <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight truncate leading-tight mt-0.5">
                {activePlayer.name}
              </h2>
              <div className="flex flex-wrap items-center gap-4 mt-1.5 text-sm sm:text-base font-mono text-slate-300 tabular-nums">
                <span>
                  Frame Score:{' '}
                  <strong className="text-2xl sm:text-3xl font-black text-white">
                    {activePlayer.score}
                  </strong>
                </span>
                <span>
                  High Break:{' '}
                  <strong className="text-xl sm:text-2xl font-black text-amber-300">
                    {state.highestBreakOverall}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* Reds Remaining + Giant Current Break */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="px-4 py-3 rounded-2xl bg-rose-950/50 border-2 border-rose-500/40 text-center min-w-[115px]">
              <div className="text-sm font-mono uppercase tracking-wider text-rose-300 font-black">
                Reds Left
              </div>
              <div className="text-4xl sm:text-5xl font-black font-mono tabular-nums text-white leading-none mt-1">
                {state.redsRemaining}
              </div>
            </div>

            <div className="px-5 py-2.5 rounded-2xl bg-emerald-950/60 border-2 border-emerald-400/50 text-right min-w-[160px] shadow-[0_0_26px_-8px_rgba(16,185,129,0.5)]">
              <div className="text-sm sm:text-base font-mono uppercase tracking-wider text-emerald-300 font-black flex items-center justify-end gap-1.5">
                <Flame
                  className={cn(
                    'w-5 h-5',
                    state.currentBreak > 0 ? 'text-amber-400' : 'text-slate-500'
                  )}
                />
                Break
              </div>
              <div
                className={cn(
                  'text-7xl sm:text-8xl font-black font-mono tabular-nums leading-none mt-0.5',
                  state.currentBreak >= 30
                    ? 'text-purple-300'
                    : state.currentBreak >= 12
                    ? 'text-amber-300'
                    : state.currentBreak > 0
                    ? 'text-emerald-300'
                    : 'text-slate-500'
                )}
              >
                {state.currentBreak}
              </div>
            </div>
          </div>
        </div>

        {/* Giant Glowing Target Ball Pill */}
        <div
          className={cn(
            'rounded-2xl border-2 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-lg',
            targetBanner.chipClass
          )}
        >
          <div className="flex items-center gap-3.5">
            <span
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full shrink-0 border-2 border-white/80 shadow-[0_0_16px_rgba(255,255,255,0.4)]"
              style={{ backgroundColor: targetBanner.dotColor }}
            />
            <span className="text-2xl sm:text-3xl font-black tracking-wide uppercase leading-tight">
              {targetBanner.label}
            </span>
          </div>
          <span className="text-sm sm:text-base font-mono font-bold opacity-95">
            {targetBanner.hint}
          </span>
        </div>

        {/* 3-Dart Visit Pills + Pull Darts Prompt */}
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

      {/* MAIN ARENA: Dartboard + Snooker Table Rack & Frame Scoreboard */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Interactive Snooker Dartboard */}
        <div className="xl:col-span-7 card-matte rounded-2xl p-4 sm:p-5 flex flex-col items-center space-y-3">
          <div className="w-full flex items-center justify-between gap-2 text-sm sm:text-base font-mono text-slate-300">
            <span className="flex items-center gap-2 font-black text-emerald-400 uppercase tracking-wider">
              <CircleDot className="w-5 h-5" />
              Championship Snooker Board
            </span>
            {!isBoardConnected && (
              <span className="text-amber-300 font-bold">Click segment to throw</span>
            )}
          </div>

          <SvgDartboard
            size={640}
            segmentOverlays={segmentOverlays}
            dimInactiveSegments={true}
            onBoardClick={!isBoardConnected ? injectBoardClickThrow : undefined}
          >
            <DartPlotOverlay
              sessionThrows={[]}
              currentVisitThrows={state.currentVisitDarts}
              mode="dots"
            />
          </SvgDartboard>

          <div className="w-full text-center text-sm sm:text-base font-mono text-slate-300 pt-1">
            {state.lastEventSummary}
          </div>
        </div>

        {/* Table Rack + Frame Scoreboard */}
        <div className="xl:col-span-5 space-y-4">
          {/* SNOOKER TABLE BALL RACK */}
          <div className="card-matte rounded-2xl p-4 sm:p-5 space-y-4 border-emerald-500/35 bg-gradient-to-b from-emerald-950/40 to-[#141D2B]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-mono uppercase tracking-widest text-emerald-400 font-bold">
                  Snooker Table Rack
                </div>
                <div className="text-xl sm:text-2xl font-black text-white">
                  {state.redsRemaining > 0
                    ? `${state.redsRemaining} / ${state.totalReds} Reds on Table`
                    : 'Clearance Sequence'}
                </div>
              </div>
              <div className="px-3.5 py-2 rounded-xl bg-slate-950/75 border border-white/10 text-right">
                <div className="text-sm font-mono uppercase text-slate-300 font-bold flex items-center justify-end gap-1.5">
                  <Award className="w-4 h-4 text-amber-400" />
                  High Break
                </div>
                <div className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-amber-300 leading-tight">
                  {state.highestBreakOverall}
                </div>
              </div>
            </div>

            {/* Reds Rack */}
            <div className="p-3.5 rounded-xl bg-emerald-950/55 border border-emerald-500/25 space-y-2.5">
              <div className="flex items-center justify-between text-sm sm:text-base font-mono">
                <span className="text-rose-300 font-black uppercase tracking-wider">
                  Reds (1 pt • Segs 1, 8–20)
                </span>
                <span className="text-slate-200 tabular-nums font-black">
                  {state.redsRemaining} / {state.totalReds}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: state.totalReds }).map((_, idx) => {
                  const isOnTable = idx < state.redsRemaining;
                  return (
                    <div
                      key={idx}
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-sm font-mono font-black transition-all duration-300',
                        isOnTable
                          ? cn(
                              'bg-gradient-to-br from-rose-400 via-red-600 to-rose-900 text-white shadow-[0_0_12px_rgba(244,63,94,0.5)] border border-rose-300/70',
                              state.targetPhase === 'red' && 'scale-105'
                            )
                          : 'bg-slate-900/60 border border-dashed border-white/15 text-slate-600 scale-90'
                      )}
                    >
                      {isOnTable ? '1' : ''}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Colour Balls Rack */}
            <div className="grid grid-cols-6 gap-2">
              {SNOOKER_COLOURS.map((c, idx) => {
                const isCleared = state.targetPhase === 'clearance' && idx < state.clearanceIndex;
                const isActiveTarget =
                  state.targetPhase === 'colour' ||
                  (state.targetPhase === 'clearance' && idx === state.clearanceIndex);

                return (
                  <div
                    key={c.id}
                    className={cn(
                      'flex flex-col items-center p-2.5 rounded-xl border-2 transition-all',
                      isActiveTarget
                        ? 'bg-slate-900/95 border-white/50 shadow-[0_0_18px_-4px_rgba(255,255,255,0.4)] scale-[1.03]'
                        : isCleared
                        ? 'bg-slate-950/40 border-white/5 opacity-40'
                        : 'bg-slate-900/55 border-white/10 opacity-80'
                    )}
                  >
                    <div
                      className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center font-mono font-black text-lg shadow-inner border-2"
                      style={{
                        backgroundColor: c.hex,
                        borderColor: c.strokeHex,
                        color: c.badgeTextColor,
                      }}
                    >
                      {isCleared ? <Check className="w-5 h-5" /> : c.points}
                    </div>
                    <span className="text-sm font-black text-slate-100 mt-1.5 leading-none">
                      {c.shortName}
                    </span>
                    <span className="text-sm font-mono font-bold text-slate-400 mt-0.5 leading-none">
                      #{c.segment}{c.acceptsBull ? '/B' : ''}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Rules Footer Pill */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm sm:text-base font-mono text-slate-300 pt-2 border-t border-white/10">
              <span>
                Foul Rule:{' '}
                <strong className={state.foulPenalty ? 'text-rose-300' : 'text-slate-200'}>
                  {state.foulPenalty ? 'ON (+4 on 0-pot)' : 'OFF'}
                </strong>
              </span>
              <span className="flex items-center gap-1.5 text-emerald-300 font-bold">
                <Sparkles className="w-4 h-4" />
                Max: {state.totalReds * 8 + 27}
              </span>
            </div>
          </div>

          {/* FRAME SCOREBOARD */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3.5">
            {state.players.map((p, idx) => {
              const isCurrent = idx === state.currentPlayerIndex && !state.isFinished;
              return (
                <div
                  key={p.id}
                  className={cn(
                    'card-matte rounded-2xl p-4 sm:p-5 transition-all border-2',
                    isCurrent ? 'bg-slate-900/95' : 'border-white/10 opacity-90'
                  )}
                  style={
                    isCurrent
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
                        <div className="flex items-center gap-2">
                          <span className="text-xl sm:text-2xl font-black text-white truncate">
                            {p.name}
                          </span>
                          {isCurrent && (
                            <span className="px-2.5 py-0.5 rounded-full text-sm font-mono font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 shrink-0">
                              At Table
                            </span>
                          )}
                        </div>
                        <div className="text-base font-mono text-slate-300 flex flex-wrap gap-x-3 gap-y-0.5 mt-1 tabular-nums">
                          <span>
                            High Break: <strong className="text-amber-300">{p.highestBreak}</strong>
                          </span>
                          <span>
                            {p.redsPotted}R / {p.coloursPotted}C
                          </span>
                          {p.foulPointsEarned > 0 && (
                            <span className="text-emerald-300">+{p.foulPointsEarned} foul</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-4xl sm:text-5xl font-black font-mono tabular-nums text-white leading-none">
                        {p.score}
                      </div>
                      <div className="text-sm font-mono uppercase tracking-wider text-slate-400 font-bold mt-1">
                        Points
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
