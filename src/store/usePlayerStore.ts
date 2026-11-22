import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PlayerProfile, PlayerStats } from '../types/stats';
import { createEmptyPlayerStats, createEmptySegmentAccuracy } from '../services/simulator';

interface PlayerState {
  activePlayerId: string;
  players: PlayerProfile[];
  playerStats: Record<string, PlayerStats>;

  // Actions
  setActivePlayer: (playerId: string) => void;
  addPlayer: (name: string, nickname?: string) => string;
  removePlayer: (playerId: string) => void;
  getActivePlayer: () => PlayerProfile;
  getActiveStats: () => PlayerStats;
  updateActiveStats: (updater: (prev: PlayerStats) => PlayerStats) => void;
  resetSessionStats: (playerId?: string) => void;
}

const PRIMARY_PLAYER: PlayerProfile = {
  id: 'player-callum',
  name: 'Callum',
  isPrimary: true,
};

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      activePlayerId: PRIMARY_PLAYER.id,
      players: [PRIMARY_PLAYER],
      playerStats: {
        [PRIMARY_PLAYER.id]: createEmptyPlayerStats(PRIMARY_PLAYER.id, PRIMARY_PLAYER.name),
      },

      setActivePlayer: (playerId: string) => {
        const exists = get().players.some((p) => p.id === playerId);
        if (exists) {
          set({ activePlayerId: playerId });
        }
      },

      addPlayer: (name: string, nickname?: string) => {
        const id = `player-${Date.now()}`;
        const newProfile: PlayerProfile = {
          id,
          name,
          nickname,
          isPrimary: false,
        };
        const newStats = createEmptyPlayerStats(id, name);

        set((state) => ({
          players: [...state.players, newProfile],
          playerStats: {
            ...state.playerStats,
            [id]: newStats,
          },
          activePlayerId: id,
        }));

        return id;
      },

      removePlayer: (playerId: string) => {
        const state = get();
        const target = state.players.find((p) => p.id === playerId);
        if (!target || target.isPrimary) return;

        const remainingPlayers = state.players.filter((p) => p.id !== playerId);
        const remainingStats = { ...state.playerStats };
        delete remainingStats[playerId];

        set({
          players: remainingPlayers,
          playerStats: remainingStats,
          activePlayerId:
            state.activePlayerId === playerId ? remainingPlayers[0].id : state.activePlayerId,
        });
      },

      getActivePlayer: () => {
        const state = get();
        return (
          state.players.find((p) => p.id === state.activePlayerId) || state.players[0]
        );
      },

      getActiveStats: () => {
        const state = get();
        const stats = state.playerStats[state.activePlayerId];
        if (stats) return stats;
        return createEmptyPlayerStats(state.activePlayerId, PRIMARY_PLAYER.name);
      },

      updateActiveStats: (updater) => {
        set((state) => {
          const activeId = state.activePlayerId;
          const current =
            state.playerStats[activeId] || createEmptyPlayerStats(activeId, PRIMARY_PLAYER.name);
          const updated = updater(current);
          return {
            playerStats: {
              ...state.playerStats,
              [activeId]: updated,
            },
          };
        });
      },

      resetSessionStats: (playerId) => {
        set((state) => {
          const targetId = playerId || state.activePlayerId;
          const existing = state.playerStats[targetId];
          if (!existing) return state;

          const reset: PlayerStats = {
            ...existing,
            threeDartAvg: 0,
            firstNineAvg: 0,
            checkoutHits: 0,
            checkoutAttempts: 0,
            checkoutPct: 0,
            highestVisit: 0,
            highestCheckout: 0,
            tonBreakdown: {
              ton60Plus: 0,
              ton100Plus: 0,
              ton140Plus: 0,
              ton180: 0,
              totalVisits: 0,
            },
            segmentAccuracy: createEmptySegmentAccuracy(),
            trendHistory: [],
            recentVisits: [],
            sessionThrows: [],
            totalDartsThrown: 0,
          };

          return {
            playerStats: {
              ...state.playerStats,
              [targetId]: reset,
            },
          };
        });
      },
    }),
    {
      name: 'autodarts_dashboard_players_v2',
    }
  )
);
