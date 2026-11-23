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

function createFreshPartyState() {
  const freshStats = createEmptyPlayerStats(PARTY_DEFAULT_PLAYER.id, PARTY_DEFAULT_PLAYER.name);
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
        [PRIMARY_PLAYER.id]: createEmptyPlayerStats(PRIMARY_PLAYER.id, PRIMARY_PLAYER.name),
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
              createEmptyPlayerStats(playerId, PARTY_DEFAULT_PLAYER.name);
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
          const newStats = createEmptyPlayerStats(id, name);
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
        const newStats = createEmptyPlayerStats(id, name);

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
              createEmptyPlayerStats(PARTY_DEFAULT_PLAYER.id, PARTY_DEFAULT_PLAYER.name),
          });
          return;
        }

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
          state.players.find((p) => p.id === state.activePlayerId) || state.players[0]
        );
      },

      getActiveStats: () => {
        const state = get();
        if (state.isPartyMode) {
          return (
            state.partyPlayerStats[state.activePartyPlayerId] ||
            state.partyStats
          );
        }
        const stats = state.playerStats[state.activePlayerId];
        if (stats) return stats;
        return createEmptyPlayerStats(state.activePlayerId, PRIMARY_PLAYER.name);
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
              createEmptyPlayerStats(partyProfile.id, partyProfile.name);
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
          // In Party Mode, reset ONLY the ephemeral RAM-only party player's stats
          if (state.isPartyMode) {
            const targetId = playerId || state.activePartyPlayerId;
            const profile =
              state.partyPlayers.find((p) => p.id === targetId) || PARTY_DEFAULT_PLAYER;
            const fresh = createEmptyPlayerStats(profile.id, profile.name);
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
