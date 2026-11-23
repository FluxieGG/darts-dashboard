import React, { useMemo } from 'react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useCareerStore } from '../../store/useCareerStore';
import { computeStreaks, evaluateObjectives } from '../../lib/careerEngine';
import { ObjectiveFlavor, ObjectiveProgress } from '../../types/career';
import { Badge } from '../common/Badge';
import {
  CheckCircle2,
  Circle,
  Flame,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react';
import { cn } from '../../lib/utils';

const FLAVOR_STYLES: Record<ObjectiveFlavor, string> = {
  Fun: 'bg-purple-500/15 text-purple-300 border-purple-400/30',
  Skill: 'bg-sky-500/15 text-sky-300 border-sky-400/30',
  Grind: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
};

const ObjectiveRow: React.FC<{ item: ObjectiveProgress }> = ({ item }) => {
  return (
    <div
      className={cn(
        'rounded-xl p-3 border transition-all',
        item.completed
          ? 'bg-emerald-500/12 border-emerald-400/45 shadow-[0_0_20px_-8px_rgba(16,185,129,0.4)]'
          : 'bg-slate-900/70 border-white/[0.08]'
      )}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0">
          {item.completed ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <Circle className="w-5 h-5 text-slate-600 shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  'text-sm font-extrabold leading-tight',
                  item.completed ? 'text-emerald-200' : 'text-white'
                )}
              >
                {item.title}
              </span>
              <span
                className={cn(
                  'text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border',
                  FLAVOR_STYLES[item.flavor]
                )}
              >
                {item.flavor}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 leading-snug">{item.description}</p>
          </div>
        </div>

        <span
          className={cn(
            'text-xs font-mono font-black tabular-nums shrink-0',
            item.completed ? 'text-emerald-400' : 'text-slate-300'
          )}
        >
          {item.current}/{item.target}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="mt-2.5 h-1.5 w-full rounded-full bg-slate-800/90 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            item.completed
              ? 'bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.8)]'
              : item.period === 'weekly'
              ? 'bg-gradient-to-r from-amber-500 to-yellow-300'
              : 'bg-gradient-to-r from-sky-500 to-emerald-400'
          )}
          style={{ width: `${item.pct}%` }}
        />
      </div>
    </div>
  );
};

export const ObjectivesWidget: React.FC = () => {
  const activePlayer = usePlayerStore((s) => s.getActivePlayer());
  const isPartyMode = usePlayerStore((s) => s.isPartyMode);
  const vaultMap = useCareerStore((s) => s.vault.players);
  const partyVaultMap = useCareerStore((s) => s.partyVaults);
  const getPlayerVault = useCareerStore((s) => s.getPlayerVault);

  const playerVault = useMemo(
    () => getPlayerVault(activePlayer.id, activePlayer.name),
    [vaultMap, partyVaultMap, isPartyMode, activePlayer.id, activePlayer.name, getPlayerVault]
  );

  const { daily, weekly } = useMemo(() => evaluateObjectives(playerVault), [playerVault]);
  const streaks = useMemo(() => computeStreaks(playerVault.dailyLogs), [playerVault.dailyLogs]);

  const dailyDone = daily.filter((o) => o.completed).length;
  const weeklyDone = weekly.filter((o) => o.completed).length;
  const isTempGuest = !isPartyMode && !activePlayer.isPrimary && activePlayer.isSaved === false;

  return (
    <div className="card-matte rounded-2xl p-5 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-400/35 flex items-center justify-center text-amber-400">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-white">
              Daily &amp; Weekly Objectives
            </h3>
            <p className="text-xs text-slate-400">
              {isPartyMode
                ? `${activePlayer.name} • Temp Party Session (Unsaved)`
                : `${activePlayer.name}'s live challenges • tied to Career Vault`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isPartyMode ? (
            <Badge variant="amber" size="sm">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-300" />
              Temp Session
            </Badge>
          ) : (
            !isTempGuest && (
              <Badge
                variant={streaks.currentStreak > 0 ? 'amber' : 'slate'}
                size="sm"
              >
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                {streaks.currentStreak} Day Streak
              </Badge>
            )
          )}
          <Badge variant={dailyDone === daily.length ? 'emerald' : 'sky'} size="sm">
            <Trophy className="w-3 h-3" />
            {dailyDone + weeklyDone}/{daily.length + weekly.length} Done
          </Badge>
        </div>
      </div>

      {/* Session-Only Guest Notice (Party Mode runs full live RAM objectives!) */}
      {isTempGuest ? (
        <div className="rounded-xl p-4 bg-purple-950/40 border border-purple-400/25 flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-amber-300 shrink-0" />
          <div className="text-xs sm:text-sm text-slate-200 leading-snug">
            <strong className="text-white">Session-Only Guest:</strong> Save this player&apos;s
            account to unlock persistent Daily &amp; Weekly Objectives and Career Vault tracking.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Daily Column */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Today&apos;s Objectives ({dailyDone}/{daily.length})
              </span>
            </div>
            <div className="space-y-2">
              {daily.map((item) => (
                <ObjectiveRow key={item.id} item={item} />
              ))}
            </div>
          </div>

          {/* Weekly Column */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5" />
                Weekly Milestones ({weeklyDone}/{weekly.length})
              </span>
            </div>
            <div className="space-y-2">
              {weekly.map((item) => (
                <ObjectiveRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
