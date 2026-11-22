import React from 'react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useLiveBoardStore } from '../../store/useLiveBoardStore';
import { MetricCard } from '../common/MetricCard';
import { formatAvg, formatPct, getDeltaIndicator } from '../../lib/utils';
import { Target, Zap, CheckCircle2, Trophy } from 'lucide-react';

export const HeroKpisWidget: React.FC = () => {
  const stats = usePlayerStore((s) => s.getActiveStats());
  const currentVisitThrows = useLiveBoardStore((s) => s.currentVisitThrows);
  const visitScore = useLiveBoardStore((s) => s.visitScore);

  const committedPoints = stats.sessionThrows.reduce((sum, d) => sum + d.score, 0);
  const livePoints = currentVisitThrows.reduce((sum, d) => sum + d.score, 0);
  const totalDarts = stats.totalDartsThrown + currentVisitThrows.length;
  const live3DA = totalDarts > 0 ? ((committedPoints + livePoints) / totalDarts) * 3 : 0;

  const combinedChronological = [
    ...[...stats.sessionThrows].reverse(),
    ...currentVisitThrows,
  ];
  const firstNine = combinedChronological.slice(0, 9);
  const liveFirstNineAvg =
    firstNine.length > 0
      ? (firstNine.reduce((sum, d) => sum + d.score, 0) / firstNine.length) * 3
      : 0;

  const liveHighestVisit = Math.max(stats.highestVisit, visitScore);
  const showDelta = stats.allTimeAvg > 0 && totalDarts > 0;
  const delta = showDelta ? getDeltaIndicator(live3DA, stats.allTimeAvg) : undefined;

  return (
    <div className="grid grid-cols-2 gap-4 sm:gap-5">
      {/* 1. 3-Dart Average */}
      <MetricCard
        label="3-Dart Avg"
        value={formatAvg(live3DA)}
        subtitle={
          totalDarts > 0
            ? `${totalDarts} darts logged`
            : 'Waiting for first throw'
        }
        delta={delta}
        icon={<Target className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-400" />}
        accentColor="emerald"
        size="lg"
      />

      {/* 2. First 9 Average */}
      <MetricCard
        label="First 9 Avg"
        value={formatAvg(liveFirstNineAvg)}
        subtitle={
          firstNine.length > 0
            ? `${firstNine.length}/9 opening darts`
            : 'Opening scoring pace'
        }
        icon={<Zap className="w-6 h-6 sm:w-7 sm:h-7 text-amber-400" />}
        accentColor="amber"
        size="lg"
      />

      {/* 3. Checkout % */}
      <MetricCard
        label="Checkout %"
        value={formatPct(stats.checkoutPct)}
        subtitle={`${stats.checkoutHits} / ${stats.checkoutAttempts} double attempts`}
        icon={<CheckCircle2 className="w-6 h-6 sm:w-7 sm:h-7 text-sky-400" />}
        accentColor="sky"
        size="md"
      />

      {/* 4. Highest Visit / Checkout */}
      <MetricCard
        label="Highest Visit"
        value={liveHighestVisit}
        subtitle={
          stats.highestCheckout > 0
            ? `High Out: ${stats.highestCheckout} | Visits: ${stats.tonBreakdown.totalVisits}`
            : `${stats.tonBreakdown.totalVisits} completed visits`
        }
        icon={<Trophy className="w-6 h-6 sm:w-7 sm:h-7 text-purple-400" />}
        accentColor="default"
        size="md"
      />
    </div>
  );
};
