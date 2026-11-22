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

  // User Preferences & History (persisted)
  soundEnabled: boolean;
  recentResults: GameSessionSummary[];

  // Actions
  setActiveView: (view: AppView) => void;
  openGamesLobby: () => void;
  returnToDashboard: () => void;
  setSelectedCategory: (category: GameCategory | 'All') => void;
  toggleSound: () => void;
  setActiveController: (controller: GameModuleController | null) => void;
  setCanUndoActiveGame: (canUndo: boolean) => void;
  setActiveTurnPlayerColor: (hex: string | null) => void;

  // Game Socket Lifecycle
  launchGame: (gameId: string, defaultConfig: GameMatchConfig) => void;
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
  completeMatch: (gameTitle: string, result: GameResult) => void;
  rematch: () => void;
}

function createInitialRoster(): GamePlayer[] {
  const players = usePlayerStore.getState().players;
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
        }),

      setSelectedCategory: (selectedCategory) => set({ selectedCategory }),

      toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),

      setActiveController: (activeController) => set({ activeController }),

      setCanUndoActiveGame: (canUndoActiveGame) => set({ canUndoActiveGame }),

      setActiveTurnPlayerColor: (activeTurnPlayerColor) => set({ activeTurnPlayerColor }),

      launchGame: (gameId, defaultConfig) => {
        const currentRoster = get().roster;
        const seededRoster = currentRoster.length > 0 ? currentRoster : createInitialRoster();
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

      exitGameToLobby: () =>
        set({
          activeView: 'games-lobby',
          activeGameId: null,
          matchPhase: 'setup',
          lastResult: null,
          activeTurnPlayerColor: null,
        }),

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
          matchInstanceKey: s.matchInstanceKey + 1,
        }));
      },

      pauseMatch: () => set({ matchPhase: 'paused' }),

      resumeMatch: () => set({ matchPhase: 'playing' }),

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
        const winnerColor =
          result.standings.find((st) => st.rank === 1)?.colorHex ?? null;
        set((s) => ({
          matchPhase: 'finished',
          lastResult: result,
          activeTurnPlayerColor: winnerColor,
          recentResults: [summary, ...s.recentResults].slice(0, 20),
        }));

        // Log arcade game played/won into Career Vault for any saved player in the match
        const careerStore = useCareerStore.getState();
        for (const standing of result.standings) {
          careerStore.recordArcadeResultForPlayer(
            standing.playerId,
            standing.playerName,
            gameTitle,
            standing.rank === 1
          );
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
