import React from 'react';
import { getArcadeGames } from '../gameRegistry';
import { GameCard } from './GameCard';
import { Badge } from '../../components/common/Badge';
import { Gamepad2, Sparkles, Tablet, Wifi } from 'lucide-react';

interface GamesLobbyProps {
  isLocalConnected: boolean;
}

/**
 * Pure Broadcast Kiosk Games Showcase Wall.
 * Displays all 8 Tech Darts Arcade titles cleanly for 8-foot glanceability;
 * all game launches & setup are driven from the iPad Oche Command Deck.
 */
export const GamesLobby: React.FC<GamesLobbyProps> = ({ isLocalConnected }) => {
  const arcadeGames = getArcadeGames();
  const playableCount = arcadeGames.filter(
    (g) => g.status !== 'coming_soon' && Boolean(g.component)
  ).length;

  return (
    <main className="w-full max-w-[1600px] mx-auto px-4 py-4 sm:px-5 sm:py-5 space-y-5">
      {/* Hero Broadcast Arcade Header Card */}
      <section className="card-matte rounded-2xl p-5 sm:p-6 relative overflow-hidden border-emerald-500/20">
        <div className="pointer-events-none absolute -top-20 -right-16 w-64 h-64 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-16 w-64 h-64 rounded-full bg-purple-500/10 blur-3xl" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-13 h-13 sm:w-15 sm:h-15 rounded-2xl bg-gradient-to-tr from-emerald-500/25 via-sky-500/20 to-purple-500/25 border border-emerald-400/35 flex items-center justify-center shrink-0 shadow-[0_0_24px_-4px_rgba(16,185,129,0.35)]">
              <Gamepad2 className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-400" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                  Tech Darts Arcade
                </h2>
                <Badge variant="purple" size="sm">
                  <Sparkles className="w-3 h-3" />
                  {playableCount} Games Armed
                </Badge>
              </div>
              <p className="text-sm sm:text-base text-slate-300/85 mt-1">
                Social party &amp; precision dart games powered live by your Autodarts board.
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
              <span>Pick any game on the iPad Oche Deck</span>
            </div>
          </div>
        </div>
      </section>

      {/* Portrait-First Bento Game Showcase Grid (2 cols on portrait 1080px, 4 cols on landscape xl) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        {arcadeGames.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </section>
    </main>
  );
};
