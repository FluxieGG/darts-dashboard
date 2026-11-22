import { DartThrow } from '../types/darts';
import {
  DailyCareerLog,
  ObjectiveProgress,
  PersonalRecords,
  PlayerCareerVault,
  StreakSummary,
} from '../types/career';
import { isDouble, isInnerBull, isMiss, isOuterBull, isTreble } from '../games/utils/dartHelpers';

/**
 * Local timezone YYYY-MM-DD key
 */
export function getLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDaysToDateKey(dateKey: string, deltaDays: number): string {
  const dt = parseDateKey(dateKey);
  dt.setDate(dt.getDate() + deltaDays);
  return getLocalDateKey(dt);
}

/**
 * Returns the Monday date key (YYYY-MM-DD) for the week containing `date`
 */
export function getWeekStartKey(date: Date = new Date()): string {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay(); // 0 = Sun, 1 = Mon, ...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diffToMonday);
  return getLocalDateKey(copy);
}

export function getCurrentWeekDateKeys(today: Date = new Date()): string[] {
  const monday = getWeekStartKey(today);
  return Array.from({ length: 7 }, (_, i) => addDaysToDateKey(monday, i));
}

export function formatReadableDate(dateKey: string): string {
  const dt = parseDateKey(dateKey);
  return dt.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

export function createEmptyRecords(): PersonalRecords {
  return {
    bestDay3DA: null,
    highestVisit: null,
    mostDartsInDay: null,
    longestStreakDays: 0,
    totalCareerDarts: 0,
    totalCareerVisits: 0,
    total180s: 0,
    total140Plus: 0,
    total100Plus: 0,
    totalBulls: 0,
    totalTrebles: 0,
    totalDoubles: 0,
    totalGamesWon: 0,
  };
}

export function createEmptyPlayerVault(playerId: string, playerName: string): PlayerCareerVault {
  return {
    playerId,
    playerName,
    dailyLogs: {},
    records: createEmptyRecords(),
    objectiveRerolls: {},
    completedObjectiveIds: [],
  };
}

export function createEmptyDailyLog(dateKey: string): DailyCareerLog {
  return {
    date: dateKey,
    totalDarts: 0,
    totalPoints: 0,
    threeDartAvg: 0,
    visitsCount: 0,
    highestVisit: 0,
    highestVisitDarts: [],
    ton60Plus: 0,
    ton100Plus: 0,
    ton140Plus: 0,
    ton180: 0,
    treblesHit: 0,
    doublesHit: 0,
    bullsHit: 0,
    outerBullsHit: 0,
    cleanVisits: 0,
    segmentCounts: {},
    gamesPlayed: 0,
    gamesWon: 0,
    highlights: [],
    lastUpdatedAt: Date.now(),
  };
}

/**
 * Computes consecutive day streaks & weekly attendance from dailyLogs
 */
export function computeStreaks(
  dailyLogs: Record<string, DailyCareerLog>,
  today: Date = new Date()
): StreakSummary {
  const activeDates = Object.values(dailyLogs)
    .filter((log) => log.totalDarts > 0 || log.gamesPlayed > 0)
    .map((log) => log.date)
    .sort();

  const activeSet = new Set(activeDates);
  const todayKey = getLocalDateKey(today);
  const yesterdayKey = addDaysToDateKey(todayKey, -1);
  const playedToday = activeSet.has(todayKey);

  // Current streak: counts back from today (or yesterday if haven't thrown yet today)
  let currentStreak = 0;
  let cursor = playedToday ? todayKey : activeSet.has(yesterdayKey) ? yesterdayKey : null;
  while (cursor && activeSet.has(cursor)) {
    currentStreak++;
    cursor = addDaysToDateKey(cursor, -1);
  }

  // Longest streak across all history
  let longestStreak = 0;
  let run = 0;
  let prevDate: string | null = null;
  for (const dateKey of activeDates) {
    if (prevDate && addDaysToDateKey(prevDate, 1) === dateKey) {
      run++;
    } else {
      run = 1;
    }
    if (run > longestStreak) longestStreak = run;
    prevDate = dateKey;
  }

  const weekKeys = getCurrentWeekDateKeys(today);
  const daysPlayedThisWeek = weekKeys.filter((k) => activeSet.has(k)).length;

  return {
    currentStreak,
    longestStreak,
    playedToday,
    daysPlayedThisWeek,
    totalDaysPlayed: activeDates.length,
  };
}

/**
 * Recomputes all-time PersonalRecords from all DailyCareerLogs
 */
export function recomputeRecords(dailyLogs: Record<string, DailyCareerLog>): PersonalRecords {
  const rec = createEmptyRecords();
  const logs = Object.values(dailyLogs);

  for (const log of logs) {
    rec.totalCareerDarts += log.totalDarts;
    rec.totalCareerVisits += log.visitsCount;
    rec.total180s += log.ton180;
    rec.total140Plus += log.ton140Plus;
    rec.total100Plus += log.ton100Plus + log.ton140Plus + log.ton180;
    rec.totalBulls += log.bullsHit;
    rec.totalTrebles += log.treblesHit;
    rec.totalDoubles += log.doublesHit;
    rec.totalGamesWon += log.gamesWon;

    // Best day 3DA (prefer days with >= 9 darts once available, else fallback to >= 3)
    const qualifiesStrong = log.totalDarts >= 9;
    if (log.totalDarts >= 3) {
      const currentBestStrong =
        rec.bestDay3DA && rec.bestDay3DA.detail ? !rec.bestDay3DA.detail.includes('warmup') : false;

      if (
        !rec.bestDay3DA ||
        (qualifiesStrong && !currentBestStrong) ||
        (qualifiesStrong === currentBestStrong && log.threeDartAvg > rec.bestDay3DA.value)
      ) {
        rec.bestDay3DA = {
          value: log.threeDartAvg,
          date: log.date,
          detail: qualifiesStrong ? `${log.totalDarts} darts` : `${log.totalDarts} darts (warmup)`,
        };
      }
    }

    if (log.highestVisit > 0 && (!rec.highestVisit || log.highestVisit > rec.highestVisit.value)) {
      rec.highestVisit = {
        value: log.highestVisit,
        date: log.date,
        detail: log.highestVisitDarts.join(' • '),
      };
    }

    if (log.totalDarts > 0 && (!rec.mostDartsInDay || log.totalDarts > rec.mostDartsInDay.value)) {
      rec.mostDartsInDay = {
        value: log.totalDarts,
        date: log.date,
        detail: `${log.visitsCount} visits`,
      };
    }
  }

  const streaks = computeStreaks(dailyLogs);
  rec.longestStreakDays = streaks.longestStreak;
  return rec;
}

/**
 * Pure reducer that applies a completed 3-dart visit to a player's Career Vault
 */
export function applyVisitToCareerVault(
  vault: PlayerCareerVault,
  throws: DartThrow[],
  now: Date = new Date()
): PlayerCareerVault {
  if (throws.length === 0) return vault;

  const dateKey = getLocalDateKey(now);
  const existing = vault.dailyLogs[dateKey] || createEmptyDailyLog(dateKey);
  const visitScore = throws.reduce((sum, d) => sum + d.score, 0);

  const nextSegments = { ...existing.segmentCounts };
  let trebles = 0;
  let doubles = 0;
  let bulls = 0;
  let outerBulls = 0;
  let hadMiss = false;

  for (const dart of throws) {
    if (isMiss(dart)) {
      hadMiss = true;
      continue;
    }
    const segName = dart.segment.name;
    nextSegments[segName] = (nextSegments[segName] || 0) + 1;
    if (isTreble(dart)) trebles++;
    if (isDouble(dart) && !isInnerBull(dart)) doubles++;
    if (isInnerBull(dart)) bulls++;
    if (isOuterBull(dart)) outerBulls++;
  }

  const nextTotalDarts = existing.totalDarts + throws.length;
  const nextTotalPoints = existing.totalPoints + visitScore;
  const next3DA = nextTotalDarts > 0 ? parseFloat(((nextTotalPoints / nextTotalDarts) * 3).toFixed(2)) : 0;

  const nextHighlights = [...existing.highlights];
  const pushHighlight = (label: string) => {
    if (!nextHighlights.includes(label)) {
      nextHighlights.unshift(label);
    }
  };

  if (visitScore === 180) pushHighlight('MAXIMUM 180!');
  else if (visitScore >= 140) pushHighlight(`Ton-40+ (${visitScore})`);
  else if (visitScore >= 100) pushHighlight(`Ton+ Visit (${visitScore})`);
  if (bulls > 0) pushHighlight('Inner Bullseye (50)');

  const isNewHighVisit = visitScore > existing.highestVisit;

  const updatedLog: DailyCareerLog = {
    ...existing,
    totalDarts: nextTotalDarts,
    totalPoints: nextTotalPoints,
    threeDartAvg: next3DA,
    visitsCount: existing.visitsCount + 1,
    highestVisit: isNewHighVisit ? visitScore : existing.highestVisit,
    highestVisitDarts: isNewHighVisit ? throws.map((t) => t.segment.name) : existing.highestVisitDarts,
    ton60Plus: existing.ton60Plus + (visitScore >= 60 && visitScore < 100 ? 1 : 0),
    ton100Plus: existing.ton100Plus + (visitScore >= 100 && visitScore < 140 ? 1 : 0),
    ton140Plus: existing.ton140Plus + (visitScore >= 140 && visitScore < 180 ? 1 : 0),
    ton180: existing.ton180 + (visitScore === 180 ? 1 : 0),
    treblesHit: existing.treblesHit + trebles,
    doublesHit: existing.doublesHit + doubles,
    bullsHit: existing.bullsHit + bulls,
    outerBullsHit: existing.outerBullsHit + outerBulls,
    cleanVisits: existing.cleanVisits + (!hadMiss && throws.length === 3 ? 1 : 0),
    segmentCounts: nextSegments,
    highlights: nextHighlights.slice(0, 8),
    lastUpdatedAt: now.getTime(),
  };

  const nextLogs = {
    ...vault.dailyLogs,
    [dateKey]: updatedLog,
  };

  return {
    ...vault,
    dailyLogs: nextLogs,
    records: recomputeRecords(nextLogs),
  };
}

/**
 * Records an Arcade Game completion/win into a player's daily career log
 */
export function applyArcadeGameToCareerVault(
  vault: PlayerCareerVault,
  gameTitle: string,
  didWin: boolean,
  now: Date = new Date()
): PlayerCareerVault {
  const dateKey = getLocalDateKey(now);
  const existing = vault.dailyLogs[dateKey] || createEmptyDailyLog(dateKey);
  const nextHighlights = [...existing.highlights];
  if (didWin) {
    const label = `Won ${gameTitle}`;
    if (!nextHighlights.includes(label)) {
      nextHighlights.unshift(label);
    }
  }

  const updatedLog: DailyCareerLog = {
    ...existing,
    gamesPlayed: existing.gamesPlayed + 1,
    gamesWon: existing.gamesWon + (didWin ? 1 : 0),
    highlights: nextHighlights.slice(0, 8),
    lastUpdatedAt: now.getTime(),
  };

  const nextLogs = {
    ...vault.dailyLogs,
    [dateKey]: updatedLog,
  };

  return {
    ...vault,
    dailyLogs: nextLogs,
    records: recomputeRecords(nextLogs),
  };
}

/**
 * Generates deterministic, fun + serious Daily (3) and Weekly (3) Objectives
 * evaluated live against the player's Career Vault logs!
 */
export function evaluateObjectives(
  vault: PlayerCareerVault,
  now: Date = new Date()
): { daily: ObjectiveProgress[]; weekly: ObjectiveProgress[] } {
  const todayKey = getLocalDateKey(now);
  const weekStartKey = getWeekStartKey(now);
  const weekKeys = getCurrentWeekDateKeys(now);

  const todayLog = vault.dailyLogs[todayKey] || createEmptyDailyLog(todayKey);
  const weekLogs = weekKeys
    .map((k) => vault.dailyLogs[k])
    .filter((l): l is DailyCareerLog => Boolean(l));

  const dailySalt = vault.objectiveRerolls[`daily:${todayKey}`] || 0;
  const weeklySalt = vault.objectiveRerolls[`weekly:${weekStartKey}`] || 0;

  const dailySeed = hashString(`${vault.playerId}:${todayKey}:d:${dailySalt}`);
  const weeklySeed = hashString(`${vault.playerId}:${weekStartKey}:w:${weeklySalt}`);

  const makeProgress = (
    id: string,
    period: 'daily' | 'weekly',
    flavor: 'Fun' | 'Skill' | 'Grind',
    title: string,
    description: string,
    current: number,
    target: number,
    unitLabel: string
  ): ObjectiveProgress => {
    const clamped = Math.min(current, target);
    return {
      id,
      period,
      flavor,
      title,
      description,
      target,
      current: clamped,
      pct: Math.min(100, Math.round((clamped / Math.max(1, target)) * 100)),
      completed: current >= target,
      unitLabel,
    };
  };

  // --- DAILY OBJECTIVE 1: Accessible Warmup / Volume ---
  const dailyWarmups = [
    () =>
      makeProgress(
        `d-${todayKey}-warm-18-${dailySalt}`,
        'daily',
        'Grind',
        'Oche Warmup',
        'Throw 18 darts (6 visits) today to stay sharp.',
        todayLog.totalDarts,
        18,
        'darts'
      ),
    () =>
      makeProgress(
        `d-${todayKey}-clean-3-${dailySalt}`,
        'daily',
        'Fun',
        'Keep It On The Wire',
        'Complete 3 clean 3-dart visits with zero misses.',
        todayLog.cleanVisits,
        3,
        'visits'
      ),
    () =>
      makeProgress(
        `d-${todayKey}-warm-24-${dailySalt}`,
        'daily',
        'Grind',
        'Daily Rhythm',
        'Log 24 darts on the board today.',
        todayLog.totalDarts,
        24,
        'darts'
      ),
  ];

  // --- DAILY OBJECTIVE 2: Specific Target Double or Treble (Easy/Achievable) ---
  const targetTrebles = ['T20', 'T19', 'T18'];
  const targetDoubles = ['D20', 'D16', 'D8', 'D10'];
  const pickedTreble = targetTrebles[dailySeed % targetTrebles.length];
  const pickedDouble = targetDoubles[(dailySeed >> 2) % targetDoubles.length];

  const dailyTargets = [
    () =>
      makeProgress(
        `d-${todayKey}-treble-${pickedTreble}-${dailySalt}`,
        'daily',
        'Skill',
        `Nail ${pickedTreble}`,
        `Land 1 dart cleanly inside ${pickedTreble} today.`,
        todayLog.segmentCounts[pickedTreble] || 0,
        1,
        'hit'
      ),
    () =>
      makeProgress(
        `d-${todayKey}-double-${pickedDouble}-${dailySalt}`,
        'daily',
        'Skill',
        `Finish on ${pickedDouble}`,
        `Hit ${pickedDouble} once today to sharpen your out-shot.`,
        todayLog.segmentCounts[pickedDouble] || 0,
        1,
        'hit'
      ),
    () =>
      makeProgress(
        `d-${todayKey}-any-double-2-${dailySalt}`,
        'daily',
        'Fun',
        'Double Vision',
        'Hit any 2 Doubles on the outer ring today.',
        todayLog.doublesHit,
        2,
        'doubles'
      ),
    () =>
      makeProgress(
        `d-${todayKey}-bull-ring-${dailySalt}`,
        'daily',
        'Fun',
        'Centre Stage',
        'Hit either Outer Bull (25) or Bullseye (50) once today.',
        todayLog.bullsHit + todayLog.outerBullsHit,
        1,
        'bull'
      ),
  ];

  // --- DAILY OBJECTIVE 3: Scoring Spark ---
  const dailySparks = [
    () =>
      makeProgress(
        `d-${todayKey}-60plus-${dailySalt}`,
        'daily',
        'Skill',
        'Break Sixty',
        'Score at least one 60+ visit today.',
        todayLog.ton60Plus + todayLog.ton100Plus + todayLog.ton140Plus + todayLog.ton180,
        1,
        '60+ visit'
      ),
    () =>
      makeProgress(
        `d-${todayKey}-any-treble-2-${dailySalt}`,
        'daily',
        'Fun',
        'Treble Hunter',
        'Hit any 2 Trebles anywhere on the board today.',
        todayLog.treblesHit,
        2,
        'trebles'
      ),
    () =>
      makeProgress(
        `d-${todayKey}-points-300-${dailySalt}`,
        'daily',
        'Grind',
        '300 Point Club',
        'Rack up 300 total points across your visits today.',
        todayLog.totalPoints,
        300,
        'pts'
      ),
  ];

  const daily: ObjectiveProgress[] = [
    dailyWarmups[dailySeed % dailyWarmups.length](),
    dailyTargets[(dailySeed >> 3) % dailyTargets.length](),
    dailySparks[(dailySeed >> 5) % dailySparks.length](),
  ];

  // --- WEEKLY AGGREGATES ---
  const weekTons = weekLogs.reduce((s, l) => s + l.ton100Plus + l.ton140Plus + l.ton180, 0);
  const weekDarts = weekLogs.reduce((s, l) => s + l.totalDarts, 0);
  const weekTrebles = weekLogs.reduce((s, l) => s + l.treblesHit, 0);
  const weekDoubles = weekLogs.reduce((s, l) => s + l.doublesHit, 0);
  const weekBulls = weekLogs.reduce((s, l) => s + l.bullsHit, 0);
  const weekDaysActive = weekLogs.filter((l) => l.totalDarts > 0 || l.gamesPlayed > 0).length;

  // --- WEEKLY OBJECTIVE 1: Signature 100+ Milestone ---
  const weeklyTonOptions = [
    () =>
      makeProgress(
        `w-${weekStartKey}-ton-1-${weeklySalt}`,
        'weekly',
        'Skill',
        'Ton-Up Milestone',
        'Smash at least one 100+ visit this week.',
        weekTons,
        1,
        '100+ visit'
      ),
    () =>
      makeProgress(
        `w-${weekStartKey}-ton-2-${weeklySalt}`,
        'weekly',
        'Skill',
        'Double Ton Week',
        'Hit two 100+ visits across your sessions this week.',
        weekTons,
        2,
        '100+ visits'
      ),
  ];

  // --- WEEKLY OBJECTIVE 2: Streak / Consistency ---
  const weeklyStreakObj = makeProgress(
    `w-${weekStartKey}-days-3-${weeklySalt}`,
    'weekly',
    'Grind',
    '3-Day Streak Builder',
    'Step up to the oche on 3 different days this week.',
    weekDaysActive,
    3,
    'days'
  );

  // --- WEEKLY OBJECTIVE 3: Tougher Skill / Fun Challenge ---
  const weeklyChallenges = [
    () =>
      makeProgress(
        `w-${weekStartKey}-trebles-8-${weeklySalt}`,
        'weekly',
        'Skill',
        'Treble Machine',
        'Hit 8 Trebles across the week.',
        weekTrebles,
        8,
        'trebles'
      ),
    () =>
      makeProgress(
        `w-${weekStartKey}-doubles-6-${weeklySalt}`,
        'weekly',
        'Skill',
        'Checkout Ready',
        'Hit 6 Doubles across the week.',
        weekDoubles,
        6,
        'doubles'
      ),
    () =>
      makeProgress(
        `w-${weekStartKey}-bull-2-${weeklySalt}`,
        'weekly',
        'Fun',
        'Bullseye Boss',
        'Stick 2 Inner Bullseyes (50) this week.',
        weekBulls,
        2,
        'bullseyes'
      ),
    () =>
      makeProgress(
        `w-${weekStartKey}-darts-150-${weeklySalt}`,
        'weekly',
        'Grind',
        'Weekly Grinder',
        'Throw 150 total darts this week.',
        weekDarts,
        150,
        'darts'
      ),
  ];

  const weekly: ObjectiveProgress[] = [
    weeklyTonOptions[weeklySeed % weeklyTonOptions.length](),
    weeklyStreakObj,
    weeklyChallenges[(weeklySeed >> 3) % weeklyChallenges.length](),
  ];

  return { daily, weekly };
}

/**
 * Returns the top "Best Days Ever" sorted by 3-Dart Average (then highest visit)
 */
export function getBestDaysEver(
  dailyLogs: Record<string, DailyCareerLog>,
  limit = 5
): DailyCareerLog[] {
  return Object.values(dailyLogs)
    .filter((l) => l.totalDarts >= 3)
    .sort((a, b) => {
      // Rank days with >= 9 darts above tiny 3-dart warmups
      const aFull = a.totalDarts >= 9 ? 1 : 0;
      const bFull = b.totalDarts >= 9 ? 1 : 0;
      if (bFull !== aFull) return bFull - aFull;
      if (b.threeDartAvg !== a.threeDartAvg) return b.threeDartAvg - a.threeDartAvg;
      return b.highestVisit - a.highestVisit;
    })
    .slice(0, limit);
}

/**
 * Builds a GitHub-style calendar matrix (last `weeks` full weeks ending this Sunday)
 */
export function buildCalendarWeeks(
  dailyLogs: Record<string, DailyCareerLog>,
  weeks = 14,
  today: Date = new Date()
): Array<
  Array<{
    dateKey: string;
    isFuture: boolean;
    isToday: boolean;
    log: DailyCareerLog | null;
    intensity: 0 | 1 | 2 | 3 | 4;
  }>
> {
  const todayKey = getLocalDateKey(today);
  const currentWeekStart = getWeekStartKey(today);
  const startKey = addDaysToDateKey(currentWeekStart, -(weeks - 1) * 7);

  const columns: Array<
    Array<{
      dateKey: string;
      isFuture: boolean;
      isToday: boolean;
      log: DailyCareerLog | null;
      intensity: 0 | 1 | 2 | 3 | 4;
    }>
  > = [];

  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const dateKey = addDaysToDateKey(startKey, w * 7 + d);
      const log = dailyLogs[dateKey] || null;
      const darts = log?.totalDarts || 0;
      let intensity: 0 | 1 | 2 | 3 | 4 = 0;
      if (darts >= 90 || (log?.ton180 || 0) > 0) intensity = 4;
      else if (darts >= 45) intensity = 3;
      else if (darts >= 18) intensity = 2;
      else if (darts > 0 || (log?.gamesPlayed || 0) > 0) intensity = 1;

      col.push({
        dateKey,
        isFuture: dateKey > todayKey,
        isToday: dateKey === todayKey,
        log,
        intensity,
      });
    }
    columns.push(col);
  }

  return columns;
}
