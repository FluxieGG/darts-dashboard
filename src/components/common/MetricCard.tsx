import React from 'react';
import { cn } from '../../lib/utils';

interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  delta?: {
    formatted: string;
    isPositive: boolean;
    isNeutral?: boolean;
    colorClass: string;
  };
  icon?: React.ReactNode;
  accentColor?: 'emerald' | 'amber' | 'rose' | 'sky' | 'default';
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  subtitle,
  delta,
  icon,
  accentColor = 'default',
  className,
  size = 'md',
}) => {
  const accentGlow = {
    emerald: 'border-emerald-500/40 hover:border-emerald-400/60 shadow-[0_6px_28px_-4px_rgba(16,185,129,0.2)]',
    amber: 'border-amber-500/40 hover:border-amber-400/60 shadow-[0_6px_28px_-4px_rgba(245,158,11,0.2)]',
    rose: 'border-rose-500/40 hover:border-rose-400/60 shadow-[0_6px_28px_-4px_rgba(244,63,94,0.2)]',
    sky: 'border-sky-500/40 hover:border-sky-400/60 shadow-[0_6px_28px_-4px_rgba(56,189,248,0.2)]',
    default: 'border-white/[0.12] hover:border-white/[0.22]',
  }[accentColor];

  const valueSize = {
    sm: 'text-3xl sm:text-4xl',
    md: 'text-4xl sm:text-5xl md:text-6xl',
    lg: 'text-5xl sm:text-6xl md:text-7xl',
  }[size];

  return (
    <div
      className={cn(
        'card-matte card-matte-hover relative flex flex-col justify-between rounded-2xl p-5 sm:p-6 transition-all overflow-hidden',
        accentGlow,
        className
      )}
    >
      {/* Header row: Label + Icon */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <span className="text-sm sm:text-base font-bold tracking-wider uppercase text-slate-300 select-none">
          {label}
        </span>
        {icon && <div className="shrink-0">{icon}</div>}
      </div>

      {/* Primary Value + Delta */}
      <div className="flex items-baseline justify-between gap-3 my-1">
        <div
          className={cn(
            'font-black tracking-tight text-white tabular-nums leading-none',
            valueSize
          )}
        >
          {value}
        </div>

        {delta && (
          <span
            className={cn(
              'inline-flex items-center px-2.5 py-1 rounded-full text-sm font-bold tabular-nums border select-none',
              delta.colorClass
            )}
          >
            {delta.formatted}
          </span>
        )}
      </div>

      {/* Subtitle / Context */}
      {subtitle && (
        <div className="mt-3 text-sm sm:text-base text-slate-300/80 font-medium select-none truncate">
          {subtitle}
        </div>
      )}
    </div>
  );
};
