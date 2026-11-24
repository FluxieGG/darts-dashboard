import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameModuleProps } from '../../types/games';
import { SvgDartboard, SegmentOverlayStyle } from '../../components/dartboard/SvgDartboard';
import { DartPlotOverlay } from '../../components/dartboard/DartPlotOverlay';
import { CalloutBanner, GameCallout, VisitPillsStrip } from '../components/ArcadePrimitives';
import { useGameBoardEvents } from '../hooks/useGameBoardEvents';
import { useActiveTurnTint } from '../hooks/useActiveTurnTint';
import { soundEngine } from '../utils/soundEngine';
import { injectBoardClickThrow } from '../utils/dartHelpers';
import { gameEventBus } from '../../services/gameEventBus';
import { cn } from '../../lib/utils';
import { Dices, Crown, Target, Sparkles } from 'lucide-react';
import {
  advanceTurn,
  applyDartToState,
  buildGameResult,
  buildVisualBoardSquares,
  createInitialState,
  squareToGridCoords,
} from './engine';
import { BoardLink, SnakesAndLaddersState, SnakesHistorySnapshot, SnakesSoundCue } from './types';

function playSoundCue(cue: SnakesSoundCue, enabled: boolean): void {
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

/**
 * Generates SVG geometry for a glowing emerald ladder (2 parallel rails + rungs)
 */
function buildLadderGeometry(link: BoardLink, gridSize: number) {
  const start = squareToGridCoords(link.from, gridSize);
  const end = squareToGridCoords(link.to, gridSize);
  const dx = end.cx - start.cx;
  const dy = end.cy - start.cy;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  // Perpendicular unit vector
  const px = -uy;
  const py = ux;
  const halfWidth = gridSize === 8 ? 11 : 10;

  // Slightly inset from exact square centers so tile numbers stay readable
  const inset = 16;
  const x1 = start.cx + ux * inset;
  const y1 = start.cy + uy * inset;
  const x2 = end.cx - ux * inset;
  const y2 = end.cy - uy * inset;

  const rail1 = {
    x1: x1 + px * halfWidth,
    y1: y1 + py * halfWidth,
    x2: x2 + px * halfWidth,
    y2: y2 + py * halfWidth,
  };
  const rail2 = {
    x1: x1 - px * halfWidth,
    y1: y1 - py * halfWidth,
    x2: x2 - px * halfWidth,
    y2: y2 - py * halfWidth,
  };

  const innerLen = Math.max(20, length - inset * 2);
  const rungCount = Math.max(3, Math.floor(innerLen / 28));
  const rungs: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (let i = 1; i <= rungCount; i++) {
    const t = i / (rungCount + 1);
    const rx = x1 + (x2 - x1) * t;
    const ry = y1 + (y2 - y1) * t;
    rungs.push({
      x1: rx + px * halfWidth,
      y1: ry + py * halfWidth,
      x2: rx - px * halfWidth,
      y2: ry - py * halfWidth,
    });
  }

  return { rail1, rail2, rungs, start, end };
}

/**
 * Generates an organic S-curved cubic Bezier SVG path for a neon crimson snake
 */
function buildSnakeGeometry(link: BoardLink, gridSize: number, index: number) {
  const head = squareToGridCoords(link.from, gridSize);
  const tail = squareToGridCoords(link.to, gridSize);
  const dx = tail.cx - head.cx;
  const dy = tail.cy - head.cy;
  const length = Math.hypot(dx, dy) || 1;
  const px = -dy / length;
  const py = dx / length;

  const swing = (index % 2 === 0 ? 1 : -1) * Math.min(58, Math.max(28, length * 0.22));
  const cp1x = head.cx + dx * 0.32 + px * swing;
  const cp1y = head.cy + dy * 0.32 + py * swing;
  const cp2x = head.cx + dx * 0.68 - px * swing;
  const cp2y = head.cy + dy * 0.68 - py * swing;

  const path = `M ${head.cx.toFixed(1)} ${head.cy.toFixed(1)} C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${tail.cx.toFixed(1)} ${tail.cy.toFixed(1)}`;
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

  return { path, head, tail, angleDeg };
}

export const SnakesAndLaddersGame: React.FC<GameModuleProps> = ({
  players,
  config,
  soundEnabled,
  isBoardConnected,
  boardStatus,
  onGameComplete,
  registerController,
  onCanUndoChange,
}) => {
  const [state, setState] = useState<SnakesAndLaddersState>(() =>
    createInitialState(players, config)
  );
  const [history, setHistory] = useState<SnakesHistorySnapshot[]>([]);
  const [callout, setCallout] = useState<GameCallout | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;

  const turnStartStateRef = useRef<SnakesAndLaddersState>(state);
  const historyRef = useRef<SnakesHistorySnapshot[]>(history);
  historyRef.current = history;

  const startedAtRef = useRef<number>(Date.now());
  const completedRef = useRef<boolean>(false);
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
      }, 2100);
    },
    []
  );

  const scheduleWinCompletion = useCallback(
    (finishedState: SnakesAndLaddersState) => {
      if (completedRef.current) return;
      completedRef.current = true;
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
    completedRef.current = false;
    const nextHistory = historyRef.current.slice(0, -1);
    const prev = historyRef.current[historyRef.current.length - 1];
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    stateRef.current = prev.state;
    turnStartStateRef.current = prev.turnStartState;
    setState(prev.state);
    setCallout(null);
    gameEventBus.resetVisitBuffer(prev.state.currentVisit.map((v) => v.dart));
  }, []);

  const handleRestart = useCallback(() => {
    clearTimers();
    completedRef.current = false;
    const fresh = createInitialState(players, config);
    startedAtRef.current = Date.now();
    stateRef.current = fresh;
    turnStartStateRef.current = fresh;
    historyRef.current = [];
    setHistory([]);
    setState(fresh);
    setCallout(null);
    gameEventBus.resetVisitBuffer([]);
  }, [clearTimers, players, config]);

  useEffect(() => {
    registerController({
      undoLastAction: handleUndo,
      canUndo: () => historyRef.current.length > 0,
      restartMatch: handleRestart,
    });
  }, [registerController, handleUndo, handleRestart]);

  useEffect(() => {
    onCanUndoChange?.(history.length > 0);
  }, [history.length, onCanUndoChange]);

  const handleAdvanceTurn = useCallback(() => {
    const current = stateRef.current;
    if (current.isFinished) return;

    const snapshot: SnakesHistorySnapshot = {
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

      const snapshot: SnakesHistorySnapshot = {
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
        completedRef.current = false;
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

  const visualSquares = useMemo(
    () => buildVisualBoardSquares(state.gridSize),
    [state.gridSize]
  );

  const linkByStart = useMemo(() => {
    const map = new Map<number, BoardLink>();
    for (const l of state.links) {
      map.set(l.from, l);
    }
    return map;
  }, [state.links]);

  const ladders = useMemo(
    () => state.links.filter((l) => l.type === 'ladder'),
    [state.links]
  );
  const snakes = useMemo(
    () => state.links.filter((l) => l.type === 'snake'),
    [state.links]
  );

  // Group on-board players by square so shared tiles offset tokens cleanly
  const playersBySquare = useMemo(() => {
    const map = new Map<number, number[]>();
    state.players.forEach((ps, idx) => {
      if (ps.position > 0) {
        const list = map.get(ps.position) || [];
        list.push(idx);
        map.set(ps.position, list);
      }
    });
    return map;
  }, [state.players]);

  const startPadPlayers = useMemo(
    () => state.players.filter((ps) => ps.position === 0),
    [state.players]
  );

  const activePlayerState = state.players[state.activePlayerIndex];
  useActiveTurnTint(activePlayerState?.player.colorHex);
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

  // Subtle dartboard overlays highlighting Bullseye turbo targets
  const dartboardOverlays = useMemo<Record<string, SegmentOverlayStyle>>(
    () => ({
      Bull: { fill: '#A855F7', opacity: 0.85, stroke: '#FFFFFF', pulse: true },
      '25': { fill: '#38BDF8', opacity: 0.7, stroke: '#BAE6FD' },
    }),
    []
  );

  if (!activePlayerState) return null;

  const remainingToFinish = Math.max(0, state.boardSize - activePlayerState.position);
  const viewBoxSize = state.gridSize * 100;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* TOP SPOTLIGHT BAR (8ft glanceable) */}
      <div
        className="card-matte rounded-2xl p-5 sm:p-6 border-2 transition-colors"
        style={{
          borderColor: `${activePlayerState.player.colorHex}85`,
          boxShadow: `0 0 36px -8px ${activePlayerState.player.colorHex}60`,
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center font-black text-3xl sm:text-4xl text-slate-950 shrink-0 shadow-lg"
              style={{ backgroundColor: activePlayerState.player.colorHex }}
            >
              {activePlayerState.player.avatarInitial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-sm sm:text-base font-mono uppercase tracking-widest text-emerald-400 font-black">
                  Round {state.round} • Active Turn
                </span>
                <span className="text-sm sm:text-base font-mono font-bold px-3 py-0.5 rounded-full bg-white/[0.08] text-slate-200 border border-white/15">
                  {state.exactFinish ? 'Exact Finish' : 'Any Overshoot'}
                </span>
              </div>
              <h3 className="text-4xl sm:text-5xl font-black text-white tracking-tight truncate mt-1 leading-none">
                {activePlayerState.player.name}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-5 shrink-0">
            <div className="text-right">
              <div className="text-sm sm:text-base font-mono font-bold uppercase tracking-wider text-slate-400">
                Current Square
              </div>
              <div className="text-6xl sm:text-7xl font-black font-mono tabular-nums text-white leading-none mt-0.5">
                {activePlayerState.position === 0 ? 'START' : `SQ ${activePlayerState.position}`}
              </div>
            </div>
            <div className="h-14 w-px bg-white/15" />
            <div className="text-right">
              <div className="text-sm sm:text-base font-mono font-bold uppercase tracking-wider text-slate-400">
                To Win
              </div>
              <div className="text-5xl sm:text-6xl font-black font-mono tabular-nums text-emerald-400 leading-none mt-0.5">
                {remainingToFinish}
              </div>
            </div>
          </div>
        </div>

        {/* Big Step Value Guide Strip */}
        <div className="mt-4 pt-3.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-sm sm:text-base font-mono">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-300 font-black uppercase tracking-wider mr-1">Steps:</span>
            <span className="px-3 py-1 rounded-lg bg-slate-800/95 border border-white/15 text-slate-100 font-bold">
              Single: 1–5
            </span>
            <span className="px-3 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/45 text-emerald-200 font-black">
              Double: +2 (3–7)
            </span>
            <span className="px-3 py-1 rounded-lg bg-amber-500/20 border border-amber-400/45 text-amber-200 font-black">
              Treble: +4 (5–9)
            </span>
            <span className="px-3 py-1 rounded-lg bg-sky-500/20 border border-sky-400/45 text-sky-200 font-black">
              25: +6
            </span>
            <span className="px-3 py-1 rounded-lg bg-purple-500/25 border border-purple-400/55 text-purple-100 font-black">
              Bull: +10 Turbo
            </span>
          </div>
          <span className="text-slate-400 font-bold hidden lg:inline">
            Base = ⌈seg ÷ 4⌉
          </span>
        </div>
      </div>

      {/* CALLOUT BANNER */}
      <CalloutBanner callout={callout} />

      {/* MAIN STAGE: Neon Snakes & Ladders Board + Paired Dartboard & Player Progress */}
      <div className="space-y-5">
        {/* CENTERPIECE: Large Crisp Neon Snakes & Ladders Board */}
        <div className="card-matte rounded-2xl p-4 sm:p-5 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2.5">
              <Dices className="w-6 h-6 text-emerald-400" />
              <span className="text-lg sm:text-xl font-black uppercase tracking-wider text-white">
                {state.boardSize}-Square Neon Board
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm sm:text-base font-mono font-bold">
              <span className="flex items-center gap-2 text-emerald-300">
                <span className="w-3.5 h-3.5 rounded-sm bg-emerald-400 inline-block" />
                {ladders.length} Ladders
              </span>
              <span className="flex items-center gap-2 text-rose-300">
                <span className="w-3.5 h-3.5 rounded-full bg-rose-500 inline-block" />
                {snakes.length} Snakes
              </span>
            </div>
          </div>

          {/* Exact Aspect-Square Board Container */}
          <div className="relative w-full max-w-[740px] mx-auto aspect-square rounded-2xl overflow-hidden border-2 border-white/15 bg-[#0A101B] shadow-[inset_0_0_40px_rgba(0,0,0,0.85)]">
            {/* Tile Grid */}
            <div
              className="grid w-full h-full"
              style={{
                gridTemplateColumns: `repeat(${state.gridSize}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${state.gridSize}, minmax(0, 1fr))`,
              }}
            >
              {visualSquares.map((sq) => {
                const { row, col } = squareToGridCoords(sq, state.gridSize);
                const isAlt = (row + col) % 2 === 0;
                const link = linkByStart.get(sq);
                const isFinish = sq === state.boardSize;
                const isStart = sq === 1;
                const isLastFinal = state.lastMove?.finalSquare === sq;

                return (
                  <div
                    key={sq}
                    className={cn(
                      'relative border-[0.5px] border-white/[0.08] p-1 sm:p-1.5 flex flex-col justify-between select-none transition-colors',
                      isFinish
                        ? 'bg-gradient-to-br from-amber-500/35 via-amber-500/15 to-emerald-500/25 border-amber-400/60'
                        : link?.type === 'ladder'
                        ? 'bg-emerald-500/18 border-emerald-400/30'
                        : link?.type === 'snake'
                        ? 'bg-rose-500/18 border-rose-400/30'
                        : isAlt
                        ? 'bg-[#111927]'
                        : 'bg-[#162033]',
                      isLastFinal && 'ring-2 ring-inset ring-white/60'
                    )}
                  >
                    <div className="flex items-start justify-between gap-0.5 leading-none">
                      <span
                        className={cn(
                          'font-mono font-black tabular-nums leading-none text-sm sm:text-base',
                          isFinish
                            ? 'text-amber-300'
                            : link?.type === 'ladder'
                            ? 'text-emerald-200'
                            : link?.type === 'snake'
                            ? 'text-rose-200'
                            : isStart
                            ? 'text-sky-300'
                            : 'text-slate-300/90'
                        )}
                      >
                        {sq}
                      </span>

                      {isFinish && (
                        <Crown className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300 shrink-0" />
                      )}
                      {link?.type === 'ladder' && (
                        <span className="text-xs sm:text-sm font-mono font-black text-emerald-300 leading-none">
                          ▲{link.to}
                        </span>
                      )}
                      {link?.type === 'snake' && (
                        <span className="text-xs sm:text-sm font-mono font-black text-rose-300 leading-none">
                          ▼{link.to}
                        </span>
                      )}
                    </div>

                    {isStart && (
                      <span className="text-xs sm:text-sm font-mono font-black uppercase tracking-wider text-sky-300 leading-none">
                        GO
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* SVG Overlay: Glowing Emerald Ladders & Crimson Curved Snakes */}
            <svg
              viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
              className="absolute inset-0 w-full h-full pointer-events-none"
            >
              <defs>
                <filter id="snakesLadderGlow" x="-25%" y="-25%" width="150%" height="150%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="snakesCrimsonGlow" x="-25%" y="-25%" width="150%" height="150%">
                  <feGaussianBlur stdDeviation="4.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Emerald Ladders */}
              {ladders.map((link) => {
                const geom = buildLadderGeometry(link, state.gridSize);
                const isTriggered = state.lastMove?.linkId === link.id;
                return (
                  <g
                    key={link.id}
                    opacity={isTriggered ? 1 : 0.86}
                    filter="url(#snakesLadderGlow)"
                  >
                    <circle
                      cx={geom.start.cx}
                      cy={geom.start.cy}
                      r={isTriggered ? 20 : 14}
                      fill="#10B981"
                      fillOpacity={isTriggered ? 0.35 : 0.22}
                      stroke="#34D399"
                      strokeWidth="2.5"
                    />
                    {geom.rungs.map((r, rIdx) => (
                      <line
                        key={rIdx}
                        x1={r.x1}
                        y1={r.y1}
                        x2={r.x2}
                        y2={r.y2}
                        stroke="#6EE7B7"
                        strokeWidth={isTriggered ? '5.5' : '4.5'}
                        strokeLinecap="round"
                      />
                    ))}
                    <line
                      x1={geom.rail1.x1}
                      y1={geom.rail1.y1}
                      x2={geom.rail1.x2}
                      y2={geom.rail1.y2}
                      stroke="#10B981"
                      strokeWidth={isTriggered ? '7.5' : '6'}
                      strokeLinecap="round"
                    />
                    <line
                      x1={geom.rail2.x1}
                      y1={geom.rail2.y1}
                      x2={geom.rail2.x2}
                      y2={geom.rail2.y2}
                      stroke="#10B981"
                      strokeWidth={isTriggered ? '7.5' : '6'}
                      strokeLinecap="round"
                    />
                    <circle cx={geom.end.cx} cy={geom.end.cy} r={8.5} fill="#34D399" />
                  </g>
                );
              })}

              {/* Crimson Curved Snakes */}
              {snakes.map((link, idx) => {
                const geom = buildSnakeGeometry(link, state.gridSize, idx);
                const isTriggered = state.lastMove?.linkId === link.id;
                return (
                  <g
                    key={link.id}
                    opacity={isTriggered ? 1 : 0.88}
                    filter="url(#snakesCrimsonGlow)"
                  >
                    <path
                      d={geom.path}
                      fill="none"
                      stroke="#F43F5E"
                      strokeWidth={isTriggered ? '15' : '12'}
                      strokeLinecap="round"
                    />
                    <path
                      d={geom.path}
                      fill="none"
                      stroke="#FDA4AF"
                      strokeWidth="4.5"
                      strokeDasharray="7 11"
                      strokeLinecap="round"
                    />
                    <circle cx={geom.tail.cx} cy={geom.tail.cy} r={6} fill="#FB7185" />
                    <g transform={`translate(${geom.head.cx}, ${geom.head.cy}) rotate(${geom.angleDeg})`}>
                      <ellipse
                        cx="0"
                        cy="0"
                        rx="15"
                        ry="12"
                        fill="#E11D48"
                        stroke="#FDA4AF"
                        strokeWidth="2.5"
                      />
                      <circle cx="-3" cy="-4.5" r="2.8" fill="#FEF08A" />
                      <circle cx="-3" cy="4.5" r="2.8" fill="#FEF08A" />
                    </g>
                  </g>
                );
              })}
            </svg>

            {/* Oversized Glowing Animated Player Tokens */}
            <div className="absolute inset-0 pointer-events-none">
              {state.players.map((ps, idx) => {
                if (ps.position <= 0) return null;
                const { row, col } = squareToGridCoords(ps.position, state.gridSize);
                const group = playersBySquare.get(ps.position) || [idx];
                const slot = group.indexOf(idx);
                const count = group.length;
                const isActive = idx === state.activePlayerIndex;

                let offsetX = 0;
                let offsetY = 0;
                if (count > 1) {
                  const angle = (slot / count) * Math.PI * 2 - Math.PI / 4;
                  const radiusPx = state.gridSize === 10 ? 12 : 16;
                  offsetX = Math.cos(angle) * radiusPx;
                  offsetY = Math.sin(angle) * radiusPx;
                }

                const leftPct = ((col + 0.5) / state.gridSize) * 100;
                const topPct = ((row + 0.5) / state.gridSize) * 100;

                return (
                  <div
                    key={ps.player.id}
                    className={cn(
                      'absolute transition-all duration-500 ease-out flex items-center justify-center',
                      isActive ? 'z-30' : 'z-20'
                    )}
                    style={{
                      left: `${leftPct}%`,
                      top: `${topPct}%`,
                      transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`,
                    }}
                  >
                    {isActive && (
                      <span
                        className="absolute inset-[-8px] rounded-full animate-ping opacity-65"
                        style={{ backgroundColor: ps.player.colorHex }}
                      />
                    )}
                    <div
                      className={cn(
                        'relative rounded-full flex items-center justify-center font-black text-slate-950 border-[3px]',
                        state.gridSize === 10
                          ? 'w-9 h-9 sm:w-11 sm:h-11 text-base sm:text-lg'
                          : 'w-10 h-10 sm:w-12 sm:h-12 text-lg sm:text-xl',
                        isActive ? 'border-white scale-115' : 'border-slate-950/90'
                      )}
                      style={{
                        backgroundColor: ps.player.colorHex,
                        boxShadow: isActive
                          ? `0 0 22px ${ps.player.colorHex}, 0 4px 14px rgba(0,0,0,0.9)`
                          : `0 0 12px ${ps.player.colorHex}80, 0 3px 10px rgba(0,0,0,0.85)`,
                      }}
                    >
                      {ps.player.avatarInitial}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Start Pad Staging Dock (when any player is still on Square 0) */}
          {startPadPlayers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2.5 px-4 py-2.5 rounded-xl bg-slate-900/85 border border-white/10">
              <span className="text-sm sm:text-base font-mono uppercase tracking-wider text-sky-300 font-black">
                Start Pad (SQ 0):
              </span>
              {startPadPlayers.map((ps) => (
                <span
                  key={ps.player.id}
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm sm:text-base font-bold text-white bg-slate-950/90 border border-white/15"
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full"
                    style={{ backgroundColor: ps.player.colorHex }}
                  />
                  {ps.player.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* LOWER STAGE: Live SvgDartboard (560px) + Visit Strip & Clean Player Progress Strip */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Live Board Plot / Click-to-Throw SvgDartboard */}
          <div className="lg:col-span-7 card-matte rounded-2xl p-4 sm:p-5 space-y-3 flex flex-col items-center">
            <div className="w-full flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-purple-400" />
                <span className="text-base sm:text-lg font-black uppercase tracking-wider text-white">
                  {isBoardConnected ? 'Live Board Plot' : 'Interactive Dartboard'}
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400/50 text-sm sm:text-base font-mono font-bold text-purple-200">
                <Sparkles className="w-4 h-4" />
                Bull +10 • 25 +6
              </span>
            </div>

            <SvgDartboard
              size={560}
              segmentOverlays={dartboardOverlays}
              onBoardClick={!isBoardConnected ? injectBoardClickThrow : undefined}
            >
              <DartPlotOverlay
                sessionThrows={[]}
                currentVisitThrows={activeVisitDarts}
                mode="dots"
              />
            </SvgDartboard>
          </div>

          {/* Visit Strip + Clean Player Progress Strip */}
          <div className="lg:col-span-5 space-y-4">
            {/* 3-Dart Visit Strip */}
            <div className="card-matte rounded-2xl p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm sm:text-base font-mono uppercase tracking-wider text-slate-300 font-black">
                  Current Visit
                </span>
                <span className="text-sm sm:text-base font-mono font-black text-emerald-400 tabular-nums">
                  +{state.currentVisit.reduce((sum, v) => sum + v.steps, 0)} steps
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

            {/* Clean Player Progress Strip */}
            <div className="card-matte rounded-2xl p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm sm:text-base font-mono uppercase tracking-wider text-slate-300 font-black">
                  Racers ({state.players.length})
                </span>
                <span className="text-sm sm:text-base font-mono font-bold text-slate-400">
                  First to SQ {state.boardSize}
                </span>
              </div>

              <div className="space-y-3">
                {state.players.map((ps, idx) => {
                  const isActive = idx === state.activePlayerIndex;
                  const progressPct = Math.min(100, Math.round((ps.position / state.boardSize) * 100));
                  return (
                    <div
                      key={ps.player.id}
                      className={cn(
                        'rounded-2xl p-3.5 border-2 transition-all',
                        isActive
                          ? 'bg-slate-900/95'
                          : 'bg-slate-950/65 border-white/[0.08]'
                      )}
                      style={
                        isActive
                          ? {
                              borderColor: ps.player.colorHex,
                              boxShadow: `0 0 22px -6px ${ps.player.colorHex}75`,
                            }
                          : undefined
                      }
                    >
                      <div className="flex items-center justify-between gap-2.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-11 h-11 rounded-full flex items-center justify-center font-black text-lg text-slate-950 shrink-0"
                            style={{ backgroundColor: ps.player.colorHex }}
                          >
                            {ps.player.avatarInitial}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-lg sm:text-xl font-black text-white truncate">
                                {ps.player.name}
                              </span>
                              {isActive && (
                                <span className="text-sm font-mono font-black px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 uppercase shrink-0">
                                  UP
                                </span>
                              )}
                            </div>
                            <div className="text-sm font-mono font-bold text-slate-300 tabular-nums">
                              🪜 {ps.laddersClimbed} • 🐍 {ps.snakesBitten}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-3xl sm:text-4xl font-black font-mono tabular-nums text-white leading-none">
                            {ps.position}
                            <span className="text-sm sm:text-base text-slate-400 font-bold">
                              /{state.boardSize}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-2.5 h-2.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${progressPct}%`,
                            backgroundColor: ps.player.colorHex,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
