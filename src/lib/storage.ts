import type { StateStorage } from 'zustand/middleware';
import { DashboardLayout } from '../types/config';

const STORAGE_KEYS = {
  LAYOUT: 'autodarts_dashboard_layout_v4',
} as const;

let lastStorageWarnAt = 0;
const STORAGE_WARN_COOLDOWN_MS = 10_000;

function warnStorageFailure(action: 'getItem' | 'setItem' | 'removeItem', key: string, err: unknown): void {
  const now = Date.now();
  if (now - lastStorageWarnAt < STORAGE_WARN_COOLDOWN_MS) return;
  lastStorageWarnAt = now;
  const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  console.warn(`[safeLocalStorage] ${action}("${key}") failed: ${reason}`);
}

/**
 * Quota- and privacy-mode-safe localStorage adapter for Zustand `createJSONStorage`.
 * Never throws on QuotaExceededError or blocked storage; logs rate-limited warnings.
 */
export const safeLocalStorage: StateStorage = {
  getItem: (name: string): string | null => {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(name);
    } catch (err) {
      warnStorageFailure('getItem', name, err);
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(name, value);
    } catch (err) {
      warnStorageFailure('setItem', name, err);
    }
  },
  removeItem: (name: string): void => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(name);
    } catch (err) {
      warnStorageFailure('removeItem', name, err);
    }
  },
};

export const DEFAULT_LAYOUT: DashboardLayout = {
  widgets: [
    {
      id: 'live-match',
      title: 'Online Match & Checkout Co-Pilot',
      description: 'Live 501/301 online match leg tracker with real-time PDC checkout routes',
      enabled: true,
      order: 0,
      colSpan: 2,
    },
    {
      id: 'live-visit',
      title: 'Current Visit Tracker',
      description: 'Live 3-dart badge breakdown, multipliers, and visit total',
      enabled: true,
      order: 1,
      colSpan: 2,
    },
    {
      id: 'trend-sparkline',
      title: 'Average Progression Trend',
      description: 'Rolling 3-dart average curve across your session',
      enabled: true,
      order: 2,
      colSpan: 2,
    },
    {
      id: 'recent-matches',
      title: 'Recent Visits Log',
      description: 'Completed visits with dart breakdown and totals',
      enabled: true,
      order: 3,
      colSpan: 2,
    },
    {
      id: 'dartboard-heatmap',
      title: 'Dartboard Coordinate Heatmap',
      description: 'Vector dartboard with real-time dot plotting and density clustering',
      enabled: true,
      order: 4,
      colSpan: 2,
    },
    {
      id: 'hero-kpis',
      title: 'Performance Snapshot',
      description: '3-Dart Average, First 9, Checkout %, and Highest Visit',
      enabled: true,
      order: 5,
      colSpan: 2,
    },
    {
      id: 'scoring-power',
      title: 'Scoring Power (Ton Breakdown)',
      description: 'Distribution of 60+, 100+, 140+, and maximum 180 visits',
      enabled: true,
      order: 6,
      colSpan: 1,
    },
    {
      id: 'doubles-trebles',
      title: 'Precision Hit Rates',
      description: 'Key double & treble target accuracy (T20, T19, D20, Bull)',
      enabled: true,
      order: 7,
      colSpan: 1,
    },
    {
      id: 'objectives-tracker',
      title: 'Daily & Weekly Objectives',
      description: 'Live fun & skill challenges tied to your Career Vault',
      enabled: true,
      order: 8,
      colSpan: 2,
    },
    {
      id: 'game-leaderboards',
      title: 'Hall of Fame & Game Leaderboards',
      description: 'All-time wins, high breaks, fastest legs & solo drill records across all games',
      enabled: true,
      order: 9,
      colSpan: 2,
    },
    {
      id: 'career-streak',
      title: 'Streak Calendar & Career Vault',
      description: 'Practice calendar, daily streak tracker, and Best Days Ever archive',
      enabled: true,
      order: 10,
      colSpan: 2,
    },
  ],
};

export function normalizeLayout(
  raw: DashboardLayout | null | undefined
): DashboardLayout {
  if (!raw || !Array.isArray(raw.widgets)) {
    return DEFAULT_LAYOUT;
  }

  const defaultMap = new Map(DEFAULT_LAYOUT.widgets.map((w) => [w.id, w]));
  const seenIds = new Set<string>();
  const validSaved = raw.widgets
    .filter((w) => {
      if (!w || !defaultMap.has(w.id) || seenIds.has(w.id)) return false;
      seenIds.add(w.id);
      return true;
    })
    .map((w) => {
      const def = defaultMap.get(w.id)!;
      return {
        ...def,
        enabled: typeof w.enabled === 'boolean' ? w.enabled : def.enabled,
        order: typeof w.order === 'number' && Number.isFinite(w.order) ? w.order : def.order,
        colSpan: (w.colSpan === 1 || w.colSpan === 2 ? w.colSpan : def.colSpan) as 1 | 2,
      };
    });

  const missingWidgets = DEFAULT_LAYOUT.widgets.filter((w) => !seenIds.has(w.id));
  const merged = [...validSaved, ...missingWidgets]
    .sort((a, b) => a.order - b.order)
    .map((w, idx) => ({ ...w, order: idx }));

  return { widgets: merged };
}

export function loadSavedLayout(): DashboardLayout {
  try {
    const raw = safeLocalStorage.getItem(STORAGE_KEYS.LAYOUT);
    if (!raw || typeof raw !== 'string') return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as DashboardLayout;
    return normalizeLayout(parsed);
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function saveLayout(layout: DashboardLayout): void {
  try {
    safeLocalStorage.setItem(STORAGE_KEYS.LAYOUT, JSON.stringify(layout));
  } catch (e) {
    console.error('Failed to save layout to localStorage', e);
  }
}

export function exportLayoutToJson(layout: DashboardLayout): string {
  return JSON.stringify(layout, null, 2);
}

export function importLayoutFromJson(jsonStr: string): DashboardLayout | null {
  try {
    const parsed = JSON.parse(jsonStr) as DashboardLayout;
    if (parsed && Array.isArray(parsed.widgets)) {
      return parsed;
    }
  } catch {
    // invalid JSON
  }
  return null;
}
