import React, { useMemo } from 'react';
import { useOnlineMatchStore } from '../../store/useOnlineMatchStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useLiveBoardStore } from '../../store/useLiveBoardStore';
import { SvgDartboard, SegmentOverlayStyle } from '../dartboard/SvgDartboard';
import { DartPlotOverlay } from '../dartboard/DartPlotOverlay';
import { VisitPillsStrip } from '../../games/components/ArcadePrimitives';
import { getCheckoutRoute } from '../../games/utils/dartHelpers';
import { DEFAULT_DART_COLOR } from '../../lib/playerThemes';
import { cn } from '../../lib/utils';
import {
  ArrowRight,
  Flame,
  Radio,
  ShieldAlert,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';

/**
 * Dedicated Full-Screen Broadcast Kiosk Mode for Online / DartCounter X01 (501/301/701) Matches.
 * Matches the Demolition 501 Arcade visual system (giant hero typography, glowing PDC checkout banner,
 * 660px live target dartboard, and animated vertical Demolition Score Towers) powered by live
 * DartCounter & Autodarts port 3180 values.
 *
 * Toggled exclusively from the iPad Oche Deck whenever an online match is loaded.
 */
export const OnlineMatchFullscreenArena: React.FC = () => {
  const {
    source,
    startScore,
    outRule,
    legsToWin,
    opponentName,
    opponentRemaining,
    opponentAvg,
    isPlayerTurn,
    playerLegs,
    opponentLegs,
    remaining,
    turnStartRemaining,
    dartsInLeg,
    legPointsScored,
    isBust,
    lastBanner,
    matchWinner,
    dcMode,
    dcLastSubmitStatus,
  } = useOnlineMatchStore();

  const activePlayer = usePlayerStore((s) => s.getActivePlayer());
  const currentVisitThrows = useLiveBoardStore((s) => s.currentVisitThrows);
  const visitScore = useLiveBoardStore((s) => s.visitScore);
  const boardStatus = useLiveBoardStore((s) => s.boardStatus);

  const playerColor = activePlayer.dartColor || DEFAULT_DART_COLOR;
  const oppColor = '#38BDF8';
  const isDartCounter = source === 'dartcounter';

  const dartsLeft = Math.max(0, 3 - currentVisitThrows.length);
  const legAvg = dartsInLeg > 0 ? (legPointsScored / dartsInLeg) * 3 : 0;

  // Live optimal PDC checkout route for your exact remaining score & darts left
  const checkoutRoute = useMemo(() => {
    if (matchWinner || isBust || remaining <= 0 || remaining > 170 || dartsLeft === 0) {
      return null;
    }
    return getCheckoutRoute(remaining, outRule, dartsLeft);
  }, [matchWinner, isBust, remaining, outRule, dartsLeft]);

  const hasCheckoutHighlight = Boolean(checkoutRoute && checkoutRoute.length > 0);

  // Highlight recommended next checkout target bed directly on the 660px SvgDartboard
  const segmentOverlays = useMemo<Record<string, SegmentOverlayStyle>>(() => {
    if (!checkoutRoute || checkoutRoute.length === 0) return {};

    const overlays: Record<string, SegmentOverlayStyle> = {};
    const primaryBed = checkoutRoute[0];
    overlays[primaryBed] = {
      fill: '#10B981',
      opacity: 0.92,
      stroke: '#FFFFFF',
      pulse: true,
      badge: primaryBed,
      badgeColor: '#FFFFFF',
    };

    if (checkoutRoute.length >= 2) {
      const secondBed = checkoutRoute[1];
      if (secondBed !== primaryBed) {
        overlays[secondBed] = {
          fill: '#38BDF8',
          opacity: 0.45,
          stroke: '#BAE6FD',
          pulse: false,
          badge: secondBed,
          badgeColor: '#FFFFFF',
        };
      }
    }

    return overlays;
  }, [checkoutRoute]);

  const dartTones = useMemo(
    () =>
      currentVisitThrows.map((d) =>
        d.bouncer || d.score === 0
          ? ('rose' as const)
          : d.segment.multiplier === 3
          ? ('amber' as const)
          : d.segment.multiplier === 2
          ? ('emerald' as const)
          : ('slate' as const)
      ),
    [currentVisitThrows]
  );

  const spotlightColor = isBust
    ? '#F43F5E'
    : isDartCounter && !isPlayerTurn
    ? oppColor
    : playerColor;

  const spotlightName = isDartCounter && !isPlayerTurn ? opponentName : activePlayer.name;
  const spotlightInitial = (spotlightName || 'P').charAt(0).toUpperCase();
  const spotlightRemaining =
    isDartCounter && !isPlayerTurn && opponentRemaining !== null
      ? opponentRemaining
      : remaining;

  const towers = [
    {
      id: 'you',
      name: activePlayer.name,
      score: remaining,
      legs: playerLegs,
      avg: legAvg,
      colorHex: playerColor,
      isCurrent: !matchWinner && (!isDartCounter || isPlayerTurn),
      isBustedActive: isBust && (!isDartCounter || isPlayerTurn),
      isKnownScore: true,
    },
    {
      id: 'opponent',
      name: opponentName || 'Opponent',
      score: opponentRemaining ?? startScore,
      legs: opponentLegs,
      avg: opponentAvg ?? 0,
      colorHex: oppColor,
      isCurrent: !matchWinner && isDartCounter && !isPlayerTurn,
      isBustedActive: false,
      isKnownScore: opponentRemaining !== null,
    },
  ];

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pt-4 pb-8 space-y-4">
      {/* TOP SPOTLIGHT: Active Thrower, Giant Remaining Score, Checkout Route & 3-Dart Visit Strip */}
      <div
        className="card-matte rounded-2xl p-5 sm:p-6 space-y-5 border-2 transition-colors"
        style={{
          borderColor: `${spotlightColor}85`,
          boxShadow: isBust
            ? '0 0 40px -8px rgba(244,63,94,0.7)'
            : `0 0 38px -10px ${spotlightColor}66`,
        }}
      >
        {/* Top Broadcast Bar: Live Source + Format + Giant Legs Scoreboard */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={cn(
                'inline-flex items-center gap-2 px-3.5 py-1 rounded-xl text-sm font-mono font-black uppercase tracking-wider border',
                isDartCounter
                  ? 'bg-emerald-500/20 border-emerald-400/55 text-emerald-200'
                  : 'bg-sky-500/20 border-sky-400/55 text-sky-200'
              )}
            >
              <Radio className="w-4 h-4 animate-pulse" />
              {isDartCounter ? `DartCounter Live • ${startScore}` : `Online Match • ${startScore}`}
            </span>

            <span
              className={cn(
                'px-3 py-1 rounded-xl text-sm font-mono font-black uppercase border',
                outRule === 'double'
                  ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                  : 'bg-sky-500/20 border-sky-400/50 text-sky-200'
              )}
            >
              {outRule === 'double' ? 'Double Out' : 'Straight Out'}
            </span>

            {isDartCounter && (
              <span className="px-3 py-1 rounded-xl text-xs font-mono font-black uppercase bg-slate-900 border border-white/15 text-slate-300">
                {dcMode === 'auto'
                  ? 'Auto-Score ON'
                  : dcMode === 'confirm'
                  ? 'iPad Confirm'
                  : 'TV Sync Only'}
              </span>
            )}
          </div>

          {/* Giant Legs Scoreboard Pill */}
          <div className="flex items-center gap-4 px-5 py-2 rounded-2xl bg-slate-950/85 border border-white/15 font-mono">
            <span className="text-base sm:text-lg font-black text-emerald-300 truncate max-w-[160px]">
              {activePlayer.name}
            </span>
            <span className="text-2xl sm:text-3xl font-black text-white tabular-nums">
              {playerLegs} — {opponentLegs}
            </span>
            <span className="text-base sm:text-lg font-bold text-sky-300 truncate max-w-[160px]">
              {opponentName}
            </span>
            {legsToWin > 0 && (
              <span className="hidden md:inline text-xs uppercase tracking-wider text-slate-400 border-l border-white/10 pl-3">
                First to {legsToWin}
              </span>
            )}
          </div>
        </div>

        {/* Active Thrower Row + Giant Remaining Hero */}
        <div className="flex flex-wrap items-center justify-between gap-5">
          {/* Left: Active Thrower Identity + Big Stat Tiles */}
          <div className="flex flex-col gap-4 min-w-0 flex-1">
            <div className="flex items-center gap-4 min-w-0">
              <div
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center font-black text-3xl sm:text-4xl text-slate-950 shrink-0 shadow-lg"
                style={{ backgroundColor: spotlightColor }}
              >
                {spotlightInitial}
              </div>
              <div className="min-w-0">
                <div className="text-sm sm:text-base font-mono uppercase tracking-wider font-black flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full animate-pulse"
                    style={{ backgroundColor: spotlightColor }}
                  />
                  <span style={{ color: spotlightColor }}>
                    {matchWinner
                      ? 'Match Complete'
                      : isDartCounter && !isPlayerTurn
                      ? `${opponentName} Throwing`
                      : 'Your Throw'}
                  </span>
                </div>
                <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight truncate leading-tight mt-0.5">
                  {spotlightName}
                </h2>
              </div>
            </div>

            {/* Big 3DA, Darts Thrown & Live Visit Tiles (matching Demolition 501) */}
            <div className="grid grid-cols-3 gap-3 max-w-xl">
              <div className="px-4 py-2.5 rounded-xl bg-slate-900/85 border border-white/10">
                <div className="text-sm font-mono uppercase tracking-wider text-slate-400 font-bold">
                  Leg 3DA
                </div>
                <div className="text-3xl sm:text-4xl font-black font-mono tabular-nums text-sky-300 leading-none mt-1">
                  {legAvg.toFixed(1)}
                </div>
              </div>

              <div className="px-4 py-2.5 rounded-xl bg-slate-900/85 border border-white/10">
                <div className="text-sm font-mono uppercase tracking-wider text-slate-400 font-bold">
                  Darts
                </div>
                <div className="text-3xl sm:text-4xl font-black font-mono tabular-nums text-slate-100 leading-none mt-1">
                  {dartsInLeg}
                </div>
              </div>

              <div className="px-4 py-2.5 rounded-xl bg-slate-900/85 border border-white/10">
                <div className="text-sm font-mono uppercase tracking-wider text-slate-400 font-bold">
                  Visit
                </div>
                <div
                  className={cn(
                    'text-3xl sm:text-4xl font-black font-mono tabular-nums leading-none mt-1',
                    isBust
                      ? 'text-rose-400'
                      : visitScore >= 100
                      ? 'text-amber-300'
                      : 'text-emerald-300'
                  )}
                >
                  {isBust ? 'BUST' : visitScore}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Giant Active Remaining Score */}
          <div className="text-right shrink-0 pl-2">
            <div className="text-sm sm:text-base font-mono uppercase tracking-widest text-slate-400 font-bold">
              {isDartCounter && !isPlayerTurn ? `${opponentName} Left` : 'Remaining'}
            </div>
            <div
              className={cn(
                'text-8xl lg:text-9xl font-black font-mono tabular-nums leading-none tracking-tight mt-1',
                hasCheckoutHighlight && (!isDartCounter || isPlayerTurn)
                  ? 'text-emerald-300 drop-shadow-[0_0_24px_rgba(16,185,129,0.55)]'
                  : isBust
                  ? 'text-rose-400'
                  : 'text-white'
              )}
            >
              {spotlightRemaining}
            </div>
          </div>
        </div>

        {/* LIVE PDC CHECKOUT ROUTE BANNER (identical Demolition 501 style!) */}
        {checkoutRoute ? (
          <div className="rounded-2xl border-2 border-emerald-400/70 bg-emerald-500/15 px-5 py-4 flex flex-wrap items-center justify-between gap-4 shadow-[0_0_30px_-6px_rgba(16,185,129,0.55)]">
            <div className="flex items-center gap-3">
              <Zap className="w-7 h-7 text-emerald-300 shrink-0" />
              <div>
                <div className="text-base sm:text-xl font-black uppercase tracking-wider text-emerald-200 leading-tight">
                  Checkout Route • {remaining}
                </div>
                <div className="text-sm sm:text-base font-mono text-emerald-200/85">
                  {outRule === 'double' ? 'Finish on Double or Bull' : 'Highlighted on board'} •{' '}
                  {dartsLeft} dart{dartsLeft === 1 ? '' : 's'} left
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              {checkoutRoute.map((step, i) => (
                <React.Fragment key={`${step}-${i}`}>
                  {i > 0 && <ArrowRight className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-300/80" />}
                  <span
                    className={cn(
                      'px-5 sm:px-6 py-2 sm:py-2.5 rounded-2xl font-mono font-black text-3xl sm:text-5xl tabular-nums leading-none border-2',
                      i === 0
                        ? 'bg-emerald-400 text-slate-950 border-white shadow-[0_0_22px_rgba(16,185,129,0.85)]'
                        : 'bg-slate-950/85 text-sky-200 border-sky-400/50'
                    )}
                  >
                    {step}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>
        ) : isBust ? (
          <div className="rounded-2xl border-2 border-rose-400/60 bg-rose-500/15 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-rose-200">
            <span className="text-base sm:text-xl font-black uppercase tracking-wider flex items-center gap-2.5">
              <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0" />
              Turn Busted — Restored to {turnStartRemaining}
            </span>
            <span className="text-sm sm:text-base font-mono font-bold opacity-90">
              Pull darts to continue
            </span>
          </div>
        ) : lastBanner ? (
          <div className="rounded-2xl border-2 border-emerald-400/60 bg-emerald-500/15 px-5 py-3.5 flex items-center justify-center gap-3 text-emerald-200">
            <Trophy className="w-6 h-6 text-amber-300 shrink-0" />
            <span className="text-base sm:text-xl font-black uppercase tracking-wider">
              {lastBanner}
            </span>
          </div>
        ) : null}

        {/* 3-Dart Live Visit Pills + Takeout Prompt */}
        <VisitPillsStrip
          darts={currentVisitThrows}
          dartTones={dartTones}
          boardStatus={boardStatus}
          turnComplete={currentVisitThrows.length >= 3 || isBust}
        />
      </div>

      {/* MAIN ARENA: Giant 660px SvgDartboard + Animated Head-to-Head Demolition Score Towers */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Giant Portrait-Optimized Target Board with Checkout Highlights & Live Dart Dots */}
        <div className="xl:col-span-6 card-matte rounded-2xl p-4 sm:p-5 flex flex-col items-center space-y-3">
          <div className="w-full flex items-center justify-between gap-2 text-sm sm:text-base font-mono text-slate-300">
            <span className="flex items-center gap-2 font-black text-sky-400 uppercase tracking-wider">
              <Target className="w-5 h-5" />
              {hasCheckoutHighlight
                ? `Checkout Guide: Aim ${checkoutRoute?.[0]}`
                : `${startScore} Target Board`}
            </span>
            {isDartCounter && dcLastSubmitStatus && (
              <span className="text-xs sm:text-sm text-emerald-300/90 font-bold truncate max-w-[260px]">
                {dcLastSubmitStatus}
              </span>
            )}
          </div>

          <SvgDartboard
            size={660}
            segmentOverlays={segmentOverlays}
            dimInactiveSegments={hasCheckoutHighlight}
          >
            <DartPlotOverlay
              sessionThrows={[]}
              currentVisitThrows={currentVisitThrows}
              mode="dots"
            />
          </SvgDartboard>
        </div>

        {/* HEAD-TO-HEAD VERTICAL DEMOLITION SCORE TOWERS (Live DartCounter Values!) */}
        <div className="xl:col-span-6 card-matte rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-mono uppercase tracking-widest text-sky-400 font-bold">
                {isDartCounter ? 'Live DartCounter Arena' : 'Online Match Arena'}
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-white">
                Score Towers ({startScore} → 0)
              </h3>
            </div>
            <span className="text-sm sm:text-base font-mono font-bold text-slate-400">
              Head-to-Head
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {towers.map((p) => {
              const pctRemaining = p.isKnownScore
                ? Math.max(0, Math.min(100, (p.score / startScore) * 100))
                : 100;
              const pctDemolished = p.isKnownScore ? Math.round(100 - pctRemaining) : 0;
              const canCheckoutIn3 =
                p.isKnownScore && p.score > 0 && getCheckoutRoute(p.score, outRule, 3) !== null;

              return (
                <div
                  key={p.id}
                  className={cn(
                    'rounded-2xl p-4 sm:p-5 border-2 flex flex-col justify-between gap-3.5 transition-all',
                    p.isCurrent
                      ? 'bg-slate-900/95 scale-[1.01]'
                      : 'bg-slate-950/65 border-white/10 opacity-90'
                  )}
                  style={
                    p.isCurrent
                      ? {
                          borderColor: p.isBustedActive ? '#F43F5E' : p.colorHex,
                          boxShadow: p.isBustedActive
                            ? '0 0 28px -6px rgba(244,63,94,0.65)'
                            : `0 0 26px -8px ${p.colorHex}85`,
                        }
                      : undefined
                  }
                >
                  {/* Tower Header */}
                  <div className="space-y-1.5 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0"
                        style={{ backgroundColor: p.colorHex }}
                      />
                      <span className="text-xl sm:text-2xl font-black text-white truncate">
                        {p.name}
                      </span>
                    </div>

                    <div
                      className={cn(
                        'text-5xl sm:text-6xl font-black font-mono tabular-nums leading-none',
                        !p.isKnownScore
                          ? 'text-slate-500'
                          : p.score === 0
                          ? 'text-emerald-400'
                          : canCheckoutIn3
                          ? 'text-emerald-300'
                          : 'text-white'
                      )}
                    >
                      {p.isKnownScore ? p.score : '—'}
                    </div>

                    <div className="min-h-[28px] flex items-center justify-center">
                      {!p.isKnownScore ? (
                        <span className="text-sm font-mono font-bold text-slate-500">
                          Manual Match
                        </span>
                      ) : p.score === 0 ? (
                        <span className="px-2.5 py-0.5 rounded-full text-sm font-mono font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/50">
                          ZERO!
                        </span>
                      ) : canCheckoutIn3 ? (
                        <span className="px-2.5 py-0.5 rounded-full text-sm font-mono font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 flex items-center gap-1">
                          <Flame className="w-4 h-4" />
                          Checkout
                        </span>
                      ) : p.isCurrent ? (
                        <span className="px-2.5 py-0.5 rounded-full text-sm font-mono font-black uppercase bg-sky-500/20 text-sky-300 border border-sky-400/40">
                          Throwing
                        </span>
                      ) : (
                        <span className="text-sm font-mono font-bold text-slate-400 tabular-nums">
                          {pctDemolished}% down
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Animated Vertical Demolition Tower Shaft */}
                  <div className="relative h-40 sm:h-52 xl:h-60 w-full rounded-xl bg-slate-950/90 border border-white/10 overflow-hidden flex items-end p-1">
                    {/* Structural Floor Guide Lines (25%, 50%, 75%) */}
                    <div className="pointer-events-none absolute inset-x-1 bottom-1/4 border-t border-dashed border-white/10 z-10" />
                    <div className="pointer-events-none absolute inset-x-1 bottom-1/2 border-t border-dashed border-white/15 z-10" />
                    <div className="pointer-events-none absolute inset-x-1 bottom-3/4 border-t border-dashed border-white/10 z-10" />

                    {/* Animated Remaining Score Block */}
                    <div
                      className={cn(
                        'w-full rounded-lg transition-all duration-500 ease-out relative overflow-hidden',
                        p.isBustedActive && 'animate-pulse',
                        !p.isKnownScore && 'opacity-30'
                      )}
                      style={{
                        height: `${pctRemaining}%`,
                        background: p.isBustedActive
                          ? 'linear-gradient(180deg, #F43F5E 0%, #9F1239 100%)'
                          : canCheckoutIn3
                          ? 'linear-gradient(180deg, #34D399 0%, #059669 100%)'
                          : `linear-gradient(180deg, ${p.colorHex} 0%, ${p.colorHex}88 100%)`,
                        boxShadow:
                          pctRemaining > 0 && p.isKnownScore
                            ? `0 -4px 16px -2px ${
                                p.isBustedActive
                                  ? 'rgba(244,63,94,0.65)'
                                  : canCheckoutIn3
                                  ? 'rgba(16,185,129,0.6)'
                                  : `${p.colorHex}66`
                              }`
                            : 'none',
                      }}
                    >
                      <div
                        className="absolute inset-0 opacity-20"
                        style={{
                          backgroundImage:
                            'repeating-linear-gradient(0deg, transparent, transparent 14px, rgba(0,0,0,0.45) 14px, rgba(0,0,0,0.45) 16px)',
                        }}
                      />
                    </div>

                    {p.isKnownScore && p.score === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center text-base font-mono font-black text-emerald-300 uppercase tracking-widest">
                        ZERO!
                      </div>
                    )}
                  </div>

                  {/* Tower Footer Stats: 3DA & Legs */}
                  <div className="grid grid-cols-2 gap-2 text-center pt-0.5">
                    <div className="rounded-xl bg-slate-950/85 border border-white/10 py-2 px-1.5">
                      <div className="text-sm font-mono uppercase text-slate-400 font-bold">3DA</div>
                      <div className="text-lg sm:text-xl font-black font-mono tabular-nums text-sky-300 leading-tight">
                        {p.avg > 0 ? p.avg.toFixed(1) : '—'}
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-950/85 border border-white/10 py-2 px-1.5">
                      <div className="text-sm font-mono uppercase text-slate-400 font-bold">Legs</div>
                      <div className="text-lg sm:text-xl font-black font-mono tabular-nums text-emerald-300 leading-tight">
                        {p.legs}
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
