import React, { useMemo } from 'react';
import { useOnlineMatchStore } from '../../store/useOnlineMatchStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useLiveBoardStore } from '../../store/useLiveBoardStore';
import { SvgDartboard, SegmentOverlayStyle } from '../dartboard/SvgDartboard';
import { DartPlotOverlay } from '../dartboard/DartPlotOverlay';
import { DartCounterIcon } from '../common/DartCounterIcon';
import { getCheckoutRoute } from '../../games/utils/dartHelpers';
import { cn } from '../../lib/utils';
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  Flame,
  Radio,
  ShieldAlert,
  Target,
  Trophy,
  Wifi,
  Zap,
} from 'lucide-react';

/**
 * Brand-Designed Target DartCounter Broadcast X01 Kiosk Arena (Light / Vibrant Orange Theme).
 * Inspired by Target DartCounter (app.dartcounter.net):
 * - Crisp off-white studio surface (#F4F5F7) & pure white cards (#FFFFFF)
 * - Signature Target Orange (#F76505) for active turn highlights, leg pips & hero accents
 * - Traditional Darts Forest Green (#107C41) for PDC checkout routes & live status badges
 * - Deep charcoal (#111827) massive tabular-nums X01 scores for 8ft+ vertical TV readability
 */
export const DartCounterKioskArena: React.FC = () => {
  const {
    isActive,
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
    dcConnected,
    dcMode,
    dcLastSubmitStatus,
    dcPendingInvites,
  } = useOnlineMatchStore();

  const activePlayer = usePlayerStore((s) => s.getActivePlayer());
  const currentVisitThrows = useLiveBoardStore((s) => s.currentVisitThrows);
  const visitScore = useLiveBoardStore((s) => s.visitScore);
  const boardStatus = useLiveBoardStore((s) => s.boardStatus);

  const hasLiveMatch = isActive && source === 'dartcounter';
  const dartsLeft = Math.max(0, 3 - currentVisitThrows.length);
  const legAvg = dartsInLeg > 0 ? (legPointsScored / dartsInLeg) * 3 : 0;

  const checkoutRoute = useMemo(() => {
    if (!hasLiveMatch || matchWinner || isBust || remaining <= 0 || remaining > 170 || dartsLeft === 0) {
      return null;
    }
    return getCheckoutRoute(remaining, outRule, dartsLeft);
  }, [hasLiveMatch, matchWinner, isBust, remaining, outRule, dartsLeft]);

  const hasCheckoutHighlight = Boolean(checkoutRoute && checkoutRoute.length > 0);

  const segmentOverlays = useMemo<Record<string, SegmentOverlayStyle>>(() => {
    if (!checkoutRoute || checkoutRoute.length === 0) return {};
    const overlays: Record<string, SegmentOverlayStyle> = {};
    const primaryBed = checkoutRoute[0];
    overlays[primaryBed] = {
      fill: '#F76505',
      opacity: 0.94,
      stroke: '#FFFFFF',
      pulse: true,
      badge: primaryBed,
      badgeColor: '#FFFFFF',
    };
    if (checkoutRoute.length >= 2 && checkoutRoute[1] !== primaryBed) {
      overlays[checkoutRoute[1]] = {
        fill: '#107C41',
        opacity: 0.55,
        stroke: '#DCFCE7',
        pulse: false,
        badge: checkoutRoute[1],
        badgeColor: '#FFFFFF',
      };
    }
    return overlays;
  }, [checkoutRoute]);

  // =========================================================================
  // STANDBY / READY TO PLAY SCREEN (when no DartCounter X01 match is active)
  // =========================================================================
  if (!hasLiveMatch) {
    return (
      <div className="max-w-[1400px] mx-auto px-5 sm:px-8 pt-6 pb-10 space-y-6">
        {/* Brand Hero Banner */}
        <section className="rounded-3xl bg-white border border-slate-200 shadow-[0_12px_36px_-10px_rgba(15,23,42,0.1)] overflow-hidden">
          <div className="h-2.5 w-full bg-gradient-to-r from-[#F76505] via-[#FF8533] to-[#107C41]" />
          <div className="p-8 sm:p-10 flex flex-col items-center text-center space-y-6">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-[#F76505] to-[#FF8A3D] text-white flex items-center justify-center shadow-[0_12px_32px_-6px_rgba(247,101,5,0.5)]">
              <DartCounterIcon className="w-11 h-11" />
            </div>

            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs sm:text-sm font-mono font-black uppercase tracking-widest border bg-[#FFF3EB] border-[#FDBA74] text-[#C2410C]">
                <DartCounterIcon className="w-4 h-4 text-[#F76505]" />
                Target DartCounter • Live Kiosk Mode
              </div>
              <h2 className="text-4xl sm:text-6xl font-black tracking-tight text-slate-900">
                Ready at the Oche
              </h2>
              <p className="text-base sm:text-xl text-slate-600 font-medium leading-relaxed">
                Start a <strong className="text-slate-900">DartBot</strong> or{' '}
                <strong className="text-slate-900">Online X01</strong> match from your{' '}
                <strong className="text-[#F76505]">iPad DartCounter Controller</strong> — this TV
                automatically switches into full broadcast scoreboard mode.
              </p>
            </div>

            {/* Live Connection Status Pills */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <div
                className={cn(
                  'inline-flex items-center gap-2.5 px-5 py-2.5 rounded-2xl border-2 text-sm sm:text-base font-mono font-black',
                  dcConnected
                    ? 'bg-emerald-50 border-emerald-500/50 text-emerald-800'
                    : 'bg-rose-50 border-rose-400/50 text-rose-800'
                )}
              >
                <span
                  className={cn(
                    'w-3 h-3 rounded-full',
                    dcConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                  )}
                />
                <Wifi className="w-4 h-4" />
                {dcConnected ? 'Brave DartCounter Linked' : 'Awaiting Brave (app.dartcounter.net)'}
              </div>

              <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-slate-100 border border-slate-200 text-sm sm:text-base font-mono font-bold text-slate-700">
                <CheckCircle2 className="w-4 h-4 text-[#F76505]" />
                Scoring:{' '}
                <span className="text-slate-900 font-black uppercase">
                  {dcMode === 'auto' ? 'Auto-Log ON' : dcMode === 'confirm' ? 'iPad Confirm' : 'Sync Only'}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Live Incoming Friend Invites Broadcast Banner (if any invite detected in Brave!) */}
        {dcPendingInvites.length > 0 && (
          <section className="rounded-3xl bg-[#FFF4EC] border-2 border-[#F76505] p-6 sm:p-8 shadow-[0_12px_36px_-8px_rgba(247,101,5,0.3)] space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#F76505] text-white flex items-center justify-center animate-bounce">
                  <BellRing className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-mono uppercase tracking-widest font-black text-[#C2410C]">
                    Incoming Friend Challenge
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-black text-slate-900">
                    {dcPendingInvites[0].fromName} invited you to play!
                  </h3>
                </div>
              </div>
              <span className="px-4 py-2 rounded-xl bg-[#F76505] text-white font-black text-sm uppercase tracking-wider">
                Tap Accept on iPad
              </span>
            </div>
            <div className="text-base sm:text-lg font-mono font-bold text-slate-700">
              {dcPendingInvites[0].summary}
            </div>
          </section>
        )}

        {/* Live Dartboard Preview while warming up */}
        <section className="rounded-3xl bg-white border border-slate-200 p-6 flex flex-col items-center space-y-4 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.08)]">
          <div className="w-full flex items-center justify-between">
            <span className="text-sm sm:text-base font-mono font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <Target className="w-5 h-5 text-[#F76505]" />
              Warm-Up Board • Autodarts Live
            </span>
            <span className="text-sm font-mono font-bold text-slate-500">
              {activePlayer.name} • Visit: <strong className="text-slate-900">{visitScore}</strong>
            </span>
          </div>
          <SvgDartboard size={580}>
            <DartPlotOverlay
              sessionThrows={[]}
              currentVisitThrows={currentVisitThrows}
              mode="dots"
            />
          </SvgDartboard>
        </section>
      </div>
    );
  }

  // =========================================================================
  // LIVE TARGET DARTCOUNTER BROADCAST X01 MATCH ARENA (LIGHT & ORANGE STYLE)
  // =========================================================================
  const showTakeoutPrompt = currentVisitThrows.length >= 3 || boardStatus === 'takeout' || isBust;
  const legDotsCount = Math.max(legsToWin || 3, playerLegs, opponentLegs);

  const playerCards = [
    {
      id: 'you',
      name: activePlayer.name,
      score: remaining,
      legs: playerLegs,
      avg: legAvg,
      darts: dartsInLeg,
      isThrowing: !matchWinner && isPlayerTurn,
      isWinner: matchWinner === 'player',
      isBusted: isBust && isPlayerTurn,
      isKnown: true,
    },
    {
      id: 'opp',
      name: opponentName || 'Opponent',
      score: opponentRemaining ?? startScore,
      legs: opponentLegs,
      avg: opponentAvg ?? 0,
      darts: null as number | null,
      isThrowing: !matchWinner && !isPlayerTurn,
      isWinner: matchWinner === 'opponent',
      isBusted: false,
      isKnown: opponentRemaining !== null,
    },
  ];

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pt-4 pb-8 space-y-4">
      {/* BRAND BROADCAST TOP MATCH STRIP */}
      <div className="rounded-2xl bg-white border border-slate-200 px-5 py-3.5 shadow-[0_6px_20px_-6px_rgba(15,23,42,0.08)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#F76505] text-white text-sm font-mono font-black uppercase tracking-wider shadow-[0_4px_14px_-2px_rgba(247,101,5,0.5)]">
            <DartCounterIcon className="w-4 h-4" />
            DartCounter • {startScore}
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-sm font-mono font-black uppercase text-slate-700">
            {outRule === 'double' ? 'Double Out' : 'Straight Out'}
          </span>
          {legsToWin > 0 && (
            <span className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-sm font-mono font-bold text-slate-600">
              First to {legsToWin}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-black uppercase border',
              dcMode === 'auto'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : 'bg-orange-50 border-orange-300 text-[#C2410C]'
            )}
          >
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            {dcMode === 'auto'
              ? 'Auto-Scoring Live'
              : dcMode === 'confirm'
              ? 'iPad Confirm Mode'
              : 'TV Sync Only'}
          </span>
          {dcLastSubmitStatus && (
            <span className="hidden md:inline text-xs font-mono font-bold text-slate-500 truncate max-w-[260px]">
              {dcLastSubmitStatus}
            </span>
          )}
        </div>
      </div>

      {/* HEAD-TO-HEAD TARGET DARTCOUNTER SCOREBOARD CARDS */}
      <div className="grid grid-cols-2 gap-4">
        {playerCards.map((p) => {
          const canCheckout =
            p.isKnown && p.score > 0 && p.score <= 170 && getCheckoutRoute(p.score, outRule, 3) !== null;
          const pctRemaining = p.isKnown
            ? Math.max(0, Math.min(100, (p.score / startScore) * 100))
            : 100;

          return (
            <div
              key={p.id}
              className={cn(
                'rounded-3xl bg-white overflow-hidden transition-all border-2',
                p.isWinner
                  ? 'border-[#107C41] shadow-[0_14px_36px_-8px_rgba(16,124,65,0.35)]'
                  : p.isBusted
                  ? 'border-rose-500 shadow-[0_14px_36px_-8px_rgba(244,63,94,0.35)]'
                  : p.isThrowing
                  ? 'border-[#F76505] shadow-[0_14px_36px_-8px_rgba(247,101,5,0.32)]'
                  : 'border-slate-200 opacity-90'
              )}
            >
              {/* Active Turn Orange Top Bar */}
              <div
                className={cn(
                  'h-2.5 w-full transition-colors',
                  p.isWinner
                    ? 'bg-[#107C41]'
                    : p.isBusted
                    ? 'bg-rose-500'
                    : p.isThrowing
                    ? 'bg-[#F76505]'
                    : 'bg-slate-200'
                )}
              />

              <div className="p-5 sm:p-6 space-y-4">
                {/* Player Header + Leg Dots */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {p.isThrowing && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#F76505] text-white text-[11px] font-mono font-black uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          Throwing
                        </span>
                      )}
                      {canCheckout && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#107C41] text-white text-[11px] font-mono font-black uppercase tracking-wider">
                          <Flame className="w-3 h-3" />
                          Checkout
                        </span>
                      )}
                      {p.isWinner && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#107C41] text-white text-[11px] font-mono font-black uppercase tracking-wider">
                          <Trophy className="w-3 h-3" />
                          Winner
                        </span>
                      )}
                    </div>
                    <h2 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight truncate mt-1">
                      {p.name}
                    </h2>
                  </div>

                  {/* Legs Box + Orange Leg Pips */}
                  <div className="text-right shrink-0">
                    <div className="px-4 py-1.5 rounded-2xl bg-slate-900 text-white font-mono text-2xl sm:text-3xl font-black tabular-nums leading-none">
                      {p.legs}
                    </div>
                    <div className="flex items-center justify-end gap-1 mt-1.5">
                      {Array.from({ length: Math.min(legDotsCount, 7) }).map((_, idx) => (
                        <span
                          key={idx}
                          className={cn(
                            'w-2.5 h-2.5 rounded-full transition-colors',
                            idx < p.legs ? 'bg-[#F76505]' : 'bg-slate-200'
                          )}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* GIANT REMAINING SCORE */}
                <div className="text-center py-2">
                  <div
                    className={cn(
                      'text-7xl sm:text-8xl lg:text-9xl font-black font-mono tabular-nums leading-none tracking-tight',
                      p.isBusted
                        ? 'text-rose-600'
                        : canCheckout
                        ? 'text-[#107C41]'
                        : p.isThrowing
                        ? 'text-slate-950'
                        : 'text-slate-700'
                    )}
                  >
                    {p.isKnown ? p.score : '—'}
                  </div>
                </div>

                {/* Target Orange Progress Bar (Demolition style) */}
                <div className="h-3.5 w-full rounded-full bg-slate-100 border border-slate-200 overflow-hidden p-0.5">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500 ease-out',
                      p.isBusted
                        ? 'bg-rose-500'
                        : canCheckout
                        ? 'bg-[#107C41]'
                        : p.isThrowing
                        ? 'bg-[#F76505]'
                        : 'bg-slate-400'
                    )}
                    style={{ width: `${pctRemaining}%` }}
                  />
                </div>

                {/* Footer Stat Tiles */}
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <div className="rounded-2xl bg-[#F4F5F7] border border-slate-200/80 px-3.5 py-2.5 text-center">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold">
                      3-Dart Avg
                    </div>
                    <div className="text-xl sm:text-2xl font-black font-mono tabular-nums text-slate-900 mt-0.5">
                      {p.avg > 0 ? p.avg.toFixed(1) : '—'}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-[#F4F5F7] border border-slate-200/80 px-3.5 py-2.5 text-center">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold">
                      {p.darts !== null ? 'Darts in Leg' : 'Legs Won'}
                    </div>
                    <div className="text-xl sm:text-2xl font-black font-mono tabular-nums text-[#F76505] mt-0.5">
                      {p.darts !== null ? p.darts : p.legs}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* LIVE PDC CHECKOUT ROUTE BANNER (Classic Darts Forest Green + Target Orange) */}
      {checkoutRoute ? (
        <div className="rounded-3xl bg-[#107C41] text-white px-6 py-4 flex flex-wrap items-center justify-between gap-4 shadow-[0_12px_32px_-8px_rgba(16,124,65,0.45)]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
              <Zap className="w-7 h-7 text-amber-300" />
            </div>
            <div>
              <div className="text-lg sm:text-2xl font-black uppercase tracking-wider leading-tight">
                Checkout Route • {remaining}
              </div>
              <div className="text-sm sm:text-base font-mono text-emerald-100">
                {outRule === 'double' ? 'Finish on Double or Bull' : 'Straight Out'} • {dartsLeft}{' '}
                dart{dartsLeft === 1 ? '' : 's'} left
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            {checkoutRoute.map((step, i) => (
              <React.Fragment key={`${step}-${i}`}>
                {i > 0 && <ArrowRight className="w-6 h-6 text-emerald-200" />}
                <span
                  className={cn(
                    'px-5 sm:px-6 py-2 sm:py-2.5 rounded-2xl font-mono font-black text-3xl sm:text-5xl tabular-nums leading-none border-2',
                    i === 0
                      ? 'bg-[#F76505] text-white border-white shadow-[0_6px_22px_rgba(0,0,0,0.28)]'
                      : 'bg-white text-slate-950 border-white/80'
                  )}
                >
                  {step}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>
      ) : isBust ? (
        <div className="rounded-2xl bg-rose-600 text-white px-5 py-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
          <span className="text-lg sm:text-2xl font-black uppercase tracking-wider flex items-center gap-2.5">
            <ShieldAlert className="w-7 h-7 shrink-0" />
            BUST — Restored to {turnStartRemaining}
          </span>
          <span className="text-sm sm:text-base font-mono font-bold opacity-95">
            Pull darts to continue
          </span>
        </div>
      ) : lastBanner ? (
        <div className="rounded-2xl bg-slate-900 text-white px-5 py-4 flex items-center justify-center gap-3 shadow-lg border-2 border-[#F76505]">
          <Trophy className="w-6 h-6 text-[#F76505] shrink-0" />
          <span className="text-lg sm:text-2xl font-black uppercase tracking-wider">
            {lastBanner}
          </span>
        </div>
      ) : null}

      {/* LIGHT-MODE 3-DART LIVE VISIT STRIP + GIANT TARGET BOARD */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Left/Top: Live 3-Dart Visit Cards */}
        <div className="xl:col-span-5 rounded-3xl bg-white border border-slate-200 p-5 sm:p-6 space-y-4 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between">
            <span className="text-sm font-mono uppercase tracking-widest font-black text-slate-500">
              Current Visit
            </span>
            <span className="text-3xl sm:text-4xl font-black font-mono tabular-nums text-[#F76505]">
              {isBust ? 'BUST' : visitScore}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((idx) => {
              const dart = currentVisitThrows[idx];
              return (
                <div
                  key={idx}
                  className={cn(
                    'relative flex flex-col items-center justify-center h-28 sm:h-32 rounded-2xl border-2 transition-all',
                    dart
                      ? dart.bouncer || dart.score === 0
                        ? 'bg-rose-50 border-rose-400 text-rose-700'
                        : dart.segment.multiplier === 3
                        ? 'bg-[#FFF3EB] border-[#F76505] text-[#C2410C]'
                        : dart.segment.multiplier === 2
                        ? 'bg-emerald-50 border-[#107C41] text-[#107C41]'
                        : 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-[#F4F5F7] border-dashed border-slate-300 text-slate-400'
                  )}
                >
                  <span className="absolute top-2 left-3 text-xs font-mono font-black opacity-65">
                    D{idx + 1}
                  </span>
                  {dart ? (
                    <>
                      <span className="text-3xl sm:text-4xl font-black font-mono leading-none">
                        {dart.segment.name}
                      </span>
                      <span className="text-xs sm:text-sm font-extrabold mt-1.5 opacity-85">
                        {dart.score} pts
                      </span>
                    </>
                  ) : (
                    <span className="text-3xl font-mono opacity-40">—</span>
                  )}
                </div>
              );
            })}
          </div>

          {showTakeoutPrompt && (
            <div className="w-full py-3.5 px-5 rounded-2xl bg-[#F76505] text-white font-black text-base sm:text-xl uppercase tracking-wider flex items-center justify-center gap-3 shadow-[0_8px_24px_-4px_rgba(247,101,5,0.45)] animate-pulse">
              <span>Pull Darts for Next Turn</span>
              <ArrowRight className="w-6 h-6" />
            </div>
          )}
        </div>

        {/* Right/Bottom: Giant 640px Target Board with Checkout Highlights */}
        <div className="xl:col-span-7 rounded-3xl bg-white border border-slate-200 p-5 flex flex-col items-center space-y-3 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.08)]">
          <div className="w-full flex items-center justify-between gap-2 text-sm sm:text-base font-mono">
            <span className="flex items-center gap-2 font-black text-slate-800 uppercase tracking-wider">
              <Target className="w-5 h-5 text-[#F76505]" />
              {hasCheckoutHighlight
                ? `Checkout Target: Aim ${checkoutRoute?.[0]}`
                : 'Live Dartboard Impact'}
            </span>
            <span className="text-xs sm:text-sm font-bold text-slate-500">
              {isPlayerTurn ? `${activePlayer.name} at the oche` : `${opponentName} throwing`}
            </span>
          </div>

          <SvgDartboard
            size={640}
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
      </div>
    </div>
  );
};
