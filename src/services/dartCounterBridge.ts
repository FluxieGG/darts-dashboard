import { useEffect } from 'react';
import {
  DartCounterBridgeConfig,
  DartCounterBridgeMode,
  DartCounterControlCommand,
  DartCounterControlResult,
  DartCounterLiveMatchState,
  DartCounterPendingVisit,
  DartCounterSubmitResult,
} from '../types/dartCounter';
import { useOnlineMatchStore } from '../store/useOnlineMatchStore';
import { useLiveBoardStore } from '../store/useLiveBoardStore';
import { useGameStore } from '../store/useGameStore';
import { gameEventBus } from './gameEventBus';
import { devLogger } from './devLogger';

export async function pushDartCounterConfig(
  partial: Partial<DartCounterBridgeConfig>
): Promise<boolean> {
  try {
    const res = await fetch('/api/dartcounter/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function dispatchVisitToDartCounter(
  visit: DartCounterPendingVisit
): Promise<{ ok: boolean; delivered: number }> {
  try {
    const res = await fetch('/api/dartcounter/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(visit),
    });
    if (!res.ok) return { ok: false, delivered: 0 };
    const data = (await res.json()) as { ok?: boolean; delivered?: number };
    return { ok: Boolean(data.ok), delivered: data.delivered || 0 };
  } catch {
    return { ok: false, delivered: 0 };
  }
}

export async function sendDartCounterControl(
  command: DartCounterControlCommand
): Promise<{ ok: boolean; delivered: number }> {
  try {
    useOnlineMatchStore
      .getState()
      .setDartCounterControlStatus(`Sending ${command.action.replace(/_/g, ' ')} to Brave...`);
    const res = await fetch('/api/dartcounter/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!res.ok) return { ok: false, delivered: 0 };
    const data = (await res.json()) as { ok?: boolean; delivered?: number };
    if ((data.delivered || 0) === 0) {
      useOnlineMatchStore
        .getState()
        .setDartCounterControlStatus('Brave DartCounter tab not connected');
    }
    devLogger.log('REMOTE', 'info', `DartCounter control → ${command.action}`, JSON.stringify(command));
    return { ok: Boolean(data.ok), delivered: data.delivered || 0 };
  } catch {
    return { ok: false, delivered: 0 };
  }
}

export async function forceSendCurrentVisitToDartCounter(): Promise<boolean> {
  const live = useLiveBoardStore.getState();
  const match = useOnlineMatchStore.getState();
  if (match.dcPendingVisit) {
    return confirmAndSendPendingDartCounterVisit();
  }
  if (live.currentVisitThrows.length === 0) {
    match.setDartCounterLastSubmit('No darts on board to send');
    return false;
  }
  const throwsList = live.currentVisitThrows;
  const totalScore = throwsList.reduce((sum, t) => sum + (t.bouncer ? 0 : t.score), 0);
  const visit: DartCounterPendingVisit = {
    id: `dc-manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    score: match.isBust ? 0 : totalScore,
    throws: throwsList.map((t) => t.segment.name),
    dartsUsed: throwsList.length,
    isBust: match.isBust,
    isCheckout: match.remaining === 0 && !match.isBust && totalScore > 0,
    createdAt: Date.now(),
  };
  const { ok, delivered } = await dispatchVisitToDartCounter(visit);
  match.setDartCounterLastSubmit(
    ok && delivered > 0
      ? `Sent ${visit.score} to DartCounter`
      : 'Brave DartCounter tab not reachable'
  );
  return ok && delivered > 0;
}

export async function setDartCounterBridgeMode(mode: DartCounterBridgeMode): Promise<void> {
  useOnlineMatchStore.getState().setDartCounterMode(mode);
  await pushDartCounterConfig({ mode });
  devLogger.log('REMOTE', 'info', `DartCounter bridge mode → ${mode.toUpperCase()}`);
}

export async function confirmAndSendPendingDartCounterVisit(): Promise<boolean> {
  const store = useOnlineMatchStore.getState();
  const pending = store.dcPendingVisit;
  if (!pending) return false;

  const { ok, delivered } = await dispatchVisitToDartCounter(pending);
  if (ok && delivered > 0) {
    store.setDartCounterPendingVisit(null);
    store.setDartCounterLastSubmit(`Sending ${pending.score} to DartCounter...`);
    devLogger.log(
      'BOARD',
      'success',
      `Sent visit (${pending.score}) to DartCounter Extension`,
      pending.throws.join(' • ')
    );
    return true;
  }

  store.setDartCounterLastSubmit(
    delivered === 0
      ? 'No DartCounter browser tab connected — open app.dartcounter.net'
      : 'Failed dispatching score to DartCounter'
  );
  return false;
}

export function discardPendingDartCounterVisit(): void {
  const store = useOnlineMatchStore.getState();
  store.setDartCounterPendingVisit(null);
  store.setDartCounterLastSubmit('Skipped visit submission');
}

/**
 * Mounted ONCE in KioskApp (`App.tsx`).
 *
 * Bridges the local Vite `/api/dartcounter/*` SSE relay with:
 * - Option A: Auto-syncing live match scores, opponent remaining, legs, turn indicator,
 *   pending friend invites, PDC checkout routes & auto-clipping from `app.dartcounter.net`.
 * - Option B: Auto-scoring Autodarts visits into DartCounter Web (works on both Dashboard
 *   and dedicated DartCounter Kiosk views, even while Brave sits un-throttled behind the Kiosk!)
 * - Remote Control: Starting DartBot games & accepting/declining friend invites from the iPad.
 */
export function useDartCounterBridge(): void {
  useEffect(() => {
    const store = useOnlineMatchStore.getState();

    // Sync initial saved mode to Vite relay on mount
    void pushDartCounterConfig({ mode: store.dcMode, submitOnTakeout: true });

    const es = new EventSource('/api/dartcounter/stream?role=kiosk');

    es.addEventListener('dc_presence', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as {
          connectedExtensions?: number;
        };
        const count = data.connectedExtensions || 0;
        const prev = useOnlineMatchStore.getState().dcConnected;
        useOnlineMatchStore.getState().setDartCounterConnected(count > 0);
        if (count === 0) {
          const cur = useOnlineMatchStore.getState();
          if (cur.isActive && cur.source === 'dartcounter') {
            cur.stopMatch();
          }
        }
        if (prev !== (count > 0)) {
          devLogger.log(
            'REMOTE',
            count > 0 ? 'success' : 'info',
            count > 0
              ? `DartCounter Brave/Chrome Extension connected (${count} tab)`
              : 'DartCounter Extension disconnected'
          );
        }
      } catch {
        // ignore
      }
    });

    es.addEventListener('dc_config', (ev) => {
      try {
        const cfg = JSON.parse((ev as MessageEvent).data) as DartCounterBridgeConfig;
        if (cfg.mode) {
          useOnlineMatchStore.getState().setDartCounterMode(cfg.mode);
        }
      } catch {
        // ignore
      }
    });

    es.addEventListener('dc_state', (ev) => {
      try {
        const dcState = JSON.parse((ev as MessageEvent).data) as DartCounterLiveMatchState;
        useOnlineMatchStore.getState().syncFromDartCounter(dcState);
      } catch {
        // ignore
      }
    });

    es.addEventListener('dc_submit_result', (ev) => {
      try {
        const result = JSON.parse((ev as MessageEvent).data) as DartCounterSubmitResult;
        useOnlineMatchStore.getState().setDartCounterLastSubmit(result.message);
        devLogger.log(
          'BOARD',
          result.ok ? 'success' : 'warn',
          `DartCounter score entry: ${result.message}`
        );
      } catch {
        // ignore
      }
    });

    es.addEventListener('dc_control_result', (ev) => {
      try {
        const result = JSON.parse((ev as MessageEvent).data) as DartCounterControlResult;
        useOnlineMatchStore.getState().setDartCounterControlStatus(result.message);
        devLogger.log(
          'REMOTE',
          result.ok ? 'success' : 'warn',
          `DartCounter remote control: ${result.message}`
        );
      } catch {
        // ignore
      }
    });

    // Listen to live Autodarts throws & visit completions -> Option B Auto-Score / Confirm Queue
    let takeoutAutoTimer: number | null = null;
    let submittedCurrentVisit = false;
    let currentVisitThrowsCache: Array<{ name: string; score: number }> = [];

    const clearTakeoutTimer = () => {
      if (takeoutAutoTimer !== null) {
        window.clearTimeout(takeoutAutoTimer);
        takeoutAutoTimer = null;
      }
    };

    const enqueueOrSubmitVisit = (
      throwsList: Array<{ name: string; score: number }>,
      triggerLabel: string
    ) => {
      if (submittedCurrentVisit) return;
      if (throwsList.length === 0) return;

      const activeView = useGameStore.getState().activeView;
      if (activeView !== 'dashboard' && activeView !== 'dartcounter') return;

      const match = useOnlineMatchStore.getState();
      if (!match.dcConnected) return;
      if (match.dcMode === 'read-only') return;
      if (!match.isActive || match.source !== 'dartcounter') return;
      if (match.matchWinner) return;

      submittedCurrentVisit = true;
      clearTakeoutTimer();

      const totalScore = throwsList.reduce((sum, t) => sum + t.score, 0);
      const isBust = match.isBust;
      const isCheckout = match.remaining === 0 && !isBust && totalScore > 0;
      const effectiveScore = isBust ? 0 : totalScore;

      const pendingVisit: DartCounterPendingVisit = {
        id: `dc-visit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        score: effectiveScore,
        throws: throwsList.map((t) => t.name),
        dartsUsed: throwsList.length,
        isBust,
        isCheckout,
        createdAt: Date.now(),
      };

      if (match.dcMode === 'auto') {
        void dispatchVisitToDartCounter(pendingVisit).then(({ ok, delivered }) => {
          if (ok && delivered > 0) {
            useOnlineMatchStore
              .getState()
              .setDartCounterLastSubmit(`Auto-sent ${effectiveScore} (${triggerLabel})`);
            devLogger.log(
              'BOARD',
              'success',
              `Auto-scored ${effectiveScore} into DartCounter (${triggerLabel})`,
              pendingVisit.throws.join(' • ')
            );
          }
        });
      } else {
        useOnlineMatchStore.getState().setDartCounterPendingVisit(pendingVisit);
      }
    };

    const unsubBus = gameEventBus.subscribe((event) => {
      if (event.type === 'dart_thrown') {
        if (event.dartIndex === 0) {
          submittedCurrentVisit = false;
          currentVisitThrowsCache = [];
          clearTakeoutTimer();
        }
        currentVisitThrowsCache = [
          ...currentVisitThrowsCache.slice(0, event.dartIndex),
          { name: event.dart.segment.name, score: event.dart.bouncer ? 0 : event.dart.score },
        ];

        const match = useOnlineMatchStore.getState();
        const finishedVisit =
          currentVisitThrowsCache.length >= 3 ||
          (match.isActive && match.source === 'dartcounter' && (match.isBust || match.remaining === 0));

        if (finishedVisit && !submittedCurrentVisit) {
          clearTakeoutTimer();
          const snapshotThrows = [...currentVisitThrowsCache];
          takeoutAutoTimer = window.setTimeout(() => {
            takeoutAutoTimer = null;
            enqueueOrSubmitVisit(snapshotThrows, '3-dart visit');
          }, 950);
        }
      } else if (event.type === 'dart_corrected') {
        currentVisitThrowsCache = event.visitThrows.map((t) => ({
          name: t.segment.name,
          score: t.bouncer ? 0 : t.score,
        }));
        if (!submittedCurrentVisit && currentVisitThrowsCache.length >= 3) {
          clearTakeoutTimer();
          const snapshotThrows = [...currentVisitThrowsCache];
          takeoutAutoTimer = window.setTimeout(() => {
            takeoutAutoTimer = null;
            enqueueOrSubmitVisit(snapshotThrows, 'corrected visit');
          }, 950);
        }
      } else if (event.type === 'visit_completed') {
        const throwsList = event.throws.map((t) => ({
          name: t.segment.name,
          score: t.bouncer ? 0 : t.score,
        }));
        enqueueOrSubmitVisit(throwsList, 'takeout');
        submittedCurrentVisit = false;
        currentVisitThrowsCache = [];
        clearTakeoutTimer();
      }
    });

    return () => {
      clearTakeoutTimer();
      es.close();
      unsubBus();
    };
  }, []);
}

