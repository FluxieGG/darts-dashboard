import React from 'react';
import { SvgDartboard } from '../dartboard/SvgDartboard';
import { DartPlotOverlay } from '../dartboard/DartPlotOverlay';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useLiveBoardStore } from '../../store/useLiveBoardStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { Crosshair, Flame } from 'lucide-react';

/**
 * Pure Broadcast Kiosk Dartboard Heatmap Widget (8ft glanceable, zero UI clutter).
 * Heatmap view mode (Dots / Heat / Both) and Reset Session are controlled from the iPad Oche Deck.
 */
export const DartboardHeatmapWidget: React.FC = () => {
  const stats = usePlayerStore((s) => s.getActiveStats());
  const currentVisitThrows = useLiveBoardStore((s) => s.currentVisitThrows);
  const heatmapMode = useSettingsStore((s) => s.heatmapMode);

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
      <div className="w-full flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <Crosshair className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm sm:text-base font-bold tracking-wider uppercase text-slate-200">
            Dartboard Heatmap
          </h3>
          <span className="text-sm text-slate-400 font-mono font-semibold tabular-nums">
            ({totalPlottedDarts} darts)
          </span>
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/80 border border-white/10 text-xs font-mono font-semibold text-slate-300">
          {heatmapMode !== 'dots' && <Flame className="w-3.5 h-3.5 text-amber-400" />}
          {modeLabel}
        </span>
      </div>

      {/* Large Broadcast-Scale SVG Dartboard */}
      <div className="w-full max-w-[560px] flex justify-center my-2">
        <SvgDartboard size={540}>
          <DartPlotOverlay
            sessionThrows={stats.sessionThrows}
            currentVisitThrows={currentVisitThrows}
            mode={heatmapMode}
          />
        </SvgDartboard>
      </div>

      {/* Coordinate & Last Dart Footer */}
      <div className="w-full flex items-center justify-between mt-3 pt-3 border-t border-white/10 text-xs sm:text-sm text-slate-400 font-mono">
        <span>Live dart precision telemetry</span>
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
