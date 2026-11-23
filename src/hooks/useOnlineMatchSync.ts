import { useEffect } from 'react';
import { gameEventBus } from '../services/gameEventBus';
import { useOnlineMatchStore } from '../store/useOnlineMatchStore';
import { useGameStore } from '../store/useGameStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { useReplayStore } from '../store/useReplayStore';
import { useCareerStore } from '../store/useCareerStore';
import { soundEngine } from '../games/utils/soundEngine';
import { DEFAULT_DART_COLOR } from '../lib/playerThemes';

/**
 * Mounted once in App.tsx.
 * Connects the live Autodarts board stream (`gameEventBus`) to `useOnlineMatchStore`
 * whenever an Online / X01 Match Tracker leg is active on the Dashboard.
 */
export function useOnlineMatchSync(): void {
  useEffect(() => {
    const unsub = gameEventBus.subscribe((event) => {
      const match = useOnlineMatchStore.getState();
      if (!match.isActive || match.matchWinner) return;

      // Only track throws on the Dashboard (never interfere with Arcade / Practice games)
      const activeView = useGameStore.getState().activeView;
      if (activeView !== 'dashboard') return;

      const soundEnabled = useGameStore.getState().soundEnabled;

      if (event.type === 'dart_thrown') {
        const outcome = match.applyDart(event.dart);
        if (!outcome) return;

        if (outcome.kind === 'bust') {
          soundEngine.playHazard(soundEnabled);
        } else if (outcome.kind === 'leg_won' || outcome.kind === 'match_won') {
          soundEngine.playJackpot(soundEnabled);

          const player = usePlayerStore.getState().getActivePlayer();
          const playerName = player.name || 'Player';
          const gameTitle = `Online ${match.startScore}`;
          const clipTitle = `${gameTitle} - Game Winning Shot - ${playerName}`;

          // Auto-clip & save the checkout shot!
          void useReplayStore.getState().triggerActionReplay({
            playerName,
            segmentName: event.dart.segment.name,
            score: event.dart.score,
            reason: clipTitle,
            customFileName: clipTitle,
            coords: event.dart.coords,
            category: 'game',
            forceAutoSave: true,
          });

          // Record into Career Vault Online X01 Leaderboard (uses RAM-only partyLeaderboards in Party Mode!)
          useCareerStore.getState().recordLeaderboardPerformance({
            gameId: `online-${match.startScore}`,
            gameTitle,
            mode: 'online',
            playerId: player.id,
            playerName,
            colorHex: player.dartColor || DEFAULT_DART_COLOR,
            didWin: outcome.kind === 'match_won' || match.legsToWin <= 1,
            statValue: outcome.dartsInLeg,
            statDisplay: `${outcome.dartsInLeg} darts (${outcome.legThreeDartAvg.toFixed(1)} 3DA)`,
            statLabel: 'Best Leg',
            lowerIsBetter: true,
          });
        }
      } else if (event.type === 'dart_corrected') {
        match.replayVisitCorrection(event.visitThrows);
      } else if (event.type === 'visit_completed') {
        match.commitVisitTakeout();
      }
    });

    return unsub;
  }, []);
}
