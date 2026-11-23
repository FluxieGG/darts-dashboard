import React, { useEffect, useRef, useState } from 'react';
import { useCareerStore } from '../../store/useCareerStore';
import { useReplayStore } from '../../store/useReplayStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { fetchRemoteInfo } from '../../services/remoteBridge';
import { hydrateDashboardStateFromDisk } from '../../services/dashboardPersistence';
import {
  CheckCircle2,
  Circle,
  Loader2,
  Wifi,
  HardDrive,
  Tablet,
  Video,
  AlertCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';

type StageState = 'pending' | 'running' | 'done' | 'warn';

interface BootStage {
  id: string;
  label: string;
  detail: string;
  state: StageState;
  icon: React.ComponentType<{ className?: string }>;
}

interface KioskBootScreenProps {
  isLocalConnected: boolean;
  onComplete: () => void;
}

export const KioskBootScreen: React.FC<KioskBootScreenProps> = ({
  isLocalConnected,
  onComplete,
}) => {
  const isLocalConnectedRef = useRef(isLocalConnected);
  isLocalConnectedRef.current = isLocalConnected;

  const [fadeOut, setFadeOut] = useState(false);
  const [ipadUrl, setIpadUrl] = useState<string | null>(null);
  const [stages, setStages] = useState<BootStage[]>([
    {
      id: 'vault',
      label: '1. Saved Dashboard Layout & Career Vault',
      detail: 'Loading saved layout, hidden modules, profiles & clips...',
      state: 'pending',
      icon: HardDrive,
    },
    {
      id: 'board',
      label: '2. Autodarts Board Socket (Port 3180)',
      detail: 'Connecting live WebSocket throw stream...',
      state: 'pending',
      icon: Wifi,
    },
    {
      id: 'remote',
      label: '3. iPad Oche Remote Relay',
      detail: 'Arming LAN control deck...',
      state: 'pending',
      icon: Tablet,
    },
    {
      id: 'camera',
      label: '4. Side-by-Side Split-Cam Buffer',
      detail: 'Initializing 10s Oche + Board camera loop...',
      state: 'pending',
      icon: Video,
    },
  ]);

  const setStage = (id: string, state: StageState, detail: string) => {
    setStages((prev) =>
      prev.map((s) => (s.id === id ? { ...s, state, detail } : s))
    );
  };

  useEffect(() => {
    let cancelled = false;

    const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

    const runOrderedBoot = async () => {
      // STAGE 1: Saved Dashboard Layout/Preferences, Career Vault & Saved Clips Archive
      setStage('vault', 'running', 'Restoring saved layout, preferences & career vault...');
      const [dashboardSynced] = await Promise.all([
        hydrateDashboardStateFromDisk(),
        useCareerStore.getState().hydrateVault(),
        useReplayStore.getState().loadSavedClips(),
      ]);
      if (cancelled) return;
      const synced = useCareerStore.getState().isDiskSynced || dashboardSynced;
      setStage(
        'vault',
        'done',
        synced ? 'Layout, preferences & Career Vault synced to disk' : 'Loaded local profile cache'
      );
      await sleep(160);

      // STAGE 2: Autodarts Local Board (Port 3180)
      const dataMode = useSettingsStore.getState().dataMode;
      if (dataMode === 'local') {
        setStage('board', 'running', 'Checking Autodarts Desktop on port 3180...');
        for (let i = 0; i < 6; i++) {
          if (isLocalConnectedRef.current || cancelled) break;
          await sleep(120);
        }
        if (cancelled) return;
        setStage(
          'board',
          isLocalConnectedRef.current ? 'done' : 'warn',
          isLocalConnectedRef.current
            ? 'Autodarts Desktop Live (Port 3180)'
            : 'Board offline — auto-reconnect armed'
        );
      } else {
        setStage('board', 'done', `Active mode: ${dataMode.toUpperCase()}`);
      }
      await sleep(140);

      // STAGE 3: iPad Oche Remote Relay
      setStage('remote', 'running', 'Detecting LAN address for iPad Oche Deck...');
      const info = await fetchRemoteInfo();
      if (cancelled) return;
      const bestUrl = info?.interfaces[0]?.url || info?.fallbackUrl || null;
      setIpadUrl(bestUrl);
      setStage(
        'remote',
        bestUrl ? 'done' : 'warn',
        bestUrl ? `Ready at ${bestUrl}` : 'LAN relay ready'
      );
      await sleep(140);

      // STAGE 4: Side-by-Side Split-Cam Buffer (Enabled Immediately by Default)
      const replay = useReplayStore.getState();
      if (replay.autoStartCamera) {
        setStage('camera', 'running', 'Detecting all cameras & arming Split-Cam...');
        await replay.refreshCameras();
        await replay.startCamera();
        if (cancelled) return;
        const after = useReplayStore.getState();
        if (after.status === 'buffering' || after.status === 'capturing') {
          const camName = after.activeCameraLabel || 'Oche Webcam';
          setStage(
            'camera',
            'done',
            `Split-Cam armed (${camName} + 3 Board Cams)`
          );
        } else {
          setStage(
            'camera',
            'warn',
            after.errorMessage || 'Camera error detected — iPad Oche Deck notified'
          );
        }
      } else {
        setStage('camera', 'done', 'Auto-start disabled in Settings');
      }

      if (cancelled) return;
      await sleep(420);
      setFadeOut(true);
      await sleep(320);
      if (!cancelled) {
        onComplete();
      }
    };

    void runOrderedBoot();

    return () => {
      cancelled = true;
    };
  }, [onComplete]);

  return (
    <div
      className={cn(
        'fixed inset-0 z-[100] bg-[#0B0F17] flex items-center justify-center p-6 transition-opacity duration-300',
        fadeOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      )}
    >
      {/* Subtle Ambient Glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/4 w-96 h-96 rounded-full bg-emerald-500/12 blur-3xl" />
        <div className="absolute -bottom-24 right-1/4 w-96 h-96 rounded-full bg-sky-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-lg card-matte rounded-3xl p-6 sm:p-8 space-y-6 border-emerald-500/30 shadow-[0_0_60px_-15px_rgba(16,185,129,0.35)]">
        {/* Kiosk Brand Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-emerald-300 flex items-center justify-center shadow-[0_0_24px_rgba(16,185,129,0.5)]">
              <span className="font-mono font-black text-slate-950 text-xl">AD</span>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                AUTODARTS KIOSK
              </h1>
              <p className="text-xs font-mono uppercase tracking-widest text-emerald-400">
                Initializing Darts Room System
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onComplete}
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-300 transition-colors cursor-pointer"
          >
            Skip
          </button>
        </div>

        {/* Ordered Boot Checklist */}
        <div className="space-y-2.5">
          {stages.map((stage) => {
            const Icon = stage.icon;
            return (
              <div
                key={stage.id}
                className={cn(
                  'p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-all',
                  stage.state === 'done'
                    ? 'bg-emerald-500/10 border-emerald-400/35'
                    : stage.state === 'running'
                    ? 'bg-sky-500/10 border-sky-400/45'
                    : stage.state === 'warn'
                    ? 'bg-amber-500/10 border-amber-400/35'
                    : 'bg-slate-900/60 border-white/[0.06] opacity-60'
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-slate-950/70 border border-white/10 flex items-center justify-center text-slate-300 shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold text-white truncate">
                      {stage.label}
                    </div>
                    <div className="text-xs font-mono text-slate-400 truncate">
                      {stage.detail}
                    </div>
                  </div>
                </div>

                <div className="shrink-0">
                  {stage.state === 'done' && (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  )}
                  {stage.state === 'running' && (
                    <Loader2 className="w-5 h-5 text-sky-400 animate-spin" />
                  )}
                  {stage.state === 'warn' && (
                    <AlertCircle className="w-5 h-5 text-amber-400" />
                  )}
                  {stage.state === 'pending' && (
                    <Circle className="w-5 h-5 text-slate-700" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* iPad Remote Ready Hint */}
        {ipadUrl && (
          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>iPad Oche Deck:</span>
            <span className="text-emerald-300 font-bold truncate ml-2">{ipadUrl}</span>
          </div>
        )}
      </div>
    </div>
  );
};
