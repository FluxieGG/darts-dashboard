import React, { useMemo } from 'react';
import { DartThrow } from '../../types/darts';
import { coordsToSvg } from '../../lib/geometry';

interface DartPlotOverlayProps {
  sessionThrows: DartThrow[];
  currentVisitThrows?: DartThrow[];
  mode: 'dots' | 'density' | 'both';
  center?: number;
  boardScale?: number;
}

export const DartPlotOverlay: React.FC<DartPlotOverlayProps> = ({
  sessionThrows,
  currentVisitThrows = [],
  mode,
  center = 200,
  boardScale = 145,
}) => {
  // Convert throws with coordinates to SVG positions
  const sessionPoints = useMemo(() => {
    return sessionThrows
      .filter((t) => t.coords && !t.bouncer)
      .slice(0, 120) // Cap display for smooth high-FPS rendering
      .map((t, idx) => {
        const { svgX, svgY } = coordsToSvg(t.coords!, center, boardScale);
        return {
          id: t.id,
          svgX,
          svgY,
          score: t.score,
          segment: t.segment.name,
          ageIndex: idx,
        };
      });
  }, [sessionThrows, center, boardScale]);

  // Current active visit points (up to 3)
  const currentVisitPoints = useMemo(() => {
    return currentVisitThrows
      .filter((t) => t.coords && !t.bouncer)
      .map((t, idx) => {
        const { svgX, svgY } = coordsToSvg(t.coords!, center, boardScale);
        return {
          id: t.id,
          dartNumber: idx + 1,
          svgX,
          svgY,
          segment: t.segment.name,
          score: t.score,
        };
      });
  }, [currentVisitThrows, center, boardScale]);

  // Pre-calculate density cluster circles for authentic broadcast heat mapping
  const densityClusters = useMemo(() => {
    if (mode === 'dots') return [];

    // Sample top cluster centers (e.g. T20, T19, Bull clusters)
    const valid = sessionPoints.slice(0, 80);
    if (valid.length === 0) return [];

    // Group nearby points within 18 SVG units
    const clusters: Array<{ x: number; y: number; weight: number }> = [];

    valid.forEach((pt) => {
      let matched = false;
      for (const cl of clusters) {
        const dist = Math.hypot(cl.x - pt.svgX, cl.y - pt.svgY);
        if (dist < 22) {
          cl.x = (cl.x * cl.weight + pt.svgX) / (cl.weight + 1);
          cl.y = (cl.y * cl.weight + pt.svgY) / (cl.weight + 1);
          cl.weight += 1;
          matched = true;
          break;
        }
      }
      if (!matched) {
        clusters.push({ x: pt.svgX, y: pt.svgY, weight: 1 });
      }
    });

    return clusters;
  }, [sessionPoints, mode]);

  return (
    <g id="dart-overlay" className="pointer-events-none">
      <defs>
        {/* Glow filters */}
        <filter id="currentDartGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <radialGradient id="heatRadial">
          <stop offset="0%" stopColor="#10B981" stopOpacity="0.7" />
          <stop offset="40%" stopColor="#F59E0B" stopOpacity="0.45" />
          <stop offset="80%" stopColor="#F43F5E" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#F43F5E" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Mode: Density Heatmap (Glowing cluster zones) */}
      {(mode === 'density' || mode === 'both') && (
        <g id="density-clusters" opacity="0.85">
          {densityClusters.map((cluster, i) => {
            const radius = Math.min(16 + cluster.weight * 5, 42);
            const opacity = Math.min(0.25 + cluster.weight * 0.12, 0.75);
            return (
              <circle
                key={`heat-${i}`}
                cx={cluster.x}
                cy={cluster.y}
                r={radius}
                fill="url(#heatRadial)"
                opacity={opacity}
                className="mix-blend-screen animate-pulse-glow"
              />
            );
          })}
        </g>
      )}

      {/* Mode: Dot Plot (Session throws) */}
      {(mode === 'dots' || mode === 'both') && (
        <g id="session-dots">
          {sessionPoints.map((pt) => {
            // Decay opacity for older darts
            const opacity = Math.max(0.3, 0.92 - pt.ageIndex * 0.012);
            return (
              <circle
                key={pt.id}
                cx={pt.svgX}
                cy={pt.svgY}
                r={4.2}
                fill="#38BDF8"
                opacity={opacity}
                stroke="#0B0F17"
                strokeWidth="1"
              />
            );
          })}
        </g>
      )}

      {/* Current Visit Throws (Prominently highlighted with dart index for 8ft visibility) */}
      <g id="current-visit-dots">
        {currentVisitPoints.map((pt) => (
          <g key={`cur-${pt.id}`} className="transition-all duration-300">
            {/* Outer pulsating beacon */}
            <circle
              cx={pt.svgX}
              cy={pt.svgY}
              r={13}
              fill="#10B981"
              opacity="0.35"
              className="animate-ping"
            />
            {/* Dart Pin Head */}
            <circle
              cx={pt.svgX}
              cy={pt.svgY}
              r={8.5}
              fill="#10B981"
              stroke="#FFFFFF"
              strokeWidth="2.2"
              filter="url(#currentDartGlow)"
            />
            {/* Dart Number Label */}
            <text
              x={pt.svgX}
              y={pt.svgY + 4}
              textAnchor="middle"
              fill="#0B0F17"
              className="font-mono text-[11px] font-black select-none"
            >
              {pt.dartNumber}
            </text>
          </g>
        ))}
      </g>
    </g>
  );
};
