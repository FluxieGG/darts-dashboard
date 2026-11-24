import React from 'react';
import { useLayoutStore } from '../../store/useLayoutStore';
import { WIDGET_REGISTRY } from '../widgets/widgetRegistry';
import { AppErrorBoundary } from '../common/AppErrorBoundary';
import { cn } from '../../lib/utils';

export const BentoGrid: React.FC = () => {
  const layout = useLayoutStore((s) => s.layout);

  // Filter only enabled widgets and sort strictly by order
  const activeWidgets = layout.widgets
    .filter((w) => w.enabled)
    .sort((a, b) => a.order - b.order);

  return (
    <main className="w-full max-w-[1600px] mx-auto px-4 py-4 sm:px-5 sm:py-5">
      {/*
        Portrait-First Bento Grid:
        - Vertical 1080x1920 monitors (width <= 1279px): ALWAYS uses full-bleed 2-column grid
          so full-width widgets span 100% of the monitor width and are easily legible from 8ft away.
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
                'transition-all duration-300',
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
};
