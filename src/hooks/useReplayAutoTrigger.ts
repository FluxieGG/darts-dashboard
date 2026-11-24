import { useEffect } from 'react';
import { gameEventBus } from '../services/gameEventBus';
import { ocheCamService } from '../services/ocheCamService';
import { isDartCounterClippingDisabled, useReplayStore } from '../store/useReplayStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { isInnerBull } from '../games/utils/dartHelpers';

/**
 * Global Oche-Cam Auto-Clipper listener mounted once in App.tsx.
 * Watches every live dart from Autodarts Desktop (or Demo Simulator) across
 * the Stats Dashboard, Solo Drills, and all Arcade Games (DISABLED during DartCounter),
 * triggering ~10s clips (~5s pre-roll before impact + ~5s post-roll reaction)
 * from the single board camera closest to the triggering dart.
 */
export function useReplayAutoTrigger(): void {
  useEffect(() => {
    const unsubscribe = gameEventBus.subscribe((event) => {
      if (event.type !== 'dart_thrown') return;
      if (isDartCounterClippingDisabled()) return;

      const { dart, visitThrows } = event;
      const segName = dart?.segment?.name || '';
      // Always track the closest board camera to the latest dart thrown (so manual "Clip (20s)"
      // taps even after pulling darts still clip from the exact closest board camera!)
      ocheCamService.noteLastDartImpact(dart.coords, segName);

      const replay = useReplayStore.getState();
      if (replay.status !== 'buffering' && replay.status !== 'capturing') return;

      const activePlayer = usePlayerStore.getState().getActivePlayer();
      const playerName = activePlayer?.name || 'Player';
      const { triggers } = replay;
      const visitScore = visitThrows.reduce((sum, t) => sum + t.score, 0);

      // If an earlier dart in this visit (e.g., Dart 1 T20 or Bull) is already mid-capture,
      // upgrade its metadata when a higher-priority 180 or 140+ visit finishes!
      if (replay.status === 'capturing') {
        if (visitThrows.length === 3) {
          if (visitScore === 180) {
            if (
              ocheCamService.upgradeActiveCaptureMeta({
                playerName,
                segmentName: '180',
                score: 180,
                reason: 'MAXIMUM 180!',
                coords: dart.coords,
                category: 'game',
              })
            ) {
              useReplayStore.setState({
                lastCaptureBanner: `MAXIMUM 180! — Recording ${playerName}'s clip...`,
              });
            }
          } else if (triggers.on140Plus && visitScore >= 140) {
            if (
              ocheCamService.upgradeActiveCaptureMeta({
                playerName,
                segmentName: String(visitScore),
                score: visitScore,
                reason: `Ton-40+ (${visitScore})`,
                coords: dart.coords,
                category: 'game',
              })
            ) {
              useReplayStore.setState({
                lastCaptureBanner: `Ton-40+ (${visitScore}) — Recording ${playerName}'s clip...`,
              });
            }
          }
        }
        return;
      }

      // PIN 0161 Dev Console one-shot clip trigger: records the very next dart regardless of bed
      if (replay.devCaptureNextDartArmed) {
        replay.cancelDevNextDartCapture();
        void replay.triggerActionReplay({
          playerName,
          segmentName: segName,
          score: dart.score,
          reason: `Dev Test (${segName})`,
          coords: dart.coords,
          isDevTest: true,
          category: 'dev',
        });
        return;
      }

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

      if (triggers.onT20 && segName.toUpperCase() === 'T20') {
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
