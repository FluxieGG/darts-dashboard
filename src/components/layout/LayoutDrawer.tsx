import React, { useRef } from 'react';
import { useLayoutStore } from '../../store/useLayoutStore';
import { WIDGET_REGISTRY } from '../widgets/widgetRegistry';
import {
  X,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Download,
  Upload,
  Columns2,
  Columns4,
} from 'lucide-react';
import { exportLayoutToJson, importLayoutFromJson } from '../../lib/storage';

export const LayoutDrawer: React.FC = () => {
  const {
    layout,
    isDrawerOpen,
    closeDrawer,
    toggleWidget,
    moveWidget,
    setColSpan,
    resetLayout,
    setLayout,
  } = useLayoutStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isDrawerOpen) return null;

  const sortedWidgets = [...layout.widgets].sort((a, b) => a.order - b.order);

  const handleExport = () => {
    const json = exportLayoutToJson(layout);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `autodarts-layout-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const imported = importLayoutFromJson(content);
      if (imported) {
        setLayout(imported);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={closeDrawer}
      />

      {/* Drawer Body */}
      <aside className="relative w-full max-w-md bg-[#131A26] border-l border-white/10 shadow-2xl h-full flex flex-col z-10">
        {/* Drawer Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Customize Layout
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Reorder, toggle, or resize widgets for your portrait monitor
            </p>
          </div>
          <button
            onClick={closeDrawer}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Widgets List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {sortedWidgets.map((widget, index) => {
            const meta = WIDGET_REGISTRY[widget.id];
            const Icon = meta?.icon;

            return (
              <div
                key={widget.id}
                className={`p-3 rounded-xl border transition-all ${
                  widget.enabled
                    ? 'bg-slate-900/80 border-white/10'
                    : 'bg-slate-900/30 border-white/5 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    {Icon && <Icon className="w-4 h-4 text-emerald-400 shrink-0" />}
                    <div>
                      <h4 className="text-xs font-semibold text-white">
                        {meta?.title || widget.title}
                      </h4>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {widget.colSpan === 2 ? 'Full Width (2 Cols)' : 'Half Width (1 Col)'}
                      </span>
                    </div>
                  </div>

                  {/* Actions: Visibility, Width, Move */}
                  <div className="flex items-center gap-1">
                    {/* Toggle Half/Full colSpan */}
                    <button
                      onClick={() => setColSpan(widget.id, widget.colSpan === 2 ? 1 : 2)}
                      title={`Toggle Width: Currently ${widget.colSpan === 2 ? 'Full' : 'Half'}`}
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                    >
                      {widget.colSpan === 2 ? (
                        <Columns2 className="w-3.5 h-3.5 text-amber-400" />
                      ) : (
                        <Columns4 className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </button>

                    {/* Move Up */}
                    <button
                      disabled={index === 0}
                      onClick={() => moveWidget(widget.id, 'up')}
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-20 rounded-lg transition-colors"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>

                    {/* Move Down */}
                    <button
                      disabled={index === sortedWidgets.length - 1}
                      onClick={() => moveWidget(widget.id, 'down')}
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-20 rounded-lg transition-colors"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>

                    {/* Toggle Visibility */}
                    <button
                      onClick={() => toggleWidget(widget.id)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        widget.enabled
                          ? 'text-emerald-400 hover:bg-emerald-500/10'
                          : 'text-slate-500 hover:bg-white/5'
                      }`}
                    >
                      {widget.enabled ? (
                        <Eye className="w-4 h-4" />
                      ) : (
                        <EyeOff className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-white/10 bg-slate-900/60 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={resetLayout}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-300 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>

            <button
              onClick={handleExport}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-300 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-300 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import JSON</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportFile}
              className="hidden"
            />
          </div>
        </div>
      </aside>
    </div>
  );
};
