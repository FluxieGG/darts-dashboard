import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { PlayerProfile, PlayerStats } from '../types/stats';
import { createEmptyPlayerStats, createEmptySegmentAccuracy } from '../services/simulator';
import { DEFAULT_DART_COLOR, getDartColorLabel } from '../lib/playerThemes';
import { safeLocalStorage } from '../lib/storage';

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
  activePartyPlayerId: string;
  partyPlayers: PlayerProfile[];
  partyPlayerStats: Record<string, PlayerStats>;
  partyStats: PlayerStats;

  // Actions
  setActivePlayer: (playerId: string) => void;
  addPlayer: (name: string, optionsOrNickname?: string | AddPlayerOptions) => string;
  updatePlayerProfile: (
    playerId: string,
    updates: Partial<Pick<PlayerProfile, 'name' | 'nickname' | 'dartColor' | 'dartColorName' | 'isSaved'>>
  ) => void;
  removePlayer: (playerId: string) => void;
  getVisiblePlayers: () => PlayerProfile[];
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

const PARTY_DEFAULT_PLAYER: PlayerProfile = {
  id: 'party-session',
  name: 'Party Guest',
  nickname: 'Temp Party Profile',
  isPrimary: false,
  isSaved: false,
  dartColor: '#C084FC',
  dartColorName: 'Purple',
};

function createInitializedPlayerStats(playerId: string, playerName: string): PlayerStats {
  return {
    ...createEmptyPlayerStats(playerId, playerName),
    totalPointsScored: 0,
    firstNinePoints: 0,
    firstNineDartsCount: 0,
  };
}

export const EMPTY_PLAYER_STATS: PlayerStats = Object.freeze(
  createInitializedPlayerStats(PRIMARY_PLAYER.id, PRIMARY_PLAYER.name)
);

function createFreshPartyState() {
  const freshStats = createInitializedPlayerStats(PARTY_DEFAULT_PLAYER.id, PARTY_DEFAULT_PLAYER.name);
  return {
    activePartyPlayerId: PARTY_DEFAULT_PLAYER.id,
    partyPlayers: [{ ...PARTY_DEFAULT_PLAYER }],
    partyPlayerStats: {
      [PARTY_DEFAULT_PLAYER.id]: freshStats,
    },
    partyStats: freshStats,
  };
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      activePlayerId: PRIMARY_PLAYER.id,
      players: [PRIMARY_PLAYER],
      playerStats: {
        [PRIMARY_PLAYER.id]: createInitializedPlayerStats(PRIMARY_PLAYER.id, PRIMARY_PLAYER.name),
      },

      isPartyMode: false,
      ...createFreshPartyState(),

      startPartyMode: () => {
        set({
          isPartyMode: true,
          ...createFreshPartyState(),
        });
      },

      stopPartyMode: () => {
        set({
          isPartyMode: false,
          ...createFreshPartyState(),
        });
      },

      setActivePlayer: (playerId: string) => {
        const state = get();
        if (state.isPartyMode) {
          const exists = state.partyPlayers.some((p) => p.id === playerId);
          if (exists) {
            const nextStats =
              state.partyPlayerStats[playerId] ||
              createInitializedPlayerStats(playerId, PARTY_DEFAULT_PLAYER.name);
            set({ activePartyPlayerId: playerId, partyStats: nextStats });
          }
          return;
        }
        const exists = state.players.some((p) => p.id === playerId);
        if (exists) {
          set({ activePlayerId: playerId });
        }
      },

      addPlayer: (name: string, optionsOrNickname?: string | AddPlayerOptions) => {
        const opts: AddPlayerOptions =
          typeof optionsOrNickname === 'string'
            ? { nickname: optionsOrNickname }
            : optionsOrNickname || {};

        const state = get();
        const dartColor = opts.dartColor || (state.isPartyMode ? '#C084FC' : DEFAULT_DART_COLOR);

        // In Party Mode, EVERY newly added player is strictly temporary (RAM-only, never saved!)
        if (state.isPartyMode) {
          const id = `party-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
          const tempProfile: PlayerProfile = {
            id,
            name,
            nickname: opts.nickname || 'Temp Party Guest',
            isPrimary: false,
            dartColor,
            dartColorName: getDartColorLabel(dartColor),
            isSaved: false,
          };
          const newStats = createInitializedPlayerStats(id, name);
          set((s) => ({
            partyPlayers: [...s.partyPlayers, tempProfile],
            partyPlayerStats: {
              ...s.partyPlayerStats,
              [id]: newStats,
            },
            activePartyPlayerId: id,
            partyStats: newStats,
          }));
          return id;
        }

        const id = `player-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
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
        const newStats = createInitializedPlayerStats(id, name);

        set((s) => ({
          players: [...s.players, newProfile],
          playerStats: {
            ...s.playerStats,
            [id]: newStats,
          },
          activePlayerId: id,
        }));

        return id;
      },

      updatePlayerProfile: (playerId, updates) => {
        set((state) => {
          if (state.isPartyMode) {
            return {
              partyPlayers: state.partyPlayers.map((p) => {
                if (p.id !== playerId) return p;
                const nextColor = updates.dartColor ?? p.dartColor ?? '#C084FC';
                return {
                  ...p,
                  ...updates,
                  isSaved: false,
                  dartColor: nextColor,
                  dartColorName:
                    updates.dartColorName ??
                    (updates.dartColor
                      ? getDartColorLabel(nextColor)
                      : p.dartColorName ?? getDartColorLabel(nextColor)),
                };
              }),
            };
          }

          return {
            players: state.players.map((p) => {
              if (p.id !== playerId) return p;
              const nextColor = updates.dartColor ?? p.dartColor ?? DEFAULT_DART_COLOR;
              return {
                ...p,
                ...updates,
                dartColor: nextColor,
                dartColorName:
                  updates.dartColorName ??
                  (updates.dartColor
                    ? getDartColorLabel(nextColor)
                    : p.dartColorName ?? getDartColorLabel(nextColor)),
              };
            }),
          };
        });
      },

      removePlayer: (playerId: string) => {
        const state = get();
        if (state.isPartyMode) {
          if (playerId === PARTY_DEFAULT_PLAYER.id) return;
          const remaining = state.partyPlayers.filter((p) => p.id !== playerId);
          const remainingStats = { ...state.partyPlayerStats };
          delete remainingStats[playerId];
          const nextActiveId =
            state.activePartyPlayerId === playerId
              ? remaining[0]?.id || PARTY_DEFAULT_PLAYER.id
              : state.activePartyPlayerId;
          set({
            partyPlayers: remaining,
            partyPlayerStats: remainingStats,
            activePartyPlayerId: nextActiveId,
            partyStats:
              remainingStats[nextActiveId] ||
              createInitializedPlayerStats(PARTY_DEFAULT_PLAYER.id, PARTY_DEFAULT_PLAYER.name),
          });
          return;
        }

        const target = state.players.find((p) => p.id === playerId);
        if (!target || target.isPrimary) return;

        const remainingPlayers = state.players.filter((p) => p.id !== playerId);
        const safePlayers = remainingPlayers.length > 0 ? remainingPlayers : [PRIMARY_PLAYER];
        const remainingStats = { ...state.playerStats };
        delete remainingStats[playerId];

        set({
          players: safePlayers,
          playerStats: remainingStats,
          activePlayerId:
            state.activePlayerId === playerId ? safePlayers[0].id : state.activePlayerId,
        });
      },

      getVisiblePlayers: () => {
        const state = get();
        return state.isPartyMode ? state.partyPlayers : state.players;
      },

      getActivePlayer: () => {
        const state = get();
        if (state.isPartyMode) {
          return (
            state.partyPlayers.find((p) => p.id === state.activePartyPlayerId) ||
            state.partyPlayers[0] ||
            PARTY_DEFAULT_PLAYER
          );
        }
        return (
          state.players.find((p) => p.id === state.activePlayerId) ||
          state.players[0] ||
          PRIMARY_PLAYER
        );
      },

      getActiveStats: () => {
        const state = get();
        if (state.isPartyMode) {
          return (
            state.partyPlayerStats[state.activePartyPlayerId] ||
            state.partyStats ||
            EMPTY_PLAYER_STATS
          );
        }
        const stats = state.playerStats[state.activePlayerId];
        if (stats) return stats;
        return EMPTY_PLAYER_STATS;
      },

      updateActiveStats: (updater) => {
        set((state) => {
          // In Party Mode, mutate ONLY the ephemeral RAM-only partyPlayerStats object
          if (state.isPartyMode) {
            const partyId = state.activePartyPlayerId;
            const partyProfile =
              state.partyPlayers.find((p) => p.id === partyId) || PARTY_DEFAULT_PLAYER;
            const current =
              state.partyPlayerStats[partyId] ||
              createInitializedPlayerStats(partyProfile.id, partyProfile.name);
            const updated = updater(current);
            return {
              partyStats: updated,
              partyPlayerStats: {
                ...state.partyPlayerStats,
                [partyId]: updated,
              },
            };
          }
          const activeId = state.activePlayerId;
          const activeProfile =
            state.players.find((p) => p.id === activeId) || PRIMARY_PLAYER;
          const current =
            state.playerStats[activeId] ||
            createInitializedPlayerStats(activeId, activeProfile.name);
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
          // In Party Mode, reset ONLY the ephemeral RAM-only party player's stats
          if (state.isPartyMode) {
            const targetId = playerId || state.activePartyPlayerId;
            const profile =
              state.partyPlayers.find((p) => p.id === targetId) || PARTY_DEFAULT_PLAYER;
            const fresh = createInitializedPlayerStats(profile.id, profile.name);
            return {
              partyStats: targetId === state.activePartyPlayerId ? fresh : state.partyStats,
              partyPlayerStats: {
                ...state.partyPlayerStats,
                [targetId]: fresh,
              },
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
            totalPointsScored: 0,
            firstNinePoints: 0,
            firstNineDartsCount: 0,
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
      storage: createJSONStorage(() => safeLocalStorage),
      // Persist ONLY saved accounts (isPrimary or isSaved !== false) and NEVER Party Mode data
      partialize: (state) => {
        const savedPlayers = state.players.filter((p) => p.isPrimary || p.isSaved !== false);
        const safePlayers = savedPlayers.length > 0 ? savedPlayers : [PRIMARY_PLAYER];
        const savedIds = new Set(safePlayers.map((p) => p.id));
        const savedStats: Record<string, PlayerStats> = {};
        for (const [id, stats] of Object.entries(state.playerStats)) {
          if (savedIds.has(id)) {
            savedStats[id] = stats;
          }
        }
        return {
          activePlayerId: savedIds.has(state.activePlayerId)
            ? state.activePlayerId
            : safePlayers[0].id,
          players: safePlayers,
          playerStats: savedStats,
        };
      },
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<PlayerState>) || {};
        const rawPlayers = Array.isArray(persisted.players)
          ? persisted.players.filter((p): p is PlayerProfile => Boolean(p && p.id))
          : [];
        const players = rawPlayers.length > 0 ? rawPlayers : [PRIMARY_PLAYER];
        const playerIds = new Set(players.map((p) => p.id));
        const activePlayerId =
          persisted.activePlayerId && playerIds.has(persisted.activePlayerId)
            ? persisted.activePlayerId
            : players[0].id;
        const mergedStats: Record<string, PlayerStats> = {
          ...currentState.playerStats,
          ...(persisted.playerStats && typeof persisted.playerStats === 'object'
            ? persisted.playerStats
            : {}),
        };
        for (const player of players) {
          if (!mergedStats[player.id]) {
            mergedStats[player.id] = createInitializedPlayerStats(player.id, player.name);
          }
        }
        return {
          ...currentState,
          activePlayerId,
          players,
          playerStats: mergedStats,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!Array.isArray(state.players) || state.players.length === 0) {
          state.players = [PRIMARY_PLAYER];
        }
        if (!state.playerStats || typeof state.playerStats !== 'object') {
          state.playerStats = {};
        }
        for (const player of state.players) {
          if (!state.playerStats[player.id]) {
            state.playerStats[player.id] = createInitializedPlayerStats(player.id, player.name);
          }
        }
        if (!state.players.some((p) => p.id === state.activePlayerId)) {
          state.activePlayerId = state.players[0].id;
        }
      },
    }
  )
);
