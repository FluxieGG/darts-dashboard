import React from 'react';
import { WidgetId } from '../../types/config';
import { HeroKpisWidget } from './HeroKpisWidget';
import { LiveVisitWidget } from './LiveVisitWidget';
import { DartboardHeatmapWidget } from './DartboardHeatmapWidget';
import { ScoringPowerWidget } from './ScoringPowerWidget';
import { DoublesTreblesWidget } from './DoublesTreblesWidget';
import { TrendSparklineWidget } from './TrendSparklineWidget';
import { RecentMatchesWidget } from './RecentMatchesWidget';
import {
  Activity,
  Flame,
  LayoutGrid,
  TrendingUp,
  Crosshair,
  History,
  Target,
} from 'lucide-react';

export interface WidgetRegistryItem {
  id: WidgetId;
  title: string;
  category: 'Live' | 'Scoring' | 'Accuracy' | 'History';
  defaultColSpan: 1 | 2;
  icon: React.ComponentType<{ className?: string }>;
  component: React.ComponentType;
}

export const WIDGET_REGISTRY: Record<WidgetId, WidgetRegistryItem> = {
  'hero-kpis': {
    id: 'hero-kpis',
    title: 'Performance Snapshot',
    category: 'Scoring',
    defaultColSpan: 2,
    icon: Target,
    component: HeroKpisWidget,
  },
  'live-visit': {
    id: 'live-visit',
    title: 'Current Visit Tracker',
    category: 'Live',
    defaultColSpan: 2,
    icon: Activity,
    component: LiveVisitWidget,
  },
  'dartboard-heatmap': {
    id: 'dartboard-heatmap',
    title: 'Dartboard Coordinate Heatmap',
    category: 'Accuracy',
    defaultColSpan: 2,
    icon: Flame,
    component: DartboardHeatmapWidget,
  },
  'scoring-power': {
    id: 'scoring-power',
    title: 'Scoring Power (Ton Breakdown)',
    category: 'Scoring',
    defaultColSpan: 1,
    icon: LayoutGrid,
    component: ScoringPowerWidget,
  },
  'doubles-trebles': {
    id: 'doubles-trebles',
    title: 'Precision Hit Rates',
    category: 'Accuracy',
    defaultColSpan: 1,
    icon: Crosshair,
    component: DoublesTreblesWidget,
  },
  'trend-sparkline': {
    id: 'trend-sparkline',
    title: 'Average Progression Trend',
    category: 'History',
    defaultColSpan: 2,
    icon: TrendingUp,
    component: TrendSparklineWidget,
  },
  'recent-matches': {
    id: 'recent-matches',
    title: 'Recent Sessions & Matches',
    category: 'History',
    defaultColSpan: 2,
    icon: History,
    component: RecentMatchesWidget,
  },
};

export function getWidgetComponent(id: WidgetId): React.ComponentType | null {
  const item = WIDGET_REGISTRY[id];
  return item ? item.component : null;
}
