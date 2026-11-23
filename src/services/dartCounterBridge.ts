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

interface CachedDartThrow {
  name: string;
  score: number;
  multiplier: number;
}

function isOneDartDoubleOutScore(rem: number): boolean {
  return rem === 50 || (rem >= 2 && rem <= 40 && rem % 2 === 0);
}

/**
 * Counts how many darts in a visit were thrown while the player was sitting on a 1-dart double finish (50 or even 2..40).
 * Used when DartCounter pops <app-darts-for-throwout-dialog> ("Darts used on a double").
 */
function countDartsAtDouble(
  turnStartRem: number,
  throwsList: Array<{ name: string; score: number }>
): number {
  let rem = turnStartRem;
  let count = 0;
  for (const dart of throwsList) {
    if (isOneDartDoubleOutScore(rem)) {
      count++;
    }
    rem -= dart.score;
    if (rem <= 1) break;
  }
  return count;
}

/**
 * Deterministically evaluates a visit against the turn-start remaining score and outRule.
 * Essential because useOnlineMatchSync updates useOnlineMatchStore (resetting remaining / setting matchWinner)
 * BEFORE useDartCounterBridge's gameEventBus listener runs on the winning checkout dart.
 */
function evaluateVisitForDartCounter(
  turnStartRem: number,
  outRule: 'double' | 'straight',
  throwsList: CachedDartThrow[]
): {
  effectiveScore: number;
  isBust: boolean;
  isCheckout: boolean;
  dartsUsed: number;
  dartsAtDouble: number;
} {
  let rem = turnStartRem;
  let scored = 0;
  let isBust = false;
  let isCheckout = false;
  let dartsUsed = 0;

  for (const dart of throwsList) {
    dartsUsed++;
    const after = rem - dart.score;
    const isDoubleFinish =
      dart.multiplier === 2 || dart.name === 'DBull' || dart.name === 'Bull';
    const validOut = outRule === 'straight' ? true : isDoubleFinish;

    if (after === 0 && validOut) {
      scored += dart.score;
      rem = 0;
      isCheckout = true;
      break;
    }
    if (after < 0 || (outRule === 'double' && (after === 1 || after === 0))) {
      isBust = true;
      scored = 0;
      break;
    }
    scored += dart.score;
    rem = after;
  }

  return {
    effectiveScore: isBust ? 0 : scored,
    isBust,
    isCheckout,
    dartsUsed,
    dartsAtDouble: countDartsAtDouble(turnStartRem, throwsList.slice(0, dartsUsed)),
  };
}

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

let lastDispatchedVisit: DartCounterPendingVisit | null = null;

export async function forceSendCurrentVisitToDartCounter(
  overrideScore?: number
): Promise<boolean> {
  const live = useLiveBoardStore.getState();
  const match = useOnlineMatchStore.getState();
  if (match.dcPendingVisit) {
    return confirmAndSendPendingDartCounterVisit(overrideScore);
  }
  if (live.currentVisitThrows.length === 0 && typeof overrideScore !== 'number') {
    match.setDartCounterLastSubmit('No darts on board to send');
    return false;
  }
  const throwsList: CachedDartThrow[] = live.currentVisitThrows.map((t) => ({
    name: t.segment.name,
    score: t.bouncer ? 0 : t.score,
    multiplier: t.bouncer ? 0 : t.segment.multiplier,
  }));
  const evalRes = evaluateVisitForDartCounter(
    match.turnStartRemaining,
    match.outRule,
    throwsList
  );
  const clampedOverride =
    typeof overrideScore === 'number' && Number.isFinite(overrideScore)
      ? Math.max(0, Math.min(180, Math.round(overrideScore)))
      : null;
  const finalScore = clampedOverride !== null ? clampedOverride : evalRes.effectiveScore;

  const visit: DartCounterPendingVisit = {
    id: `dc-manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    score: finalScore,
    throws:
      throwsList.length > 0
        ? throwsList.map((t) => t.name)
        : [String(finalScore)],
    dartsUsed: Math.max(1, evalRes.dartsUsed || 3),
    dartsAtDouble: evalRes.dartsAtDouble,
    isBust: clampedOverride !== null ? clampedOverride === 0 && evalRes.isBust : evalRes.isBust,
    isCheckout:
      clampedOverride !== null
        ? match.isActive && match.turnStartRemaining - clampedOverride === 0
        : evalRes.isCheckout,
    createdAt: Date.now(),
  };
  lastDispatchedVisit = visit;
  const { ok, delivered } = await dispatchVisitToDartCounter(visit);
  if (ok && delivered > 0) {
    match.setDartCounterLastSubmit(`Sent ${visit.score} to DartCounter`);
    return true;
  }
  match.setDartCounterPendingVisit(visit);
  match.setDartCounterLastSubmit(
    delivered === 0
      ? 'Brave DartCounter tab not reachable — open app.dartcounter.net/match'
      : 'Failed sending score to DartCounter'
  );
  return false;
}

export async function setDartCounterBridgeMode(mode: DartCounterBridgeMode): Promise<void> {
  useOnlineMatchStore.getState().setDartCounterMode(mode);
  await pushDartCounterConfig({ mode });
  devLogger.log('REMOTE', 'info', `DartCounter bridge mode → ${mode.toUpperCase()}`);
}

export async function confirmAndSendPendingDartCounterVisit(
  overrideScore?: number
): Promise<boolean> {
  const store = useOnlineMatchStore.getState();
  const pending = store.dcPendingVisit;
  if (!pending) return false;

  const clampedOverride =
    typeof overrideScore === 'number' && Number.isFinite(overrideScore)
      ? Math.max(0, Math.min(180, Math.round(overrideScore)))
      : null;

  const visitToSend: DartCounterPendingVisit =
    clampedOverride !== null && clampedOverride !== pending.score
      ? {
          ...pending,
          id: `dc-edited-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          score: clampedOverride,
          isBust: clampedOverride === 0 && pending.isBust,
          isCheckout: store.isActive && store.turnStartRemaining - clampedOverride === 0,
        }
      : pending;

  lastDispatchedVisit = visitToSend;
  const { ok, delivered } = await dispatchVisitToDartCounter(visitToSend);
  if (ok && delivered > 0) {
    store.setDartCounterPendingVisit(null);
    store.setDartCounterLastSubmit(`Sending ${visitToSend.score} to DartCounter...`);
    devLogger.log(
      'BOARD',
      'success',
      `Confirmed & sent visit (${visitToSend.score}) to DartCounter Extension`,
      visitToSend.throws.join(' • ')
    );
    return true;
  }

  store.setDartCounterLastSubmit(
    delivered === 0
      ? 'No DartCounter browser tab connected — open app.dartcounter.net/match'
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
 *   online friends list, pending friend invites, PDC checkout routes & auto-clipping from `app.dartcounter.net`.
 * - Option B: Auto-scoring Autodarts visits into DartCounter Web (works on both Dashboard
 *   and dedicated DartCounter Kiosk views, even while Brave sits un-throttled behind the Kiosk!)
 * - Remote Control: Starting DartBot games (Lv 1-20), seeing/challenging online friends & accepting invites from the iPad.
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
        const om = useOnlineMatchStore.getState();
        om.setDartCounterLastSubmit(result.message);
        // If score entry failed (e.g. "Waiting for your turn in DartCounter...") in iPad Confirm mode,
        // restore the pending visit so the player can tap Confirm & Send again without losing their score!
        if (
          !result.ok &&
          om.dcMode === 'confirm' &&
          !om.dcPendingVisit &&
          lastDispatchedVisit &&
          lastDispatchedVisit.id === result.visitId
        ) {
          om.setDartCounterPendingVisit({
            ...lastDispatchedVisit,
            id: `dc-retry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          });
        } else if (result.ok && lastDispatchedVisit && lastDispatchedVisit.id === result.visitId) {
          lastDispatchedVisit = null;
        }
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
    let currentVisitThrowsCache: CachedDartThrow[] = [];
    let trackedTurnStartRemaining = useOnlineMatchStore.getState().turnStartRemaining;

    // Keep trackedTurnStartRemaining synced whenever a visit is NOT actively in progress
    const unsubOnlineStore = useOnlineMatchStore.subscribe((nextState) => {
      if (currentVisitThrowsCache.length === 0 && !nextState.matchWinner) {
        trackedTurnStartRemaining = nextState.turnStartRemaining;
      }
    });

    const clearTakeoutTimer = () => {
      if (takeoutAutoTimer !== null) {
        window.clearTimeout(takeoutAutoTimer);
        takeoutAutoTimer = null;
      }
    };

    const enqueueOrSubmitVisit = (
      throwsList: CachedDartThrow[],
      triggerLabel: string,
      allowUpdatePending = false
    ) => {
      if (throwsList.length === 0) return;

      const activeView = useGameStore.getState().activeView;
      if (activeView !== 'dashboard' && activeView !== 'dartcounter') return;

      const match = useOnlineMatchStore.getState();
      if (match.dcMode === 'read-only') return;

      const isDartCounterMatch = match.isActive && match.source === 'dartcounter';
      const isDartCounterView = activeView === 'dartcounter';

      // In iPad Confirm mode on the DartCounter tab, ALWAYS queue the visit to the iPad
      // (even if the extension's match-state poll briefly lagged) so the user can review & send!
      // In Auto-Log mode, strictly require an active connected DartCounter match.
      if (match.dcMode === 'auto') {
        if (!match.dcConnected || !isDartCounterMatch) return;
      } else {
        if (!isDartCounterView && !isDartCounterMatch) return;
      }

      if (submittedCurrentVisit && !(allowUpdatePending && match.dcMode === 'confirm' && match.dcPendingVisit)) {
        return;
      }

      const rawTotal = throwsList.reduce((sum, t) => sum + t.score, 0);
      const evalRes = isDartCounterMatch
        ? evaluateVisitForDartCounter(trackedTurnStartRemaining, match.outRule, throwsList)
        : {
            effectiveScore: Math.max(0, Math.min(180, rawTotal)),
            isBust: false,
            isCheckout: false,
            dartsUsed: throwsList.length,
            dartsAtDouble: 0,
          };

      // Do NOT skip if this visit IS the match-winning checkout (useOnlineMatchSync already set matchWinner!)
      if (isDartCounterMatch && match.matchWinner && !evalRes.isCheckout) return;

      submittedCurrentVisit = true;
      clearTakeoutTimer();

      const pendingVisit: DartCounterPendingVisit = {
        id: `dc-visit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        score: evalRes.effectiveScore,
        throws: throwsList.map((t) => t.name),
        dartsUsed: evalRes.dartsUsed,
        dartsAtDouble: evalRes.dartsAtDouble,
        isBust: evalRes.isBust,
        isCheckout: evalRes.isCheckout,
        createdAt: Date.now(),
      };

      if (match.dcMode === 'auto') {
        lastDispatchedVisit = pendingVisit;
        void dispatchVisitToDartCounter(pendingVisit).then(({ ok, delivered }) => {
          if (ok && delivered > 0) {
            useOnlineMatchStore
              .getState()
              .setDartCounterLastSubmit(`Auto-sent ${evalRes.effectiveScore} (${triggerLabel})`);
            devLogger.log(
              'BOARD',
              'success',
              `Auto-scored ${evalRes.effectiveScore} into DartCounter (${triggerLabel})`,
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
          {
            name: event.dart.segment.name,
            score: event.dart.bouncer ? 0 : event.dart.score,
            multiplier: event.dart.bouncer ? 0 : event.dart.segment.multiplier,
          },
        ];

        const match = useOnlineMatchStore.getState();
        const evalRes = evaluateVisitForDartCounter(
          trackedTurnStartRemaining,
          match.outRule,
          currentVisitThrowsCache
        );
        const finishedVisit =
          currentVisitThrowsCache.length >= 3 ||
          (match.isActive &&
            match.source === 'dartcounter' &&
            (evalRes.isBust || evalRes.isCheckout));

        if (finishedVisit && !submittedCurrentVisit) {
          clearTakeoutTimer();
          const snapshotThrows = [...currentVisitThrowsCache];
          const label = evalRes.isCheckout
            ? 'checkout'
            : evalRes.isBust
            ? 'bust'
            : '3-dart visit';
          takeoutAutoTimer = window.setTimeout(() => {
            takeoutAutoTimer = null;
            enqueueOrSubmitVisit(snapshotThrows, label);
          }, 600);
        }
      } else if (event.type === 'dart_corrected') {
        currentVisitThrowsCache = event.visitThrows.map((t) => ({
          name: t.segment.name,
          score: t.bouncer ? 0 : t.score,
          multiplier: t.bouncer ? 0 : t.segment.multiplier,
        }));
        const match = useOnlineMatchStore.getState();
        const evalRes = evaluateVisitForDartCounter(
          trackedTurnStartRemaining,
          match.outRule,
          currentVisitThrowsCache
        );
        const isPendingConfirmUpdate = Boolean(
          match.dcMode === 'confirm' && match.dcPendingVisit && currentVisitThrowsCache.length > 0
        );
        if (
          isPendingConfirmUpdate ||
          (!submittedCurrentVisit &&
            (currentVisitThrowsCache.length >= 3 || evalRes.isBust || evalRes.isCheckout))
        ) {
          clearTakeoutTimer();
          const snapshotThrows = [...currentVisitThrowsCache];
          takeoutAutoTimer = window.setTimeout(() => {
            takeoutAutoTimer = null;
            enqueueOrSubmitVisit(snapshotThrows, 'corrected visit', true);
          }, 450);
        }
      } else if (event.type === 'visit_completed') {
        const throwsList: CachedDartThrow[] = event.throws.map((t) => ({
          name: t.segment.name,
          score: t.bouncer ? 0 : t.score,
          multiplier: t.bouncer ? 0 : t.segment.multiplier,
        }));
        enqueueOrSubmitVisit(throwsList, 'takeout');
        submittedCurrentVisit = false;
        currentVisitThrowsCache = [];
        clearTakeoutTimer();
        trackedTurnStartRemaining = useOnlineMatchStore.getState().turnStartRemaining;
      }
    });

    return () => {
      clearTakeoutTimer();
      es.close();
      unsubBus();
      unsubOnlineStore();
    };
  }, []);
}
