import { describe, expect, it } from 'vitest';
import {
  addDaysToDateKey,
  applyVisitToCareerVault,
  computeStreaks,
  createEmptyDailyLog,
  createEmptyPlayerVault,
  evaluateObjectives,
  isValidDateKey,
  parseDateKey,
} from '../lib/careerEngine';
import { DailyCareerLog } from '../types/career';
import { DartThrow } from '../types/darts';

function makeDart(
  name: string,
  number: number,
  multiplier: number,
  score: number,
  bed: DartThrow['segment']['bed'],
  idx = 0
): DartThrow {
  return {
    id: `career-dart-${idx}-${name}`,
    visitDartIndex: idx,
    segment: { name, number, bed, multiplier },
    score,
    timestamp: 1_700_000_000_000,
  };
}

function assertNoNaNOrInfinity(value: unknown, path = 'root', seen = new WeakSet<object>()): void {
  if (typeof value === 'number') {
    expect(Number.isFinite(value), `Non-finite number at ${path}: ${String(value)}`).toBe(true);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, idx) => assertNoNaNOrInfinity(item, `${path}[${idx}]`, seen));
    return;
  }

  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    assertNoNaNOrInfinity(v, `${path}.${k}`, seen);
  }
}

describe('careerEngine date key utilities', () => {
  it('validates real calendar YYYY-MM-DD keys including leap days and rejects malformed strings', () => {
    expect(isValidDateKey('2026-03-15')).toBe(true);
    expect(isValidDateKey('2024-02-29')).toBe(true); // leap year
    expect(isValidDateKey('2026-02-29')).toBe(false); // non-leap year
    expect(isValidDateKey('2026-04-31')).toBe(false); // April has 30 days
    expect(isValidDateKey('2026-99-99')).toBe(false);
    expect(isValidDateKey('invalid-date')).toBe(false);
    expect(isValidDateKey('NaN-NaN-NaN')).toBe(false);
    expect(isValidDateKey('')).toBe(false);
    expect(isValidDateKey(null)).toBe(false);
    expect(isValidDateKey(undefined)).toBe(false);
    expect(isValidDateKey(20260315)).toBe(false);
  });

  it('parses valid date keys cleanly and falls back safely on invalid keys', () => {
    const valid = parseDateKey('2024-02-29');
    expect(valid.getFullYear()).toBe(2024);
    expect(valid.getMonth()).toBe(1);
    expect(valid.getDate()).toBe(29);

    for (const bad of ['invalid-date', '2026-99-99', '']) {
      const parsed = parseDateKey(bad);
      expect(parsed instanceof Date).toBe(true);
      expect(Number.isNaN(parsed.getTime())).toBe(false);
    }
  });

  it('adds days accurately across leap days and year boundaries and returns empty string on bad input', () => {
    expect(addDaysToDateKey('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDaysToDateKey('2024-02-29', 1)).toBe('2024-03-01');
    expect(addDaysToDateKey('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDaysToDateKey('2026-12-31', 1)).toBe('2027-01-01');

    expect(addDaysToDateKey('invalid-date', 1)).toBe('');
    expect(addDaysToDateKey('2026-99-99', -1)).toBe('');
    expect(addDaysToDateKey('', 5)).toBe('');
    expect(addDaysToDateKey('2026-03-15', Number.NaN)).toBe('');
    expect(addDaysToDateKey('2026-03-15', Number.POSITIVE_INFINITY)).toBe('');
  });
});

describe('computeStreaks', () => {
  it('handles empty vault, consecutive streaks, and broken streaks accurately', () => {
    const today = new Date(2026, 5, 15); // 2026-06-15

    const empty = computeStreaks({}, today);
    expect(empty.currentStreak).toBe(0);
    expect(empty.longestStreak).toBe(0);
    expect(empty.playedToday).toBe(false);
    expect(empty.totalDaysPlayed).toBe(0);

    const activeLog = (dateKey: string): DailyCareerLog => ({
      ...createEmptyDailyLog(dateKey),
      totalDarts: 18,
    });

    const consecutive = computeStreaks(
      {
        '2026-06-13': activeLog('2026-06-13'),
        '2026-06-14': activeLog('2026-06-14'),
        '2026-06-15': activeLog('2026-06-15'),
      },
      today
    );
    expect(consecutive.currentStreak).toBe(3);
    expect(consecutive.longestStreak).toBe(3);
    expect(consecutive.playedToday).toBe(true);
    expect(consecutive.totalDaysPlayed).toBe(3);

    // Broken streak: 5-day run in May + 2-day run ending yesterday
    const broken = computeStreaks(
      {
        '2026-05-01': activeLog('2026-05-01'),
        '2026-05-02': activeLog('2026-05-02'),
        '2026-05-03': activeLog('2026-05-03'),
        '2026-05-04': activeLog('2026-05-04'),
        '2026-05-05': activeLog('2026-05-05'),
        '2026-06-13': activeLog('2026-06-13'),
        '2026-06-14': activeLog('2026-06-14'),
      },
      today
    );
    expect(broken.currentStreak).toBe(2);
    expect(broken.longestStreak).toBe(5);
    expect(broken.playedToday).toBe(false);
    expect(broken.totalDaysPlayed).toBe(7);
  });

  it('ignores corrupt NaN-NaN-NaN and invalid keys without infinite looping (< 50ms)', () => {
    const today = new Date(2026, 5, 15);
    const logs: Record<string, DailyCareerLog> = {
      'NaN-NaN-NaN': { ...createEmptyDailyLog('NaN-NaN-NaN'), totalDarts: 99 },
      invalid: { ...createEmptyDailyLog('invalid'), totalDarts: 45 },
      '2026-99-99': { ...createEmptyDailyLog('2026-99-99'), totalDarts: 30 },
      '': { ...createEmptyDailyLog(''), totalDarts: 12 },
      '2026-06-14': { ...createEmptyDailyLog('2026-06-14'), totalDarts: 30 },
      '2026-06-15': { ...createEmptyDailyLog('2026-06-15'), totalDarts: 30 },
    };

    const start = performance.now();
    const result = computeStreaks(logs, today);
    const elapsedMs = performance.now() - start;

    expect(elapsedMs).toBeLessThan(50);
    expect(result.currentStreak).toBe(2);
    expect(result.longestStreak).toBe(2);
    expect(result.totalDaysPlayed).toBe(2);
  });
});

describe('applyVisitToCareerVault', () => {
  it('records normal visits and sanitizes NaN / negative / missing segment throws', () => {
    const day = new Date(2026, 3, 10, 18, 0, 0);
    let vault = createEmptyPlayerVault('player-callum', 'Callum');

    // Normal 180 visit
    vault = applyVisitToCareerVault(
      vault,
      [
        makeDart('T20', 20, 3, 60, 'Triple', 0),
        makeDart('T20', 20, 3, 60, 'Triple', 1),
        makeDart('T20', 20, 3, 60, 'Triple', 2),
      ],
      day
    );

    const logAfterNormal = vault.dailyLogs['2026-04-10'];
    expect(logAfterNormal.totalDarts).toBe(3);
    expect(logAfterNormal.totalPoints).toBe(180);
    expect(logAfterNormal.threeDartAvg).toBe(180);
    expect(logAfterNormal.ton180).toBe(1);
    expect(logAfterNormal.treblesHit).toBe(3);
    expect(logAfterNormal.cleanVisits).toBe(1);

    // Malformed visit: NaN score, negative score, missing segment
    const malformedThrows: DartThrow[] = [
      {
        id: 'bad-1',
        visitDartIndex: 0,
        segment: { name: 'T20', number: 20, bed: 'Triple', multiplier: 3 },
        score: Number.NaN,
        timestamp: day.getTime(),
      },
      {
        id: 'bad-2',
        visitDartIndex: 1,
        segment: { name: 'S5', number: 5, bed: 'Single', multiplier: 1 },
        score: -45,
        timestamp: day.getTime(),
      },
      {
        id: 'bad-3',
        visitDartIndex: 2,
        segment: undefined as unknown as DartThrow['segment'],
        score: Number.POSITIVE_INFINITY,
        timestamp: day.getTime(),
      },
    ];

    vault = applyVisitToCareerVault(vault, malformedThrows, day);
    const logAfterBad = vault.dailyLogs['2026-04-10'];

    expect(logAfterBad.totalDarts).toBe(6);
    expect(logAfterBad.totalPoints).toBe(180);
    expect(logAfterBad.threeDartAvg).toBe(90);
    expect(vault.records.totalCareerDarts).toBe(6);
    expect(vault.records.highestVisit?.value).toBe(180);
    assertNoNaNOrInfinity(vault);
  });

  it('passes 365-day / 10,950-dart stress run with exact streaks, totals, 0 NaN, and bounded objective pct', () => {
    let vault = createEmptyPlayerVault('player-stress', 'Callum');

    const visitPatterns: DartThrow[][] = [
      [
        makeDart('T20', 20, 3, 60, 'Triple', 0),
        makeDart('S20', 20, 1, 20, 'Single', 1),
        makeDart('D16', 16, 2, 32, 'Double', 2),
      ],
      [
        makeDart('Bull', 25, 2, 50, 'InnerBull', 0),
        makeDart('25', 25, 1, 25, 'Bull', 1),
        makeDart('Miss', 0, 0, 0, 'Outside', 2),
      ],
      [
        makeDart('T19', 19, 3, 57, 'Triple', 0),
        makeDart('T20', 20, 3, 60, 'Triple', 1),
        makeDart('S18', 18, 1, 18, 'Single', 2),
      ],
    ];

    let lastDate = new Date(2026, 0, 1, 12, 0, 0);
    for (let dayOffset = 0; dayOffset < 365; dayOffset++) {
      const currentDate = new Date(2026, 0, 1 + dayOffset, 12, 0, 0);
      lastDate = currentDate;
      // 10 visits * 3 darts = 30 darts/day -> 365 * 30 = 10,950 darts
      for (let v = 0; v < 10; v++) {
        const pattern = visitPatterns[(dayOffset + v) % visitPatterns.length];
        vault = applyVisitToCareerVault(vault, pattern, currentDate);
      }
    }

    const streaks = computeStreaks(vault.dailyLogs, lastDate);
    expect(streaks.currentStreak).toBe(365);
    expect(streaks.longestStreak).toBe(365);
    expect(streaks.totalDaysPlayed).toBe(365);
    expect(streaks.playedToday).toBe(true);
    expect(vault.records.totalCareerDarts).toBe(10_950);
    expect(vault.records.totalCareerVisits).toBe(3_650);
    expect(vault.records.longestStreakDays).toBe(365);

    assertNoNaNOrInfinity(vault);

    const { daily, weekly } = evaluateObjectives(vault, lastDate);
    expect(daily).toHaveLength(3);
    expect(weekly).toHaveLength(3);
    for (const obj of [...daily, ...weekly]) {
      expect(Number.isFinite(obj.pct)).toBe(true);
      expect(obj.pct).toBeGreaterThanOrEqual(0);
      expect(obj.pct).toBeLessThanOrEqual(100);
      expect(Number.isFinite(obj.current)).toBe(true);
    }
  });
});
