import React, { useMemo } from 'react';
import { useOnlineMatchStore } from '../../store/useOnlineMatchStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useLiveBoardStore } from '../../store/useLiveBoardStore';
import { getCheckoutRoute } from '../../games/utils/dartHelpers';
import { Badge } from '../common/Badge';
import { Crosshair, ExternalLink, Radio, ShieldAlert, Tablet, Target, Trophy, VideoOff } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Pure Broadcast Kiosk Live Online Match & Checkout Assistant Widget.
 * Driven from the iPad Oche Deck; updates live dart-by-dart from Autodarts port 3180.
 */
export const LiveMatchWidget: React.FC = () => {
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
    dartsInLeg,
    legPointsScored,
    isBust,
    lastBanner,
    matchWinner,
    dcConnected,
    dcMode,
    dcMatchUrl,
    dcLastSubmitStatus,
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
            <div className="text-sm sm:text-base font-black text-white flex items-center gap-2 flex-wrap">
              <span>Live Match &amp; Checkout Co-Pilot</span>
              {dcConnected ? (
                <Badge variant="emerald" size="sm" dot>
                  DartCounter Ready ({dcMode === 'auto' ? 'Auto' : dcMode === 'confirm' ? 'Confirm' : 'Sync'})
                </Badge>
              ) : (
                <Badge variant="slate" size="sm">
                  Standby
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-400 truncate">
              {dcConnected
                ? 'Start any match on app.dartcounter.net to auto-sync scores, checkouts & clips here.'
                : 'Track an online DartCounter / Autodarts 501/301 leg with live checkout routes.'}
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

  const isDartCounter = source === 'dartcounter';

  // For Target DartCounter matches, show a clean lightweight handoff banner to app.dartcounter.net/match
  // (clipping is disabled, and the player confirms Autodarts totals on the iPad).
  if (isDartCounter) {
    const matchHref = dcMatchUrl || 'https://app.dartcounter.net/match';
    return (
      <div className="card-matte rounded-2xl p-5 sm:p-6 border-orange-500/50 bg-gradient-to-r from-orange-500/10 via-slate-900/90 to-emerald-500/10 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <Badge variant="emerald" size="sm" dot>
              <Radio className="w-3 h-3" />
              Online Match Started
            </Badge>
            <Badge variant="amber" size="sm">
              {dcMode === 'confirm'
                ? 'IPAD CONFIRM'
                : dcMode === 'auto'
                ? 'AUTO-LOG'
                : 'MANUAL'}
            </Badge>
            <Badge variant="slate" size="sm">
              <VideoOff className="w-3 h-3" />
              CLIPS OFF
            </Badge>
          </div>
          <a
            href={matchHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#F76505] hover:bg-[#E05600] text-white font-mono font-black text-xs uppercase tracking-wider"
          >
            <span>app.dartcounter.net/match</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm text-slate-300">
          <span>
            Use Target DartCounter in Brave — confirm your Autodarts visit totals on the{' '}
            <strong className="text-white">iPad Oche Deck</strong>.
          </span>
          {dcLastSubmitStatus && (
            <span className="font-mono text-emerald-300 font-bold truncate">
              {dcLastSubmitStatus}
            </span>
          )}
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
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={isDartCounter ? 'emerald' : 'sky'} size="sm" dot>
            <Radio className="w-3 h-3" />
            {isDartCounter ? 'DartCounter' : 'Online'} {startScore} •{' '}
            {outRule === 'double' ? 'Double Out' : 'Straight Out'}
          </Badge>
          {isDartCounter && (
            <Badge variant={dcMode === 'auto' ? 'amber' : 'slate'} size="sm">
              {dcMode === 'auto'
                ? 'AUTO-SCORE'
                : dcMode === 'confirm'
                ? 'IPAD CONFIRM'
                : 'SYNC ONLY'}
            </Badge>
          )}
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

      {/* Main Remaining Score (+ Opponent Head-to-Head when DartCounter live) & Dynamic Checkout Route */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-5 sm:gap-7">
          {/* Player Remaining */}
          <div
            className={cn(
              'rounded-2xl transition-all',
              isDartCounter && isPlayerTurn && 'pr-3 border-r border-white/10'
            )}
          >
            <div className="text-[11px] font-mono uppercase tracking-widest text-slate-400 font-bold flex items-center gap-1.5">
              {isDartCounter && isPlayerTurn && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
              <span>{isDartCounter ? `${activePlayer.name} (You)` : 'Remaining Score'}</span>
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

          {/* Opponent Live Remaining (populated automatically by DartCounter Extension!) */}
          {opponentRemaining !== null && (
            <div className={cn(!isPlayerTurn && 'opacity-100', isPlayerTurn && 'opacity-75')}>
              <div className="text-[11px] font-mono uppercase tracking-widest text-slate-400 font-bold flex items-center gap-1.5">
                {!isPlayerTurn && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                )}
                <span className="truncate max-w-[160px]">{opponentName}</span>
              </div>
              <div className="flex items-baseline gap-3 mt-0.5">
                <span className="text-4xl sm:text-5xl font-black font-mono tabular-nums text-slate-200 leading-none">
                  {opponentRemaining}
                </span>
                {opponentAvg !== null && (
                  <span className="text-xs font-mono text-slate-400 tabular-nums">
                    3DA <strong className="text-sky-300">{opponentAvg.toFixed(1)}</strong>
                  </span>
                )}
              </div>
            </div>
          )}
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
              {isDartCounter && !isPlayerTurn ? `${opponentName} throwing...` : 'Power scoring phase'}
            </span>
          )}
        </div>
      </div>

      {/* DartCounter Last Auto-Submit Micro Status */}
      {isDartCounter && dcLastSubmitStatus && !lastBanner && (
        <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between pt-1 border-t border-white/[0.06]">
          <span>DartCounter Bridge</span>
          <span className="text-emerald-300/90 font-bold truncate ml-2">{dcLastSubmitStatus}</span>
        </div>
      )}

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
