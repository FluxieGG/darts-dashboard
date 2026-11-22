import { useEffect, useState } from 'react';
import {
  DevConsoleCommand,
  DevHealthSnapshot,
  DevLogChannel,
  DevLogEntry,
  DevLogLevel,
} from '../types/devConsole';
import { gameEventBus } from './gameEventBus';
import { useLiveBoardStore } from '../store/useLiveBoardStore';
import { useGameStore } from '../store/useGameStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { useReplayStore } from '../store/useReplayStore';
import { useCareerStore } from '../store/useCareerStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { getGameDefinition } from '../games/gameRegistry';
import { ocheCamService } from './ocheCamService';

class DevLoggerService {
  private queue: DevLogEntry[] = [];
  private flushTimer: number | null = null;
  private errorCount = 0;
  private startedAt = Date.now();

  public log(
    channel: DevLogChannel,
    level: DevLogLevel,
    message: string,
    detail?: string
  ): void {
    if (level === 'error') {
      this.errorCount += 1;
    }
    const entry: DevLogEntry = {
      id: `dl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      channel,
      level,
      message,
      detail,
    };
    this.queue.push(entry);
    this.scheduleFlush();
  }

  public getErrorCount(): number {
    return this.errorCount;
  }

  public getUptimeSec(): number {
    return Math.floor((Date.now() - this.startedAt) / 1000);
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      if (this.queue.length === 0) return;
      const batch = this.queue.splice(0, 40);
      fetch('/api/dev/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      }).catch(() => {
        // ignore transient network errors
      });
    }, 120);
  }
}

export const devLogger = new DevLoggerService();

export async function sendDevCommand(cmd: DevConsoleCommand): Promise<boolean> {
  try {
    const res = await fetch('/api/dev/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data?.ok);
  } catch {
    return false;
  }
}

function buildHealthSnapshot(
  isLocalConnected: boolean,
  connectedRemotes: number,
  connectedDevs: number
): DevHealthSnapshot {
  const live = useLiveBoardStore.getState();
  const game = useGameStore.getState();
  const player = usePlayerStore.getState();
  const replay = useReplayStore.getState();
  const career = useCareerStore.getState();
  const settings = useSettingsStore.getState();

  const activePlayer = player.getActivePlayer();
  const gameDef = game.activeGameId ? getGameDefinition(game.activeGameId) : undefined;
  const visitText =
    live.currentVisitThrows.length > 0
      ? `${live.currentVisitThrows.map((t) => t.segment.name).join(' • ')} (${live.visitScore})`
      : 'Empty';

  return {
    kioskUptimeSec: devLogger.getUptimeSec(),
    dataMode: settings.dataMode,
    boardConnected: isLocalConnected,
    boardStatus: live.boardStatus,
    boardEvent: live.boardEvent || '—',
    currentVisitSummary: visitText,
    activeView: game.activeView,
    activePlayerName: activePlayer.name,
    isPartyMode: player.isPartyMode,
    activeGameTitle: gameDef?.title ?? null,
    activeGamePhase: gameDef ? game.matchPhase : null,
    connectedRemotes,
    connectedDevs,
    cameraStatus: replay.status,
    boardCameraMode: replay.boardCameraMode,
    devReplayArmed: replay.devCaptureNextDartArmed,
    savedClipsCount: replay.clips.length,
    careerDiskSynced: career.isDiskSynced,
    errorCount: devLogger.getErrorCount(),
    updatedAt: Date.now(),
  };
}

/**
 * Mounted ONCE on KioskApp (`App.tsx`) to stream clear live telemetry,
 * dartboard events, camera status, store transitions, and JS errors to the
 * hidden PIN-protected Mobile Dev Console (`/?dev=1`).
 */
export function useKioskDevBridge(
  isLocalConnected: boolean,
  connectedRemotes: number
): { connectedDevs: number } {
  const [connectedDevs, setConnectedDevs] = useState(0);

  // Log board connection state changes cleanly
  useEffect(() => {
    devLogger.log(
      'BOARD',
      isLocalConnected ? 'success' : 'warn',
      isLocalConnected
        ? 'Autodarts Desktop connected (port 3180)'
        : 'Autodarts Desktop offline / waiting for port 3180'
    );
  }, [isLocalConnected]);

  // Main instrumentation & dev SSE bridge
  useEffect(() => {
    devLogger.log('SYS', 'info', 'Kiosk dev telemetry bridge armed');

    let healthTimer: number | null = null;
    let latestDevCount = 0;

    const pushHealth = () => {
      if (healthTimer !== null) return;
      healthTimer = window.setTimeout(() => {
        healthTimer = null;
        const snapshot = buildHealthSnapshot(
          isLocalConnected,
          connectedRemotes,
          latestDevCount
        );
        fetch('/api/dev/health', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(snapshot),
        }).catch(() => {});
      }, 150);
    };

    pushHealth();

    // 1. Subscribe to live dartboard event bus
    const unsubBus = gameEventBus.subscribe((ev) => {
      switch (ev.type) {
        case 'dart_thrown': {
          const coordsStr = ev.dart.coords
            ? `x=${ev.dart.coords.x.toFixed(3)}, y=${ev.dart.coords.y.toFixed(3)}`
            : 'no coords';
          devLogger.log(
            'BOARD',
            ev.dart.score >= 50 ? 'success' : 'info',
            `Dart #${ev.dartIndex + 1}: ${ev.dart.segment.name} (${ev.dart.score} pts)`,
            `bed=${ev.dart.segment.bed} | mult=${ev.dart.segment.multiplier} | ${coordsStr}${
              ev.dart.bouncer ? ' | BOUNCER' : ''
            }`
          );
          break;
        }
        case 'dart_corrected':
          devLogger.log(
            'BOARD',
            'warn',
            `Dart #${ev.dartIndex + 1} corrected: ${ev.previousDart.segment.name} → ${ev.dart.segment.name}`,
            `score ${ev.previousDart.score} → ${ev.dart.score}`
          );
          break;
        case 'visit_completed':
          devLogger.log(
            'BOARD',
            'info',
            `Visit committed: ${ev.totalScore} pts`,
            ev.throws.map((t) => t.segment.name).join(' • ')
          );
          break;
        case 'board_status':
          devLogger.log(
            'BOARD',
            'info',
            `Board status → ${ev.status}`,
            ev.event ? `event=${ev.event}` : undefined
          );
          break;
      }
      pushHealth();
    });

    // 2. Track major state changes cleanly (without spam)
    let prevView = useGameStore.getState().activeView;
    let prevGamePhase = useGameStore.getState().matchPhase;
    let prevGameId = useGameStore.getState().activeGameId;
    const unsubGame = useGameStore.subscribe((s) => {
      if (s.activeView !== prevView || s.activeGameId !== prevGameId || s.matchPhase !== prevGamePhase) {
        devLogger.log(
          'GAME',
          'info',
          `View: ${s.activeView}${s.activeGameId ? ` (${s.activeGameId} • ${s.matchPhase})` : ''}`
        );
        prevView = s.activeView;
        prevGameId = s.activeGameId;
        prevGamePhase = s.matchPhase;
      }
      pushHealth();
    });

    let prevParty = usePlayerStore.getState().isPartyMode;
    let prevPlayerId = usePlayerStore.getState().activePlayerId;
    const unsubPlayer = usePlayerStore.subscribe((s) => {
      if (s.isPartyMode !== prevParty) {
        devLogger.log(
          'GAME',
          s.isPartyMode ? 'warn' : 'info',
          s.isPartyMode ? 'Party Mode ENABLED (unsaved RAM session)' : 'Party Mode STOPPED'
        );
        prevParty = s.isPartyMode;
      }
      if (s.activePlayerId !== prevPlayerId) {
        const p = s.getActivePlayer();
        devLogger.log('GAME', 'info', `Active player → ${p.name}`, `color=${p.dartColor || 'default'}`);
        prevPlayerId = s.activePlayerId;
      }
      pushHealth();
    });

    let prevCamStatus = useReplayStore.getState().status;
    let prevClipCount = useReplayStore.getState().clips.length;
    let prevLastClipId = useReplayStore.getState().lastRecordedClip?.id ?? null;
    const unsubReplay = useReplayStore.subscribe((s) => {
      if (s.status !== prevCamStatus) {
        devLogger.log(
          'CAMERA',
          s.status === 'error' ? 'error' : s.status === 'buffering' ? 'success' : 'info',
          `Oche-Cam status → ${s.status} (${s.boardCameraMode})`,
          s.errorMessage || s.boardFeedError || undefined
        );
        prevCamStatus = s.status;
      }
      if (s.lastRecordedClip && s.lastRecordedClip.id !== prevLastClipId) {
        devLogger.log(
          'CAMERA',
          'success',
          `Captured ${s.lastRecordedClip.durationSec}s clip: ${s.lastRecordedClip.segmentName}`,
          s.lastRecordedClip.isSavedToDisk
            ? `Auto-saved → ${s.lastRecordedClip.filePath}`
            : 'Held in RAM — awaiting iPad Save tap'
        );
        prevLastClipId = s.lastRecordedClip.id;
      } else if (s.clips.length > prevClipCount) {
        const newest = s.clips[0];
        devLogger.log(
          'CAMERA',
          'success',
          `Saved clip to disk: ${newest.filename}`,
          newest.filePath
        );
      }
      prevClipCount = s.clips.length;
      pushHealth();
    });

    let prevObjToast = useCareerStore.getState().recentlyCompletedObjective;
    const unsubCareer = useCareerStore.subscribe((s) => {
      if (s.recentlyCompletedObjective && s.recentlyCompletedObjective !== prevObjToast) {
        devLogger.log('VAULT', 'success', s.recentlyCompletedObjective);
      }
      prevObjToast = s.recentlyCompletedObjective;
      pushHealth();
    });

    // 3. Intercept uncaught errors & console.error / console.warn
    const origError = console.error;
    const origWarn = console.warn;
    console.error = (...args: unknown[]) => {
      origError.apply(console, args);
      const text = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ').slice(0, 220);
      devLogger.log('SYS', 'error', `console.error: ${text}`);
    };
    console.warn = (...args: unknown[]) => {
      origWarn.apply(console, args);
      const text = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ').slice(0, 220);
      devLogger.log('SYS', 'warn', `console.warn: ${text}`);
    };

    const handleWindowError = (event: ErrorEvent) => {
      devLogger.log('SYS', 'error', `Uncaught Error: ${event.message}`, `${event.filename}:${event.lineno}`);
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      devLogger.log('SYS', 'error', `Unhandled Promise Rejection: ${String(event.reason)}`);
    };
    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleRejection);

    // 4. Listen for Dev Console SSE presence & diagnostic commands
    const es = new EventSource('/api/dev/stream?role=kiosk');
    es.onopen = () => pushHealth();
    es.addEventListener('presence', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as { connectedDevs?: number };
        latestDevCount = data.connectedDevs || 0;
        setConnectedDevs(latestDevCount);
        pushHealth();
      } catch {
        // ignore
      }
    });
    es.addEventListener('dev_command', (ev) => {
      try {
        const cmd = JSON.parse((ev as MessageEvent).data) as DevConsoleCommand;
        switch (cmd.type) {
          case 'ping':
            devLogger.log('SYS', 'success', 'PONG — Kiosk live & responsive');
            pushHealth();
            break;
          case 'force_health':
            pushHealth();
            break;
          case 'restart_cameras':
            devLogger.log('CAMERA', 'info', 'Dev Console requested Split-Cam restart...');
            void useReplayStore.getState().startCamera();
            break;
          case 'arm_dev_replay':
            if (!ocheCamService.isRunning()) {
              void useReplayStore.getState().startCamera().then(() => {
                if (ocheCamService.isRunning()) {
                  useReplayStore.getState().armDevNextDartCapture();
                }
              });
            } else {
              useReplayStore.getState().armDevNextDartCapture();
            }
            devLogger.log('CAMERA', 'warn', 'Dev Console armed Next-Dart 10s debug capture');
            break;
          case 'clear_logs':
            break;
        }
      } catch {
        // ignore
      }
    });

    const periodicHealth = window.setInterval(pushHealth, 5000);

    return () => {
      es.close();
      unsubBus();
      unsubGame();
      unsubPlayer();
      unsubReplay();
      unsubCareer();
      console.error = origError;
      console.warn = origWarn;
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleRejection);
      window.clearInterval(periodicHealth);
      if (healthTimer !== null) clearTimeout(healthTimer);
    };
  }, [isLocalConnected, connectedRemotes]);

  return { connectedDevs };
}
