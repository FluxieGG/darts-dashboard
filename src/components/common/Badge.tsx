import React from 'react';
import { cn } from '../../lib/utils';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'emerald' | 'amber' | 'rose' | 'sky' | 'slate' | 'purple';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'slate',
  size = 'md',
  className,
  dot = false,
}) => {
  const variantStyles = {
    emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    rose: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
    sky: 'bg-sky-500/10 text-sky-300 border-sky-500/20',
    purple: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
    slate: 'bg-white/[0.04] text-slate-300 border-white/[0.08]',
  }[variant];

  const dotColors = {
    emerald: 'bg-emerald-400',
    amber: 'bg-amber-400',
    rose: 'bg-rose-400',
    sky: 'bg-sky-400',
    purple: 'bg-purple-400',
    slate: 'bg-slate-400',
  }[variant];

  const sizeStyles = {
    sm: 'text-[11px] px-2.5 py-0.5 gap-1.5',
    md: 'text-xs px-2.5 py-1 gap-2',
    lg: 'text-sm px-3.5 py-1.5 gap-2.5 font-semibold',
  }[size];

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full border tabular-nums select-none tracking-wide transition-colors',
        variantStyles,
        sizeStyles,
        className
      )}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColors)} />}
      {children}
    </span>
  );
};
