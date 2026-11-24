import React, { useMemo } from 'react';
import { useLayoutStore } from '../../store/useLayoutStore';
import { WIDGET_REGISTRY } from '../widgets/widgetRegistry';
import { AppErrorBoundary } from '../common/AppErrorBoundary';
import { cn } from '../../lib/utils';

export const BentoGrid: React.FC = React.memo(() => {
  const layout = useLayoutStore((s) => s.layout);

  // Filter only enabled widgets and sort strictly by evaluated order
  const activeWidgets = useMemo(
    () =>
      layout.widgets
        .filter((w) => w.enabled)
        .sort((a, b) => a.order - b.order),
    [layout.widgets]
  );

  return (
    <main className="w-full max-w-[1560px] mx-auto px-4 py-5 sm:px-6 sm:py-6">
      {/*
        Portrait-First Minimalist Bento Grid:
        - Vertical 1080x1920 monitors (width <= 1279px): clean 2-column grid
          with generous breathing room for 8-foot glanceability.
        - Wide Landscape displays (xl >= 1280px): expands cleanly to a 4-column bento grid.
      */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5 auto-rows-min">
        {activeWidgets.map((widgetConfig) => {
          const registryItem = WIDGET_REGISTRY[widgetConfig.id];
          if (!registryItem) return null;

          const Component = registryItem.component;
          const isFullWidth = widgetConfig.colSpan === 2;

          return (
            <div
              key={widgetConfig.id}
              className={cn(
                isFullWidth ? 'col-span-2' : 'col-span-2 sm:col-span-1'
              )}
            >
              <AppErrorBoundary mode="widget" label={registryItem.title}>
                <Component />
              </AppErrorBoundary>
            </div>
          );
        })}
      </div>
    </main>
  );
});

BentoGrid.displayName = 'BentoGrid';
