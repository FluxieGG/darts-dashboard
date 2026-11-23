import React from 'react';

interface DartCounterIconProps {
  className?: string;
}

/**
 * Clean Lucide-matched Target DartCounter emblem (concentric target rings + dart flight)
 * used across the iPad mode switcher, Kiosk header, and DartCounter broadcast arena.
 */
export const DartCounterIcon: React.FC<DartCounterIconProps> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.1"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9.5" />
    <circle cx="12" cy="12" r="5.5" />
    <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    <path d="M15.5 8.5L21 3" />
    <path d="M17.5 3H21v3.5" />
  </svg>
);
