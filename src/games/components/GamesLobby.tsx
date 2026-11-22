import React, { useState } from 'react';
import { GAME_REGISTRY, getDefaultConfigForGame } from '../gameRegistry';
import { useGameStore } from '../../store/useGameStore';
import { GameCategory, GameDefinition } from '../../types/games';
import { GameCard } from './GameCard';
import { GameRulePreviewModal } from './GameRulePreviewModal';
import { Badge } from '../../components/common/Badge';
import {
  Gamepad2,
  ArrowLeft,
  Sparkles,
  Layers,
  Wifi,
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface GamesLobbyProps {
  isLocalConnected: boolean;
}

const CATEGORIES: Array<GameCategory | 'All'> = [
  'All',
  'Party',
  'Elimination',
  'Precision',
  'Classic',
  'Arcade',
];

export const GamesLobby: React.FC<GamesLobbyProps> = ({ isLocalConnected }) => {
  const {
    selectedCategory,
    setSelectedCategory,
    returnToDashboard,
    launchGame,
  } = useGameStore();

  const [previewGame, setPreviewGame] = useState<GameDefinition | null>(null);

  const filteredGames =
    selectedCategory === 'All'
      ? GAME_REGISTRY
      : GAME_REGISTRY.filter((g) => g.category === selectedCategory);

  const playableCount = GAME_REGISTRY.filter(
    (g) => g.status !== 'coming_soon' && Boolean(g.component)
  ).length;
  const upcomingCount = GAME_REGISTRY.length - playableCount;

  const handleSelectGame = (game: GameDefinition) => {
    if (game.status !== 'coming_soon' && game.component) {
      launchGame(game.id, getDefaultConfigForGame(game));
    } else {
      setPreviewGame(game);
    }
  };

  return (
    <main className="w-full max-w-[1600px] mx-auto px-4 py-4 sm:px-5 sm:py-5 space-y-5">
      {/* Hero Arcade Header Card */}
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
                  Modular Games
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
              {isLocalConnected ? 'Live Socket Armed' : 'Socket Ready'}
            </Badge>

            <button
              type="button"
              onClick={returnToDashboard}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900/90 hover:bg-white/10 border border-white/15 text-slate-200 hover:text-white text-xs sm:text-sm font-bold transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Stats Dashboard</span>
            </button>
          </div>
        </div>

        {/* Category Filter Pills & Counters */}
        <div className="relative z-10 mt-5 pt-4 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {CATEGORIES.map((category) => {
              const isSelected = selectedCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  className={cn(
                    'px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all border',
                    isSelected
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50 shadow-[0_0_16px_-4px_rgba(16,185,129,0.35)]'
                      : 'bg-slate-900/70 text-slate-400 border-white/[0.08] hover:text-white hover:border-white/20'
                  )}
                >
                  {category}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 text-xs font-mono text-slate-400 tabular-nums">
            <span>
              <strong className="text-emerald-400">{playableCount}</strong> Playable
            </span>
            <span>•</span>
            <span>
              <strong className="text-amber-400">{upcomingCount}</strong> Coming Soon
            </span>
          </div>
        </div>
      </section>

      {/* Portrait-First Bento Game Cards Grid (2 cols on portrait 1080px, 4 cols on landscape xl) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        {filteredGames.map((game) => (
          <GameCard key={game.id} game={game} onSelect={handleSelectGame} />
        ))}
      </section>

      {/* Modular Socket Status Strip */}
      <section className="card-matte rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-white/[0.08]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center text-sky-400 shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">
              Modular Game Socket Active
            </div>
            <p className="text-xs text-slate-400">
              {upcomingCount === 0
                ? 'All 8 Tech Darts games are live and armed! Add even more custom cartridges anytime using '
                : 'Click any Coming Soon card to preview rules or pick a playable cartridge. Build specs live in '}
              <code className="font-mono text-emerald-400">GAMES_DEVELOPMENT_GUIDE.md</code>.
            </p>
          </div>
        </div>

        <Badge variant="sky" size="sm" className="self-start sm:self-center shrink-0">
          Socket v1.0 Ready
        </Badge>
      </section>

      {/* Coming Soon Preview Modal */}
      <GameRulePreviewModal
        game={previewGame}
        onClose={() => setPreviewGame(null)}
      />
    </main>
  );
};
