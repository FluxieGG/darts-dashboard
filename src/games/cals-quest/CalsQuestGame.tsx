import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameModuleProps } from '../../types/games';
import { SvgDartboard, SegmentOverlayStyle } from '../../components/dartboard/SvgDartboard';
import { DartPlotOverlay } from '../../components/dartboard/DartPlotOverlay';
import { useGameBoardEvents } from '../hooks/useGameBoardEvents';
import { useActiveTurnTint } from '../hooks/useActiveTurnTint';
import { soundEngine } from '../utils/soundEngine';
import { injectBoardClickThrow } from '../utils/dartHelpers';
import { CalloutBanner, GameCallout, VisitPillsStrip } from '../components/ArcadePrimitives';
import { CalsQuestState, RelicId } from './types';
import {
  advanceCalsQuestTurn,
  applyDartToCalsQuest,
  buildCalsQuestResult,
  createInitialCalsQuestState,
  LEFT_HALF_WEDGES,
  RELIC_CATALOG,
  RIGHT_HALF_WEDGES,
} from './engine';
import {
  Compass,
  Crosshair,
  Flame,
  Heart,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Zap,
} from 'lucide-react';
import { cn } from '../../lib/utils';

const RELIC_ICON_MAP: Record<RelicId, React.ComponentType<{ className?: string }>> = {
  'flame-edge': Flame,
  vampiric: Heart,
  buckler: Shield,
  'sniper-scope': Crosshair,
  dragonbane: Swords,
  phoenix: Sparkles,
};

const RELIC_CHIP_STYLES: Record<RelicId, string> = {
  'flame-edge': 'bg-amber-500/20 border-amber-400/60 text-amber-200 shadow-[0_0_16px_-4px_rgba(245,158,11,0.55)]',
  vampiric: 'bg-rose-500/20 border-rose-400/60 text-rose-200 shadow-[0_0_16px_-4px_rgba(244,63,94,0.55)]',
  buckler: 'bg-sky-500/20 border-sky-400/60 text-sky-200 shadow-[0_0_16px_-4px_rgba(56,189,248,0.55)]',
  'sniper-scope': 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200 shadow-[0_0_16px_-4px_rgba(16,185,129,0.55)]',
  dragonbane: 'bg-purple-500/20 border-purple-400/60 text-purple-200 shadow-[0_0_16px_-4px_rgba(168,85,247,0.55)]',
  phoenix: 'bg-orange-500/20 border-orange-400/60 text-orange-200 shadow-[0_0_16px_-4px_rgba(249,115,22,0.55)]',
};

export const CalsQuestGame: React.FC<GameModuleProps> = ({
  players,
  config,
  soundEnabled,
  isBoardConnected,
  boardStatus,
  onGameComplete,
  registerController,
  onCanUndoChange,
}) => {
  const [state, setState] = useState<CalsQuestState>(() =>
    createInitialCalsQuestState(players, config)
  );
  const [historyLen, setHistoryLen] = useState(0);
  const [callout, setCallout] = useState<GameCallout | null>(null);

  const stateRef = useRef(state);
  const turnStartRef = useRef(state);
  const historyRef = useRef<CalsQuestState[]>([]);
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
      calloutTimerRef.current = window.setTimeout(() => setCallout(null), 1900);
    },
    []
  );

  const scheduleFinish = useCallback(
    (finalState: CalsQuestState) => {
      if (completedRef.current) return;
      completedRef.current = true;
      completeTimerRef.current = window.setTimeout(() => {
        onGameComplete(buildCalsQuestResult(finalState, startedAtRef.current));
      }, 800);
    },
    [onGameComplete]
  );

  const playSoundCue = useCallback(
    (cue: 'dartHit' | 'bonusHit' | 'jackpot' | 'hazard' | 'elimination') => {
      if (cue === 'jackpot') soundEngine.playJackpot(soundEnabled);
      else if (cue === 'bonusHit') soundEngine.playBonusHit(soundEnabled);
      else if (cue === 'hazard') soundEngine.playHazard(soundEnabled);
      else if (cue === 'elimination') soundEngine.playElimination(soundEnabled);
      else soundEngine.playDartHit(soundEnabled);
    },
    [soundEnabled]
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
    const fresh = createInitialCalsQuestState(players, config);
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
      const { nextState, feedback } = applyDartToCalsQuest(current, dart);
      stateRef.current = nextState;
      setState(nextState);
      setHistoryLen(historyRef.current.length);

      playSoundCue(feedback.sound);
      if (feedback.title) {
        showCallout(feedback.title, feedback.subtitle, feedback.accent || 'purple');
      }
      if (nextState.isFinished) {
        scheduleFinish(nextState);
      }
    },
    onDartCorrected: (_dart, _prev, _idx, visitThrows) => {
      let replay = turnStartRef.current;
      for (const d of visitThrows) {
        replay = applyDartToCalsQuest(replay, d).nextState;
      }
      stateRef.current = replay;
      setState(replay);
      if (replay.isFinished) scheduleFinish(replay);
    },
    onVisitCompleted: () => {
      const current = stateRef.current;
      if (current.isFinished) return;
      if (current.visitDarts.length === 0 && !current.pendingPathChoice) return;

      historyRef.current.push(current);
      const { nextState, counterCallout } = advanceCalsQuestTurn(current);
      stateRef.current = nextState;
      turnStartRef.current = nextState;
      setState(nextState);
      setHistoryLen(historyRef.current.length);

      if (counterCallout) {
        playSoundCue(counterCallout.sound);
        if (counterCallout.title) {
          showCallout(
            counterCallout.title,
            counterCallout.subtitle,
            counterCallout.accent || 'rose'
          );
        }
      } else {
        soundEngine.playTurnChange(soundEnabled);
      }

      if (nextState.isFinished) {
        scheduleFinish(nextState);
      }
    },
  });

  const segmentOverlays = useMemo<Record<string, SegmentOverlayStyle>>(() => {
    const overlays: Record<string, SegmentOverlayStyle> = {};

    if (state.phase === 'path-choice') {
      LEFT_HALF_WEDGES.forEach((n) => {
        overlays[String(n)] = {
          fill: state.claimedPathSide === 'left' ? '#10B981' : '#0EA5E9',
          opacity: state.claimedPathSide === 'right' ? 0.22 : 0.72,
          stroke: '#34D399',
          pulse: state.claimedPathSide === null,
          badge: n === 11 ? 'LEFT' : undefined,
        };
      });
      RIGHT_HALF_WEDGES.forEach((n) => {
        overlays[String(n)] = {
          fill: state.claimedPathSide === 'right' ? '#A855F7' : '#F59E0B',
          opacity: state.claimedPathSide === 'left' ? 0.22 : 0.72,
          stroke: '#C084FC',
          pulse: state.claimedPathSide === null,
          badge: n === 6 ? 'RIGHT' : undefined,
        };
      });
      return overlays;
    }

    // Combat Phase overlays
    state.boss.targetWedges.forEach((w) => {
      const isWeakSpot = state.boss.weakSpotWedge === w;
      overlays[String(w)] = isWeakSpot
        ? {
            fill: '#A855F7',
            opacity: 0.88,
            stroke: '#FDE047',
            pulse: true,
            badge: '2x',
            badgeColor: '#FEF08A',
          }
        : {
            fill: '#F43F5E',
            opacity: 0.72,
            stroke: '#FDA4AF',
            badge: state.boss.armor > 0 ? '🛡️' : '⚔️',
          };
    });

    state.minions.forEach((m) => {
      if (m.hp <= 0) return;
      overlays[String(m.wedge)] = {
        fill: '#F59E0B',
        opacity: 0.82,
        stroke: '#FEF3C7',
        pulse: true,
        badge: '👾',
      };
    });

    state.cursedWedges.forEach((w) => {
      overlays[String(w)] = {
        fill: '#7E22CE',
        opacity: 0.82,
        stroke: '#F43F5E',
        pulse: true,
        badge: '☠️',
      };
    });

    // Healing Bulls
    overlays['25'] = {
      fill: '#10B981',
      opacity: 0.85,
      stroke: '#A7F3D0',
    };
    overlays['Bull'] = {
      fill: '#38BDF8',
      opacity: 0.94,
      stroke: '#FFFFFF',
      pulse: true,
    };

    return overlays;
  }, [state.phase, state.claimedPathSide, state.boss, state.minions, state.cursedWedges]);

  const bossHpPct = Math.max(0, Math.min(100, (state.boss.hp / state.boss.maxHp) * 100));
  const livingMinions = state.minions.filter((m) => m.hp > 0);
  const dartTones = state.visitOutcomes.map((o) => o.tone);
  const dartLabels = state.visitOutcomes.map((o) => o.label);
  const totalPartyDamage = state.players.reduce((sum, p) => sum + p.damageDealt, 0);

  return (
    <div className="space-y-4">
      <CalloutBanner callout={callout} />

      {/* Top Dungeon Bar: Room Progress + Big Party Hearts + Equipped Relics */}
      <div className="card-matte rounded-2xl p-4 sm:p-5 border-2 border-purple-500/35 bg-gradient-to-r from-[#121626] via-[#151D2F] to-[#1C1428]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Room Stepper */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5 text-sm sm:text-base font-mono uppercase tracking-widest text-purple-300 font-black">
              <Swords className="w-5 h-5 text-amber-400 shrink-0" />
              <span>
                Dungeon Floor {state.roomNumber} / {state.maxRooms}
              </span>
              <span className="px-3 py-0.5 rounded-full bg-white/10 text-sm text-slate-100 font-bold">
                {state.difficulty === 'heroic' ? 'HEROIC' : 'NORMAL'} •{' '}
                {state.damageMode === 'rpg' ? 'RPG BARS' : 'RAW DMG'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((r) => {
                const cleared = r < state.roomNumber || (r === 5 && state.victory);
                const current = r === state.roomNumber && !state.victory;
                return (
                  <div
                    key={r}
                    className={cn(
                      'h-3.5 w-14 sm:w-16 rounded-full transition-all',
                      cleared
                        ? 'bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.75)]'
                        : current
                        ? r === 5
                          ? 'bg-amber-400 animate-pulse shadow-[0_0_14px_rgba(245,158,11,0.85)]'
                          : 'bg-purple-400 animate-pulse shadow-[0_0_14px_rgba(168,85,247,0.85)]'
                        : 'bg-slate-800 border border-white/15'
                    )}
                  />
                );
              })}
            </div>
          </div>

          {/* Big Party Hearts Strip */}
          <div className="text-right ml-auto">
            <div className="text-sm sm:text-base font-mono uppercase tracking-widest text-rose-300 font-black">
              Party Hearts
            </div>
            <div className="flex items-center justify-end gap-1.5 mt-1.5">
              {Array.from({ length: state.maxHearts }, (_, i) => {
                const filled = i < state.hearts;
                return (
                  <Heart
                    key={i}
                    className={cn(
                      'w-8 h-8 sm:w-9 sm:h-9 transition-all',
                      filled
                        ? 'text-rose-400 fill-rose-500 drop-shadow-[0_0_10px_rgba(244,63,94,0.8)]'
                        : 'text-slate-700 fill-slate-900'
                    )}
                  />
                );
              })}
              <span className="ml-2 text-3xl sm:text-4xl font-black font-mono tabular-nums text-white leading-none">
                {state.hearts}/{state.maxHearts}
              </span>
            </div>
          </div>
        </div>

        {/* Glowing Roguelike Relics & Active Buffs Strip */}
        {(state.relics.length > 0 || state.shadowArmoryStacks > 0 || state.curseWardActive) && (
          <div className="flex flex-wrap items-center gap-2.5 mt-3.5 pt-3 border-t border-white/10">
            <span className="text-sm sm:text-base font-mono uppercase tracking-widest text-slate-300 font-bold mr-1">
              Relics:
            </span>
            {state.relics.map((relicId) => {
              const def = RELIC_CATALOG[relicId];
              const Icon = RELIC_ICON_MAP[relicId];
              const expended =
                (relicId === 'buckler' && state.bucklerUsedThisRoom) ||
                (relicId === 'phoenix' && state.phoenixUsed);
              return (
                <div
                  key={relicId}
                  title={state.damageMode === 'rpg' ? def.shortDescRpg : def.shortDescRaw}
                  className={cn(
                    'inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border-2 text-sm sm:text-base font-extrabold transition-all',
                    RELIC_CHIP_STYLES[relicId],
                    expended && 'opacity-45 line-through'
                  )}
                >
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                  <span>{def.name}</span>
                </div>
              );
            })}
            {state.shadowArmoryStacks > 0 && (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border-2 bg-amber-500/20 border-amber-400/60 text-amber-200 text-sm sm:text-base font-extrabold">
                <Zap className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                <span>
                  Armory +{state.damageMode === 'rpg' ? state.shadowArmoryStacks : state.shadowArmoryStacks * 15} D/T
                </span>
              </div>
            )}
            {state.curseWardActive && (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border-2 bg-sky-500/20 border-sky-400/60 text-sky-200 text-sm sm:text-base font-extrabold">
                <Shield className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                <span>Curse Ward</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Arena Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Left/Top: Boss or Choose-Your-Path Panel + Dartboard */}
        <div className="xl:col-span-7 space-y-4">
          {state.phase === 'path-choice' && state.activePathChoices ? (
            <div className="card-matte rounded-2xl p-5 sm:p-6 border-2 border-purple-400/60 bg-gradient-to-br from-sky-950/50 via-[#13192B] to-purple-950/55 space-y-4 shadow-[0_0_40px_-8px_rgba(168,85,247,0.5)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm sm:text-base font-mono uppercase tracking-widest text-amber-300 font-black flex items-center gap-2">
                    <Compass className="w-5 h-5 text-amber-400 shrink-0" />
                    <span>Crossroads — Choose Your Path!</span>
                  </div>
                  <h3 className="text-3xl sm:text-4xl font-black text-white mt-1 leading-tight">
                    Throw 1 Dart into Left or Right Half
                  </h3>
                </div>
                <span className="px-4 py-1.5 rounded-full bg-emerald-500/20 border-2 border-emerald-400/55 text-emerald-100 text-sm sm:text-base font-mono font-black">
                  Room {state.roomNumber} Cleared!
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* MASSIVE LEFT HALF CHOICE */}
                <div
                  className={cn(
                    'rounded-2xl p-5 sm:p-6 border-2 transition-all',
                    state.claimedPathSide === 'left'
                      ? 'bg-emerald-500/28 border-emerald-300 shadow-[0_0_28px_rgba(16,185,129,0.55)]'
                      : state.claimedPathSide === 'right'
                      ? 'bg-slate-900/50 border-white/10 opacity-45'
                      : 'bg-sky-500/20 border-sky-400/80 shadow-[0_0_28px_-6px_rgba(56,189,248,0.6)]'
                  )}
                >
                  <div className="text-sm sm:text-base font-mono uppercase tracking-wider text-sky-200 font-black">
                    ◀ LEFT HALF (11 • 14 • 9 • 12 • 5 • 8 • 16 • 7 • 19)
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-white mt-2 leading-tight">
                    {state.activePathChoices.left.title}
                  </div>
                  <div className="text-base sm:text-lg font-bold text-emerald-200 mt-2">
                    {state.activePathChoices.left.subtitle}
                  </div>
                </div>

                {/* MASSIVE RIGHT HALF CHOICE */}
                <div
                  className={cn(
                    'rounded-2xl p-5 sm:p-6 border-2 transition-all',
                    state.claimedPathSide === 'right'
                      ? 'bg-purple-500/28 border-purple-300 shadow-[0_0_28px_rgba(168,85,247,0.55)]'
                      : state.claimedPathSide === 'left'
                      ? 'bg-slate-900/50 border-white/10 opacity-45'
                      : 'bg-amber-500/20 border-amber-400/80 shadow-[0_0_28px_-6px_rgba(245,158,11,0.6)]'
                  )}
                >
                  <div className="text-sm sm:text-base font-mono uppercase tracking-wider text-amber-200 font-black">
                    RIGHT HALF (6 • 13 • 4 • 18 • 1 • 10 • 15 • 2 • 17) ▶
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-white mt-2 leading-tight">
                    {state.activePathChoices.right.title}
                  </div>
                  <div className="text-base sm:text-lg font-bold text-amber-100 mt-2">
                    {state.activePathChoices.right.subtitle}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Epic 8ft-Readable Combat Boss Spotlight */
            <div className="card-matte rounded-2xl p-5 sm:p-6 border-2 border-rose-500/45 bg-gradient-to-br from-rose-950/40 via-[#141A29] to-purple-950/35 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm sm:text-base font-mono uppercase tracking-widest text-rose-300 font-black flex items-center gap-2">
                    <Skull className="w-5 h-5 text-rose-400 shrink-0" />
                    <span>
                      Room {state.roomNumber} Boss • {state.boss.title}
                    </span>
                  </div>
                  <h3 className="text-4xl sm:text-5xl font-black text-white tracking-tight leading-none mt-1.5">
                    {state.boss.name}
                  </h3>
                </div>

                <div className="text-right ml-auto">
                  <div className="text-sm sm:text-base font-mono uppercase tracking-widest text-slate-300 font-bold">
                    Boss HP
                  </div>
                  <div className="text-4xl sm:text-5xl font-black font-mono tabular-nums text-rose-300 leading-none mt-1">
                    {state.boss.hp}
                    <span className="text-2xl sm:text-3xl text-slate-400">/{state.boss.maxHp}</span>
                  </div>
                </div>
              </div>

              {/* Huge Glowing Boss HP Bar */}
              <div className="space-y-3">
                <div className="h-7 sm:h-8 w-full rounded-full bg-slate-950/90 border-2 border-rose-400/35 overflow-hidden p-1 shadow-[0_0_24px_rgba(244,63,94,0.28)]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-rose-600 via-rose-500 to-amber-400 transition-all duration-300 shadow-[0_0_16px_rgba(244,63,94,0.75)]"
                    style={{ width: `${bossHpPct}%` }}
                  />
                </div>

                {/* Boss Wedges & Big Armor Shield Callout */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 font-mono">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm sm:text-base font-bold text-slate-300">BOSS WEDGES:</span>
                    {state.boss.targetWedges.map((w) => {
                      const isWeak = state.boss.weakSpotWedge === w;
                      return (
                        <span
                          key={w}
                          className={cn(
                            'px-3 py-1 rounded-xl text-base sm:text-lg font-black border-2',
                            isWeak
                              ? 'bg-purple-500/35 border-yellow-300 text-yellow-100 animate-pulse shadow-[0_0_16px_rgba(250,204,21,0.45)]'
                              : 'bg-rose-500/22 border-rose-400/60 text-rose-100'
                          )}
                        >
                          #{w}
                          {isWeak ? ' (2×!)' : ''}
                        </span>
                      );
                    })}
                  </div>

                  {state.boss.maxArmor > 0 && (
                    <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-sky-500/20 border-2 border-sky-400/60 text-sky-100 text-base sm:text-lg font-black">
                      <Shield className="w-5 h-5 text-sky-300 shrink-0" />
                      <span>ARMOR:</span>
                      {Array.from({ length: state.boss.maxArmor }, (_, i) => (
                        <span
                          key={i}
                          className={cn(
                            'w-4 h-4 sm:w-5 sm:h-5 rounded border-2',
                            i < state.boss.armor
                              ? 'bg-sky-400 border-white shadow-[0_0_10px_rgba(56,189,248,0.85)]'
                              : 'bg-slate-800 border-slate-600'
                          )}
                        />
                      ))}
                      {state.boss.armor === 0 && (
                        <span className="text-emerald-300 ml-1">BROKEN</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Active Room Mechanics Callout Pills: Minions, Curses, Fire Breath, Bulls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {livingMinions.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-xl px-4 py-3 bg-amber-500/18 border-2 border-amber-400/60 flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="text-base sm:text-lg font-mono font-black text-amber-200 leading-tight">
                        👾 {m.name} • #{m.wedge}
                      </div>
                      <div className="text-sm sm:text-base font-bold text-amber-100/85 mt-0.5">
                        Strikes -1 ❤️ end of visit
                      </div>
                    </div>
                    <div className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-white shrink-0">
                      {m.hp}/{m.maxHp}
                    </div>
                  </div>
                ))}

                {state.cursedWedges.length > 0 && (
                  <div className="rounded-xl px-4 py-3 bg-purple-500/20 border-2 border-rose-400/60 flex items-center justify-between">
                    <div>
                      <div className="text-base sm:text-lg font-mono font-black text-rose-200 leading-tight">
                        ☠️ CURSED: {state.cursedWedges.map((w) => `#${w}`).join(' & ')}
                      </div>
                      <div className="text-sm sm:text-base font-bold text-purple-100/85 mt-0.5">
                        Avoid! Hit deals -1 ❤️ recoil
                      </div>
                    </div>
                  </div>
                )}

                {state.boss.hasFireBreath && (
                  <div className="rounded-xl px-4 py-3 bg-orange-500/20 border-2 border-orange-400/60 flex items-center justify-between">
                    <div>
                      <div className="text-base sm:text-lg font-mono font-black text-orange-200 leading-tight">
                        🔥 FIRE BREATH COUNTER
                      </div>
                      <div className="text-sm sm:text-base font-bold text-orange-100/85 mt-0.5">
                        0 dmg visit scorches -2 ❤️!
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-xl px-4 py-3 bg-emerald-500/14 border-2 border-emerald-400/45 flex items-center justify-between">
                  <div>
                    <div className="text-base sm:text-lg font-mono font-black text-emerald-200 leading-tight">
                      🧪 25 = +1 ❤️ • ✨ BULL = +2 ❤️ & CRIT
                    </div>
                    <div className="text-sm sm:text-base font-bold text-slate-200 mt-0.5">
                      {state.damageMode === 'rpg'
                        ? 'S = 1 • D = 2 • T = 3 Crit'
                        : 'Raw Dart Score damages Boss & Minions'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <VisitPillsStrip
            darts={state.visitDarts}
            dartTones={dartTones}
            dartLabels={dartLabels}
            boardStatus={boardStatus}
            turnComplete={state.turnComplete}
          />

          <div className="card-matte rounded-2xl p-3.5 sm:p-4 flex items-center justify-center border border-purple-500/25">
            <SvgDartboard
              size={600}
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

        {/* Right/Bottom: Party Damage Bar, Equipped Relics & Combat Chronicle */}
        <div className="xl:col-span-5 space-y-4">
          {/* Adventuring Party & Damage Share Bar */}
          <div className="card-matte rounded-2xl p-4 sm:p-5 space-y-3 border border-white/15">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-base sm:text-lg font-mono uppercase tracking-widest text-sky-300 font-black flex items-center gap-2">
                <Swords className="w-5 h-5 text-sky-400" />
                <span>Adventuring Party ({state.players.length}P Co-Op)</span>
              </div>
              <span className="text-base sm:text-lg font-mono font-bold text-slate-300 tabular-nums">
                Visit Dmg: <strong className="text-amber-300 font-black">{state.visitDamageDealt}</strong>
              </span>
            </div>

            {/* Combined Party Damage Share Bar */}
            {totalPartyDamage > 0 && (
              <div className="h-3 w-full rounded-full bg-slate-900 overflow-hidden flex border border-white/10">
                {state.players.map((entry) => {
                  const pct = (entry.damageDealt / totalPartyDamage) * 100;
                  if (pct <= 0) return null;
                  return (
                    <div
                      key={entry.player.id}
                      className="h-full transition-all duration-300"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: entry.player.colorHex,
                      }}
                    />
                  );
                })}
              </div>
            )}

            <div
              className={cn(
                'grid gap-3',
                state.players.length > 1 ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-1' : 'grid-cols-1'
              )}
            >
              {state.players.map((entry, idx) => {
                const isActive = idx === state.activePlayerIndex && !state.isFinished;
                return (
                  <div
                    key={entry.player.id}
                    className={cn(
                      'rounded-xl p-3.5 border-2 transition-all flex items-center justify-between gap-3',
                      isActive
                        ? 'bg-purple-500/20 border-purple-400/80 shadow-[0_0_24px_-8px_rgba(168,85,247,0.65)]'
                        : 'bg-slate-900/75 border-white/10'
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-11 h-11 rounded-full flex items-center justify-center font-black text-base text-slate-950 shrink-0 shadow"
                        style={{ backgroundColor: entry.player.colorHex }}
                      >
                        {entry.player.avatarInitial}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-lg sm:text-xl font-black text-white truncate">
                            {entry.player.name}
                          </span>
                          {isActive && (
                            <span className="px-2.5 py-0.5 rounded-full bg-purple-500/35 border border-purple-300/70 text-sm font-mono font-black uppercase text-purple-100 shrink-0">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="text-sm sm:text-base font-mono text-slate-300 tabular-nums">
                          {entry.critsLanded} Crits • {entry.minionsSlain} Minions •{' '}
                          {entry.healsTriggered} Heals
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-3xl sm:text-4xl font-black font-mono tabular-nums text-amber-300 leading-none">
                        {entry.damageDealt}
                      </div>
                      <div className="text-sm font-mono font-bold uppercase text-slate-400 mt-1">
                        Total Dmg
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Relic Codex & Dungeon Chronicle side-by-side on Portrait Kiosk */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4">
            {/* Relic Codex / Active Power Summary */}
            <div className="card-matte rounded-2xl p-4 sm:p-5 space-y-3 border border-white/15">
              <div className="text-base sm:text-lg font-mono uppercase tracking-widest text-amber-300 font-black flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <span>Equipped Relics ({state.relics.length}/6)</span>
              </div>
              {state.relics.length === 0 ? (
                <div className="text-sm sm:text-base text-slate-300 font-mono py-1.5">
                  Slay Room bosses to unlock Crossroads & claim Roguelike Relics!
                </div>
              ) : (
                <div className="space-y-2">
                  {state.relics.map((relicId) => {
                    const def = RELIC_CATALOG[relicId];
                    const Icon = RELIC_ICON_MAP[relicId];
                    return (
                      <div
                        key={relicId}
                        className={cn(
                          'rounded-xl px-3.5 py-2.5 border-2',
                          RELIC_CHIP_STYLES[relicId]
                        )}
                      >
                        <div className="text-sm sm:text-base font-black flex items-center gap-2">
                          <Icon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                          <span>{def.name}</span>
                        </div>
                        <div className="text-sm font-semibold opacity-90 mt-0.5">
                          {state.damageMode === 'rpg' ? def.shortDescRpg : def.shortDescRaw}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Dungeon Combat Chronicle */}
            <div className="card-matte rounded-2xl p-4 sm:p-5 space-y-3 border border-white/15">
              <div className="text-base sm:text-lg font-mono uppercase tracking-widest text-slate-300 font-black">
                Dungeon Chronicle
              </div>
              <div className="space-y-2">
                {state.combatLog.slice(0, 4).map((entry, idx) => (
                  <div
                    key={`${idx}-${entry}`}
                    className={cn(
                      'text-sm sm:text-base font-mono px-3.5 py-2 rounded-xl border',
                      idx === 0
                        ? 'bg-white/[0.08] border-white/20 text-white font-bold'
                        : 'bg-slate-900/60 border-white/[0.06] text-slate-300'
                    )}
                  >
                    {entry}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
