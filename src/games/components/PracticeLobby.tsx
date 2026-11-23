import React from 'react';
import { getPracticeDrills } from '../gameRegistry';
import { GameCard } from './GameCard';
import { Badge } from '../../components/common/Badge';
import { Crosshair, Sparkles, Tablet, Wifi } from 'lucide-react';

interface PracticeLobbyProps {
  isLocalConnected: boolean;
}

/**
 * Pure Broadcast Kiosk Solo Training Showcase Wall.
 * Displays all Solo Practice Drills cleanly for 8-foot glanceability;
 * drills are selected, configured, and started from the iPad Oche Command Deck.
 */
export const PracticeLobby: React.FC<PracticeLobbyProps> = ({ isLocalConnected }) => {
  const drills = getPracticeDrills();

  return (
    <main className="w-full max-w-[1600px] mx-auto px-4 py-4 sm:px-5 sm:py-5 space-y-5">
      {/* Hero Solo Training Header Card */}
      <section className="card-matte rounded-2xl p-5 sm:p-6 relative overflow-hidden border-sky-500/25">
        <div className="pointer-events-none absolute -top-20 -right-16 w-64 h-64 rounded-full bg-sky-500/12 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-16 w-64 h-64 rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-13 h-13 sm:w-15 sm:h-15 rounded-2xl bg-gradient-to-tr from-sky-500/25 via-emerald-500/20 to-purple-500/20 border border-sky-400/35 flex items-center justify-center shrink-0 shadow-[0_0_24px_-4px_rgba(56,189,248,0.35)]">
              <Crosshair className="w-7 h-7 sm:w-8 sm:h-8 text-sky-400" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                  Solo Training Mode
                </h2>
                <Badge variant="sky" size="sm">
                  <Sparkles className="w-3 h-3" />
                  {drills.length} Pro Drills Ready
                </Badge>
              </div>
              <p className="text-sm sm:text-base text-slate-300/85 mt-1">
                Structured PDC doubles, checkout ladders, JDC routines &amp; scoring benchmarks.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Badge variant={isLocalConnected ? 'emerald' : 'slate'} size="sm" dot>
              <Wifi className="w-3 h-3" />
              {isLocalConnected ? 'Board Live' : 'Socket Ready'}
            </Badge>

            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/80 border border-sky-400/25 text-sky-300 text-xs sm:text-sm font-bold">
              <Tablet className="w-4 h-4 shrink-0" />
              <span>Pick a training drill on the iPad Oche Deck</span>
            </div>
          </div>
        </div>
      </section>

      {/* Portrait-First Bento Drills Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        {drills.map((drill) => (
          <GameCard key={drill.id} game={drill} />
        ))}
      </section>
    </main>
  );
};
