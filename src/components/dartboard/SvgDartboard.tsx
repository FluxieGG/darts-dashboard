import React, { useMemo } from 'react';
import {
  DARTBOARD_RADIUS,
  SEGMENT_ORDER,
  SEGMENT_ANGLE_DEG,
  describeArcSector,
  getSegmentCenterAngle,
} from '../../lib/geometry';

interface SvgDartboardProps {
  size?: number;
  highlightSegment?: string;
  onBoardClick?: (coords: { x: number; y: number }) => void;
  children?: React.ReactNode;
}

export const SvgDartboard: React.FC<SvgDartboardProps> = ({
  size = 400,
  highlightSegment,
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

      // Check for highlight
      const isHighT = highlightSegment === `T${num}`;
      const isHighD = highlightSegment === `D${num}`;
      const isHighS = highlightSegment === `S${num}`;

      // Numbers position on number ring
      const numAngleRad = (centerAngle * Math.PI) / 180;
      const numX = center + (rNumberRing - 14) * Math.cos(numAngleRad);
      const numY = center - (rNumberRing - 14) * Math.sin(numAngleRad);

      return {
        num,
        centerAngle,
        numX,
        numY,
        pathDouble: describeArcSector(center, center, rInnerDouble, rOuterDouble, startAngle, endAngle),
        pathOuterSingle: describeArcSector(center, center, rOuterTreble, rInnerDouble, startAngle, endAngle),
        pathTreble: describeArcSector(center, center, rInnerTreble, rOuterTreble, startAngle, endAngle),
        pathInnerSingle: describeArcSector(center, center, rOuterBull, rInnerTreble, startAngle, endAngle),
        singleColor,
        ringColor,
        isHighD,
        isHighT,
        isHighS,
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
          {segments.map((s) => (
            <g key={`seg-${s.num}`}>
              {/* Outer Single Bed */}
              <path
                d={s.pathOuterSingle}
                fill={s.isHighS ? '#38BDF8' : s.singleColor}
                stroke="#475569"
                strokeWidth="0.8"
              />
              {/* Inner Single Bed */}
              <path
                d={s.pathInnerSingle}
                fill={s.isHighS ? '#38BDF8' : s.singleColor}
                stroke="#475569"
                strokeWidth="0.8"
              />
              {/* Double Bed */}
              <path
                d={s.pathDouble}
                fill={s.isHighD ? '#FACC15' : s.ringColor}
                stroke="#475569"
                strokeWidth="0.8"
              />
              {/* Treble Bed */}
              <path
                d={s.pathTreble}
                fill={s.isHighT ? '#FACC15' : s.ringColor}
                stroke="#475569"
                strokeWidth="0.8"
              />
            </g>
          ))}
        </g>

        {/* Outer Bull (25 - Green) */}
        <circle
          cx={center}
          cy={center}
          r={rOuterBull}
          fill={highlightSegment === '25' ? '#FACC15' : '#10B981'}
          stroke="#475569"
          strokeWidth="0.8"
        />

        {/* Inner Bull (50 - Red) */}
        <circle
          cx={center}
          cy={center}
          r={rInnerBull}
          fill={highlightSegment === 'Bull' ? '#FACC15' : '#DC2626'}
          stroke="#475569"
          strokeWidth="0.8"
        />

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
