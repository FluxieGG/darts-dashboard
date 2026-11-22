import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format average with fixed precision and fallback
 */
export function formatAvg(val: number | undefined | null, decimals = 2): string {
  if (val === undefined || val === null || isNaN(val)) return '0.00';
  return val.toFixed(decimals);
}

/**
 * Format percentage
 */
export function formatPct(val: number | undefined | null, decimals = 1): string {
  if (val === undefined || val === null || isNaN(val)) return '0.0%';
  return `${val.toFixed(decimals)}%`;
}

/**
 * Get delta indicator details
 */
export function getDeltaIndicator(current: number, baseline: number) {
  const diff = current - baseline;
  const isPositive = diff > 0;
  const isNeutral = Math.abs(diff) < 0.01;

  return {
    diff,
    formatted: `${isPositive ? '+' : ''}${diff.toFixed(2)}`,
    isPositive,
    isNeutral,
    colorClass: isNeutral
      ? 'text-slate-400 bg-slate-800/60 border-slate-700/50'
      : isPositive
      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
      : 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  };
}

/**
 * Generate unique id
 */
export function generateId(prefix = 'id'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}
