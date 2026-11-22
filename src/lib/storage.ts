import { DashboardLayout } from '../types/config';

const STORAGE_KEYS = {
  LAYOUT: 'autodarts_dashboard_layout_v4',
} as const;

export const DEFAULT_LAYOUT: DashboardLayout = {
  widgets: [
    {
      id: 'live-visit',
      title: 'Current Visit Tracker',
      description: 'Live 3-dart badge breakdown, multipliers, and visit total',
      enabled: true,
      order: 0,
      colSpan: 2,
    },
    {
      id: 'trend-sparkline',
      title: 'Average Progression Trend',
      description: 'Rolling 3-dart average curve across your session',
      enabled: true,
      order: 1,
      colSpan: 2,
    },
    {
      id: 'recent-matches',
      title: 'Recent Visits Log',
      description: 'Completed visits with dart breakdown and totals',
      enabled: true,
      order: 2,
      colSpan: 2,
    },
    {
      id: 'dartboard-heatmap',
      title: 'Dartboard Coordinate Heatmap',
      description: 'Vector dartboard with real-time dot plotting and density clustering',
      enabled: true,
      order: 3,
      colSpan: 2,
    },
    {
      id: 'hero-kpis',
      title: 'Performance Snapshot',
      description: '3-Dart Average, First 9, Checkout %, and Highest Visit',
      enabled: true,
      order: 4,
      colSpan: 2,
    },
    {
      id: 'scoring-power',
      title: 'Scoring Power (Ton Breakdown)',
      description: 'Distribution of 60+, 100+, 140+, and maximum 180 visits',
      enabled: true,
      order: 5,
      colSpan: 1,
    },
    {
      id: 'doubles-trebles',
      title: 'Precision Hit Rates',
      description: 'Key double & treble target accuracy (T20, T19, D20, Bull)',
      enabled: true,
      order: 6,
      colSpan: 1,
    },
    {
      id: 'objectives-tracker',
      title: 'Daily & Weekly Objectives',
      description: 'Live fun & skill challenges tied to your Career Vault',
      enabled: true,
      order: 7,
      colSpan: 2,
    },
    {
      id: 'career-streak',
      title: 'Streak Calendar & Career Vault',
      description: 'Practice calendar, daily streak tracker, and Best Days Ever archive',
      enabled: true,
      order: 8,
      colSpan: 2,
    },
  ],
};

export function loadSavedLayout(): DashboardLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LAYOUT);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as DashboardLayout;
    if (!parsed || !Array.isArray(parsed.widgets)) return DEFAULT_LAYOUT;

    const existingIds = new Set(parsed.widgets.map((w) => w.id));
    const missingWidgets = DEFAULT_LAYOUT.widgets.filter((w) => !existingIds.has(w.id));
    const merged = [...parsed.widgets, ...missingWidgets];

    return { widgets: merged.sort((a, b) => a.order - b.order) };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function saveLayout(layout: DashboardLayout): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LAYOUT, JSON.stringify(layout));
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
