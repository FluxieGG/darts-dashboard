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
import { AlertTriangle, Check, Crown, Scissors, ShieldCheck, Target } from 'lucide-react';
import {
  advanceTurn,
  applyDartToState,
  buildGameResult,
  createInitialState,
} from './engine';
import {
  HalveItChallenge,
  HalveItFeedback,
  HalveItHistoryEntry,
  HalveItState,
} from './types';

const DARK_VEIL: SegmentOverlayStyle = {
  fill: '#0B0F17',
  opacity: 0.65,
  stroke: '#1E293B',
  pulse: false,
};

function buildChallengeOverlays(challenge: HalveItChallenge): Record<string, SegmentOverlayStyle> {
  const overlays: Record<string, SegmentOverlayStyle> = {};

  switch (challenge.kind) {
    case 'number': {
      const n = challenge.targetNumber ?? 20;
      overlays[String(n)] = {
        fill: '#F59E0B',
        opacity: 0.8,
        stroke: '#FFFFFF',
        pulse: true,
        badge: String(n),
        badgeColor: '#FFFFFF',
      };
      return overlays;
    }

    case 'any_double': {
      for (let n = 1; n <= 20; n++) {
        overlays[`S${n}`] = DARK_VEIL;
        overlays[`T${n}`] = DARK_VEIL;
        overlays[`D${n}`] = {
          fill: '#10B981',
          opacity: 0.9,
          stroke: '#FFFFFF',
          pulse: true,
        };
      }
      overlays['25'] = DARK_VEIL;
      overlays['Bull'] = {
        fill: '#10B981',
        opacity: 0.94,
        stroke: '#FFFFFF',
        pulse: true,
      };
      return overlays;
    }

    case 'any_treble': {
      for (let n = 1; n <= 20; n++) {
        overlays[`S${n}`] = DARK_VEIL;
        overlays[`D${n}`] = DARK_VEIL;
        overlays[`T${n}`] = {
          fill: '#A855F7',
          opacity: 0.92,
          stroke: '#FFFFFF',
          pulse: true,
        };
      }
      overlays['25'] = DARK_VEIL;
      overlays['Bull'] = DARK_VEIL;
      return overlays;
    }

    case 'specific_double': {
      const n = challenge.targetNumber ?? 20;
      overlays[`S${n}`] = DARK_VEIL;
      overlays[`T${n}`] = DARK_VEIL;
      overlays[`D${n}`] = {
        fill: '#F43F5E',
        opacity: 0.94,
        stroke: '#FFFFFF',
        pulse: true,
        badge: `D${n}`,
        badgeColor: '#FFFFFF',
      };
      return overlays;
    }

    case 'bull': {
      overlays['25'] = {
        fill: '#10B981',
        opacity: 0.84,
        stroke: '#FFFFFF',
        pulse: true,
      };
      overlays['Bull'] = {
        fill: '#F59E0B',
        opacity: 0.96,
        stroke: '#FFFFFF',
        pulse: true,
      };
      return overlays;
    }
  }
}

function playFeedbackSound(sound: HalveItFeedback['sound'], enabled: boolean): void {
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

export const HalveItGame: React.FC<GameModuleProps> = ({
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

  const [state, setState] = useState<HalveItState>(initialState);
  const [history, setHistory] = useState<HalveItHistoryEntry[]>([]);
  const [callout, setCallout] = useState<GameCallout | null>(null);

  const stateRef = useRef<HalveItState>(initialState);
  const turnStartRef = useRef<HalveItState>(initialState);
  const historyRef = useRef<HalveItHistoryEntry[]>([]);
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

  const triggerCallout = useCallback((next: HalveItFeedback['callout'], durationMs = 1750) => {
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
    (nextState: HalveItState) => {
      if (!nextState.isFinished || completedRef.current) return;
      completedRef.current = true;
      finishTimerRef.current = window.setTimeout(() => {
        onGameComplete(buildGameResult(nextState, startedAtRef.current));
      }, 950);
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
        triggerCallout(feedback.callout, nextState.visitWasHalved ? 2200 : 1700);
      }

      scheduleCompletionIfFinished(nextState);
    },
    onDartCorrected: (_dart, _prevDart, _dartIndex, visitThrows) => {
      let replayed = turnStartRef.current;
      let lastFeedback: HalveItFeedback = { sound: 'none', callout: null };

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

      const prevPlayer = current.players[current.activePlayerIndex];
      const prevChallenge = current.challenges[current.currentRoundIndex];
      const willHalveOnEarlyPull =
        current.visitDarts.length > 0 && !current.visitHadHit && !current.visitWasHalved;

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

      if (willHalveOnEarlyPull) {
        const halvedScore = Math.floor(prevPlayer.score / 2);
        soundEngine.playHazard(soundEnabled);
        triggerCallout(
          {
            title: '✂️ HALVED!',
            subtitle: `${prevPlayer.name} missed ${prevChallenge.label} — ${prevPlayer.score} → ${halvedScore} pts!`,
            accent: 'rose',
          },
          2100
        );
      } else if (!nextState.isFinished) {
        soundEngine.playTurnChange(soundEnabled);
        if (nextState.currentRoundIndex !== current.currentRoundIndex) {
          const nextChallenge = nextState.challenges[nextState.currentRoundIndex];
          triggerCallout(
            {
              title: `NEXT CHALLENGE: ${nextChallenge.label.toUpperCase()}`,
              subtitle: nextChallenge.description,
              accent: 'amber',
            },
            1700
          );
        }
      }

      if (nextState.isFinished) {
        scheduleCompletionIfFinished(nextState);
      }
    },
  });

  const activePlayer = state.players[state.activePlayerIndex];
  useActiveTurnTint(activePlayer?.colorHex);
  const currentChallenge = state.challenges[state.currentRoundIndex];
  const potentialHalvedScore = Math.floor(activePlayer.score / 2);
  const dartsRemaining = Math.max(0, 3 - state.visitDarts.length);

  const segmentOverlays = useMemo(
    () => buildChallengeOverlays(currentChallenge),
    [currentChallenge]
  );

  const rankByPlayerId = useMemo(() => {
    const sorted = [...state.players].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.timesHalved - b.timesHalved;
    });
    const map: Record<string, number> = {};
    sorted.forEach((p, idx) => {
      map[p.id] = idx + 1;
    });
    return map;
  }, [state.players]);

  return (
    <div className="space-y-4">
      {/* Horizontal Round Gauntlet Progression Bar */}
      <div className="card-matte rounded-2xl px-4 py-3">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="text-[11px] font-mono uppercase tracking-wider text-amber-300 font-bold flex items-center gap-1.5">
            <Scissors className="w-3.5 h-3.5" />
            Challenge Gauntlet ({state.preset === 'extended' ? 'Extended 10' : 'Classic 7'})
          </span>
          <span className="text-xs font-mono font-black text-white tabular-nums">
            ROUND {state.currentRoundIndex + 1} / {state.challenges.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {state.challenges.map((ch, idx) => {
            const isPast = idx < state.currentRoundIndex;
            const isCurrent = idx === state.currentRoundIndex;
            return (
              <div
                key={ch.id}
                className={cn(
                  'shrink-0 flex-1 min-w-[68px] rounded-xl border px-2.5 py-2 text-center transition-all',
                  isCurrent
                    ? 'bg-amber-500/25 border-amber-400 text-white shadow-[0_0_20px_-4px_rgba(245,158,11,0.65)] scale-[1.03]'
                    : isPast
                    ? 'bg-emerald-500/12 border-emerald-500/30 text-emerald-300/80'
                    : 'bg-slate-900/75 border-white/10 text-slate-400'
                )}
              >
                <div className="text-[9px] font-mono uppercase tracking-wider opacity-75 flex items-center justify-center gap-1">
                  {isPast ? (
                    <>
                      <Check className="w-2.5 h-2.5" /> R{idx + 1}
                    </>
                  ) : isCurrent ? (
                    'NOW'
                  ) : (
                    `R${idx + 1}`
                  )}
                </div>
                <div className="text-xs sm:text-sm font-black font-mono tracking-tight mt-0.5 truncate">
                  {ch.shortLabel}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* High-Drama Callout Banner */}
      <CalloutBanner callout={callout} />

      {/* Active Turn Spotlight + Live SAFE vs DANGER Status */}
      <div
        className="card-matte rounded-2xl p-4 sm:p-5 border-2 transition-colors"
        style={{
          borderColor: `${activePlayer.colorHex}85`,
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
                <span className="text-[11px] font-mono uppercase tracking-widest text-amber-300 font-bold">
                  On The Oche
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

          {/* Live Bank Readout */}
          <div className="text-right">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold">
              Current Bank
            </div>
            <div className="text-4xl sm:text-6xl font-black font-mono tabular-nums text-white leading-none">
              {activePlayer.score}
            </div>
            <div className="text-xs font-mono font-bold mt-1 tabular-nums">
              {state.visitWasHalved && state.preHalveScore !== null ? (
                <span className="text-rose-400">
                  ✂️ Slashed from {state.preHalveScore}
                </span>
              ) : state.visitPoints > 0 ? (
                <span className="text-emerald-400">+{state.visitPoints} banked this visit</span>
              ) : (
                <span className="text-slate-400">
                  If halved → {potentialHalvedScore} pts
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Active Challenge + SAFE / DANGER Live Status Row */}
        <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-12 gap-3 items-stretch">
          {/* Challenge Target */}
          <div className="sm:col-span-7 rounded-xl bg-amber-500/15 border-2 border-amber-400/50 px-4 py-3 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-500/25 border border-amber-400/50 flex items-center justify-center text-amber-300 shrink-0">
              <Target className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-mono uppercase tracking-widest text-amber-200/90 font-bold">
                Round {state.currentRoundIndex + 1} Challenge
              </div>
              <div className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight leading-none mt-0.5">
                {currentChallenge.label}
              </div>
              <div className="text-xs text-amber-100/80 mt-1 truncate">
                {currentChallenge.description}
              </div>
            </div>
          </div>

          {/* Live SAFE vs DANGER Jeopardy Status Badge */}
          <div
            className={cn(
              'sm:col-span-5 rounded-xl border-2 px-4 py-3 flex items-center gap-3 transition-all',
              state.visitHadHit
                ? 'bg-emerald-500/20 border-emerald-400/70 text-emerald-100 shadow-[0_0_24px_-6px_rgba(16,185,129,0.6)]'
                : state.visitWasHalved
                ? 'bg-rose-500/25 border-rose-400 text-rose-100 shadow-[0_0_24px_-6px_rgba(244,63,94,0.65)]'
                : dartsRemaining === 1
                ? 'bg-rose-500/25 border-rose-400 text-rose-100 animate-pulse shadow-[0_0_24px_-6px_rgba(244,63,94,0.65)]'
                : 'bg-rose-500/15 border-rose-400/50 text-rose-200'
            )}
          >
            {state.visitHadHit ? (
              <ShieldCheck className="w-8 h-8 text-emerald-300 shrink-0" />
            ) : state.visitWasHalved ? (
              <Scissors className="w-8 h-8 text-rose-300 shrink-0" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-rose-300 shrink-0" />
            )}

            <div className="min-w-0">
              <div className="text-base sm:text-lg font-black uppercase tracking-tight leading-tight">
                {state.visitHadHit
                  ? 'SAFE ✓'
                  : state.visitWasHalved
                  ? 'HALVED! ✂️'
                  : dartsRemaining === 1
                  ? 'LAST DART: HALVE RISK!'
                  : 'DANGER: MISS = HALVE!'}
              </div>
              <div className="text-xs font-mono opacity-90 mt-0.5 tabular-nums">
                {state.visitHadHit
                  ? 'Bank protected — keep scoring!'
                  : state.visitWasHalved && state.preHalveScore !== null
                  ? `Slashed ${state.preHalveScore} → ${activePlayer.score} pts`
                  : `${dartsRemaining} dart${dartsRemaining === 1 ? '' : 's'} left • Miss → ${potentialHalvedScore}`}
              </div>
            </div>
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
        {/* Interactive Dartboard with Highlighted Challenge Beds */}
        <div className="xl:col-span-7 card-matte rounded-2xl p-4 sm:p-6 flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">
              Valid Target:{' '}
              <span className="text-amber-300 font-black">{currentChallenge.label}</span>
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

          {/* Compact Next Challenge Preview */}
          <div className="w-full mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-xs font-mono text-slate-400">
            <span>
              Hit = <span className="text-emerald-300 font-bold">+Dart Score</span>
            </span>
            {state.currentRoundIndex < state.challenges.length - 1 ? (
              <span>
                Up Next:{' '}
                <span className="text-white font-bold">
                  {state.challenges[state.currentRoundIndex + 1].label}
                </span>
              </span>
            ) : (
              <span className="text-amber-300 font-bold">FINAL ROUND!</span>
            )}
          </div>
        </div>

        {/* Multiplayer Scoreboard */}
        <div className="xl:col-span-5 grid grid-cols-2 xl:grid-cols-1 gap-3">
          {state.players.map((player, idx) => {
            const isActive = idx === state.activePlayerIndex && !state.isFinished;
            const rank = rankByPlayerId[player.id];
            const halvePreview = Math.floor(player.score / 2);

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
                        {rank === 1 && (
                          <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                        )}
                        <span className="text-base sm:text-lg font-black text-white truncate">
                          {player.name}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                        <span>#{rank}</span>
                        <span>•</span>
                        <span>{player.challengeHits} hits</span>
                        {player.timesHalved > 0 ? (
                          <span className="text-rose-400 font-bold">
                            ✂️ ×{player.timesHalved}
                          </span>
                        ) : (
                          <span className="text-emerald-400/90 font-semibold">Unscathed</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-3xl sm:text-4xl font-black font-mono tabular-nums text-white leading-none">
                      {player.score}
                    </div>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mt-1 tabular-nums">
                      {isActive ? (
                        <span className="text-amber-300 font-bold">UP NOW</span>
                      ) : (
                        <span>½ = {halvePreview}</span>
                      )}
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
