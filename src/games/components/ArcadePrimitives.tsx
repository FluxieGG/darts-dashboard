import React from 'react';
import { DartThrow } from '../../types/darts';
import { GameAccent } from '../../types/games';
import { cn } from '../../lib/utils';
import { ArrowRight } from 'lucide-react';

export interface GameCallout {
  id: number;
  title: string;
  subtitle?: string;
  accent: GameAccent;
}

const CALLOUT_ACCENTS: Record<GameAccent, string> = {
  emerald: 'bg-emerald-500/20 border-emerald-400/70 text-emerald-200 shadow-[0_0_32px_-4px_rgba(16,185,129,0.55)]',
  amber: 'bg-amber-500/20 border-amber-400/70 text-amber-200 shadow-[0_0_32px_-4px_rgba(245,158,11,0.55)]',
  rose: 'bg-rose-500/25 border-rose-400/70 text-rose-200 shadow-[0_0_32px_-4px_rgba(244,63,94,0.6)]',
  sky: 'bg-sky-500/20 border-sky-400/70 text-sky-200 shadow-[0_0_32px_-4px_rgba(56,189,248,0.55)]',
  purple: 'bg-purple-500/25 border-purple-400/70 text-purple-200 shadow-[0_0_32px_-4px_rgba(168,85,247,0.6)]',
};

/**
 * High-drama Flight Club / Roxy Ballroom callout banner (8-foot portrait kiosk glanceable)
 */
export const CalloutBanner: React.FC<{ callout: GameCallout | null }> = ({ callout }) => {
  if (!callout) return null;

  return (
    <div
      key={callout.id}
      className={cn(
        'w-full rounded-2xl border-2 px-6 py-4 sm:py-5 text-center backdrop-blur-md transition-all animate-in fade-in zoom-in-95 duration-200',
        CALLOUT_ACCENTS[callout.accent]
      )}
    >
      <div className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight uppercase leading-tight text-white">
        {callout.title}
      </div>
      {callout.subtitle && (
        <div className="text-sm sm:text-xl font-bold opacity-95 mt-1">{callout.subtitle}</div>
      )}
    </div>
  );
};

interface VisitPillsStripProps {
  darts: DartThrow[];
  dartLabels?: Array<string | undefined>;
  dartTones?: Array<'emerald' | 'amber' | 'rose' | 'sky' | 'purple' | 'slate' | undefined>;
  boardStatus: string;
  turnComplete?: boolean;
  onManualNextTurn?: () => void;
}

const PILL_TONES: Record<string, string> = {
  emerald: 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200',
  amber: 'bg-amber-500/20 border-amber-400/60 text-amber-200',
  rose: 'bg-rose-500/20 border-rose-400/60 text-rose-200',
  sky: 'bg-sky-500/20 border-sky-400/60 text-sky-200',
  purple: 'bg-purple-500/20 border-purple-400/60 text-purple-200',
  slate: 'bg-slate-800/90 border-slate-500/50 text-white',
};

/**
 * Unified 3-Dart Visit Strip + Passive Broadcast Takeout Banner (8ft glanceable Kiosk Display).
 * Next-turn override is triggered via the physical board takeout or the iPad Oche Deck.
 */
export const VisitPillsStrip: React.FC<VisitPillsStripProps> = ({
  darts,
  dartLabels,
  dartTones,
  boardStatus,
  turnComplete = false,
}) => {
  const showTakeoutPrompt = turnComplete || darts.length >= 3 || boardStatus === 'takeout';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {[0, 1, 2].map((idx) => {
          const dart = darts[idx];
          const tone = dartTones?.[idx] || (dart ? (dart.score === 0 ? 'rose' : 'slate') : undefined);
          const customLabel = dartLabels?.[idx];

          return (
            <div
              key={idx}
              className={cn(
                'relative flex flex-col items-center justify-center h-24 sm:h-32 rounded-2xl border-2 transition-all',
                dart && tone
                  ? PILL_TONES[tone]
                  : 'bg-slate-900/55 border-dashed border-white/15 text-slate-600'
              )}
            >
              <span className="absolute top-2 left-3 text-xs sm:text-sm font-mono font-black opacity-70">
                D{idx + 1}
              </span>
              {dart ? (
                <>
                  <span className="text-3xl sm:text-5xl font-black font-mono leading-none tracking-tight">
                    {dart.segment.name}
                  </span>
                  <span className="text-xs sm:text-base font-extrabold mt-1.5 opacity-95 truncate max-w-[92%]">
                    {customLabel ?? `${dart.score} pts`}
                  </span>
                </>
              ) : (
                <span className="text-3xl sm:text-4xl font-mono opacity-35">—</span>
              )}
            </div>
          );
        })}
      </div>

      {showTakeoutPrompt && (
        <div className="w-full py-3.5 px-5 rounded-2xl bg-amber-500/20 border-2 border-amber-400/65 text-amber-200 font-black text-base sm:text-xl uppercase tracking-wider flex items-center justify-center gap-3 animate-pulse">
          <span>Pull Darts for Next Turn</span>
          <ArrowRight className="w-6 h-6" />
        </div>
      )}
    </div>
  );
};
