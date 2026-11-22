import React from 'react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { Crosshair } from 'lucide-react';

export const DoublesTreblesWidget: React.FC = () => {
  const stats = usePlayerStore((s) => s.getActiveStats());
  const accuracies = stats.segmentAccuracy;

  return (
    <div className="card-matte rounded-2xl p-5 sm:p-6 flex flex-col justify-between h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <Crosshair className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm sm:text-base font-bold tracking-wider uppercase text-slate-200">
            Target Precision
          </h3>
        </div>
        <span className="text-sm text-slate-400 font-mono font-semibold">Hit Rates</span>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-1">
        {accuracies.map((item) => (
          <div
            key={item.segment}
            className="flex flex-col justify-between p-3 sm:p-3.5 rounded-xl bg-slate-900/75 border border-white/10 hover:border-white/20 transition-colors"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono font-black text-lg sm:text-xl text-white">
                {item.segment}
              </span>
              <span
                className="text-base sm:text-lg font-extrabold font-mono tabular-nums"
                style={{ color: item.color || '#10B981' }}
              >
                {item.pct.toFixed(0)}%
              </span>
            </div>

            <div className="flex items-center justify-between mt-2.5">
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden mr-2.5">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(item.pct, 100)}%`,
                    backgroundColor: item.color || '#10B981',
                  }}
                />
              </div>
              <span className="text-xs sm:text-sm text-slate-300 font-mono font-bold shrink-0">
                {item.hits}/{item.attempts}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
