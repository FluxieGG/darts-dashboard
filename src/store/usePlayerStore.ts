import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PlayerProfile, PlayerStats } from '../types/stats';
import { createEmptyPlayerStats, createEmptySegmentAccuracy } from '../services/simulator';
import { DEFAULT_DART_COLOR, getDartColorLabel } from '../lib/playerThemes';

export interface AddPlayerOptions {
  nickname?: string;
  dartColor?: string;
  isSaved?: boolean;
}

interface PlayerState {
  activePlayerId: string;
  players: PlayerProfile[];
  playerStats: Record<string, PlayerStats>;

  // Ephemeral RAM-only Party Mode state (NEVER persisted to localStorage)
  isPartyMode: boolean;
  partyStats: PlayerStats;

  // Actions
  setActivePlayer: (playerId: string) => void;
  addPlayer: (name: string, optionsOrNickname?: string | AddPlayerOptions) => string;
  updatePlayerProfile: (
    playerId: string,
    updates: Partial<Pick<PlayerProfile, 'name' | 'nickname' | 'dartColor' | 'dartColorName' | 'isSaved'>>
  ) => void;
  removePlayer: (playerId: string) => void;
  getActivePlayer: () => PlayerProfile;
  getActiveStats: () => PlayerStats;
  updateActiveStats: (updater: (prev: PlayerStats) => PlayerStats) => void;
  resetSessionStats: (playerId?: string) => void;

  // Party Mode actions
  startPartyMode: () => void;
  stopPartyMode: () => void;
}

const PRIMARY_PLAYER: PlayerProfile = {
  id: 'player-callum',
  name: 'Callum',
  isPrimary: true,
  isSaved: true,
  dartColor: DEFAULT_DART_COLOR,
  dartColorName: 'Emerald',
};

const PARTY_PLAYER: PlayerProfile = {
  id: 'party-session',
  name: 'Party Session',
  nickname: 'Unsaved Guest Mode',
  isPrimary: false,
};

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      activePlayerId: PRIMARY_PLAYER.id,
      players: [PRIMARY_PLAYER],
      playerStats: {
        [PRIMARY_PLAYER.id]: createEmptyPlayerStats(PRIMARY_PLAYER.id, PRIMARY_PLAYER.name),
      },

      isPartyMode: false,
      partyStats: createEmptyPlayerStats(PARTY_PLAYER.id, PARTY_PLAYER.name),

      startPartyMode: () => {
        set({
          isPartyMode: true,
          partyStats: createEmptyPlayerStats(PARTY_PLAYER.id, PARTY_PLAYER.name),
        });
      },

      stopPartyMode: () => {
        set({
          isPartyMode: false,
          partyStats: createEmptyPlayerStats(PARTY_PLAYER.id, PARTY_PLAYER.name),
        });
      },

      setActivePlayer: (playerId: string) => {
        const exists = get().players.some((p) => p.id === playerId);
        if (exists) {
          set({ activePlayerId: playerId });
        }
      },

      addPlayer: (name: string, optionsOrNickname?: string | AddPlayerOptions) => {
        const opts: AddPlayerOptions =
          typeof optionsOrNickname === 'string'
            ? { nickname: optionsOrNickname }
            : optionsOrNickname || {};

        const id = `player-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        const dartColor = opts.dartColor || DEFAULT_DART_COLOR;
        const isSaved = opts.isSaved ?? true;

        const newProfile: PlayerProfile = {
          id,
          name,
          nickname: opts.nickname,
          isPrimary: false,
          dartColor,
          dartColorName: getDartColorLabel(dartColor),
          isSaved,
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

      updatePlayerProfile: (playerId, updates) => {
        set((state) => ({
          players: state.players.map((p) => {
            if (p.id !== playerId) return p;
            const nextColor = updates.dartColor ?? p.dartColor ?? DEFAULT_DART_COLOR;
            return {
              ...p,
              ...updates,
              dartColor: nextColor,
              dartColorName:
                updates.dartColorName ??
                (updates.dartColor ? getDartColorLabel(nextColor) : p.dartColorName ?? getDartColorLabel(nextColor)),
            };
          }),
        }));
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
        if (state.isPartyMode) {
          return PARTY_PLAYER;
        }
        return (
          state.players.find((p) => p.id === state.activePlayerId) || state.players[0]
        );
      },

      getActiveStats: () => {
        const state = get();
        if (state.isPartyMode) {
          return state.partyStats;
        }
        const stats = state.playerStats[state.activePlayerId];
        if (stats) return stats;
        return createEmptyPlayerStats(state.activePlayerId, PRIMARY_PLAYER.name);
      },

      updateActiveStats: (updater) => {
        set((state) => {
          // In Party Mode, mutate ONLY the ephemeral RAM-only partyStats object
          if (state.isPartyMode) {
            return {
              partyStats: updater(state.partyStats),
            };
          }
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
          // If Party Mode is active and no explicit playerId was passed, reset ONLY partyStats
          if (state.isPartyMode && !playerId) {
            return {
              partyStats: createEmptyPlayerStats(PARTY_PLAYER.id, PARTY_PLAYER.name),
            };
          }

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
      // Persist ONLY saved accounts (isPrimary or isSaved !== false) and NEVER Party Mode data
      partialize: (state) => {
        const savedPlayers = state.players.filter((p) => p.isPrimary || p.isSaved !== false);
        const savedIds = new Set(savedPlayers.map((p) => p.id));
        const savedStats: Record<string, PlayerStats> = {};
        for (const [id, stats] of Object.entries(state.playerStats)) {
          if (savedIds.has(id)) {
            savedStats[id] = stats;
          }
        }
        return {
          activePlayerId: savedIds.has(state.activePlayerId)
            ? state.activePlayerId
            : savedPlayers[0]?.id || PRIMARY_PLAYER.id,
          players: savedPlayers,
          playerStats: savedStats,
        };
      },
    }
  )
);
