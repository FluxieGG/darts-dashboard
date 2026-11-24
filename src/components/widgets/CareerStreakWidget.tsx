import React, { useEffect, useMemo, useState } from 'react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useCareerStore } from '../../store/useCareerStore';
import {
  buildCalendarWeeks,
  computeStreaks,
  formatReadableDate,
  getBestDaysEver,
  getLocalDateKey,
  parseDateKey,
} from '../../lib/careerEngine';
import { Badge } from '../common/Badge';
import {
  CalendarDays,
  Crown,
  Flame,
  HardDrive,
  Zap,
} from 'lucide-react';
import { cn } from '../../lib/utils';

const INTENSITY_CLASSES: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: 'bg-slate-800/70 border-white/[0.05]',
  1: 'bg-emerald-900/70 border-emerald-700/40',
  2: 'bg-emerald-700/75 border-emerald-500/45',
  3: 'bg-emerald-500/80 border-emerald-300/50',
  4: 'bg-emerald-400 border-amber-300/80 shadow-[0_0_10px_rgba(16,185,129,0.55)]',
};

export const CareerStreakWidget: React.FC = () => {
  const activePlayer = usePlayerStore((s) => s.getActivePlayer());
  const isPartyMode = usePlayerStore((s) => s.isPartyMode);
  const vaultMap = useCareerStore((s) => s.vault.players);
  const partyVaultMap = useCareerStore((s) => s.partyVaults);
  const isDiskSynced = useCareerStore((s) => s.isDiskSynced);
  const getPlayerVault = useCareerStore((s) => s.getPlayerVault);

  const [todayKey, setTodayKey] = useState(() => getLocalDateKey());

  // Keep 24/7 kiosk calendar & streak badge accurate across local midnight rollovers
  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextKey = getLocalDateKey();
      setTodayKey((prev) => (prev === nextKey ? prev : nextKey));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const playerId = activePlayer?.id ?? 'default';
  const playerName = activePlayer?.name ?? 'Player';

  const playerVault = useMemo(
    () => getPlayerVault(playerId, playerName),
    [vaultMap, partyVaultMap, isPartyMode, playerId, playerName, getPlayerVault]
  );

  const dailyLogs = playerVault?.dailyLogs ?? {};
  const todayDate = useMemo(() => parseDateKey(todayKey), [todayKey]);

  const streaks = useMemo(
    () => computeStreaks(dailyLogs, todayDate),
    [dailyLogs, todayDate]
  );
  const calendarWeeks = useMemo(
    () => buildCalendarWeeks(dailyLogs, 14, todayDate),
    [dailyLogs, todayDate]
  );
  const bestDays = useMemo(() => getBestDaysEver(dailyLogs, 3), [dailyLogs]);
  const bestDayDate = playerVault?.records?.bestDay3DA?.date;

  const selectedLog = dailyLogs[todayKey] || bestDays[0] || null;
  const shownDateKey = selectedLog?.date || todayKey;
  const topSegments = useMemo(() => {
    if (!selectedLog?.segmentCounts) return [];
    return Object.entries(selectedLog.segmentCounts)
      .filter(([name]) => name.startsWith('T') || name.startsWith('D') || name === 'Bull')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }, [selectedLog]);

  return (
    <div className="card-matte rounded-2xl p-5 sm:p-6 space-y-5">
      {/* Clean Broadcast Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-400/35 flex items-center justify-center text-emerald-400">
            <CalendarDays className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-white">
              Streak Calendar &amp; Career Vault
            </h3>
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <HardDrive className="w-3 h-3 text-emerald-400" />
              {isPartyMode
                ? 'Temp Party Session (Unsaved RAM Only)'
                : isDiskSynced
                ? 'Synced to Career Vault'
                : 'Local browser vault'}
            </p>
          </div>
        </div>

        <Badge variant="emerald" size="sm">
          {playerVault.records.totalCareerDarts.toLocaleString()} Career Darts
        </Badge>
      </div>

      {/* Hero Streak & Volume KPI Strip */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        <div className="rounded-xl p-3 sm:p-3.5 bg-slate-900/80 border border-amber-400/25">
          <div className="text-[11px] font-mono uppercase text-slate-400 flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            Current Streak
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-amber-300 mt-1">
            {streaks.currentStreak}
            <span className="text-xs font-bold text-slate-400 ml-1">
              {streaks.currentStreak === 1 ? 'day' : 'days'}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 truncate">
            {streaks.playedToday
              ? 'Active today!'
              : streaks.currentStreak > 0
              ? 'Throw today to keep alive'
              : 'Start a streak today'}
          </div>
        </div>

        <div className="rounded-xl p-3 sm:p-3.5 bg-slate-900/80 border border-white/10">
          <div className="text-[11px] font-mono uppercase text-slate-400 flex items-center gap-1">
            <Crown className="w-3.5 h-3.5 text-purple-400" />
            Best Streak
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-white mt-1">
            {streaks.longestStreak}
            <span className="text-xs font-bold text-slate-400 ml-1">days</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 truncate">
            {streaks.totalDaysPlayed} total days played
          </div>
        </div>

        <div className="rounded-xl p-3 sm:p-3.5 bg-slate-900/80 border border-white/10">
          <div className="text-[11px] font-mono uppercase text-slate-400 flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            Best Day 3DA
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-emerald-400 mt-1">
            {playerVault.records.bestDay3DA
              ? playerVault.records.bestDay3DA.value.toFixed(1)
              : '0.0'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 truncate">
            {playerVault.records.bestDay3DA
              ? formatReadableDate(playerVault.records.bestDay3DA.date)
              : 'Waiting for first session'}
          </div>
        </div>
      </div>

      {/* GitHub-Style 14-Week Practice Calendar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span>Last 14 Weeks ({streaks.daysPlayedThisWeek}/7 days this week)</span>
          <div className="flex items-center gap-1">
            <span>Less</span>
            {([0, 1, 2, 3, 4] as const).map((lvl) => (
              <span
                key={lvl}
                className={cn('w-2.5 h-2.5 rounded-[3px] border', INTENSITY_CLASSES[lvl])}
              />
            ))}
            <span>More</span>
          </div>
        </div>

        <div className="overflow-x-auto no-scrollbar pb-1">
          <div className="flex items-start gap-1.5 min-w-fit">
            {/* Weekday Legend */}
            <div className="grid grid-rows-7 gap-1.5 text-[9px] font-mono text-slate-500 pr-1 pt-0.5">
              <span>M</span>
              <span className="opacity-0">T</span>
              <span>W</span>
              <span className="opacity-0">T</span>
              <span>F</span>
              <span className="opacity-0">S</span>
              <span>S</span>
            </div>

            {/* 14 Week Columns */}
            <div className="flex-1 grid grid-cols-14 gap-1.5">
              {calendarWeeks.map((week, wIdx) => (
                <div key={wIdx} className="grid grid-rows-7 gap-1.5">
                  {week.map((cell) => {
                    const isBestDay = Boolean(bestDayDate && cell.dateKey === bestDayDate);

                    return (
                      <div
                        key={cell.dateKey}
                        className={cn(
                          'w-4 h-4 sm:w-5 sm:h-5 rounded-[4px] border transition-all',
                          cell.isFuture
                            ? 'opacity-20 bg-slate-900 border-white/[0.03]'
                            : INTENSITY_CLASSES[cell.intensity],
                          cell.isToday && 'ring-1 ring-sky-400',
                          isBestDay && 'ring-1 ring-amber-400'
                        )}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Today / Latest Highlight Recap */}
      <div className="rounded-xl p-3.5 bg-slate-900/75 border border-white/10 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-black text-white">
              {formatReadableDate(shownDateKey)}
            </span>
            {shownDateKey === bestDayDate && (
              <Badge variant="amber" size="sm">
                Best Day Ever
              </Badge>
            )}
          </div>
          {selectedLog && (
            <span className="text-xs font-mono text-emerald-400 font-bold tabular-nums">
              {selectedLog.totalDarts} darts • {selectedLog.visitsCount} visits
            </span>
          )}
        </div>

        {selectedLog ? (
          <div className="space-y-2.5">
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-lg bg-slate-950/70 p-2 border border-white/[0.06]">
                <div className="text-[10px] font-mono uppercase text-slate-400">3DA</div>
                <div className="text-base sm:text-lg font-black font-mono tabular-nums text-emerald-400">
                  {selectedLog.threeDartAvg.toFixed(1)}
                </div>
              </div>
              <div className="rounded-lg bg-slate-950/70 p-2 border border-white/[0.06]">
                <div className="text-[10px] font-mono uppercase text-slate-400">High</div>
                <div className="text-base sm:text-lg font-black font-mono tabular-nums text-amber-300">
                  {selectedLog.highestVisit}
                </div>
              </div>
              <div className="rounded-lg bg-slate-950/70 p-2 border border-white/[0.06]">
                <div className="text-[10px] font-mono uppercase text-slate-400">Trebles</div>
                <div className="text-base sm:text-lg font-black font-mono tabular-nums text-sky-300">
                  {selectedLog.treblesHit}
                </div>
              </div>
              <div className="rounded-lg bg-slate-950/70 p-2 border border-white/[0.06]">
                <div className="text-[10px] font-mono uppercase text-slate-400">Doubles</div>
                <div className="text-base sm:text-lg font-black font-mono tabular-nums text-purple-300">
                  {selectedLog.doublesHit}
                </div>
              </div>
            </div>

            {(topSegments.length > 0 || (selectedLog.highlights?.length ?? 0) > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {(selectedLog.highlights ?? []).slice(0, 3).map((h, idx) => (
                  <Badge key={`${h}-${idx}`} variant="amber" size="sm">
                    {h}
                  </Badge>
                ))}
                {topSegments.map(([seg, count]) => (
                  <span
                    key={seg}
                    className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-white/[0.06] text-slate-200 border border-white/10"
                  >
                    {seg} ×{count}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            {isPartyMode
              ? 'Party Mode active — personal Career Vault is paused.'
              : 'Throw a visit to light up today on your streak calendar.'}
          </p>
        )}
      </div>

      {/* Best Days Ever Podium Strip */}
      {bestDays.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold">
            Best Days Ever
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {bestDays.map((day, idx) => (
              <div
                key={day.date}
                className={cn(
                  'flex items-center justify-between p-2.5 rounded-xl border',
                  idx === 0
                    ? 'bg-amber-500/12 border-amber-400/40'
                    : 'bg-slate-900/60 border-white/[0.08]'
                )}
              >
                <div>
                  <div className="text-[11px] font-mono font-bold text-amber-300">
                    #{idx + 1} • {formatReadableDate(day.date)}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {day.totalDarts} darts • High {day.highestVisit}
                  </div>
                </div>
                <div className="text-lg font-black font-mono tabular-nums text-white">
                  {day.threeDartAvg.toFixed(1)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
