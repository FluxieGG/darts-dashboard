export type WidgetId =
  | 'live-match'
  | 'hero-kpis'
  | 'live-visit'
  | 'dartboard-heatmap'
  | 'scoring-power'
  | 'trend-sparkline'
  | 'doubles-trebles'
  | 'recent-matches'
  | 'objectives-tracker'
  | 'career-streak'
  | 'game-leaderboards';

export interface WidgetConfig {
  id: WidgetId;
  title: string;
  description: string;
  enabled: boolean;
  order: number;
  colSpan: 1 | 2; // In 2-col bento (portrait), 1 = half width, 2 = full width
}

export interface DashboardLayout {
  widgets: WidgetConfig[];
}

export type DataConnectionMode = 'demo' | 'local' | 'cloud';

export interface ConnectionStatus {
  mode: DataConnectionMode;
  localConnected: boolean;
  cloudConnected: boolean;
  cloudUser?: string;
  lastMessageTime?: number;
  errorMessage?: string;
}
