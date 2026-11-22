import React from 'react';
import { GameAccent, GameDefinition } from '../../types/games';
import { Badge } from '../../components/common/Badge';
import { Users, Clock, Play, Sparkles, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

interface GameCardProps {
  game: GameDefinition;
  onSelect: (game: GameDefinition) => void;
}

const ACCENT_STYLES: Record<
  GameAccent,
  {
    cardBorder: string;
    iconBg: string;
    iconText: string;
    glowSpot: string;
    ctaBg: string;
  }
> = {
  emerald: {
    cardBorder:
      'border-emerald-500/30 hover:border-emerald-400/60 shadow-[0_8px_28px_-6px_rgba(16,185,129,0.2)]',
    iconBg: 'bg-emerald-500/15 border-emerald-400/30',
    iconText: 'text-emerald-400',
    glowSpot: 'bg-emerald-500/15',
    ctaBg: 'bg-emerald-500 text-slate-950 hover:bg-emerald-400',
  },
  amber: {
    cardBorder:
      'border-amber-500/30 hover:border-amber-400/60 shadow-[0_8px_28px_-6px_rgba(245,158,11,0.2)]',
    iconBg: 'bg-amber-500/15 border-amber-400/30',
    iconText: 'text-amber-400',
    glowSpot: 'bg-amber-500/15',
    ctaBg: 'bg-amber-500 text-slate-950 hover:bg-amber-400',
  },
  rose: {
    cardBorder:
      'border-rose-500/30 hover:border-rose-400/60 shadow-[0_8px_28px_-6px_rgba(244,63,94,0.22)]',
    iconBg: 'bg-rose-500/15 border-rose-400/30',
    iconText: 'text-rose-400',
    glowSpot: 'bg-rose-500/15',
    ctaBg: 'bg-rose-500 text-white hover:bg-rose-400',
  },
  sky: {
    cardBorder:
      'border-sky-500/30 hover:border-sky-400/60 shadow-[0_8px_28px_-6px_rgba(56,189,248,0.2)]',
    iconBg: 'bg-sky-500/15 border-sky-400/30',
    iconText: 'text-sky-400',
    glowSpot: 'bg-sky-500/15',
    ctaBg: 'bg-sky-500 text-slate-950 hover:bg-sky-400',
  },
  purple: {
    cardBorder:
      'border-purple-500/30 hover:border-purple-400/60 shadow-[0_8px_28px_-6px_rgba(168,85,247,0.22)]',
    iconBg: 'bg-purple-500/15 border-purple-400/30',
    iconText: 'text-purple-400',
    glowSpot: 'bg-purple-500/15',
    ctaBg: 'bg-purple-500 text-white hover:bg-purple-400',
  },
};

export const GameCard: React.FC<GameCardProps> = ({ game, onSelect }) => {
  const Icon = game.icon;
  const accent = ACCENT_STYLES[game.accent];
  const isPlayable = game.status !== 'coming_soon' && Boolean(game.component);

  return (
    <button
      type="button"
      onClick={() => onSelect(game)}
      className={cn(
        'card-matte card-matte-hover group relative flex flex-col justify-between text-left rounded-2xl p-5 sm:p-6 overflow-hidden cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400/60',
        accent.cardBorder
      )}
    >
      {/* Ambient corner radial glow */}
      <div
        className={cn(
          'pointer-events-none absolute -top-12 -right-12 w-36 h-36 rounded-full blur-3xl opacity-50 group-hover:opacity-90 transition-opacity duration-300',
          accent.glowSpot
        )}
      />

      {/* Top Row: Icon + Status Pill */}
      <div className="relative z-10 flex items-start justify-between gap-3 mb-4">
        <div
          className={cn(
            'w-13 h-13 sm:w-14 sm:h-14 rounded-2xl border flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-105',
            accent.iconBg
          )}
        >
          <Icon className={cn('w-7 h-7 sm:w-8 sm:h-8', accent.iconText)} />
        </div>

        <div className="flex flex-col items-end gap-1.5">
          {isPlayable ? (
            <Badge variant={game.status === 'beta' ? 'amber' : 'emerald'} size="sm" dot>
              {game.status === 'beta' ? 'Beta' : 'Ready to Play'}
            </Badge>
          ) : (
            <Badge variant="slate" size="sm" className="bg-slate-900/90 border-white/15 text-slate-300">
              <Sparkles className="w-3 h-3 text-amber-400" />
              Coming Soon
            </Badge>
          )}
          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
            {game.category}
          </span>
        </div>
      </div>

      {/* Middle: Title + Tagline */}
      <div className="relative z-10 flex-1 mb-5">
        <h3 className="text-xl sm:text-2xl font-black tracking-tight text-white leading-tight group-hover:text-white transition-colors">
          {game.title}
        </h3>
        <p className="mt-2 text-sm sm:text-base text-slate-300/85 font-medium leading-snug line-clamp-2">
          {game.tagline}
        </p>

        {/* Vibe Tags */}
        <div className="flex flex-wrap gap-1.5 mt-3.5">
          {game.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white/[0.05] text-slate-300 border border-white/[0.07]"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Footer Meta & CTA Strip */}
      <div className="relative z-10 pt-3.5 border-t border-white/[0.08] flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-xs sm:text-sm font-mono text-slate-400 tabular-nums">
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            {game.minPlayers === game.maxPlayers
              ? `${game.minPlayers}P`
              : `${game.minPlayers}–${game.maxPlayers}P`}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            {game.estimatedMinutes}
          </span>
        </div>

        {isPlayable ? (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-transform group-hover:translate-x-0.5',
              accent.ctaBg
            )}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Play
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-400 group-hover:text-white transition-colors">
            Preview
            <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        )}
      </div>
    </button>
  );
};
