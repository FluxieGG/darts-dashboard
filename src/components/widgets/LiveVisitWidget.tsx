import React from 'react';
import { useLiveBoardStore } from '../../store/useLiveBoardStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';

export const LiveVisitWidget: React.FC = () => {
  const {
    currentVisitThrows,
    visitScore,
    isBust,
    boardStatus,
    lastCompletedVisit,
  } = useLiveBoardStore();
  const activePlayer = usePlayerStore((s) => s.getActivePlayer());

  const slots = [0, 1, 2];

  const statusLabel =
    boardStatus === 'takeout'
      ? 'Pull Darts'
      : boardStatus === 'throw'
      ? 'Throw'
      : 'Ready';

  return (
    <div className="card-matte rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-4 sm:mb-5">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              'w-3 h-3 rounded-full',
              boardStatus === 'takeout'
                ? 'bg-amber-400 animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.8)]'
                : 'bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.8)]'
            )}
          />
          <h3 className="text-sm sm:text-base font-bold tracking-wider uppercase text-slate-200">
            Live Visit
          </h3>
          <span className="text-sm text-slate-400 font-mono font-semibold">
            ({activePlayer.name})
          </span>
        </div>

        {/* Pure Broadcast Status Pill */}
        <span
          className={cn(
            'px-3.5 py-1 rounded-full text-xs sm:text-sm font-mono font-bold uppercase tracking-wider border',
            boardStatus === 'takeout'
              ? 'bg-amber-500/20 text-amber-300 border-amber-400/50 animate-pulse'
              : 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40'
          )}
        >
          {statusLabel}
        </span>
      </div>

      {/* Main Throw Badges & Broadcast-Scale Visit Score */}
      <div className="grid grid-cols-12 gap-3 sm:gap-4 items-center">
        {/* 3 Dart Badges (takes 8 cols) */}
        <div className="col-span-8 grid grid-cols-3 gap-2.5 sm:gap-3.5">
          {slots.map((idx) => {
            const dart = currentVisitThrows[idx];
            const isFilled = Boolean(dart);

            return (
              <div
                key={`slot-${idx}`}
                className={cn(
                  'flex flex-col items-center justify-center h-28 sm:h-36 rounded-2xl border-2 transition-all duration-300 relative overflow-hidden',
                  isFilled
                    ? dart?.bouncer || dart?.score === 0
                      ? 'bg-rose-500/15 border-rose-400/50 text-rose-300'
                      : dart?.segment.multiplier === 3
                      ? 'bg-amber-500/20 border-amber-400/60 text-amber-300 shadow-[0_0_24px_-4px_rgba(245,158,11,0.35)]'
                      : dart?.segment.multiplier === 2
                      ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300 shadow-[0_0_24px_-4px_rgba(16,185,129,0.35)]'
                      : 'bg-slate-800/90 border-slate-500/60 text-white'
                    : 'bg-slate-900/50 border-dashed border-white/15 text-slate-600'
                )}
              >
                <span className="absolute top-2 left-2.5 text-xs font-mono font-bold text-slate-400">
                  D{idx + 1}
                </span>

                {isFilled ? (
                  <>
                    <span className="text-3xl sm:text-5xl font-black tracking-tight font-mono leading-none mt-2">
                      {dart.segment.name}
                    </span>
                    <span className="text-sm sm:text-lg text-slate-200/90 font-bold tabular-nums mt-1.5">
                      {dart.score} pts
                    </span>
                  </>
                ) : (
                  <span className="text-3xl font-light text-slate-600 font-mono">—</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Visit Total Sum (takes 4 cols) */}
        <div
          className={cn(
            'col-span-4 flex flex-col items-center justify-center h-28 sm:h-36 rounded-2xl border-2 p-3 transition-all',
            visitScore >= 140
              ? 'bg-amber-500/15 border-amber-400/50 shadow-[0_0_28px_-4px_rgba(245,158,11,0.3)]'
              : visitScore >= 100
              ? 'bg-emerald-500/15 border-emerald-400/50 shadow-[0_0_28px_-4px_rgba(16,185,129,0.3)]'
              : 'bg-slate-900/80 border-white/15'
          )}
        >
          {isBust ? (
            <div className="flex flex-col items-center text-rose-400 animate-bounce">
              <AlertTriangle className="w-8 h-8 mb-1" />
              <span className="text-xl font-black tracking-wider uppercase">BUST</span>
            </div>
          ) : (
            <>
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-300">
                Total
              </span>
              <span
                className={cn(
                  'text-5xl sm:text-7xl font-black font-mono tabular-nums tracking-tight leading-none mt-1',
                  visitScore >= 140
                    ? 'text-amber-300'
                    : visitScore >= 100
                    ? 'text-emerald-300'
                    : 'text-white'
                )}
              >
                {visitScore}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Prominent recap of last completed visit when board is cleared */}
      {lastCompletedVisit && currentVisitThrows.length === 0 && (
        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-sm sm:text-base font-mono">
          <span className="text-slate-300">
            Last Visit:{' '}
            <span className="text-white font-bold">
              {lastCompletedVisit.throws.map((t) => t.segment.name).join(' • ')}
            </span>
          </span>
          <span className="text-emerald-400 font-black tabular-nums text-base sm:text-lg">
            {lastCompletedVisit.totalScore} pts
          </span>
        </div>
      )}
    </div>
  );
};
