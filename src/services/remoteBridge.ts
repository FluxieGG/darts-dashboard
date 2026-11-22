import { useEffect, useState } from 'react';
import {
  RemoteCommand,
  RemoteKioskState,
  RemoteNetworkInfo,
  RemotePresencePayload,
} from '../types/remote';
import { usePlayerStore } from '../store/usePlayerStore';
import { useLiveBoardStore } from '../store/useLiveBoardStore';
import { useGameStore } from '../store/useGameStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useReplayStore } from '../store/useReplayStore';
import { useLayoutStore } from '../store/useLayoutStore';
import { useCareerStore } from '../store/useCareerStore';
import { computeStreaks } from '../lib/careerEngine';
import { getDefaultConfigForGame, getGameDefinition } from '../games/gameRegistry';
import { gameEventBus } from './gameEventBus';
import { generateSimulatedThrow, generateSimulatedVisit } from './simulator';
import { ocheCamService } from './ocheCamService';
import { devLogger } from './devLogger';

export async function fetchRemoteInfo(): Promise<RemoteNetworkInfo | null> {
  try {
    const res = await fetch('/api/remote/info', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as RemoteNetworkInfo;
  } catch {
    return null;
  }
}

export async function sendRemoteCommand(command: RemoteCommand): Promise<boolean> {
  try {
    const res = await fetch('/api/remote/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.ok);
  } catch {
    return false;
  }
}

async function pushKioskState(snapshot: RemoteKioskState): Promise<void> {
  try {
    await fetch('/api/remote/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    });
  } catch {
    // Ignore transient network errors when server restarts
  }
}

function buildKioskSnapshot(isLocalConnected: boolean): RemoteKioskState {
  const playerState = usePlayerStore.getState();
  const liveState = useLiveBoardStore.getState();
  const gameState = useGameStore.getState();
  const settingsState = useSettingsStore.getState();
  const replayState = useReplayStore.getState();
  const layoutState = useLayoutStore.getState();
  const careerState = useCareerStore.getState();

  const activePlayer = playerState.getActivePlayer();
  const activeStats = playerState.getActiveStats();
  const playerVault = careerState.getPlayerVault(activePlayer.id, activePlayer.name);
  const streaks = computeStreaks(playerVault.dailyLogs);

  const gameDef = gameState.activeGameId ? getGameDefinition(gameState.activeGameId) : undefined;

  const activeTintHex =
    gameState.activeView === 'game-active' && gameState.activeTurnPlayerColor
      ? gameState.activeTurnPlayerColor
      : !playerState.isPartyMode
      ? activePlayer.dartColor || null
      : null;

  return {
    activeView: gameState.activeView,
    isPartyMode: playerState.isPartyMode,
    activeTintHex,
    isLocalConnected,
    dataMode: settingsState.dataMode,
    boardStatus: liveState.boardStatus,
    visitScore: liveState.visitScore,
    currentVisitThrows: liveState.currentVisitThrows.map((t) => ({
      name: t.segment.name,
      score: t.score,
      multiplier: t.segment.multiplier,
      bouncer: t.bouncer,
    })),
    activePlayer: {
      id: activePlayer.id,
      name: activePlayer.name,
      dartColor: activePlayer.dartColor,
    },
    players: playerState.players.map((p) => ({
      id: p.id,
      name: p.name,
      isPrimary: p.isPrimary,
      dartColor: p.dartColor,
      isSaved: p.isSaved,
    })),
    statsSnapshot: {
      threeDartAvg: activeStats.threeDartAvg,
      highestVisit: activeStats.highestVisit,
      totalDartsThrown: activeStats.totalDartsThrown,
    },
    soundEnabled: gameState.soundEnabled,
    heatmapMode: settingsState.heatmapMode,
    isAutoSimulating: settingsState.isAutoSimulating,
    layoutWidgets: [...layoutState.layout.widgets]
      .sort((a, b) => a.order - b.order)
      .map((w) => ({
        id: w.id,
        title: w.title,
        enabled: w.enabled,
        order: w.order,
        colSpan: w.colSpan,
      })),
    careerSummary: {
      currentStreak: streaks.currentStreak,
      longestStreak: streaks.longestStreak,
      bestDay3DA: playerVault.records.bestDay3DA?.value ?? 0,
      totalCareerDarts: playerVault.records.totalCareerDarts,
      isDiskSynced: careerState.isDiskSynced,
    },
    replayStatus: replayState.status,
    replayBoardCameraMode: replayState.boardCameraMode,
    replayAutoStartCamera: replayState.autoStartCamera,
    replayPlaybackRate: replayState.playbackRate,
    replayTriggers: replayState.triggers,
    replayDevArmed: replayState.devCaptureNextDartArmed,
    hasActiveReplayOverlay: Boolean(replayState.activeOverlayClip),
    replayClipCount: replayState.clips.length,
    isSavingReplay: replayState.isSavingLastClip,
    lastRecording: replayState.lastRecordedClip
      ? {
          id: replayState.lastRecordedClip.id,
          playerName: replayState.lastRecordedClip.playerName,
          segmentName: replayState.lastRecordedClip.segmentName,
          reason: replayState.lastRecordedClip.reason,
          durationSec: replayState.lastRecordedClip.durationSec,
          isSaved: Boolean(replayState.lastRecordedClip.isSavedToDisk),
        }
      : null,
    recentClips: replayState.clips.slice(0, 30).map((c) => ({
      id: c.id,
      filename: c.filename,
      relativePath: c.relativePath,
      subfolder: c.subfolder,
      category: c.category,
      playerName: c.playerName,
      segmentName: c.segmentName,
      score: c.score,
      reason: c.reason,
      durationSec: c.durationSec,
      isDualCamera: c.isDualCamera,
      createdAt: c.createdAt,
    })),
    activeGame: gameDef
      ? {
          id: gameDef.id,
          title: gameDef.title,
          phase: gameState.matchPhase,
          minPlayers: gameDef.minPlayers,
          maxPlayers: gameDef.maxPlayers,
          canUndo: gameState.canUndoActiveGame,
          matchConfig: gameState.matchConfig,
          roster: gameState.roster.map((r) => ({
            id: r.id,
            name: r.name,
            colorHex: r.colorHex,
          })),
          winnerHeadline: gameState.lastResult?.headline,
        }
      : null,
    updatedAt: Date.now(),
  };
}

function executeRemoteCommand(cmd: RemoteCommand): void {
  const playerStore = usePlayerStore.getState();
  const liveStore = useLiveBoardStore.getState();
  const gameStore = useGameStore.getState();

  switch (cmd.type) {
    case 'toggle_party_mode':
      liveStore.resetBoardForModeSwitch();
      if (playerStore.isPartyMode) {
        playerStore.stopPartyMode();
      } else {
        playerStore.startPartyMode();
      }
      break;

    case 'navigate':
      if (cmd.view === 'dashboard') {
        gameStore.returnToDashboard();
      } else {
        gameStore.openGamesLobby();
      }
      break;

    case 'switch_player':
      if (!playerStore.isPartyMode) {
        playerStore.setActivePlayer(cmd.playerId);
      }
      break;

    case 'add_player': {
      const trimmed = cmd.name.trim();
      if (!trimmed) break;
      const shouldSave = cmd.isSaved ?? true;
      const dartColor = cmd.dartColor;
      if (cmd.addToRoster || (gameStore.activeView === 'game-active' && gameStore.matchPhase === 'setup')) {
        if (shouldSave) {
          const newId = playerStore.addPlayer(trimmed, { dartColor, isSaved: true });
          gameStore.addRosterPlayer(trimmed, newId, undefined, dartColor);
        } else {
          gameStore.addRosterPlayer(trimmed, undefined, undefined, dartColor);
        }
      } else {
        playerStore.addPlayer(trimmed, { dartColor, isSaved: shouldSave });
      }
      break;
    }

    case 'update_player_color':
      playerStore.updatePlayerProfile(cmd.playerId, { dartColor: cmd.dartColor });
      break;

    case 'add_saved_to_roster': {
      const match = playerStore.players.find((p) => p.id === cmd.playerId);
      if (match) {
        gameStore.addRosterPlayer(match.name, match.id, match.nickname, match.dartColor);
      }
      break;
    }

    case 'remove_roster_player':
      gameStore.removeRosterPlayer(cmd.playerId);
      break;

    case 'launch_game': {
      const def = getGameDefinition(cmd.gameId);
      if (def && def.status !== 'coming_soon' && def.component) {
        gameStore.launchGame(def.id, getDefaultConfigForGame(def));
      }
      break;
    }

    case 'set_match_config':
      gameStore.setMatchConfigValue(cmd.key, cmd.value);
      break;

    case 'trigger_manual_replay': {
      const replay = useReplayStore.getState();
      const activePlayer = playerStore.getActivePlayer();
      const lastDart = liveStore.currentVisitThrows[liveStore.currentVisitThrows.length - 1];
      void replay.triggerActionReplay({
        playerName: activePlayer.name || 'Player',
        segmentName: lastDart?.segment.name || 'Clip',
        score: lastDart?.score ?? liveStore.visitScore,
        reason: 'User Triggered Clip',
        coords: lastDart?.coords,
        category: 'user',
      });
      break;
    }

    case 'save_last_replay':
      void useReplayStore.getState().saveLastRecording();
      break;

    case 'dismiss_replay':
      useReplayStore.getState().closeOverlayClip();
      break;

    case 'set_heatmap_mode':
      useSettingsStore.getState().setHeatmapMode(cmd.mode);
      break;

    case 'toggle_widget':
      useLayoutStore.getState().toggleWidget(cmd.widgetId);
      break;

    case 'move_widget':
      useLayoutStore.getState().moveWidget(cmd.widgetId, cmd.direction);
      break;

    case 'set_widget_span':
      useLayoutStore.getState().setColSpan(cmd.widgetId, cmd.colSpan);
      break;

    case 'reset_layout':
      useLayoutStore.getState().resetLayout();
      break;

    case 'reroll_objectives': {
      const p = playerStore.getActivePlayer();
      useCareerStore.getState().rerollObjectives(p.id, cmd.period);
      break;
    }

    case 'set_data_mode':
      useSettingsStore.getState().setDataMode(cmd.mode);
      break;

    case 'toggle_auto_sim':
      useSettingsStore.getState().toggleAutoSimulating();
      break;

    case 'simulate_visit': {
      const simVisit = generateSimulatedVisit(playerStore.getActivePlayer().id, Date.now());
      simVisit.throws.forEach((t, i) => {
        window.setTimeout(() => {
          useLiveBoardStore.getState().addSimulatedDart(t);
        }, i * 320);
      });
      break;
    }

    case 'start_cameras':
      void useReplayStore.getState().startCamera();
      break;

    case 'stop_cameras':
      useReplayStore.getState().stopCamera();
      break;

    case 'set_board_camera_mode': {
      const rs = useReplayStore.getState();
      rs.setBoardCameraMode(cmd.mode);
      if (rs.status === 'buffering') {
        void rs.startCamera({ boardCameraMode: cmd.mode });
      }
      break;
    }

    case 'set_auto_start_camera':
      useReplayStore.getState().setAutoStartCamera(cmd.enabled);
      break;

    case 'update_replay_trigger':
      useReplayStore.getState().updateTrigger(cmd.key, cmd.value);
      break;

    case 'set_replay_speed':
      useReplayStore.getState().setPlaybackRate(cmd.rate);
      break;

    case 'play_saved_clip': {
      const rs = useReplayStore.getState();
      const clip = rs.clips.find((c) => c.id === cmd.clipId);
      if (clip) {
        rs.openOverlayClip(clip);
      }
      break;
    }

    case 'delete_saved_clip':
      void useReplayStore.getState().deleteClip(cmd.path);
      break;

    case 'arm_dev_replay': {
      const rs = useReplayStore.getState();
      if (!ocheCamService.isRunning()) {
        void rs.startCamera().then(() => {
          if (ocheCamService.isRunning()) {
            useReplayStore.getState().armDevNextDartCapture();
          }
        });
      } else {
        rs.armDevNextDartCapture();
      }
      break;
    }

    case 'cancel_dev_replay':
      useReplayStore.getState().cancelDevNextDartCapture();
      break;

    case 'toggle_fullscreen':
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
      break;

    case 'start_match':
      if (gameStore.activeView === 'game-active' && gameStore.matchPhase === 'setup') {
        gameStore.startMatch();
      }
      break;

    case 'rematch':
      if (gameStore.activeView === 'game-active') {
        gameStore.rematch();
      }
      break;

    case 'exit_game':
      gameStore.exitGameToLobby();
      break;

    case 'undo_last_action':
      gameStore.activeController?.undoLastAction?.();
      break;

    case 'restart_match':
      if (gameStore.activeController?.restartMatch) {
        gameStore.activeController.restartMatch();
      } else if (gameStore.activeView === 'game-active') {
        gameStore.rematch();
      }
      break;

    case 'toggle_sound':
      gameStore.toggleSound();
      break;

    case 'next_turn_takeout':
      if (gameStore.activeView === 'game-active' && gameStore.matchPhase === 'playing') {
        gameEventBus.injectManualTakeout();
      } else {
        liveStore.completeVisit();
      }
      break;

    case 'clear_visit':
      liveStore.clearCurrentVisit();
      break;

    case 'reset_session':
      playerStore.resetSessionStats();
      liveStore.clearCurrentVisit();
      break;

    case 'inject_dart': {
      const target = cmd.target;
      const isGamePlaying = gameStore.activeView === 'game-active' && gameStore.matchPhase === 'playing';
      const dart =
        target === 'Miss'
          ? {
              id: `remote-miss-${Date.now()}`,
              visitDartIndex: liveStore.currentVisitThrows.length % 3,
              segment: { name: 'Miss', number: 0, bed: 'Outside' as const, multiplier: 0 },
              score: 0,
              coords: { x: 1.12, y: 0.12 },
              timestamp: Date.now(),
            }
          : generateSimulatedThrow(target, liveStore.currentVisitThrows.length % 3, 0.01);

      if (isGamePlaying) {
        gameEventBus.injectManualDart(dart);
      } else {
        liveStore.addSimulatedDart(dart);
      }
      break;
    }
  }
}

/**
 * Mounted ONCE on the Kiosk App (`App.tsx`):
 * - Opens SSE stream `/api/remote/stream?role=kiosk` to receive Phone commands instantaneously.
 * - Pushes compact state snapshots to paired phones whenever stores update.
 * - Returns live count of connected phones for the Header badge.
 */
export function useKioskRemoteBridge(isLocalConnected: boolean): { connectedRemotes: number } {
  const [connectedRemotes, setConnectedRemotes] = useState(0);

  useEffect(() => {
    let pushTimer: number | null = null;

    const schedulePush = () => {
      if (pushTimer !== null) return;
      pushTimer = window.setTimeout(() => {
        pushTimer = null;
        void pushKioskState(buildKioskSnapshot(isLocalConnected));
      }, 60);
    };

    // Push initial state immediately
    void pushKioskState(buildKioskSnapshot(isLocalConnected));

    const es = new EventSource('/api/remote/stream?role=kiosk');

    es.onopen = () => {
      schedulePush();
    };

    es.addEventListener('presence', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as RemotePresencePayload;
        const count = data.connectedRemotes || 0;
        setConnectedRemotes((prev) => {
          if (prev !== count) {
            devLogger.log(
              'REMOTE',
              count > 0 ? 'success' : 'info',
              `iPad / Oche Remote count: ${count}`
            );
          }
          return count;
        });
        useReplayStore.getState().setConnectedRemotes(count);
        if (count > 0) {
          schedulePush();
        }
      } catch {
        // ignore
      }
    });

    es.addEventListener('command', (ev) => {
      try {
        const cmd = JSON.parse((ev as MessageEvent).data) as RemoteCommand;
        devLogger.log('REMOTE', 'info', `Remote cmd: ${cmd.type}`, JSON.stringify(cmd));
        executeRemoteCommand(cmd);
        schedulePush();
      } catch (err) {
        console.error('[RemoteBridge] Failed to execute command:', err);
      }
    });

    const unsubPlayer = usePlayerStore.subscribe(schedulePush);
    const unsubLive = useLiveBoardStore.subscribe(schedulePush);
    const unsubGame = useGameStore.subscribe(schedulePush);
    const unsubSettings = useSettingsStore.subscribe(schedulePush);
    const unsubReplay = useReplayStore.subscribe(schedulePush);
    const unsubLayout = useLayoutStore.subscribe(schedulePush);
    const unsubCareer = useCareerStore.subscribe(schedulePush);

    return () => {
      es.close();
      unsubPlayer();
      unsubLive();
      unsubGame();
      unsubSettings();
      unsubReplay();
      unsubLayout();
      unsubCareer();
      if (pushTimer !== null) {
        clearTimeout(pushTimer);
      }
    };
  }, [isLocalConnected]);

  return { connectedRemotes };
}
