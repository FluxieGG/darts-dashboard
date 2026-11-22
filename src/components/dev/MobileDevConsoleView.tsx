import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEV_CONSOLE_PIN,
  DevHealthSnapshot,
  DevLogChannel,
  DevLogEntry,
} from '../../types/devConsole';
import { sendDevCommand } from '../../services/devLogger';
import { Badge } from '../common/Badge';
import {
  Terminal,
  Lock,
  Delete,
  Wifi,
  Video,
  HardDrive,
  Tablet,
  Activity,
  AlertTriangle,
  Pause,
  Play,
  Trash2,
  RefreshCw,
  Radio,
  FlaskConical,
  Search,
} from 'lucide-react';
import { cn } from '../../lib/utils';

type ChannelFilter = 'ALL' | DevLogChannel | 'ERRORS';

const SESSION_UNLOCK_KEY = 'autodarts_dev_console_unlocked';

const CHANNEL_BADGE: Record<DevLogChannel, string> = {
  BOARD: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
  CAMERA: 'bg-rose-500/20 text-rose-300 border-rose-400/40',
  REMOTE: 'bg-sky-500/20 text-sky-300 border-sky-400/40',
  GAME: 'bg-purple-500/20 text-purple-300 border-purple-400/40',
  VAULT: 'bg-amber-500/20 text-amber-300 border-amber-400/40',
  SYS: 'bg-slate-700/70 text-slate-200 border-slate-500/40',
};

function formatTimeMs(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export const MobileDevConsoleView: React.FC = () => {
  const [unlocked, setUnlocked] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(SESSION_UNLOCK_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);

  const [connected, setConnected] = useState(false);
  const [health, setHealth] = useState<DevHealthSnapshot | null>(null);
  const [logs, setLogs] = useState<DevLogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<ChannelFilter>('ALL');
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);

  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const esRef = useRef<EventSource | null>(null);

  const handleDigit = (digit: string) => {
    setPinError(false);
    setPin((prev) => {
      if (prev.length >= 4) return prev;
      const next = prev + digit;
      if (next.length === 4) {
        if (next === DEV_CONSOLE_PIN) {
          try {
            sessionStorage.setItem(SESSION_UNLOCK_KEY, '1');
          } catch {
            // ignore
          }
          setUnlocked(true);
        } else {
          setPinError(true);
          window.setTimeout(() => {
            setPin('');
            setPinError(false);
          }, 550);
        }
      }
      return next;
    });
  };

  const handleLock = () => {
    try {
      sessionStorage.removeItem(SESSION_UNLOCK_KEY);
    } catch {
      // ignore
    }
    setUnlocked(false);
    setPin('');
  };

  const pullSnapshot = useCallback(async () => {
    try {
      const res = await fetch('/api/dev/snapshot', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.ok) {
        setConnected(true);
        if (data.health) setHealth(data.health as DevHealthSnapshot);
        if (Array.isArray(data.logs)) {
          setLogs((data.logs as DevLogEntry[]).slice(-250).reverse());
        }
      }
    } catch {
      setConnected(false);
    }
  }, []);

  const connectStream = useCallback(() => {
    esRef.current?.close();
    const es = new EventSource('/api/dev/stream?role=dev');
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.addEventListener('health', (ev) => {
      try {
        setHealth(JSON.parse((ev as MessageEvent).data) as DevHealthSnapshot);
        setConnected(true);
      } catch {
        // ignore
      }
    });

    es.addEventListener('backlog', (ev) => {
      try {
        const list = JSON.parse((ev as MessageEvent).data) as DevLogEntry[];
        if (Array.isArray(list)) {
          setLogs(list.slice(-250).reverse());
        }
      } catch {
        // ignore
      }
    });

    es.addEventListener('logs', (ev) => {
      if (pausedRef.current) return;
      try {
        const incoming = JSON.parse((ev as MessageEvent).data) as DevLogEntry[];
        if (Array.isArray(incoming) && incoming.length > 0) {
          setLogs((prev) => [...incoming.slice().reverse(), ...prev].slice(0, 300));
        }
      } catch {
        // ignore
      }
    });

    es.addEventListener('cleared', () => {
      setLogs([]);
    });
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    void pullSnapshot();
    connectStream();

    const onWake = () => {
      if (document.visibilityState === 'visible') {
        void pullSnapshot();
        if (!esRef.current || esRef.current.readyState === EventSource.CLOSED) {
          connectStream();
        }
      }
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);

    return () => {
      esRef.current?.close();
      esRef.current = null;
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [unlocked, pullSnapshot, connectStream]);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((entry) => {
      if (filter === 'ERRORS' && entry.level !== 'error' && entry.level !== 'warn') {
        return false;
      }
      if (filter !== 'ALL' && filter !== 'ERRORS' && entry.channel !== filter) {
        return false;
      }
      if (q) {
        const hay = `${entry.channel} ${entry.message} ${entry.detail || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, filter, search]);

  // =========================================================================
  // PIN LOCK SCREEN (0161)
  // =========================================================================
  if (!unlocked) {
    return (
      <div className="min-h-screen bg-[#070A10] text-slate-100 flex items-center justify-center p-6 font-sans select-none">
        <div className="w-full max-w-xs card-matte rounded-3xl p-6 space-y-6 border-sky-500/30 text-center">
          <div className="space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-sky-500/15 border border-sky-400/35 flex items-center justify-center mx-auto text-sky-400">
              <Lock className="w-7 h-7" />
            </div>
            <h1 className="text-lg font-black font-mono tracking-tight text-white">
              DEV CONSOLE
            </h1>
            <p className="text-xs text-slate-400">Enter 4-digit PIN to inspect live listeners</p>
          </div>

          <div className="flex items-center justify-center gap-3.5">
            {[0, 1, 2, 3].map((idx) => (
              <div
                key={idx}
                className={cn(
                  'w-4 h-4 rounded-full border-2 transition-all',
                  pinError
                    ? 'bg-rose-500 border-rose-400 scale-110'
                    : idx < pin.length
                    ? 'bg-sky-400 border-sky-300 scale-110 shadow-[0_0_12px_rgba(56,189,248,0.7)]'
                    : 'bg-slate-900 border-white/20'
                )}
              />
            ))}
          </div>

          <div className="h-4 text-xs font-mono font-bold text-rose-400">
            {pinError ? 'Invalid PIN' : ''}
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => handleDigit(d)}
                className="h-14 rounded-2xl bg-slate-900 hover:bg-white/10 border border-white/10 font-mono text-xl font-black text-white active:scale-95 transition-transform"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPin('')}
              className="h-14 rounded-2xl bg-slate-900/60 border border-white/10 font-mono text-xs font-bold text-slate-400"
            >
              CLR
            </button>
            <button
              type="button"
              onClick={() => handleDigit('0')}
              className="h-14 rounded-2xl bg-slate-900 hover:bg-white/10 border border-white/10 font-mono text-xl font-black text-white active:scale-95 transition-transform"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => setPin((p) => p.slice(0, -1))}
              className="h-14 rounded-2xl bg-slate-900/60 border border-white/10 flex items-center justify-center text-slate-300"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // LIVE MOBILE DEV DEBUG CONSOLE
  // =========================================================================
  return (
    <div className="min-h-screen bg-[#070A10] text-slate-100 flex flex-col font-sans antialiased">
      {/* Top Dev Header */}
      <header className="sticky top-0 z-30 bg-[#0B0F17]/95 backdrop-blur-md border-b border-sky-500/20 px-3.5 py-2.5">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-300">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-xs sm:text-sm font-mono font-black text-white leading-none">
                DEV CONSOLE
              </h1>
              <span className="text-[10px] font-mono text-slate-400">
                {health ? `Up ${formatUptime(health.kioskUptimeSec)} • ${health.dataMode}` : 'Syncing...'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Badge variant={connected ? 'emerald' : 'rose'} size="sm" dot>
              {connected ? 'LIVE' : 'OFFLINE'}
            </Badge>

            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              title={paused ? 'Resume live log stream' : 'Pause log stream'}
              className={cn(
                'p-1.5 rounded-lg border text-xs',
                paused
                  ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                  : 'bg-slate-900 border-white/10 text-slate-300'
              )}
            >
              {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={async () => {
                setSyncing(true);
                await sendDevCommand({ type: 'force_health' });
                await pullSnapshot();
                setSyncing(false);
              }}
              title="Force resync"
              className="p-1.5 rounded-lg bg-slate-900 border border-white/10 text-slate-300"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', syncing && 'animate-spin')} />
            </button>

            <button
              type="button"
              onClick={() => void sendDevCommand({ type: 'clear_logs' })}
              title="Clear console buffer"
              className="p-1.5 rounded-lg bg-slate-900 border border-white/10 text-slate-300 hover:text-rose-300"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleLock}
              title="Lock Dev Console"
              className="p-1.5 rounded-lg bg-slate-900 border border-white/10 text-slate-400 hover:text-white"
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-3.5 py-3 space-y-3 flex flex-col">
        {/* AT-A-GLANCE LIVE LISTENERS & SUBSYSTEMS GRID */}
        <section className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {/* 1. Autodarts Port 3180 */}
          <div className="p-2.5 rounded-xl bg-[#111827] border border-white/10 space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase text-slate-400">
              <span className="flex items-center gap-1">
                <Wifi className="w-3 h-3 text-emerald-400" />
                Board 3180
              </span>
              <span
                className={cn(
                  'font-black',
                  health?.boardConnected ? 'text-emerald-400' : 'text-rose-400'
                )}
              >
                {health?.boardConnected ? 'LIVE' : 'OFF'}
              </span>
            </div>
            <div className="text-xs font-mono font-bold text-white truncate">
              {health?.boardStatus || '—'} • {health?.currentVisitSummary || 'Empty'}
            </div>
          </div>

          {/* 2. Split-Cam / Replays */}
          <div className="p-2.5 rounded-xl bg-[#111827] border border-white/10 space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase text-slate-400">
              <span className="flex items-center gap-1">
                <Video className="w-3 h-3 text-rose-400" />
                Split-Cam
              </span>
              <span
                className={cn(
                  'font-black uppercase',
                  health?.cameraStatus === 'buffering'
                    ? 'text-emerald-400'
                    : health?.cameraStatus === 'capturing'
                    ? 'text-rose-400 animate-pulse'
                    : 'text-slate-400'
                )}
              >
                {health?.cameraStatus || 'idle'}
              </span>
            </div>
            <div className="text-xs font-mono font-bold text-white truncate">
              {health?.boardCameraMode || '—'} • {health?.savedClipsCount ?? 0} clips
              {health?.devReplayArmed ? ' • ARMED' : ''}
            </div>
          </div>

          {/* 3. iPad Oche Remote */}
          <div className="p-2.5 rounded-xl bg-[#111827] border border-white/10 space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase text-slate-400">
              <span className="flex items-center gap-1">
                <Tablet className="w-3 h-3 text-sky-400" />
                Oche Deck
              </span>
              <span
                className={cn(
                  'font-black',
                  (health?.connectedRemotes || 0) > 0 ? 'text-sky-300' : 'text-slate-500'
                )}
              >
                {health?.connectedRemotes ?? 0} PAIRED
              </span>
            </div>
            <div className="text-xs font-mono font-bold text-white truncate">
              {(health?.connectedRemotes || 0) > 0 ? 'Manual Save Mode' : 'Auto-Save Mode'}
            </div>
          </div>

          {/* 4. App View & Active Game */}
          <div className="p-2.5 rounded-xl bg-[#111827] border border-white/10 space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase text-slate-400">
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3 text-purple-400" />
                Kiosk View
              </span>
              {health?.isPartyMode && <span className="text-amber-300 font-black">PARTY</span>}
            </div>
            <div className="text-xs font-mono font-bold text-white truncate">
              {health?.activeGameTitle
                ? `${health.activeGameTitle} (${health.activeGamePhase})`
                : health?.activeView || '—'}
            </div>
          </div>

          {/* 5. Career Vault */}
          <div className="p-2.5 rounded-xl bg-[#111827] border border-white/10 space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase text-slate-400">
              <span className="flex items-center gap-1">
                <HardDrive className="w-3 h-3 text-amber-400" />
                Vault
              </span>
              <span
                className={cn(
                  'font-black',
                  health?.careerDiskSynced ? 'text-emerald-400' : 'text-amber-400'
                )}
              >
                {health?.careerDiskSynced ? 'DISK' : 'CACHE'}
              </span>
            </div>
            <div className="text-xs font-mono font-bold text-white truncate">
              {health?.activePlayerName || '—'}
            </div>
          </div>

          {/* 6. Error Counter */}
          <div
            className={cn(
              'p-2.5 rounded-xl border space-y-1',
              (health?.errorCount || 0) > 0
                ? 'bg-rose-950/50 border-rose-500/45'
                : 'bg-[#111827] border-white/10'
            )}
          >
            <div className="flex items-center justify-between text-[10px] font-mono uppercase text-slate-400">
              <span className="flex items-center gap-1">
                <AlertTriangle
                  className={cn(
                    'w-3 h-3',
                    (health?.errorCount || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'
                  )}
                />
                JS Errors
              </span>
              <span
                className={cn(
                  'font-black',
                  (health?.errorCount || 0) > 0 ? 'text-rose-300' : 'text-emerald-400'
                )}
              >
                {health?.errorCount ?? 0}
              </span>
            </div>
            <div className="text-xs font-mono font-bold text-white truncate">
              {(health?.errorCount || 0) === 0 ? 'All Systems Clean' : 'Check ERROR Filter'}
            </div>
          </div>
        </section>

        {/* Quick Diagnostic Triggers */}
        <section className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => void sendDevCommand({ type: 'ping' })}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-[11px] font-mono font-bold text-emerald-300 active:scale-95"
          >
            <Radio className="w-3 h-3" />
            Ping Kiosk
          </button>
          <button
            type="button"
            onClick={() => void sendDevCommand({ type: 'restart_cameras' })}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-[11px] font-mono font-bold text-rose-300 active:scale-95"
          >
            <Video className="w-3 h-3" />
            Restart Cams
          </button>
          <button
            type="button"
            onClick={() => void sendDevCommand({ type: 'arm_dev_replay' })}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-amber-400/35 text-[11px] font-mono font-bold text-amber-300 active:scale-95"
          >
            <FlaskConical className="w-3 h-3" />
            Arm Next-Dart Clip
          </button>
        </section>

        {/* Channel Filter + Search */}
        <section className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {(['ALL', 'BOARD', 'CAMERA', 'REMOTE', 'GAME', 'VAULT', 'ERRORS'] as const).map(
              (ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setFilter(ch)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[10px] font-mono font-black border transition-colors',
                    filter === ch
                      ? 'bg-sky-500/20 border-sky-400/60 text-sky-300'
                      : 'bg-slate-900/70 border-white/10 text-slate-400'
                  )}
                >
                  {ch}
                </button>
              )
            )}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter console messages..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-900/90 border border-white/10 text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
            />
          </div>
        </section>

        {/* Live Scrolling Monospace Console Feed */}
        <section className="flex-1 rounded-2xl bg-[#0B0F17] border border-white/10 overflow-hidden flex flex-col min-h-[340px]">
          <div className="px-3 py-1.5 bg-slate-900/90 border-b border-white/10 flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span>
              LIVE STREAM ({filteredLogs.length} entries){paused ? ' • PAUSED' : ''}
            </span>
            <span>Newest First</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-white/[0.05] font-mono text-[11px]">
            {filteredLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                Listening for live Kiosk events... Tap <strong>Ping Kiosk</strong> or throw a dart.
              </div>
            ) : (
              filteredLogs.map((entry) => (
                <div
                  key={entry.id}
                  className={cn(
                    'px-3 py-2 space-y-0.5',
                    entry.level === 'error'
                      ? 'bg-rose-950/35'
                      : entry.level === 'warn'
                      ? 'bg-amber-950/20'
                      : ''
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] text-slate-500 shrink-0 tabular-nums mt-0.5">
                      {formatTimeMs(entry.timestamp)}
                    </span>
                    <span
                      className={cn(
                        'px-1.5 py-0.2 rounded border text-[9px] font-black shrink-0 mt-0.5',
                        CHANNEL_BADGE[entry.channel]
                      )}
                    >
                      {entry.channel}
                    </span>
                    <span
                      className={cn(
                        'break-words leading-snug',
                        entry.level === 'error'
                          ? 'text-rose-300 font-bold'
                          : entry.level === 'warn'
                          ? 'text-amber-200'
                          : entry.level === 'success'
                          ? 'text-emerald-300'
                          : 'text-slate-100'
                      )}
                    >
                      {entry.message}
                    </span>
                  </div>
                  {entry.detail && (
                    <div className="pl-[86px] text-[10px] text-slate-400 break-all">
                      {entry.detail}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
};
