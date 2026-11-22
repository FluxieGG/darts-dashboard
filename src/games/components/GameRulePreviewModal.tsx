import React, { useState } from 'react';
import { GameDefinition } from '../../types/games';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';
import { Users, Clock, Sparkles, Copy, Check, Terminal, Sliders } from 'lucide-react';

interface GameRulePreviewModalProps {
  game: GameDefinition | null;
  onClose: () => void;
}

export const GameRulePreviewModal: React.FC<GameRulePreviewModalProps> = ({ game, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!game) return null;

  const Icon = game.icon;
  const agyPrompt = `Build the "${game.title}" modular game (id: "${game.id}") following GAMES_DEVELOPMENT_GUIDE.md and plug it into src/games/gameRegistry.ts.`;

  const handleCopyPrompt = () => {
    navigator.clipboard?.writeText(agyPrompt).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      isOpen={Boolean(game)}
      onClose={onClose}
      title={game.title}
      description={game.tagline}
      maxWidth="lg"
    >
      <div className="space-y-5">
        {/* Top Meta Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900/80 border border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white">
              <Icon className="w-6 h-6" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={game.accent} size="sm">
                {game.category}
              </Badge>
              <Badge variant="slate" size="sm">
                <Users className="w-3 h-3" />
                {game.minPlayers}–{game.maxPlayers} Players
              </Badge>
              <Badge variant="slate" size="sm">
                <Clock className="w-3 h-3" />
                {game.estimatedMinutes}
              </Badge>
            </div>
          </div>

          <Badge variant="amber" size="sm">
            <Sparkles className="w-3 h-3" />
            Coming Soon
          </Badge>
        </div>

        {/* Description */}
        <p className="text-sm text-slate-300 leading-relaxed">{game.description}</p>

        {/* How It Will Play */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            How It Plays
          </h4>
          <div className="space-y-2">
            {game.rules.map((step) => (
              <div
                key={step.title}
                className="p-3 rounded-xl bg-slate-900/60 border border-white/[0.07]"
              >
                <div className="text-sm font-bold text-white">{step.title}</div>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Planned Match Options */}
        {game.configOptions.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" />
              Configurable Match Rules
            </h4>
            <div className="flex flex-wrap gap-2">
              {game.configOptions.map((opt) => (
                <span
                  key={opt.key}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-900/80 border border-white/10 text-slate-300"
                >
                  {opt.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* AGY CLI Build Prompt Helper */}
        <div className="p-3.5 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/25 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5" />
              Ready to Build with AGY CLI
            </span>
            <button
              type="button"
              onClick={handleCopyPrompt}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy Prompt
                </>
              )}
            </button>
          </div>
          <code className="block text-xs font-mono text-slate-300 bg-slate-950/70 rounded-lg p-2.5 border border-white/[0.06] select-all">
            {agyPrompt}
          </code>
        </div>
      </div>
    </Modal>
  );
};
