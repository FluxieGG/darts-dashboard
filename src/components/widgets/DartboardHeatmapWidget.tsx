import React, { useState } from 'react';
import { SvgDartboard } from '../dartboard/SvgDartboard';
import { DartPlotOverlay } from '../dartboard/DartPlotOverlay';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useLiveBoardStore } from '../../store/useLiveBoardStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { coordsToSegment } from '../../lib/geometry';
import { generateId } from '../../lib/utils';
import { Trash2, Flame, Crosshair } from 'lucide-react';
import { DartThrow } from '../../types/darts';

export const DartboardHeatmapWidget: React.FC = () => {
  const stats = usePlayerStore((s) => s.getActiveStats());
  const resetSession = usePlayerStore((s) => s.resetSessionStats);
  const currentVisitThrows = useLiveBoardStore((s) => s.currentVisitThrows);
  const addSimulatedDart = useLiveBoardStore((s) => s.addSimulatedDart);

  const dataMode = useSettingsStore((s) => s.dataMode);
  const heatmapMode = useSettingsStore((s) => s.heatmapMode);
  const setHeatmapMode = useSettingsStore((s) => s.setHeatmapMode);

  const [clickedCoord, setClickedCoord] = useState<{ x: number; y: number } | null>(null);

  const handleBoardClick = (coords: { x: number; y: number }) => {
    if (dataMode !== 'demo') return;

    setClickedCoord(coords);
    const segment = coordsToSegment(coords.x, coords.y);
    const score = segment.number === 50 ? 50 : segment.number * segment.multiplier;

    const simulatedDart: DartThrow = {
      id: generateId('click-dart'),
      visitDartIndex: (currentVisitThrows.length % 3) as 0 | 1 | 2,
      segment,
      score,
      coords,
      timestamp: Date.now(),
    };

    addSimulatedDart(simulatedDart);
  };

  const latestDart =
    currentVisitThrows[currentVisitThrows.length - 1] || stats.sessionThrows[0];
  const totalPlottedDarts = stats.sessionThrows.length + currentVisitThrows.length;

  return (
    <div className="card-matte rounded-2xl p-5 sm:p-6 flex flex-col items-center">
      {/* Header and Mode Switcher */}
      <div className="w-full flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <Crosshair className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm sm:text-base font-bold tracking-wider uppercase text-slate-200">
            Dartboard Heatmap
          </h3>
          <span className="text-sm text-slate-400 font-mono font-semibold">
            ({totalPlottedDarts} darts)
          </span>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-900/90 rounded-lg p-1 border border-white/15 text-xs sm:text-sm">
            <button
              onClick={() => setHeatmapMode('dots')}
              className={`px-3 py-1 rounded-md transition-colors ${
                heatmapMode === 'dots'
                  ? 'bg-slate-700 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Dots
            </button>
            <button
              onClick={() => setHeatmapMode('density')}
              className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1 ${
                heatmapMode === 'density'
                  ? 'bg-slate-700 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              Heat
            </button>
            <button
              onClick={() => setHeatmapMode('both')}
              className={`px-3 py-1 rounded-md transition-colors ${
                heatmapMode === 'both'
                  ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/35'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Both
            </button>
          </div>

          <button
            onClick={() => resetSession()}
            title="Reset Session & Clear Board"
            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors border border-transparent hover:border-rose-500/30"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Large Broadcast-Scale SVG Dartboard */}
      <div className="w-full max-w-[560px] flex justify-center my-2">
        <SvgDartboard
          size={540}
          onBoardClick={dataMode === 'demo' ? handleBoardClick : undefined}
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
          {dataMode === 'demo'
            ? 'Click board to simulate dart'
            : 'Live coordinates from Autodarts'}
        </span>
        {latestDart?.coords ? (
          <span className="text-emerald-400 font-bold">
            {latestDart.segment.name} ({latestDart.coords.x.toFixed(3)},{' '}
            {latestDart.coords.y.toFixed(3)})
          </span>
        ) : clickedCoord ? (
          <span className="text-emerald-400 font-bold">
            x: {clickedCoord.x.toFixed(3)}, y: {clickedCoord.y.toFixed(3)}
          </span>
        ) : (
          <span>No throws yet</span>
        )}
      </div>
    </div>
  );
};
