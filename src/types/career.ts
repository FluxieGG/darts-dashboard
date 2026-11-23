export interface DailyCareerLog {
  /** Local date key: YYYY-MM-DD */
  date: string;
  totalDarts: number;
  totalPoints: number;
  threeDartAvg: number;
  visitsCount: number;
  highestVisit: number;
  highestVisitDarts: string[];
  ton60Plus: number;
  ton100Plus: number;
  ton140Plus: number;
  ton180: number;
  treblesHit: number;
  doublesHit: number;
  bullsHit: number;
  outerBullsHit: number;
  cleanVisits: number; // 3-dart visits with zero misses
  /** Count of hits per exact segment name (e.g. "T20": 8, "D16": 2, "Bull": 1) */
  segmentCounts: Record<string, number>;
  gamesPlayed: number;
  gamesWon: number;
  highlights: string[];
  lastUpdatedAt: number;
}

export interface CareerRecordEntry {
  value: number;
  date: string;
  detail?: string;
}

export interface PersonalRecords {
  bestDay3DA: CareerRecordEntry | null;
  highestVisit: CareerRecordEntry | null;
  mostDartsInDay: CareerRecordEntry | null;
  longestStreakDays: number;
  totalCareerDarts: number;
  totalCareerVisits: number;
  total180s: number;
  total140Plus: number;
  total100Plus: number;
  totalBulls: number;
  totalTrebles: number;
  totalDoubles: number;
  totalGamesWon: number;
}

export interface PlayerCareerVault {
  playerId: string;
  playerName: string;
  dailyLogs: Record<string, DailyCareerLog>;
  records: PersonalRecords;
  /** Optional reroll salt per dateKey / weekKey so players can refresh challenges */
  objectiveRerolls: Record<string, number>;
  /** Tracked completed objective IDs so we celebrate once and count lifetime completions */
  completedObjectiveIds: string[];
}

export interface GameLeaderboardEntry {
  gameId: string;
  gameTitle: string;
  mode: 'arcade' | 'practice' | 'online';
  playerId: string;
  playerName: string;
  colorHex: string;
  wins: number;
  gamesPlayed: number;
  bestStatValue: number;
  bestStatDisplay: string;
  bestStatLabel: string;
  lowerIsBetter?: boolean;
  lastPlayedAt: number;
}

export interface CareerVaultData {
  version: number;
  players: Record<string, PlayerCareerVault>;
  /** Persistent per-game & per-drill leaderboards keyed by gameId */
  gameLeaderboards?: Record<string, GameLeaderboardEntry[]>;
  updatedAt: number;
}

export type ObjectivePeriod = 'daily' | 'weekly';
export type ObjectiveFlavor = 'Fun' | 'Skill' | 'Grind';

export interface ObjectiveProgress {
  id: string;
  period: ObjectivePeriod;
  flavor: ObjectiveFlavor;
  title: string;
  description: string;
  target: number;
  current: number;
  pct: number;
  completed: boolean;
  unitLabel: string;
}

export interface StreakSummary {
  currentStreak: number;
  longestStreak: number;
  playedToday: boolean;
  daysPlayedThisWeek: number;
  totalDaysPlayed: number;
}
