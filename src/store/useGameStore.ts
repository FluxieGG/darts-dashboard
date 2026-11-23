import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  AppView,
  GAME_PLAYER_COLORS,
  GameCategory,
  GameMatchConfig,
  GameMatchPhase,
  GameModuleController,
  GamePlayer,
  GameResult,
  GameSessionSummary,
} from '../types/games';
import { usePlayerStore } from './usePlayerStore';
import { useCareerStore } from './useCareerStore';
import { gameEventBus } from '../services/gameEventBus';

interface GameStoreState {
  // Navigation & Active Game Socket State
  activeView: AppView;
  activeGameId: string | null;
  matchPhase: GameMatchPhase;
  selectedCategory: GameCategory | 'All';

  // Active Match Setup & Runtime
  roster: GamePlayer[];
  matchConfig: GameMatchConfig;
  lastResult: GameResult | null;
  matchInstanceKey: number; // Bumped on rematch/restart to cleanly remount game state

  // Ephemeral controller hooks registered by the mounted Game Module (for GameHost & Phone Remote)
  activeController: GameModuleController | null;
  canUndoActiveGame: boolean;
  /** Hex colour of the player whose turn it currently is inside an active game */
  activeTurnPlayerColor: string | null;
  /** Broadcast "How to Play" rulebook popup overlay controlled from the iPad */
  isRulesOverlayOpen: boolean;

  // User Preferences & History (persisted)
  soundEnabled: boolean;
  recentResults: GameSessionSummary[];

  // Actions
  setActiveView: (view: AppView) => void;
  openGamesLobby: () => void;
  openPracticeLobby: () => void;
  returnToDashboard: () => void;
  setSelectedCategory: (category: GameCategory | 'All') => void;
  toggleSound: () => void;
  setActiveController: (controller: GameModuleController | null) => void;
  setCanUndoActiveGame: (canUndo: boolean) => void;
  setActiveTurnPlayerColor: (hex: string | null) => void;
  setRulesOverlayOpen: (open: boolean) => void;
  toggleRulesOverlay: () => void;

  // Game Socket Lifecycle
  launchGame: (gameId: string, defaultConfig: GameMatchConfig, isPractice?: boolean) => void;
  exitGameToLobby: () => void;
  setMatchConfigValue: (key: string, value: string | number | boolean) => void;
  addRosterPlayer: (
    name: string,
    existingId?: string,
    nickname?: string,
    preferredColorHex?: string
  ) => void;
  removeRosterPlayer: (playerId: string) => void;
  reorderRoster: (fromIndex: number, toIndex: number) => void;
  startMatch: () => void;
  pauseMatch: () => void;
  resumeMatch: () => void;
  returnToSetup: () => void;
  completeMatch: (gameTitle: string, result: GameResult) => void;
  rematch: () => void;
}

function createInitialRoster(): GamePlayer[] {
  const players = usePlayerStore.getState().getVisiblePlayers();
  return players.slice(0, 4).map((p, idx) => {
    const fallbackColor = GAME_PLAYER_COLORS[idx % GAME_PLAYER_COLORS.length];
    return {
      id: p.id,
      name: p.name,
      nickname: p.nickname,
      colorHex: p.dartColor || fallbackColor.hex,
      colorIndex: idx % GAME_PLAYER_COLORS.length,
      avatarInitial: p.name.charAt(0).toUpperCase(),
    };
  });
}

function createSoloRoster(): GamePlayer[] {
  const playerState = usePlayerStore.getState();
  const active = playerState.getActivePlayer();
  const fallbackColor = GAME_PLAYER_COLORS[0];
  return [
    {
      id: active.id,
      name: active.name,
      nickname: active.nickname,
      colorHex: active.dartColor || fallbackColor.hex,
      colorIndex: 0,
      avatarInitial: active.name.charAt(0).toUpperCase(),
    },
  ];
}

const PRACTICE_DRILL_IDS = new Set([
  'bobs-27',
  'checkout-121',
  'jdc-challenge',
  'scoring-gauntlet',
  'around-the-clock',
  'catch-40',
  'precision-sniper',
]);

export const useGameStore = create<GameStoreState>()(
  persist(
    (set, get) => ({
      activeView: 'dashboard',
      activeGameId: null,
      matchPhase: 'setup',
      selectedCategory: 'All',

      roster: [],
      matchConfig: {},
      lastResult: null,
      matchInstanceKey: 0,
      activeController: null,
      canUndoActiveGame: false,
      activeTurnPlayerColor: null,
      isRulesOverlayOpen: false,

      soundEnabled: true,
      recentResults: [],

      setActiveView: (activeView) => set({ activeView }),

      openGamesLobby: () =>
        set({
          activeView: 'games-lobby',
          activeGameId: null,
          matchPhase: 'setup',
          lastResult: null,
          activeController: null,
          canUndoActiveGame: false,
          activeTurnPlayerColor: null,
          isRulesOverlayOpen: false,
        }),

      openPracticeLobby: () =>
        set({
          activeView: 'practice-lobby',
          activeGameId: null,
          matchPhase: 'setup',
          lastResult: null,
          activeController: null,
          canUndoActiveGame: false,
          activeTurnPlayerColor: null,
          isRulesOverlayOpen: false,
        }),

      returnToDashboard: () =>
        set({
          activeView: 'dashboard',
          activeGameId: null,
          matchPhase: 'setup',
          lastResult: null,
          activeController: null,
          canUndoActiveGame: false,
          activeTurnPlayerColor: null,
          isRulesOverlayOpen: false,
        }),

      setSelectedCategory: (selectedCategory) => set({ selectedCategory }),

      toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),

      setActiveController: (activeController) => set({ activeController }),

      setCanUndoActiveGame: (canUndoActiveGame) => set({ canUndoActiveGame }),

      setActiveTurnPlayerColor: (activeTurnPlayerColor) => set({ activeTurnPlayerColor }),

      setRulesOverlayOpen: (isRulesOverlayOpen) => set({ isRulesOverlayOpen }),

      toggleRulesOverlay: () => set((s) => ({ isRulesOverlayOpen: !s.isRulesOverlayOpen })),

      launchGame: (gameId, defaultConfig, isPractice) => {
        const soloDrill = Boolean(isPractice || PRACTICE_DRILL_IDS.has(gameId));
        const currentRoster = get().roster;
        const seededRoster = soloDrill
          ? createSoloRoster()
          : currentRoster.length > 0
          ? currentRoster
          : createInitialRoster();
        set({
          activeView: 'game-active',
          activeGameId: gameId,
          matchPhase: 'setup',
          roster: seededRoster,
          matchConfig: { ...defaultConfig },
          lastResult: null,
          activeTurnPlayerColor: null,
          matchInstanceKey: get().matchInstanceKey + 1,
        });
      },

      exitGameToLobby: () => {
        gameEventBus.resetVisitBuffer();
        const wasPractice = Boolean(get().activeGameId && PRACTICE_DRILL_IDS.has(get().activeGameId!));
        set({
          activeView: wasPractice ? 'practice-lobby' : 'games-lobby',
          activeGameId: null,
          matchPhase: 'setup',
          lastResult: null,
          activeController: null,
          canUndoActiveGame: false,
          activeTurnPlayerColor: null,
          isRulesOverlayOpen: false,
        });
      },

      setMatchConfigValue: (key, value) =>
        set((s) => ({
          matchConfig: {
            ...s.matchConfig,
            [key]: value,
          },
        })),

      addRosterPlayer: (name, existingId, nickname, preferredColorHex) => {
        const trimmed = name.trim();
        if (!trimmed) return;

        set((s) => {
          if (s.roster.length >= 8) return s;
          if (existingId && s.roster.some((p) => p.id === existingId)) return s;

          const usedIndices = new Set(s.roster.map((p) => p.colorIndex));
          let colorIndex = 0;
          while (usedIndices.has(colorIndex) && colorIndex < GAME_PLAYER_COLORS.length) {
            colorIndex++;
          }
          colorIndex = colorIndex % GAME_PLAYER_COLORS.length;
          const fallbackColor = GAME_PLAYER_COLORS[colorIndex];

          const newPlayer: GamePlayer = {
            id: existingId || `guest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: trimmed,
            nickname,
            colorHex: preferredColorHex || fallbackColor.hex,
            colorIndex,
            avatarInitial: trimmed.charAt(0).toUpperCase(),
          };

          return {
            roster: [...s.roster, newPlayer],
          };
        });
      },

      removeRosterPlayer: (playerId) =>
        set((s) => ({
          roster: s.roster.filter((p) => p.id !== playerId),
        })),

      reorderRoster: (fromIndex, toIndex) =>
        set((s) => {
          if (
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= s.roster.length ||
            toIndex >= s.roster.length
          ) {
            return s;
          }
          const copy = [...s.roster];
          const [moved] = copy.splice(fromIndex, 1);
          copy.splice(toIndex, 0, moved);
          return { roster: copy };
        }),

      startMatch: () => {
        gameEventBus.resetVisitBuffer();
        set((s) => ({
          matchPhase: 'playing',
          lastResult: null,
          isRulesOverlayOpen: false,
          matchInstanceKey: s.matchInstanceKey + 1,
        }));
      },

      pauseMatch: () => set({ matchPhase: 'paused' }),

      resumeMatch: () => set({ matchPhase: 'playing' }),

      returnToSetup: () => {
        gameEventBus.resetVisitBuffer();
        set({
          matchPhase: 'setup',
          lastResult: null,
          activeController: null,
          canUndoActiveGame: false,
          activeTurnPlayerColor: null,
          isRulesOverlayOpen: false,
        });
      },

      completeMatch: (gameTitle, result) => {
        const summary: GameSessionSummary = {
          id: `gsum-${Date.now()}`,
          gameId: result.gameId,
          gameTitle,
          winnerName: result.winnerName,
          playerCount: result.standings.length,
          headline: result.headline,
          completedAt: result.completedAt,
        };
        const isPartyMode = usePlayerStore.getState().isPartyMode;
        const winnerColor =
          result.standings.find((st) => st.rank === 1)?.colorHex ?? null;
        set((s) => ({
          matchPhase: 'finished',
          lastResult: result,
          activeTurnPlayerColor: winnerColor,
          // Never persist Party Mode match history into localStorage
          recentResults: isPartyMode ? s.recentResults : [summary, ...s.recentResults].slice(0, 20),
        }));

        // Log arcade/practice game played/won into Career Vault & Hall of Fame Leaderboards
        const careerStore = useCareerStore.getState();
        const gameMode = PRACTICE_DRILL_IDS.has(result.gameId) ? 'practice' : 'arcade';
        for (const standing of result.standings) {
          careerStore.recordArcadeResultForPlayer(
            standing.playerId,
            standing.playerName,
            gameTitle,
            standing.rank === 1
          );
          const rawNum =
            typeof standing.primaryStatValue === 'number'
              ? standing.primaryStatValue
              : parseFloat(String(standing.primaryStatValue).replace(/[^0-9.-]/g, ''));
          const statNum = Number.isFinite(rawNum) ? rawNum : 0;
          const lowerIsBetter =
            result.gameId === 'darts-golf' ||
            ((result.gameId === 'demolition' ||
              result.gameId === 'around-the-clock' ||
              result.gameId === 'precision-sniper') &&
              standing.primaryStatLabel.toLowerCase().includes('dart'));
          careerStore.recordLeaderboardPerformance({
            gameId: result.gameId,
            gameTitle,
            mode: gameMode,
            playerId: standing.playerId,
            playerName: standing.playerName,
            colorHex: standing.colorHex,
            didWin: standing.rank === 1 && result.winnerId !== null,
            statValue: statNum,
            statDisplay: `${standing.primaryStatValue} ${standing.primaryStatLabel}`,
            statLabel: standing.primaryStatLabel,
            lowerIsBetter,
          });
        }
      },

      rematch: () => {
        gameEventBus.resetVisitBuffer();
        set((s) => ({
          matchPhase: 'playing',
          lastResult: null,
          matchInstanceKey: s.matchInstanceKey + 1,
        }));
      },
    }),
    {
      name: 'autodarts_games_store_v1',
      partialize: (state) => ({
        soundEnabled: state.soundEnabled,
        recentResults: state.recentResults,
      }),
    }
  )
);
