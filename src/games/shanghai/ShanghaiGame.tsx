import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameModuleProps } from '../../types/games';
import { SvgDartboard, SegmentOverlayStyle } from '../../components/dartboard/SvgDartboard';
import { DartPlotOverlay } from '../../components/dartboard/DartPlotOverlay';
import { useGameBoardEvents } from '../hooks/useGameBoardEvents';
import { useActiveTurnTint } from '../hooks/useActiveTurnTint';
import { soundEngine } from '../utils/soundEngine';
import { injectBoardClickThrow } from '../utils/dartHelpers';
import { CalloutBanner, GameCallout, VisitPillsStrip } from '../components/ArcadePrimitives';
import { cn } from '../../lib/utils';
import { Crown, Check, Flame, Sparkles, Target } from 'lucide-react';
import {
  advanceTurn,
  applyDartToState,
  buildGameResult,
  createInitialState,
} from './engine';
import { ShanghaiFeedback, ShanghaiHistoryEntry, ShanghaiState } from './types';

function playFeedbackSound(sound: ShanghaiFeedback['sound'], enabled: boolean): void {
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

export const ShanghaiGame: React.FC<GameModuleProps> = ({
  players,
  config,
  soundEnabled,
  isBoardConnected,
  boardStatus,
  onGameComplete,
  registerController,
  onCanUndoChange,
}) => {
  const initialState = useMemo(() => createInitialState(players, config), [players, config]);

  const [state, setState] = useState<ShanghaiState>(initialState);
  const [history, setHistory] = useState<ShanghaiHistoryEntry[]>([]);
  const [callout, setCallout] = useState<GameCallout | null>(null);

  const stateRef = useRef<ShanghaiState>(initialState);
  const turnStartRef = useRef<ShanghaiState>(initialState);
  const historyRef = useRef<ShanghaiHistoryEntry[]>([]);
  const startedAtRef = useRef<number>(Date.now());
  const completedRef = useRef<boolean>(false);
  const calloutTimerRef = useRef<number | null>(null);
  const finishTimerRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (calloutTimerRef.current !== null) {
      window.clearTimeout(calloutTimerRef.current);
      calloutTimerRef.current = null;
    }
    if (finishTimerRef.current !== null) {
      window.clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return clearTimers;
  }, [clearTimers]);

  const triggerCallout = useCallback((next: ShanghaiFeedback['callout'], durationMs = 1700) => {
    if (!next) return;
    if (calloutTimerRef.current !== null) {
      window.clearTimeout(calloutTimerRef.current);
    }
    setCallout({ id: Date.now() + Math.random(), ...next });
    calloutTimerRef.current = window.setTimeout(() => {
      setCallout(null);
      calloutTimerRef.current = null;
    }, durationMs);
  }, []);

  const scheduleCompletionIfFinished = useCallback(
    (nextState: ShanghaiState) => {
      if (!nextState.isFinished || completedRef.current) return;
      completedRef.current = true;
      const delay = nextState.winReason === 'shanghai' ? 1200 : 850;
      finishTimerRef.current = window.setTimeout(() => {
        onGameComplete(buildGameResult(nextState, startedAtRef.current));
      }, delay);
    },
    [onGameComplete]
  );

  const handleUndo = useCallback(() => {
    const stack = historyRef.current;
    if (stack.length === 0) return;

    if (finishTimerRef.current !== null) {
      window.clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
    completedRef.current = false;

    const prev = stack[stack.length - 1];
    const nextStack = stack.slice(0, -1);
    historyRef.current = nextStack;
    stateRef.current = prev.state;
    turnStartRef.current = prev.turnStartState;

    setHistory(nextStack);
    setState(prev.state);
    setCallout(null);
  }, []);

  const handleRestart = useCallback(() => {
    clearTimers();
    completedRef.current = false;
    startedAtRef.current = Date.now();
    const fresh = createInitialState(players, config);
    stateRef.current = fresh;
    turnStartRef.current = fresh;
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

  useGameBoardEvents({
    enabled: !state.isFinished,
    onDartThrown: (dart) => {
      const current = stateRef.current;
      if (current.isFinished || current.turnComplete || current.visitDarts.length >= 3) {
        return;
      }

      const nextHistory = [
        ...historyRef.current,
        { state: current, turnStartState: turnStartRef.current },
      ];
      const { nextState, feedback } = applyDartToState(current, dart);

      historyRef.current = nextHistory;
      stateRef.current = nextState;
      setHistory(nextHistory);
      setState(nextState);

      playFeedbackSound(feedback.sound, soundEnabled);
      if (feedback.callout) {
        triggerCallout(
          feedback.callout,
          nextState.winReason === 'shanghai' ? 2400 : 1650
        );
      }

      scheduleCompletionIfFinished(nextState);
    },
    onDartCorrected: (_dart, _prevDart, _dartIndex, visitThrows) => {
      let replayed = turnStartRef.current;
      let lastFeedback: ShanghaiFeedback = { sound: 'none', callout: null };

      for (const t of visitThrows.slice(0, 3)) {
        const res = applyDartToState(replayed, t);
        replayed = res.nextState;
        lastFeedback = res.feedback;
        if (replayed.isFinished) break;
      }

      stateRef.current = replayed;
      setState(replayed);

      playFeedbackSound(lastFeedback.sound, soundEnabled);
      if (lastFeedback.callout) {
        triggerCallout(lastFeedback.callout);
      }
      scheduleCompletionIfFinished(replayed);
    },
    onVisitCompleted: () => {
      const current = stateRef.current;
      if (current.isFinished) return;

      const nextHistory = [
        ...historyRef.current,
        { state: current, turnStartState: turnStartRef.current },
      ];
      const nextState = advanceTurn(current);

      historyRef.current = nextHistory;
      stateRef.current = nextState;
      turnStartRef.current = nextState;
      setHistory(nextHistory);
      setState(nextState);

      if (nextState.isFinished) {
        scheduleCompletionIfFinished(nextState);
      } else {
        soundEngine.playTurnChange(soundEnabled);
        if (nextState.currentRound !== current.currentRound) {
          triggerCallout(
            {
              title: `ROUND ${nextState.currentRound} • TARGET ${nextState.currentRound}s`,
              subtitle: `S${nextState.currentRound} (${nextState.currentRound}) • D${nextState.currentRound} (${nextState.currentRound * 2}) • T${nextState.currentRound} (${nextState.currentRound * 3})`,
              accent: 'purple',
            },
            1600
          );
        }
      }
    },
  });

  const activePlayer = state.players[state.activePlayerIndex];
  useActiveTurnTint(activePlayer?.colorHex);
  const target = state.currentRound;
  const comboCount =
    Number(state.visitCombo.hitSingle) +
    Number(state.visitCombo.hitDouble) +
    Number(state.visitCombo.hitTreble);
  const shanghaiThreat = comboCount === 2 && state.visitDarts.length < 3 && !state.isFinished;

  // Build glowing overlays exclusively on the active round segment (S / D / T states)
  const segmentOverlays = useMemo<Record<string, SegmentOverlayStyle>>(() => {
    const r = state.currentRound;
    const { hitSingle, hitDouble, hitTreble } = state.visitCombo;

    return {
      [`S${r}`]: hitSingle
        ? {
            fill: '#10B981',
            opacity: 0.82,
            stroke: '#FFFFFF',
            pulse: false,
            badge: `✓`,
            badgeColor: '#FFFFFF',
          }
        : {
            fill: '#A855F7',
            opacity: 0.66,
            stroke: '#E9D5FF',
            pulse: true,
            badge: String(r),
            badgeColor: '#FFFFFF',
          },
      [`D${r}`]: hitDouble
        ? {
            fill: '#10B981',
            opacity: 0.94,
            stroke: '#FFFFFF',
            pulse: false,
          }
        : {
            fill: '#D946EF',
            opacity: 0.9,
            stroke: '#FFFFFF',
            pulse: true,
          },
      [`T${r}`]: hitTreble
        ? {
            fill: '#10B981',
            opacity: 0.94,
            stroke: '#FFFFFF',
            pulse: false,
          }
        : {
            fill: '#F59E0B',
            opacity: 0.92,
            stroke: '#FFFFFF',
            pulse: true,
          },
    };
  }, [state.currentRound, state.visitCombo]);

  // Rank map for live leaderboard badges without reordering turn cards unexpectedly
  const rankByPlayerId = useMemo(() => {
    const sorted = [...state.players].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.targetHits - a.targetHits;
    });
    const map: Record<string, number> = {};
    sorted.forEach((p, idx) => {
      map[p.id] = idx + 1;
    });
    return map;
  }, [state.players]);

  const roundNumbers = useMemo(
    () => Array.from({ length: state.totalRounds }, (_, i) => i + 1),
    [state.totalRounds]
  );

  return (
    <div className="space-y-4">
      {/* Round Progression Strip */}
      <div className="card-matte rounded-2xl px-4 py-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-purple-300 font-bold flex items-center gap-1.5">
            <Crown className="w-3.5 h-3.5" />
            Shanghai Escalation ({state.instantWin ? 'Instant Win ON' : '+100 Combo Bonus'})
          </span>
          <span className="text-xs font-mono font-black text-white tabular-nums">
            ROUND {state.currentRound} / {state.totalRounds}
          </span>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {roundNumbers.map((num) => {
            const isPast = num < state.currentRound;
            const isCurrent = num === state.currentRound;
            return (
              <div
                key={num}
                className={cn(
                  'shrink-0 min-w-[34px] h-8 px-2 rounded-lg border font-mono text-xs font-black tabular-nums flex items-center justify-center transition-all',
                  isCurrent
                    ? 'bg-purple-500/30 border-purple-400 text-white shadow-[0_0_16px_rgba(168,85,247,0.55)] scale-105'
                    : isPast
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300/80'
                    : 'bg-slate-900/70 border-white/10 text-slate-500'
                )}
              >
                {num}
              </div>
            );
          })}
        </div>
      </div>

      {/* High-Drama Callout Banner */}
      <CalloutBanner callout={callout} />

      {/* Active Turn Spotlight + Round Target + S/D/T Combo Tracker */}
      <div
        className="card-matte rounded-2xl p-4 sm:p-5 border-2 transition-colors"
        style={{
          borderColor: `${activePlayer.colorHex}80`,
          boxShadow: `0 0 32px -10px ${activePlayer.colorHex}55`,
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Active Player Identity */}
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl text-slate-950 shrink-0 shadow-lg"
              style={{ backgroundColor: activePlayer.colorHex }}
            >
              {activePlayer.avatarInitial}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono uppercase tracking-widest text-purple-300 font-bold">
                  Now Throwing
                </span>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-white/10 text-slate-200">
                  #{rankByPlayerId[activePlayer.id]}
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-white truncate leading-tight">
                {activePlayer.name}
              </div>
            </div>
          </div>

          {/* Massive Round Target Readout */}
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="text-center px-5 py-2.5 rounded-2xl bg-purple-500/20 border-2 border-purple-400/60 shadow-[0_0_28px_-6px_rgba(168,85,247,0.6)]">
              <div className="text-[10px] sm:text-xs font-mono uppercase tracking-widest text-purple-200 font-bold flex items-center justify-center gap-1">
                <Target className="w-3.5 h-3.5" />
                Target Segment
              </div>
              <div className="text-4xl sm:text-6xl font-black font-mono tabular-nums text-white leading-none mt-0.5">
                {target}
              </div>
            </div>

            <div className="text-right">
              <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                Total Score
              </div>
              <div className="text-4xl sm:text-5xl font-black font-mono tabular-nums text-white leading-none">
                {activePlayer.score}
              </div>
              <div className="text-xs font-mono font-bold text-emerald-400 mt-1 tabular-nums">
                +{state.visitPoints} this visit
              </div>
            </div>
          </div>
        </div>

        {/* 3 Glowing S / D / T Shanghai Combo Indicator Badges */}
        <div className="mt-4 pt-4 border-t border-white/10 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-mono uppercase tracking-wider font-black text-purple-300 flex items-center gap-1.5">
              {shanghaiThreat ? (
                <>
                  <Flame className="w-4 h-4 text-amber-400 animate-bounce" />
                  <span className="text-amber-300">SHANGHAI ON! HIT FINAL BED!</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Shanghai Combo ({state.instantWin ? 'Instant Victory' : '+100 Bonus'})
                </>
              )}
            </span>
            <span className="text-xs font-mono font-bold text-slate-400 tabular-nums">
              {comboCount} / 3 LIT
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {[
              {
                key: 'S',
                label: `SINGLE ${target}`,
                pts: target,
                lit: state.visitCombo.hitSingle,
                litClass:
                  'bg-sky-500/25 border-sky-400 text-sky-100 shadow-[0_0_24px_-4px_rgba(56,189,248,0.65)]',
              },
              {
                key: 'D',
                label: `DOUBLE ${target}`,
                pts: target * 2,
                lit: state.visitCombo.hitDouble,
                litClass:
                  'bg-emerald-500/25 border-emerald-400 text-emerald-100 shadow-[0_0_24px_-4px_rgba(16,185,129,0.65)]',
              },
              {
                key: 'T',
                label: `TREBLE ${target}`,
                pts: target * 3,
                lit: state.visitCombo.hitTreble,
                litClass:
                  'bg-amber-500/25 border-amber-400 text-amber-100 shadow-[0_0_24px_-4px_rgba(245,158,11,0.65)]',
              },
            ].map((badge) => (
              <div
                key={badge.key}
                className={cn(
                  'rounded-xl border-2 px-3 py-2.5 flex items-center justify-between gap-2 transition-all',
                  badge.lit
                    ? badge.litClass
                    : shanghaiThreat
                    ? 'bg-purple-500/15 border-purple-400/70 text-purple-200 animate-pulse'
                    : 'bg-slate-900/70 border-white/10 text-slate-400'
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={cn(
                      'w-8 h-8 rounded-lg font-mono font-black text-base flex items-center justify-center shrink-0',
                      badge.lit
                        ? 'bg-white text-slate-950'
                        : 'bg-white/10 text-slate-300'
                    )}
                  >
                    {badge.lit ? <Check className="w-5 h-5 stroke-[3]" /> : badge.key}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-black tracking-tight truncate">
                      {badge.label}
                    </div>
                    <div className="text-[11px] font-mono opacity-80 tabular-nums">
                      +{badge.pts} pts
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 3-Dart Visit Strip */}
        <div className="mt-4">
          <VisitPillsStrip
            darts={state.visitDarts}
            dartLabels={state.visitLabels}
            dartTones={state.visitTones}
            boardStatus={boardStatus}
            turnComplete={state.turnComplete}
          />
        </div>
      </div>

      {/* Main Arena: Dartboard Centerpiece + Scoreboard */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Interactive Dartboard */}
        <div className="xl:col-span-7 card-matte rounded-2xl p-4 sm:p-6 flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">
              Active Slice: <span className="text-purple-300 font-black">{target}</span> Only
            </span>
            {!isBoardConnected && (
              <span className="text-[11px] font-mono text-amber-300/90">
                Click board to simulate throw
              </span>
            )}
          </div>

          <SvgDartboard
            size={480}
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

          {/* Compact Bed Legend */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-3 text-[11px] font-mono text-slate-300">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
              Single ({target})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-fuchsia-500" />
              Double ({target * 2})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              Treble ({target * 3})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              Combo Hit ✓
            </span>
          </div>
        </div>

        {/* Multiplayer Scoreboard */}
        <div className="xl:col-span-5 grid grid-cols-2 xl:grid-cols-1 gap-3">
          {state.players.map((player, idx) => {
            const isActive = idx === state.activePlayerIndex && !state.isFinished;
            const rank = rankByPlayerId[player.id];

            return (
              <div
                key={player.id}
                className={cn(
                  'card-matte rounded-2xl p-4 border-2 transition-all',
                  isActive ? 'scale-[1.01]' : 'border-white/[0.07] opacity-90'
                )}
                style={
                  isActive
                    ? {
                        borderColor: player.colorHex,
                        boxShadow: `0 0 24px -6px ${player.colorHex}70`,
                      }
                    : undefined
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-lg text-slate-950 shrink-0"
                      style={{ backgroundColor: player.colorHex }}
                    >
                      {player.avatarInitial}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {rank === 1 && player.score > 0 && (
                          <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                        )}
                        <span className="text-base sm:text-lg font-black text-white truncate">
                          {player.name}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
                        <span>#{rank}</span>
                        <span>•</span>
                        <span>{player.targetHits} hits</span>
                        {player.bestVisit > 0 && (
                          <>
                            <span>•</span>
                            <span>Best {player.bestVisit}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-3xl sm:text-4xl font-black font-mono tabular-nums text-white leading-none">
                      {player.score}
                    </div>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mt-1">
                      {isActive ? 'UP NOW' : 'PTS'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
