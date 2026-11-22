import React, { useMemo } from 'react';
import {
  DARTBOARD_RADIUS,
  SEGMENT_ORDER,
  SEGMENT_ANGLE_DEG,
  describeArcSector,
  getSegmentCenterAngle,
} from '../../lib/geometry';

export interface SegmentOverlayStyle {
  /** Target beds to apply to. Defaults to 'all' (single + double + treble). */
  beds?: 'all' | 'single' | 'double' | 'triple';
  /** Fill color (hex/rgb/rgba) */
  fill: string;
  /** Fill opacity (0 to 1), defaults to 0.78 */
  opacity?: number;
  /** Optional highlighted border stroke */
  stroke?: string;
  /** Pulse animation (ideal for Lava zones or active targets) */
  pulse?: boolean;
  /** Optional short badge label rendered inside the outer single bed (e.g., "P1", "🔥", "R") */
  badge?: string;
  badgeColor?: string;
}

interface SvgDartboardProps {
  size?: number;
  highlightSegment?: string;
  /**
   * Game-ready multi-segment overlays keyed by:
   * - Segment number as string ("20", "19", ..., "1") for a whole wedge
   * - Specific bed ("T20", "D16", "S20", "Bull", "25")
   */
  segmentOverlays?: Record<string, SegmentOverlayStyle>;
  /** Dim non-highlighted beds so active game targets pop from 8ft away */
  dimInactiveSegments?: boolean;
  onBoardClick?: (coords: { x: number; y: number }) => void;
  children?: React.ReactNode;
}

export const SvgDartboard: React.FC<SvgDartboardProps> = ({
  size = 400,
  highlightSegment,
  segmentOverlays,
  dimInactiveSegments = false,
  onBoardClick,
  children,
}) => {
  const center = 200;
  const boardScale = 145; // radius 1.0 = 145 SVG units, leaving ring for numbers up to 195

  // Radii in SVG units
  const rInnerBull = DARTBOARD_RADIUS.INNER_BULL * boardScale;
  const rOuterBull = DARTBOARD_RADIUS.OUTER_BULL * boardScale;
  const rInnerTreble = DARTBOARD_RADIUS.INNER_TREBLE * boardScale;
  const rOuterTreble = DARTBOARD_RADIUS.OUTER_TREBLE * boardScale;
  const rInnerDouble = DARTBOARD_RADIUS.INNER_DOUBLE * boardScale;
  const rOuterDouble = DARTBOARD_RADIUS.OUTER_DOUBLE * boardScale;
  const rNumberRing = 188;

  // Render all 20 segments
  const segments = useMemo(() => {
    return SEGMENT_ORDER.map((num, idx) => {
      // Polar angle for segment center: 20 is at 90 deg (top)
      const centerAngle = getSegmentCenterAngle(num);
      const startAngle = centerAngle - SEGMENT_ANGLE_DEG / 2;
      const endAngle = centerAngle + SEGMENT_ANGLE_DEG / 2;

      // In official dartboards:
      // Even index (20, 18, 13, 10, 2, 3, 7, 8, 14, 12):
      // Single beds: Black (#171C26)
      // Double/Treble: Red (#EF4444 or #DC2626)
      // Odd index (1, 4, 6, 15, 17, 19, 16, 11, 9, 5):
      // Single beds: Cream / Off-white (#E2E8F0 / #CBD5E1)
      // Double/Treble: Green (#10B981 or #059669)
      const isEven = idx % 2 === 0;
      const singleColor = isEven ? '#121824' : '#E2E8F0';
      const ringColor = isEven ? '#DC2626' : '#10B981';

      // Check for highlight & game overlays
      const isHighT = highlightSegment === `T${num}`;
      const isHighD = highlightSegment === `D${num}`;
      const isHighS = highlightSegment === `S${num}`;

      const wholeOverlay = segmentOverlays?.[String(num)];
      const overlayT =
        segmentOverlays?.[`T${num}`] ||
        (wholeOverlay && (!wholeOverlay.beds || wholeOverlay.beds === 'all' || wholeOverlay.beds === 'triple')
          ? wholeOverlay
          : undefined);
      const overlayD =
        segmentOverlays?.[`D${num}`] ||
        (wholeOverlay && (!wholeOverlay.beds || wholeOverlay.beds === 'all' || wholeOverlay.beds === 'double')
          ? wholeOverlay
          : undefined);
      const overlayS =
        segmentOverlays?.[`S${num}`] ||
        (wholeOverlay && (!wholeOverlay.beds || wholeOverlay.beds === 'all' || wholeOverlay.beds === 'single')
          ? wholeOverlay
          : undefined);

      // Numbers position on number ring
      const numAngleRad = (centerAngle * Math.PI) / 180;
      const numX = center + (rNumberRing - 14) * Math.cos(numAngleRad);
      const numY = center - (rNumberRing - 14) * Math.sin(numAngleRad);

      // Badge position in the outer single bed for game overlays
      const rBadge = (rOuterTreble + rInnerDouble) / 2;
      const badgeX = center + rBadge * Math.cos(numAngleRad);
      const badgeY = center - rBadge * Math.sin(numAngleRad);

      return {
        num,
        centerAngle,
        numX,
        numY,
        badgeX,
        badgeY,
        pathDouble: describeArcSector(center, center, rInnerDouble, rOuterDouble, startAngle, endAngle),
        pathOuterSingle: describeArcSector(center, center, rOuterTreble, rInnerDouble, startAngle, endAngle),
        pathTreble: describeArcSector(center, center, rInnerTreble, rOuterTreble, startAngle, endAngle),
        pathInnerSingle: describeArcSector(center, center, rOuterBull, rInnerTreble, startAngle, endAngle),
        singleColor,
        ringColor,
        isHighD,
        isHighT,
        isHighS,
        overlayT,
        overlayD,
        overlayS,
        badge: wholeOverlay?.badge || overlayS?.badge || overlayD?.badge || overlayT?.badge,
        badgeColor: wholeOverlay?.badgeColor || '#FFFFFF',
      };
    });
  }, [
    center,
    rInnerDouble,
    rOuterDouble,
    rOuterTreble,
    rInnerTreble,
    rOuterBull,
    rNumberRing,
    highlightSegment,
    segmentOverlays,
  ]);

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onBoardClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Normalize to 400x400 coordinate space
    const scale = 400 / rect.width;
    const svgX = clickX * scale;
    const svgY = clickY * scale;

    // Convert to bull-centered Autodarts coordinate: +x right, +y up, radius 1.0 = rOuterDouble
    const normX = (svgX - center) / rOuterDouble;
    const normY = (center - svgY) / rOuterDouble;

    onBoardClick({ x: normX, y: normY });
  };

  return (
    <div className="relative w-full flex items-center justify-center select-none">
      <svg
        viewBox="0 0 400 400"
        width={size}
        height={size}
        onClick={handleSvgClick}
        className="w-full max-w-[560px] h-auto drop-shadow-[0_12px_30px_rgba(0,0,0,0.85)] touch-none"
      >
        <defs>
          {/* Subtle outer metallic rim gradient */}
          <radialGradient id="rimGradient" cx="50%" cy="50%" r="50%">
            <stop offset="90%" stopColor="#0F172A" />
            <stop offset="96%" stopColor="#334155" />
            <stop offset="100%" stopColor="#0B0F17" />
          </radialGradient>

          {/* Wire highlight filter */}
          <filter id="wireShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="0.5" stdDeviation="0.4" floodColor="#000" floodOpacity="0.8" />
          </filter>
        </defs>

        {/* Outer Catch Ring / Number Ring */}
        <circle cx={center} cy={center} r={rNumberRing} fill="url(#rimGradient)" stroke="#1E293B" strokeWidth="2" />
        <circle cx={center} cy={center} r={rOuterDouble} fill="#0B0F17" stroke="#64748B" strokeWidth="1.2" />

        {/* Segments: Singles, Doubles, Trebles */}
        <g id="dartboard-beds">
          {segments.map((s) => {
            const hasAnyOverlay = Boolean(s.overlayS || s.overlayD || s.overlayT || s.isHighS || s.isHighD || s.isHighT);
            const inactiveOpacity = dimInactiveSegments && !hasAnyOverlay ? 0.35 : 1;

            return (
              <g key={`seg-${s.num}`} opacity={inactiveOpacity}>
                {/* Outer Single Bed */}
                <path
                  d={s.pathOuterSingle}
                  fill={s.isHighS ? '#38BDF8' : s.singleColor}
                  stroke="#475569"
                  strokeWidth="0.8"
                />
                {s.overlayS && (
                  <path
                    d={s.pathOuterSingle}
                    fill={s.overlayS.fill}
                    fillOpacity={s.overlayS.opacity ?? 0.72}
                    stroke={s.overlayS.stroke || s.overlayS.fill}
                    strokeWidth="1.1"
                    className={s.overlayS.pulse ? 'animate-pulse-glow' : undefined}
                  />
                )}

                {/* Inner Single Bed */}
                <path
                  d={s.pathInnerSingle}
                  fill={s.isHighS ? '#38BDF8' : s.singleColor}
                  stroke="#475569"
                  strokeWidth="0.8"
                />
                {s.overlayS && (
                  <path
                    d={s.pathInnerSingle}
                    fill={s.overlayS.fill}
                    fillOpacity={s.overlayS.opacity ?? 0.72}
                    stroke={s.overlayS.stroke || s.overlayS.fill}
                    strokeWidth="1.1"
                    className={s.overlayS.pulse ? 'animate-pulse-glow' : undefined}
                  />
                )}

                {/* Double Bed */}
                <path
                  d={s.pathDouble}
                  fill={s.isHighD ? '#FACC15' : s.ringColor}
                  stroke="#475569"
                  strokeWidth="0.8"
                />
                {s.overlayD && (
                  <path
                    d={s.pathDouble}
                    fill={s.overlayD.fill}
                    fillOpacity={s.overlayD.opacity ?? 0.85}
                    stroke={s.overlayD.stroke || '#FFFFFF'}
                    strokeWidth="1.2"
                    className={s.overlayD.pulse ? 'animate-pulse-glow' : undefined}
                  />
                )}

                {/* Treble Bed */}
                <path
                  d={s.pathTreble}
                  fill={s.isHighT ? '#FACC15' : s.ringColor}
                  stroke="#475569"
                  strokeWidth="0.8"
                />
                {s.overlayT && (
                  <path
                    d={s.pathTreble}
                    fill={s.overlayT.fill}
                    fillOpacity={s.overlayT.opacity ?? 0.85}
                    stroke={s.overlayT.stroke || '#FFFFFF'}
                    strokeWidth="1.2"
                    className={s.overlayT.pulse ? 'animate-pulse-glow' : undefined}
                  />
                )}

                {/* Optional Game Overlay Badge */}
                {s.badge && (
                  <text
                    x={s.badgeX}
                    y={s.badgeY + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={s.badgeColor}
                    className="font-mono text-[11px] font-black pointer-events-none select-none drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]"
                  >
                    {s.badge}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* Outer Bull (25 - Green) */}
        <circle
          cx={center}
          cy={center}
          r={rOuterBull}
          fill={highlightSegment === '25' ? '#FACC15' : '#10B981'}
          opacity={dimInactiveSegments && !segmentOverlays?.['25'] && !segmentOverlays?.['Bull'] && highlightSegment !== '25' && highlightSegment !== 'Bull' ? 0.35 : 1}
          stroke="#475569"
          strokeWidth="0.8"
        />
        {segmentOverlays?.['25'] && (
          <circle
            cx={center}
            cy={center}
            r={rOuterBull}
            fill={segmentOverlays['25'].fill}
            fillOpacity={segmentOverlays['25'].opacity ?? 0.8}
            stroke={segmentOverlays['25'].stroke || '#FFFFFF'}
            strokeWidth="1.2"
            className={segmentOverlays['25'].pulse ? 'animate-pulse-glow' : undefined}
          />
        )}

        {/* Inner Bull (50 - Red) */}
        <circle
          cx={center}
          cy={center}
          r={rInnerBull}
          fill={highlightSegment === 'Bull' ? '#FACC15' : '#DC2626'}
          opacity={dimInactiveSegments && !segmentOverlays?.['Bull'] && highlightSegment !== 'Bull' ? 0.35 : 1}
          stroke="#475569"
          strokeWidth="0.8"
        />
        {segmentOverlays?.['Bull'] && (
          <circle
            cx={center}
            cy={center}
            r={rInnerBull}
            fill={segmentOverlays['Bull'].fill}
            fillOpacity={segmentOverlays['Bull'].opacity ?? 0.88}
            stroke={segmentOverlays['Bull'].stroke || '#FFFFFF'}
            strokeWidth="1.2"
            className={segmentOverlays['Bull'].pulse ? 'animate-pulse-glow' : undefined}
          />
        )}

        {/* Segment Number Wire Labels */}
        <g id="number-ring" className="font-bold text-[14px] select-none pointer-events-none">
          {segments.map((s) => (
            <text
              key={`num-${s.num}`}
              x={s.numX}
              y={s.numY + 5}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#FFFFFF"
              className="font-mono text-[15px] font-black tracking-tighter drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]"
            >
              {s.num}
            </text>
          ))}
        </g>

        {/* Children overlay (Dart plots, density heat clusters, cursors) */}
        {children}
      </svg>
    </div>
  );
};
