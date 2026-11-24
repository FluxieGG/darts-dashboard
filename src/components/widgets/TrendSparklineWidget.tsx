import React, { useId, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { usePlayerStore } from '../../store/usePlayerStore';
import { TrendingUp } from 'lucide-react';
import { formatAvg } from '../../lib/utils';

export const TrendSparklineWidget: React.FC = () => {
  const uid = useId().replace(/:/g, '');
  const avgGradientId = `${uid}-avgGradient`;
  const stats = usePlayerStore((s) => s.getActiveStats());

  const data = useMemo(
    () => (stats?.trendHistory ?? []).filter((d) => Number.isFinite(d?.threeDartAvg)),
    [stats?.trendHistory]
  );

  const rawBaseline =
    (stats?.allTimeAvg ?? 0) > 0 ? stats.allTimeAvg : (stats?.threeDartAvg ?? 0);
  const baselineAvg = Number.isFinite(rawBaseline) ? rawBaseline : 0;

  return (
    <div className="card-matte rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <TrendingUp className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm sm:text-base font-bold tracking-wider uppercase text-slate-200">
            Average Progression Trend
          </h3>
        </div>
        {data.length > 0 && (
          <div className="flex items-center gap-4 text-sm font-semibold">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-3 h-1 bg-emerald-400 inline-block rounded-full" />
              3-Dart Avg
            </span>
            {baselineAvg > 0 && (
              <span className="flex items-center gap-1.5 text-slate-400 font-mono">
                <span className="w-3 h-0.5 border-t-2 border-dashed border-slate-400 inline-block" />
                {formatAvg(baselineAvg)}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="w-full h-56 sm:h-64 mt-2">
        {data.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center rounded-xl bg-slate-900/50 border border-dashed border-white/15 text-center px-6">
            <TrendingUp className="w-8 h-8 text-slate-500 mb-2.5" />
            <p className="text-base font-semibold text-slate-300">
              No visits recorded yet
            </p>
            <p className="text-sm text-slate-400 mt-1">
              Your rolling 3-Dart Average curve plots automatically after each visit
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180}>
            <AreaChart data={data} margin={{ top: 12, right: 12, left: -16, bottom: 4 }}>
              <defs>
                <linearGradient id={avgGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                stroke="#94A3B8"
                fontSize={13}
                fontWeight={600}
                tickLine={false}
                axisLine={false}
                dy={6}
              />
              <YAxis
                domain={[
                  (min: number) => (Number.isFinite(min) ? Math.max(0, Math.floor(min - 5)) : 0),
                  (max: number) => (Number.isFinite(max) ? Math.ceil(max + 5) : 100),
                ]}
                stroke="#94A3B8"
                fontSize={13}
                fontWeight={600}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => Math.round(v).toString()}
              />
              {baselineAvg > 0 && (
                <ReferenceLine
                  y={baselineAvg}
                  stroke="#94A3B8"
                  strokeDasharray="4 4"
                  strokeOpacity={0.7}
                />
              )}
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0]?.payload;
                    if (!item) return null;
                    return (
                      <div className="rounded-xl bg-[#141D2B] border border-white/15 p-3 shadow-2xl text-sm">
                        <p className="font-bold text-white">
                          {item.label} ({item.date})
                        </p>
                        <p className="text-emerald-400 font-mono font-black text-base mt-1">
                          3DA: {formatAvg(item.threeDartAvg)}
                        </p>
                        <p className="text-amber-400 font-mono font-bold mt-0.5">
                          First 9: {formatAvg(item.firstNineAvg)}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="threeDartAvg"
                stroke="#10B981"
                strokeWidth={3.5}
                fillOpacity={1}
                fill={`url(#${avgGradientId})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
