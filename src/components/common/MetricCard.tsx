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

export const MetricCard: React.FC<MetricCardProps> = React.memo(
  ({
    label,
    value,
    subtitle,
    delta,
    icon,
    accentColor = 'default',
    className,
    size = 'md',
  }) => {
    const accentBorder = {
      emerald: 'border-emerald-500/25',
      amber: 'border-amber-500/25',
      rose: 'border-rose-500/25',
      sky: 'border-sky-500/25',
      default: 'border-white/[0.07]',
    }[accentColor];

    const valueSize = {
      sm: 'text-3xl sm:text-4xl',
      md: 'text-4xl sm:text-5xl',
      lg: 'text-5xl sm:text-6xl',
    }[size];

    return (
      <div
        className={cn(
          'card-matte card-matte-hover relative flex flex-col justify-between rounded-2xl p-5 sm:p-6 overflow-hidden',
          accentBorder,
          className
        )}
      >
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-xs font-medium tracking-wider uppercase text-slate-400 select-none">
            {label}
          </span>
          {icon && <div className="shrink-0 opacity-75">{icon}</div>}
        </div>

        <div className="flex items-baseline justify-between gap-3">
          <div
            className={cn(
              'font-bold tracking-tight text-white tabular-nums leading-none',
              valueSize
            )}
          >
            {value}
          </div>

          {delta && (
            <span
              className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium tabular-nums border select-none',
                delta.colorClass
              )}
            >
              {delta.formatted}
            </span>
          )}
        </div>

        {subtitle && (
          <div className="mt-3 text-xs sm:text-sm text-slate-500 font-normal select-none truncate">
            {subtitle}
          </div>
        )}
      </div>
    );
  }
);

MetricCard.displayName = 'MetricCard';
