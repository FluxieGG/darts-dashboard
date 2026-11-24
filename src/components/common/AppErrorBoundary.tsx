import React from 'react';
import { AlertTriangle, RotateCcw, RefreshCw } from 'lucide-react';

export type ErrorBoundaryMode = 'root' | 'widget' | 'game' | 'silent';

interface AppErrorBoundaryProps {
  children: React.ReactNode;
  mode?: ErrorBoundaryMode;
  label?: string;
  resetKey?: string | number;
  resetActionLabel?: string;
  onReset?: () => void;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

/**
 * Resilient React Error Boundary ensuring no single widget, game cartridge,
 * or overlay throw can white-screen the unattended kiosk display or iPad deck.
 */
export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
        ? error
        : 'Unexpected render error';
    return { hasError: true, errorMessage: message };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    try {
      const scope = this.props.label || this.props.mode || 'App';
      console.error(`[ErrorBoundary:${scope}]`, error?.message || String(error));
    } catch {
      // Never allow error logging to throw inside componentDidCatch
    }
    try {
      this.props.onError?.(error, errorInfo);
    } catch {
      // Ignore secondary error handler throws
    }
  }

  componentDidUpdate(prevProps: AppErrorBoundaryProps): void {
    if (
      this.state.hasError &&
      this.props.resetKey !== undefined &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  private handleResetAction = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
    try {
      this.props.onReset?.();
    } catch {
      // Ignore reset errors
    }
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const mode = this.props.mode || 'widget';
    const label = this.props.label || 'Component';

    if (mode === 'silent') {
      return null;
    }

    if (mode === 'widget') {
      return (
        <div className="card-matte rounded-2xl p-5 border border-rose-500/35 bg-rose-950/20 flex flex-col items-center justify-center text-center gap-3 min-h-[160px]">
          <AlertTriangle className="w-7 h-7 text-rose-400 shrink-0" />
          <div>
            <div className="text-sm font-black text-white">{label} Unavailable</div>
            <div className="text-xs font-mono text-rose-300/80 mt-1 max-w-xs truncate">
              {this.state.errorMessage}
            </div>
          </div>
          <button
            type="button"
            onClick={this.handleRetry}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold text-white transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Retry Widget
          </button>
        </div>
      );
    }

    if (mode === 'game') {
      return (
        <div className="card-matte rounded-2xl p-8 border border-rose-500/40 bg-rose-950/25 max-w-xl mx-auto text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-400/40 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8 text-rose-400" />
          </div>
          <div>
            <h3 className="text-xl sm:text-2xl font-black text-white">
              {label} Encountered an Error
            </h3>
            <p className="text-xs sm:text-sm font-mono text-rose-200/80 mt-2 break-words">
              {this.state.errorMessage}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-bold text-white transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Retry Match
            </button>
            {this.props.onReset && (
              <button
                type="button"
                onClick={this.handleResetAction}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/45 text-sm font-bold text-emerald-200 transition-colors"
              >
                {this.props.resetActionLabel || 'Return to Lobby'}
              </button>
            )}
          </div>
        </div>
      );
    }

    // mode === 'root'
    return (
      <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex items-center justify-center p-6 font-sans">
        <div className="card-matte rounded-3xl p-8 max-w-lg w-full border border-rose-500/40 text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-400/50 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-9 h-9 text-rose-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              {label} Recovered From a Crash
            </h1>
            <p className="text-xs sm:text-sm font-mono text-rose-200/85 mt-2 break-words">
              {this.state.errorMessage}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-bold text-white transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Try Recovering
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/45 text-sm font-bold text-emerald-200 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Reload App
            </button>
          </div>
        </div>
      </div>
    );
  }
}
