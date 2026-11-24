import React, { useMemo } from 'react';
import { useCareerStore } from '../../store/useCareerStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { GameLeaderboardEntry } from '../../types/career';
import { Badge } from '../common/Badge';
import { Award, Crown, Medal, Trophy } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Pure Broadcast Kiosk Modular Leaderboards Widget (8ft glanceable, movable up/down via iPad Display tab).
 * Persists all-time per-game & per-drill champions inside `data/career-vault.json`,
 * and seamlessly switches to an unsaved RAM-only Party Night leaderboard during Party Mode.
 */
export const LeaderboardsWidget: React.FC = () => {
  const isPartyMode = usePlayerStore((s) => s.isPartyMode);
  const savedLeaderboards = useCareerStore((s) => s.vault.gameLeaderboards);
  const partyLeaderboards = useCareerStore((s) => s.partyLeaderboards);
  const gameLeaderboards = isPartyMode ? partyLeaderboards : savedLeaderboards;

  const { allTimeChampions, gameCards } = useMemo(() => {
    const boards = gameLeaderboards || {};
    const playerWinMap = new Map<
      string,
      { playerId: string; playerName: string; colorHex: string; wins: number; played: number }
    >();

    const cards: Array<{
      gameId: string;
      gameTitle: string;
      mode: GameLeaderboardEntry['mode'];
      top: GameLeaderboardEntry;
      runnerUp?: GameLeaderboardEntry;
    }> = [];

    for (const [gameId, entries] of Object.entries(boards)) {
      if (!Array.isArray(entries) || entries.length === 0) continue;

      const sorted = [...entries].sort((a, b) => {
        const aVal = Number.isFinite(a?.bestStatValue) ? a.bestStatValue : 0;
        const bVal = Number.isFinite(b?.bestStatValue) ? b.bestStatValue : 0;
        const aWins = Number.isFinite(a?.wins) ? a.wins : 0;
        const bWins = Number.isFinite(b?.wins) ? b.wins : 0;
        if (a.mode === 'practice' || a.mode === 'online') {
          if (a.lowerIsBetter) {
            if (aVal !== bVal) return aVal - bVal;
          } else if (aVal !== bVal) {
            return bVal - aVal;
          }
          return bWins - aWins;
        }
        if (bWins !== aWins) return bWins - aWins;
        return a.lowerIsBetter ? aVal - bVal : bVal - aVal;
      });

      cards.push({
        gameId,
        gameTitle: sorted[0].gameTitle || gameId,
        mode: sorted[0].mode || 'arcade',
        top: sorted[0],
        runnerUp: sorted[1],
      });

      for (const e of entries) {
        if (!e || !e.playerId) continue;
        const safeName = e.playerName || 'Player';
        const prev = playerWinMap.get(e.playerId) || {
          playerId: e.playerId,
          playerName: safeName,
          colorHex: e.colorHex || '#10B981',
          wins: 0,
          played: 0,
        };
        prev.wins += Number.isFinite(e.wins) ? e.wins : 0;
        prev.played += Number.isFinite(e.gamesPlayed) ? e.gamesPlayed : 0;
        prev.colorHex = e.colorHex || prev.colorHex;
        playerWinMap.set(e.playerId, prev);
      }
    }

    cards.sort((a, b) => (b.top.lastPlayedAt || 0) - (a.top.lastPlayedAt || 0));

    const champions = Array.from(playerWinMap.values())
      .sort((a, b) => b.wins - a.wins || b.played - a.played)
      .slice(0, 4);

    return { allTimeChampions: champions, gameCards: cards };
  }, [gameLeaderboards]);

  return (
    <div className="card-matte rounded-2xl p-5 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Trophy className="w-5 h-5 text-amber-400" />
          <h3 className="text-sm sm:text-base font-bold tracking-wider uppercase text-slate-200">
            Hall of Fame &amp; Game Leaderboards
          </h3>
        </div>
        <Badge variant="amber" size="sm">
          <Crown className="w-3 h-3" />
          {isPartyMode
            ? `Party Night (${gameCards.length} Live)`
            : gameCards.length > 0
            ? `${gameCards.length} Tracked Records`
            : 'Career Vault'}
        </Badge>
      </div>

      {gameCards.length === 0 ? (
        <div className="py-8 px-4 rounded-2xl bg-slate-900/55 border border-dashed border-white/12 text-center space-y-2">
          <Award className="w-9 h-9 text-amber-400/70 mx-auto" />
          <div className="text-base font-black text-white">No Records Set Yet</div>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
            Finish any Arcade game, Solo Practice Drill, or Online X01 leg to permanently lock in
            all-time high scores, fastest legs, and win leaderboards here.
          </p>
        </div>
      ) : (
        <>
          {/* Overall Wins Podium Strip */}
          {allTimeChampions.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {allTimeChampions.map((champ, idx) => (
                <div
                  key={champ.playerId}
                  className={cn(
                    'p-3 rounded-xl border flex items-center gap-2.5',
                    idx === 0
                      ? 'bg-amber-500/12 border-amber-400/40'
                      : 'bg-slate-900/75 border-white/[0.08]'
                  )}
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm text-slate-950 shrink-0"
                    style={{ backgroundColor: champ.colorHex || '#10B981' }}
                  >
                    {(champ.playerName || 'Player').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-black text-white truncate flex items-center gap-1">
                      {idx === 0 && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                      <span className="truncate">{champ.playerName || 'Player'}</span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                      <strong className="text-emerald-300">{champ.wins}W</strong> • {champ.played} played
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Per-Game & Solo Drill Record Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {gameCards.slice(0, 9).map((card) => (
              <div
                key={card.gameId}
                className="p-4 rounded-xl bg-slate-900/80 border border-white/10 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black text-white truncate">{card.gameTitle}</span>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-md text-[10px] font-mono uppercase font-bold border shrink-0',
                      card.mode === 'practice'
                        ? 'bg-sky-500/15 border-sky-400/35 text-sky-300'
                        : card.mode === 'online'
                        ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300'
                        : 'bg-purple-500/15 border-purple-400/35 text-purple-300'
                    )}
                  >
                    {card.mode}
                  </span>
                </div>

                {/* #1 Record Holder */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Medal className="w-4 h-4 text-amber-400 shrink-0" />
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: card.top.colorHex || '#10B981' }}
                    />
                    <span className="text-xs sm:text-sm font-bold text-slate-100 truncate">
                      {card.top.playerName || 'Player'}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs sm:text-sm font-black font-mono text-emerald-300 tabular-nums">
                      {card.top.bestStatDisplay ||
                        (Number.isFinite(card.top.bestStatValue) ? String(card.top.bestStatValue) : '—')}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400">
                      {(card.top.wins ?? 0) > 0 ? `${card.top.wins}W` : card.top.bestStatLabel || 'Record'}
                    </div>
                  </div>
                </div>

                {/* Runner-Up (if multiplayer / multiple players logged) */}
                {card.runnerUp && (
                  <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
                    <span className="truncate">2. {card.runnerUp.playerName || 'Player'}</span>
                    <span className="tabular-nums shrink-0">
                      {card.runnerUp.bestStatDisplay ||
                        (Number.isFinite(card.runnerUp.bestStatValue)
                          ? String(card.runnerUp.bestStatValue)
                          : '—')}
                      {(card.runnerUp.wins ?? 0) > 0 ? ` (${card.runnerUp.wins}W)` : ''}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
