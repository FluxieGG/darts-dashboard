import React from 'react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { History } from 'lucide-react';
import { cn } from '../../lib/utils';

export const RecentMatchesWidget: React.FC = () => {
  const stats = usePlayerStore((s) => s.getActiveStats());
  const visits = stats.recentVisits || [];

  return (
    <div className="card-matte rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <History className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm sm:text-base font-bold tracking-wider uppercase text-slate-200">
            Recent Visits Log
          </h3>
        </div>
        <span className="text-sm text-slate-400 font-mono font-semibold">
          {visits.length} logged
        </span>
      </div>

      {visits.length === 0 ? (
        <div className="py-10 flex flex-col items-center justify-center rounded-xl bg-slate-900/50 border border-dashed border-white/15 text-center px-6">
          <History className="w-8 h-8 text-slate-500 mb-2.5" />
          <p className="text-base font-semibold text-slate-300">No visits logged yet</p>
          <p className="text-sm text-slate-400 mt-1">
            Each completed visit from Autodarts appears here automatically
          </p>
        </div>
      ) : (
        <div className="space-y-2.5 mt-1 max-h-80 overflow-y-auto pr-1">
          {visits.map((v) => {
            const timeStr = new Date(v.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });

            return (
              <div
                key={v.id}
                className="flex items-center justify-between p-3.5 sm:p-4 rounded-xl bg-slate-900/75 border border-white/10 hover:border-white/20 transition-colors"
              >
                <div className="flex items-center gap-3.5">
                  {/* Visit Number Badge */}
                  <span className="w-10 h-10 rounded-xl flex items-center justify-center font-extrabold text-sm font-mono shrink-0 bg-slate-800 text-slate-200 border border-white/15">
                    #{v.visitNumber}
                  </span>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {v.throws.map((t, idx) => (
                        <span
                          key={`${v.id}-${idx}`}
                          className={cn(
                            'px-2.5 py-1 rounded-lg text-sm sm:text-base font-mono font-extrabold border',
                            t.segment.multiplier === 3
                              ? 'bg-amber-500/20 text-amber-300 border-amber-400/45'
                              : t.segment.multiplier === 2
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/45'
                              : t.score === 0
                              ? 'bg-rose-500/15 text-rose-300 border-rose-400/35'
                              : 'bg-slate-800 text-white border-white/15'
                          )}
                        >
                          {t.segment.name}
                        </span>
                      ))}
                    </div>
                    <div className="text-xs sm:text-sm text-slate-400 font-mono mt-1.5">
                      {timeStr} • {v.throws.length} dart{v.throws.length === 1 ? '' : 's'}
                    </div>
                  </div>
                </div>

                {/* Visit Total */}
                <div className="text-right pl-3">
                  <div
                    className={cn(
                      'font-mono font-black text-2xl sm:text-3xl tabular-nums leading-none',
                      v.totalScore === 180
                        ? 'text-amber-300'
                        : v.totalScore >= 100
                        ? 'text-emerald-300'
                        : 'text-white'
                    )}
                  >
                    {v.totalScore}
                  </div>
                  <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mt-0.5">
                    pts
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
