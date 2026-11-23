import React, { useMemo } from 'react';
import { useOnlineMatchStore } from '../../store/useOnlineMatchStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useLiveBoardStore } from '../../store/useLiveBoardStore';
import { getCheckoutRoute } from '../../games/utils/dartHelpers';
import { Badge } from '../common/Badge';
import { Crosshair, Radio, ShieldAlert, Tablet, Target, Trophy } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Pure Broadcast Kiosk Live Online Match & Checkout Assistant Widget.
 * Driven from the iPad Oche Deck; updates live dart-by-dart from Autodarts port 3180.
 */
export const LiveMatchWidget: React.FC = () => {
  const {
    isActive,
    startScore,
    outRule,
    legsToWin,
    opponentName,
    playerLegs,
    opponentLegs,
    remaining,
    dartsInLeg,
    legPointsScored,
    isBust,
    lastBanner,
    matchWinner,
  } = useOnlineMatchStore();

  const activePlayer = usePlayerStore((s) => s.getActivePlayer());
  const currentVisitThrows = useLiveBoardStore((s) => s.currentVisitThrows);

  const dartsLeftInVisit = Math.max(1, 3 - currentVisitThrows.length);
  const legAvg = dartsInLeg > 0 ? (legPointsScored / dartsInLeg) * 3 : 0;

  const checkoutRoute = useMemo(() => {
    if (!isActive || remaining <= 0 || remaining > 170) return null;
    const route = getCheckoutRoute(remaining, outRule);
    if (!route || route.length > dartsLeftInVisit) return null;
    return route;
  }, [isActive, remaining, outRule, dartsLeftInVisit]);

  if (!isActive) {
    return (
      <div className="card-matte rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-white/[0.08]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-sky-500/12 border border-sky-400/30 flex items-center justify-center text-sky-400 shrink-0">
            <Crosshair className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm sm:text-base font-black text-white flex items-center gap-2">
              <span>Live Match &amp; Checkout Co-Pilot</span>
              <Badge variant="slate" size="sm">
                Standby
              </Badge>
            </div>
            <p className="text-xs text-slate-400 truncate">
              Track an online play.autodarts.io 501/301 leg with live checkout routes on the board.
            </p>
          </div>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/80 border border-white/10 text-xs font-mono text-slate-300">
          <Tablet className="w-3.5 h-3.5 text-sky-400" />
          <span>Start Match on iPad</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'card-matte rounded-2xl p-5 sm:p-6 space-y-4 transition-all',
        matchWinner === 'player'
          ? 'border-emerald-400/60 shadow-[0_0_36px_-6px_rgba(16,185,129,0.45)]'
          : isBust
          ? 'border-rose-400/60 shadow-[0_0_32px_-6px_rgba(244,63,94,0.4)]'
          : checkoutRoute
          ? 'border-emerald-400/45 shadow-[0_0_32px_-8px_rgba(16,185,129,0.3)]'
          : 'border-sky-400/35'
      )}
    >
      {/* Top Broadcast Match Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Badge variant="sky" size="sm" dot>
            <Radio className="w-3 h-3" />
            Online {startScore} • {outRule === 'double' ? 'Double Out' : 'Straight Out'}
          </Badge>
          {legsToWin > 0 && (
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
              First to {legsToWin}
            </span>
          )}
        </div>

        {/* Legs Scoreboard Pill */}
        <div className="flex items-center gap-3 px-4 py-1.5 rounded-xl bg-slate-900/90 border border-white/12 font-mono">
          <span className="text-xs sm:text-sm font-extrabold text-emerald-300 truncate max-w-[120px]">
            {activePlayer.name}
          </span>
          <span className="text-lg sm:text-xl font-black text-white tabular-nums">
            {playerLegs} — {opponentLegs}
          </span>
          <span className="text-xs sm:text-sm font-bold text-slate-400 truncate max-w-[120px]">
            {opponentName}
          </span>
        </div>
      </div>

      {/* Main Remaining Score + Dynamic Checkout Route */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-slate-400 font-bold">
            Remaining Score
          </div>
          <div className="flex items-baseline gap-4 mt-0.5">
            <span className="text-6xl sm:text-7xl font-black font-mono tabular-nums text-white leading-none">
              {remaining}
            </span>
            <div className="text-xs sm:text-sm font-mono text-slate-400 space-y-0.5 tabular-nums">
              <div>
                Leg 3DA: <strong className="text-emerald-300">{legAvg.toFixed(1)}</strong>
              </div>
              <div>
                Darts: <strong className="text-slate-200">{dartsInLeg}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic PDC Checkout Co-Pilot Pills */}
        <div className="text-right space-y-1.5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center justify-end gap-1">
            <Target className="w-3.5 h-3.5 text-emerald-400" />
            Checkout Assistant
          </div>
          {checkoutRoute ? (
            <div className="flex items-center justify-end gap-2">
              {checkoutRoute.map((step, idx) => (
                <span
                  key={`${step}-${idx}`}
                  className={cn(
                    'px-4 py-2 rounded-xl font-mono text-xl sm:text-3xl font-black border',
                    idx === 0
                      ? 'bg-emerald-500/20 border-emerald-400/75 text-emerald-200 shadow-[0_0_24px_rgba(16,185,129,0.4)]'
                      : 'bg-slate-900 border-white/15 text-white'
                  )}
                >
                  {step}
                </span>
              ))}
            </div>
          ) : remaining <= 170 && remaining > 0 ? (
            <span className="inline-block px-3.5 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-xs sm:text-sm font-mono text-slate-400">
              {dartsLeftInVisit < 3
                ? `No ${dartsLeftInVisit}-dart finish — set up double`
                : 'Bogey number — set up double'}
            </span>
          ) : (
            <span className="inline-block px-3.5 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-xs sm:text-sm font-mono text-slate-400">
              Power scoring phase
            </span>
          )}
        </div>
      </div>

      {/* Bust / Leg Won Broadcast Callout Strip */}
      {lastBanner && (
        <div
          className={cn(
            'px-4 py-2.5 rounded-xl border flex items-center justify-center gap-2 text-xs sm:text-sm font-black uppercase tracking-wider',
            isBust
              ? 'bg-rose-500/18 border-rose-400/55 text-rose-200'
              : 'bg-emerald-500/18 border-emerald-400/55 text-emerald-200'
          )}
        >
          {isBust ? (
            <ShieldAlert className="w-4 h-4 shrink-0" />
          ) : (
            <Trophy className="w-4 h-4 text-amber-300 shrink-0" />
          )}
          <span>{lastBanner}</span>
        </div>
      )}
    </div>
  );
};
