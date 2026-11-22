import { create } from 'zustand';
import { DashboardLayout, WidgetConfig, WidgetId } from '../types/config';
import { DEFAULT_LAYOUT, loadSavedLayout, saveLayout } from '../lib/storage';

interface LayoutState {
  layout: DashboardLayout;
  isDrawerOpen: boolean;

  // Actions
  toggleWidget: (id: WidgetId) => void;
  moveWidget: (id: WidgetId, direction: 'up' | 'down') => void;
  setColSpan: (id: WidgetId, colSpan: 1 | 2) => void;
  resetLayout: () => void;
  setLayout: (newLayout: DashboardLayout) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  layout: loadSavedLayout(),
  isDrawerOpen: false,

  toggleWidget: (id: WidgetId) => {
    const current = get().layout;
    const updatedWidgets = current.widgets.map((w) =>
      w.id === id ? { ...w, enabled: !w.enabled } : w
    );
    const newLayout: DashboardLayout = { widgets: updatedWidgets };
    saveLayout(newLayout);
    set({ layout: newLayout });
  },

  moveWidget: (id: WidgetId, direction: 'up' | 'down') => {
    const current = get().layout;
    const sorted = [...current.widgets].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((w) => w.id === id);

    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === sorted.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const temp = sorted[index];
    sorted[index] = sorted[targetIndex];
    sorted[targetIndex] = temp;

    // Re-index orders cleanly
    const reordered: WidgetConfig[] = sorted.map((w, idx) => ({
      ...w,
      order: idx,
    }));

    const newLayout: DashboardLayout = { widgets: reordered };
    saveLayout(newLayout);
    set({ layout: newLayout });
  },

  setColSpan: (id: WidgetId, colSpan: 1 | 2) => {
    const current = get().layout;
    const updated = current.widgets.map((w) =>
      w.id === id ? { ...w, colSpan } : w
    );
    const newLayout: DashboardLayout = { widgets: updated };
    saveLayout(newLayout);
    set({ layout: newLayout });
  },

  resetLayout: () => {
    saveLayout(DEFAULT_LAYOUT);
    set({ layout: DEFAULT_LAYOUT });
  },

  setLayout: (newLayout: DashboardLayout) => {
    saveLayout(newLayout);
    set({ layout: newLayout });
  },

  openDrawer: () => set({ isDrawerOpen: true }),
  closeDrawer: () => set({ isDrawerOpen: false }),
  toggleDrawer: () => set((state) => ({ isDrawerOpen: !state.isDrawerOpen })),
}));
