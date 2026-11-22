import { useEffect } from 'react';
import { gameEventBus } from '../services/gameEventBus';
import { useReplayStore } from '../store/useReplayStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { isInnerBull } from '../games/utils/dartHelpers';

/**
 * Global Oche-Cam Auto-Clipper listener mounted once in App.tsx.
 * Watches every live dart from Autodarts Desktop (or Demo Simulator) across
 * both the Stats Dashboard and all 8 Arcade Games, triggering ~10s clips
 * (~5s pre-roll before impact + ~5s post-roll reaction) saved to disk.
 */
export function useReplayAutoTrigger(): void {
  useEffect(() => {
    const unsubscribe = gameEventBus.subscribe((event) => {
      if (event.type !== 'dart_thrown') return;

      const replay = useReplayStore.getState();
      if (replay.status !== 'buffering') return;

      const activePlayer = usePlayerStore.getState().getActivePlayer();
      const playerName = activePlayer.name || 'Player';
      const { dart, visitThrows } = event;

      /* =====================================================================
         [DEV-TEST: REMOVE WHEN DONE]
         One-shot debug capture: records the very next dart regardless of bed
         ===================================================================== */
      if (replay.devCaptureNextDartArmed) {
        replay.cancelDevNextDartCapture();
        void replay.triggerActionReplay({
          playerName,
          segmentName: dart.segment.name,
          score: dart.score,
          reason: `Dev Test (${dart.segment.name})`,
          coords: dart.coords,
          isDevTest: true,
          category: 'dev',
        });
        return;
      }

      const { triggers } = replay;
      const visitScore = visitThrows.reduce((sum, t) => sum + t.score, 0);

      // 1. Check 3-dart visit totals first (180, 140+, 100+)
      if (visitThrows.length === 3) {
        if (visitScore === 180) {
          void replay.triggerActionReplay({
            playerName,
            segmentName: '180',
            score: 180,
            reason: 'MAXIMUM 180!',
            coords: dart.coords,
            category: 'game',
          });
          return;
        }
        if (triggers.on140Plus && visitScore >= 140) {
          void replay.triggerActionReplay({
            playerName,
            segmentName: String(visitScore),
            score: visitScore,
            reason: `Ton-40+ (${visitScore})`,
            coords: dart.coords,
            category: 'game',
          });
          return;
        }
        if (triggers.onTonPlus && visitScore >= 100) {
          void replay.triggerActionReplay({
            playerName,
            segmentName: String(visitScore),
            score: visitScore,
            reason: `Ton+ (${visitScore})`,
            coords: dart.coords,
            category: 'game',
          });
          return;
        }
      }

      // 2. Check single-dart landing highlights (Bullseye / T20)
      if (triggers.onBullseye && isInnerBull(dart)) {
        void replay.triggerActionReplay({
          playerName,
          segmentName: 'Bull',
          score: 50,
          reason: 'Bullseye!',
          coords: dart.coords,
          category: 'game',
        });
        return;
      }

      if (triggers.onT20 && dart.segment.name.toUpperCase() === 'T20') {
        void replay.triggerActionReplay({
          playerName,
          segmentName: 'T20',
          score: 60,
          reason: 'Treble 20!',
          coords: dart.coords,
          category: 'game',
        });
      }
    });

    return unsubscribe;
  }, []);
}
