import React, { useMemo } from 'react';
import { SvgDartboard, SegmentOverlayStyle } from '../dartboard/SvgDartboard';
import { DartPlotOverlay } from '../dartboard/DartPlotOverlay';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useLiveBoardStore } from '../../store/useLiveBoardStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useOnlineMatchStore } from '../../store/useOnlineMatchStore';
import { getCheckoutRoute } from '../../games/utils/dartHelpers';
import { Crosshair, Flame, Target } from 'lucide-react';

/**
 * Pure Broadcast Kiosk Dartboard Heatmap Widget (8ft glanceable, zero UI clutter).
 * Automatically highlights optimal PDC checkout doubles/trebles when Online Match Co-Pilot is active!
 */
export const DartboardHeatmapWidget: React.FC = () => {
  const stats = usePlayerStore((s) => s.getActiveStats());
  const currentVisitThrows = useLiveBoardStore((s) => s.currentVisitThrows);
  const heatmapMode = useSettingsStore((s) => s.heatmapMode);

  const matchActive = useOnlineMatchStore((s) => s.isActive);
  const matchRemaining = useOnlineMatchStore((s) => s.remaining);
  const matchOutRule = useOnlineMatchStore((s) => s.outRule);

  const dartsLeftInVisit = Math.max(1, 3 - currentVisitThrows.length);
  const checkoutRoute = useMemo(() => {
    if (!matchActive || matchRemaining <= 0 || matchRemaining > 170) return null;
    const route = getCheckoutRoute(matchRemaining, matchOutRule);
    if (!route || route.length > dartsLeftInVisit) return null;
    return route;
  }, [matchActive, matchRemaining, matchOutRule, dartsLeftInVisit]);

  const segmentOverlays = useMemo<Record<string, SegmentOverlayStyle>>(() => {
    if (!checkoutRoute || checkoutRoute.length === 0) return {};
    const overlays: Record<string, SegmentOverlayStyle> = {
      [checkoutRoute[0]]: {
        fill: '#10B981',
        opacity: 0.9,
        stroke: '#FFFFFF',
        pulse: true,
        badge: checkoutRoute[0],
      },
    };
    if (checkoutRoute[1] && checkoutRoute[1] !== checkoutRoute[0]) {
      overlays[checkoutRoute[1]] = {
        fill: '#38BDF8',
        opacity: 0.55,
      };
    }
    return overlays;
  }, [checkoutRoute]);

  const latestDart =
    currentVisitThrows[currentVisitThrows.length - 1] || stats.sessionThrows[0];
  const totalPlottedDarts = stats.sessionThrows.length + currentVisitThrows.length;

  const modeLabel =
    heatmapMode === 'both'
      ? 'Dots + Heat'
      : heatmapMode === 'density'
      ? 'Density Heat'
      : 'Dot Plot';

  return (
    <div className="card-matte rounded-2xl p-5 sm:p-6 flex flex-col items-center">
      {/* Clean Broadcast Header */}
      <div className="w-full flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <Crosshair className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm sm:text-base font-bold tracking-wider uppercase text-slate-200">
            Dartboard Heatmap
          </h3>
          <span className="text-sm text-slate-400 font-mono font-semibold tabular-nums">
            ({totalPlottedDarts} darts)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {checkoutRoute && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/55 text-xs font-mono font-black text-emerald-200">
              <Target className="w-3.5 h-3.5 text-emerald-400" />
              Checkout: {checkoutRoute.join(' • ')}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/80 border border-white/10 text-xs font-mono font-semibold text-slate-300">
            {heatmapMode !== 'dots' && <Flame className="w-3.5 h-3.5 text-amber-400" />}
            {modeLabel}
          </span>
        </div>
      </div>

      {/* Large Broadcast-Scale SVG Dartboard */}
      <div className="w-full max-w-[560px] flex justify-center my-2">
        <SvgDartboard
          size={540}
          segmentOverlays={segmentOverlays}
          dimInactiveSegments={Boolean(checkoutRoute)}
        >
          <DartPlotOverlay
            sessionThrows={stats.sessionThrows}
            currentVisitThrows={currentVisitThrows}
            mode={heatmapMode}
          />
        </SvgDartboard>
      </div>

      {/* Coordinate & Last Dart Footer */}
      <div className="w-full flex items-center justify-between mt-3 pt-3 border-t border-white/10 text-xs sm:text-sm text-slate-400 font-mono">
        <span>
          {checkoutRoute
            ? `Target highlighted: ${checkoutRoute[0]} (${matchRemaining} left)`
            : 'Live dart precision telemetry'}
        </span>
        {latestDart?.coords ? (
          <span className="text-emerald-400 font-bold tabular-nums">
            {latestDart.segment.name} ({latestDart.coords.x.toFixed(3)},{' '}
            {latestDart.coords.y.toFixed(3)})
          </span>
        ) : (
          <span>Waiting for throw</span>
        )}
      </div>
    </div>
  );
};
