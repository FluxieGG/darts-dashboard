import React from 'react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { Zap } from 'lucide-react';

export const ScoringPowerWidget: React.FC = () => {
  const stats = usePlayerStore((s) => s.getActiveStats());
  const ton = stats.tonBreakdown;
  const total = Math.max(ton.totalVisits, 1);

  const tiers = [
    {
      label: '180 Max',
      count: ton.ton180,
      pct: ton.totalVisits > 0 ? ((ton.ton180 / total) * 100).toFixed(0) : '0',
      barClass: 'bg-gradient-to-r from-amber-500 to-amber-300 shadow-[0_0_14px_rgba(245,158,11,0.5)]',
      pillClass: 'bg-amber-500/20 text-amber-300 border-amber-400/50',
    },
    {
      label: '140+ Visits',
      count: ton.ton140Plus,
      pct: ton.totalVisits > 0 ? ((ton.ton140Plus / total) * 100).toFixed(0) : '0',
      barClass: 'bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.4)]',
      pillClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50',
    },
    {
      label: '100+ Tons',
      count: ton.ton100Plus,
      pct: ton.totalVisits > 0 ? ((ton.ton100Plus / total) * 100).toFixed(0) : '0',
      barClass: 'bg-sky-400',
      pillClass: 'bg-sky-500/20 text-sky-300 border-sky-400/50',
    },
    {
      label: '60+ Visits',
      count: ton.ton60Plus,
      pct: ton.totalVisits > 0 ? ((ton.ton60Plus / total) * 100).toFixed(0) : '0',
      barClass: 'bg-slate-300',
      pillClass: 'bg-slate-800 text-white border-slate-600',
    },
  ];

  return (
    <div className="card-matte rounded-2xl p-5 sm:p-6 flex flex-col justify-between h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <Zap className="w-5 h-5 text-amber-400" />
          <h3 className="text-sm sm:text-base font-bold tracking-wider uppercase text-slate-200">
            Scoring Power
          </h3>
        </div>
        <span className="text-sm text-slate-400 font-mono font-semibold">
          {ton.totalVisits} visits
        </span>
      </div>

      <div className="space-y-4 mt-1">
        {tiers.map((tier) => {
          const widthPct = Math.min((tier.count / total) * 100 * 2.2, 100);
          return (
            <div key={tier.label} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-base sm:text-lg text-slate-200 font-bold">
                  {tier.label}
                </span>
                <div className="flex items-center gap-2.5">
                  <span className="text-slate-400 text-sm font-mono tabular-nums">
                    {tier.pct}%
                  </span>
                  <span
                    className={`inline-block min-w-[2.5rem] text-center px-2.5 py-0.5 rounded-lg text-lg sm:text-xl font-black font-mono tabular-nums border ${tier.pillClass}`}
                  >
                    {tier.count}
                  </span>
                </div>
              </div>

              {/* Thicker High-Visibility Progress Track */}
              <div className="w-full h-3.5 rounded-full bg-slate-900/90 overflow-hidden border border-white/10">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${tier.barClass}`}
                  style={{ width: `${Math.max(widthPct, tier.count > 0 ? 5 : 0)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
