import { create } from 'zustand';
import { DartThrow } from '../types/darts';
import {
  CareerVaultData,
  DailyCareerLog,
  GameLeaderboardEntry,
  PlayerCareerVault,
} from '../types/career';
import {
  addDaysToDateKey,
  applyArcadeGameToCareerVault,
  applyVisitToCareerVault,
  createEmptyPlayerVault,
  createEmptyRecords,
  evaluateObjectives,
  getLocalDateKey,
  getWeekStartKey,
  isValidDateKey,
} from '../lib/careerEngine';
import { safeLocalStorage } from '../lib/storage';
import { usePlayerStore } from './usePlayerStore';
import { useGameStore } from './useGameStore';
import { soundEngine } from '../games/utils/soundEngine';

const LOCAL_FALLBACK_KEY = 'autodarts_career_vault_v1';
const OBJECTIVE_RETENTION_DAYS = 14;
const MAX_KEEPALIVE_BYTES = 60 * 1024;
const UNLOAD_GUARD_KEY = '__autodartsCareerUnloadFlushHandler__';

export const EMPTY_PLAYER_VAULT: PlayerCareerVault = Object.freeze({
  playerId: '',
  playerName: '',
  dailyLogs: Object.freeze({}) as Record<string, DailyCareerLog>,
  records: Object.freeze(createEmptyRecords()),
  objectiveRerolls: Object.freeze({}) as Record<string, number>,
  completedObjectiveIds: Object.freeze([]) as unknown as string[],
});

function pruneExpiredObjectiveIds(ids: string[], now: Date = new Date()): string[] {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const cutoffKey = addDaysToDateKey(getLocalDateKey(now), -OBJECTIVE_RETENTION_DAYS);
  if (!cutoffKey) return ids;
  return ids.filter((id) => {
    if (typeof id !== 'string') return false;
    const match = id.match(/^[dw]-(\d{4}-\d{2}-\d{2})-/);
    if (!match) return true;
    const dateKey = match[1];
    return isValidDateKey(dateKey) && dateKey >= cutoffKey;
  });
}

function pruneExpiredObjectiveRerolls(
  rerolls: Record<string, number>,
  now: Date = new Date()
): Record<string, number> {
  if (!rerolls || typeof rerolls !== 'object') return {};
  const cutoffKey = addDaysToDateKey(getLocalDateKey(now), -OBJECTIVE_RETENTION_DAYS);
  if (!cutoffKey) return { ...rerolls };
  const pruned: Record<string, number> = {};
  for (const [key, val] of Object.entries(rerolls)) {
    const match = key.match(/^(?:daily|weekly):(\d{4}-\d{2}-\d{2})$/);
    if (match) {
      const dateKey = match[1];
      if (isValidDateKey(dateKey) && dateKey >= cutoffKey) {
        pruned[key] = val;
      }
    } else {
      pruned[key] = val;
    }
  }
  return pruned;
}

interface LeaderboardRecordInput {
  gameId: string;
  gameTitle: string;
  mode: 'arcade' | 'practice' | 'online';
  playerId: string;
  playerName: string;
  colorHex: string;
  didWin: boolean;
  statValue: number;
  statDisplay: string;
  statLabel: string;
  lowerIsBetter?: boolean;
}

interface CareerStoreState {
  vault: CareerVaultData;
  /** Ephemeral RAM-only Career Vaults & Leaderboards for Party Mode (NEVER saved to disk/localStorage) */
  partyVaults: Record<string, PlayerCareerVault>;
  partyLeaderboards: Record<string, GameLeaderboardEntry[]>;
  isDiskSynced: boolean;
  lastSavedAt: number | null;
  recentlyCompletedObjective: string | null;

  // Lifecycle
  hydrateVault: () => Promise<void>;
  resetPartyCareerData: () => void;
  getPlayerVault: (playerId: string, playerName?: string) => PlayerCareerVault;

  // Recorders (work live in Party Mode using RAM-only temp vaults — zero disk writes!)
  recordVisitForActivePlayer: (throws: DartThrow[]) => void;
  recordArcadeResultForPlayer: (playerId: string, playerName: string, gameTitle: string, didWin: boolean) => void;
  recordLeaderboardPerformance: (entry: LeaderboardRecordInput) => void;

  // Objective Management
  rerollObjectives: (playerId: string, period: 'daily' | 'weekly') => void;
  dismissObjectiveToast: () => void;

  // Backup / Reset
  importVaultData: (data: CareerVaultData) => void;
  clearPlayerVault: (playerId: string) => void;
}

function loadLocalFallback(): CareerVaultData {
  try {
    const raw = safeLocalStorage.getItem(LOCAL_FALLBACK_KEY);
    if (raw && typeof raw === 'string') {
      const parsed = JSON.parse(raw) as CareerVaultData;
      if (parsed && typeof parsed === 'object' && parsed.players) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return { version: 1, players: {}, updatedAt: 0 };
}

let diskSaveTimer: number | null = null;
let pendingDiskVault: CareerVaultData | null = null;
let hydrateInFlightPromise: Promise<void> | null = null;

function saveVaultToDisk(
  vault: CareerVaultData,
  onDiskSaved: (savedAt: number, ok: boolean) => void
): Promise<void> {
  return fetch('/api/career/vault', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(vault),
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data?.ok) {
        onDiskSaved(data.savedAt || Date.now(), true);
      } else {
        onDiskSaved(Date.now(), false);
      }
    })
    .catch(() => {
      onDiskSaved(Date.now(), false);
    });
}

function flushPendingVaultOnUnload(): void {
  if (diskSaveTimer !== null) {
    window.clearTimeout(diskSaveTimer);
    diskSaveTimer = null;
  }
  if (!pendingDiskVault) return;
  const vaultToFlush = pendingDiskVault;
  pendingDiskVault = null;

  try {
    const body = JSON.stringify(vaultToFlush);
    const byteLength =
      typeof TextEncoder !== 'undefined'
        ? new TextEncoder().encode(body).byteLength
        : body.length;
    if (byteLength <= MAX_KEEPALIVE_BYTES) {
      void fetch('/api/career/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {
        // ignore unload errors
      });
    } else {
      void fetch('/api/career/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }).catch(() => {
        // ignore unload errors
      });
    }
  } catch {
    // ignore serialization errors on unload
  }
}

if (typeof window !== 'undefined') {
  const win = window as unknown as Record<string, (() => void) | undefined>;
  const prevHandler = win[UNLOAD_GUARD_KEY];
  if (prevHandler) {
    window.removeEventListener('beforeunload', prevHandler);
    window.removeEventListener('pagehide', prevHandler);
  }
  win[UNLOAD_GUARD_KEY] = flushPendingVaultOnUnload;
  window.addEventListener('beforeunload', flushPendingVaultOnUnload);
  window.addEventListener('pagehide', flushPendingVaultOnUnload);
}

function persistVault(vault: CareerVaultData, onDiskSaved: (savedAt: number, ok: boolean) => void): void {
  try {
    safeLocalStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(vault));
  } catch {
    // ignore quota errors
  }

  pendingDiskVault = vault;
  if (diskSaveTimer !== null) {
    window.clearTimeout(diskSaveTimer);
  }
  diskSaveTimer = window.setTimeout(() => {
    diskSaveTimer = null;
    const toSave = pendingDiskVault;
    pendingDiskVault = null;
    if (!toSave) return;
    void saveVaultToDisk(toSave, onDiskSaved);
  }, 350);
}

function upsertLeaderboardEntry(
  prevBoards: Record<string, GameLeaderboardEntry[]>,
  input: LeaderboardRecordInput
): Record<string, GameLeaderboardEntry[]> {
  const prevList = prevBoards[input.gameId] ? [...prevBoards[input.gameId]] : [];
  const existingIdx = prevList.findIndex((e) => e.playerId === input.playerId);
  const now = Date.now();

  if (existingIdx >= 0) {
    const existing = prevList[existingIdx];
    const isBetter =
      Number.isFinite(input.statValue) &&
      (input.lowerIsBetter
        ? input.gameId === 'darts-golf'
          ? input.statValue < existing.bestStatValue
          : input.statValue > 0 &&
            (existing.bestStatValue <= 0 || input.statValue < existing.bestStatValue)
        : input.statValue > existing.bestStatValue);

    prevList[existingIdx] = {
      ...existing,
      gameTitle: input.gameTitle,
      playerName: input.playerName,
      colorHex: input.colorHex || existing.colorHex,
      wins: existing.wins + (input.didWin ? 1 : 0),
      gamesPlayed: existing.gamesPlayed + 1,
      bestStatValue: isBetter ? input.statValue : existing.bestStatValue,
      bestStatDisplay: isBetter ? input.statDisplay : existing.bestStatDisplay,
      bestStatLabel: input.statLabel || existing.bestStatLabel,
      lowerIsBetter: input.lowerIsBetter ?? existing.lowerIsBetter,
      lastPlayedAt: now,
    };
  } else {
    prevList.push({
      gameId: input.gameId,
      gameTitle: input.gameTitle,
      mode: input.mode,
      playerId: input.playerId,
      playerName: input.playerName,
      colorHex: input.colorHex || '#10B981',
      wins: input.didWin ? 1 : 0,
      gamesPlayed: 1,
      bestStatValue: Number.isFinite(input.statValue) ? input.statValue : 0,
      bestStatDisplay: input.statDisplay,
      bestStatLabel: input.statLabel,
      lowerIsBetter: input.lowerIsBetter,
      lastPlayedAt: now,
    });
  }

  return {
    ...prevBoards,
    [input.gameId]: prevList,
  };
}

export const useCareerStore = create<CareerStoreState>((set, get) => ({
  vault: loadLocalFallback(),
  partyVaults: {},
  partyLeaderboards: {},
  isDiskSynced: false,
  lastSavedAt: null,
  recentlyCompletedObjective: null,

  resetPartyCareerData: () => {
    set({
      partyVaults: {},
      partyLeaderboards: {},
      recentlyCompletedObjective: null,
    });
  },

  hydrateVault: () => {
    if (hydrateInFlightPromise) return hydrateInFlightPromise;

    let run: Promise<void> | null = null;
    run = (async () => {
      try {
        const res = await fetch('/api/career/vault', { cache: 'no-store' });
        if (!res.ok) return;
        const diskVault = (await res.json()) as CareerVaultData;
        if (!diskVault || typeof diskVault !== 'object' || !diskVault.players) return;

        const localVault = get().vault;
        const diskHasData = Object.keys(diskVault.players).length > 0;
        const localHasData = Object.keys(localVault.players).length > 0;
        const diskUpdatedAt = Number.isFinite(diskVault.updatedAt) ? diskVault.updatedAt : 0;
        const localUpdatedAt = Number.isFinite(localVault.updatedAt) ? localVault.updatedAt : 0;

        if (diskHasData && (diskUpdatedAt >= localUpdatedAt || !localHasData)) {
          try {
            safeLocalStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(diskVault));
          } catch {
            // ignore
          }
          set({
            vault: diskVault,
            isDiskSynced: true,
            lastSavedAt: diskUpdatedAt || Date.now(),
          });
        } else if (
          (localHasData && !diskHasData) ||
          (localHasData && diskHasData && localUpdatedAt > diskUpdatedAt)
        ) {
          await saveVaultToDisk(localVault, (savedAt, ok) =>
            set({ isDiskSynced: ok, lastSavedAt: savedAt })
          );
        } else {
          set({ isDiskSynced: true });
        }
      } catch {
        set({ isDiskSynced: false });
      } finally {
        if (hydrateInFlightPromise === run) {
          hydrateInFlightPromise = null;
        }
      }
    })();

    hydrateInFlightPromise = run;
    return run;
  },

  getPlayerVault: (playerId) => {
    if (usePlayerStore.getState().isPartyMode) {
      return get().partyVaults[playerId] || EMPTY_PLAYER_VAULT;
    }
    return get().vault.players[playerId] || EMPTY_PLAYER_VAULT;
  },

  recordVisitForActivePlayer: (throws) => {
    if (throws.length === 0) return;

    const playerState = usePlayerStore.getState();
    const activePlayer = playerState.getActivePlayer();
    const now = new Date();

    // PARTY MODE: Full live functionality in RAM-only partyVaults (ZERO disk / localStorage writes!)
    if (playerState.isPartyMode) {
      const prevPartyVault =
        get().partyVaults[activePlayer.id] ||
        createEmptyPlayerVault(activePlayer.id, activePlayer.name);
      const updated = applyVisitToCareerVault(prevPartyVault, throws, now);

      const { daily, weekly } = evaluateObjectives(updated, now);
      const allObjectives = [...daily, ...weekly];
      const prunedIds = pruneExpiredObjectiveIds(updated.completedObjectiveIds, now);
      const prunedRerolls = pruneExpiredObjectiveRerolls(updated.objectiveRerolls, now);
      const alreadyDone = new Set(prunedIds);
      const newlyCompleted = allObjectives.filter((obj) => obj.completed && !alreadyDone.has(obj.id));

      let finalVault: PlayerCareerVault = {
        ...updated,
        completedObjectiveIds: prunedIds,
        objectiveRerolls: prunedRerolls,
      };
      let toastLabel: string | null = get().recentlyCompletedObjective;

      if (newlyCompleted.length > 0) {
        finalVault = {
          ...finalVault,
          completedObjectiveIds: [
            ...prunedIds,
            ...newlyCompleted.map((o) => o.id),
          ],
        };
        toastLabel = `Party Goal Complete: ${newlyCompleted[0].title}!`;
        soundEngine.playBonusHit(useGameStore.getState().soundEnabled);

        window.setTimeout(() => {
          set((s) =>
            s.recentlyCompletedObjective === toastLabel ? { recentlyCompletedObjective: null } : s
          );
        }, 4000);
      }

      set((s) => ({
        partyVaults: {
          ...s.partyVaults,
          [activePlayer.id]: finalVault,
        },
        recentlyCompletedObjective: toastLabel,
      }));
      return;
    }

    // NORMAL MODE: Skip unsaved session-only guests from Career Vault disk persistence
    if (!activePlayer.isPrimary && activePlayer.isSaved === false) return;

    const currentVault = get().vault;
    const prevPlayerVault =
      currentVault.players[activePlayer.id] ||
      createEmptyPlayerVault(activePlayer.id, activePlayer.name);

    const updatedPlayerVault = applyVisitToCareerVault(prevPlayerVault, throws, now);

    const { daily, weekly } = evaluateObjectives(updatedPlayerVault, now);
    const allObjectives = [...daily, ...weekly];
    const prunedIds = pruneExpiredObjectiveIds(updatedPlayerVault.completedObjectiveIds, now);
    const prunedRerolls = pruneExpiredObjectiveRerolls(updatedPlayerVault.objectiveRerolls, now);
    const alreadyDone = new Set(prunedIds);
    const newlyCompleted = allObjectives.filter((obj) => obj.completed && !alreadyDone.has(obj.id));

    let finalPlayerVault: PlayerCareerVault = {
      ...updatedPlayerVault,
      completedObjectiveIds: prunedIds,
      objectiveRerolls: prunedRerolls,
    };
    let toastLabel: string | null = get().recentlyCompletedObjective;

    if (newlyCompleted.length > 0) {
      finalPlayerVault = {
        ...finalPlayerVault,
        completedObjectiveIds: [
          ...prunedIds,
          ...newlyCompleted.map((o) => o.id),
        ],
      };
      toastLabel = `Objective Complete: ${newlyCompleted[0].title}!`;
      soundEngine.playBonusHit(useGameStore.getState().soundEnabled);

      window.setTimeout(() => {
        set((s) =>
          s.recentlyCompletedObjective === toastLabel ? { recentlyCompletedObjective: null } : s
        );
      }, 4000);
    }

    const nextVault: CareerVaultData = {
      ...currentVault,
      players: {
        ...currentVault.players,
        [activePlayer.id]: finalPlayerVault,
      },
      updatedAt: Date.now(),
    };

    set({ vault: nextVault, recentlyCompletedObjective: toastLabel });
    persistVault(nextVault, (savedAt, ok) => set({ isDiskSynced: ok, lastSavedAt: savedAt }));
  },

  recordArcadeResultForPlayer: (playerId, playerName, gameTitle, didWin) => {
    const playerState = usePlayerStore.getState();

    // PARTY MODE: Track in RAM-only partyVaults (ZERO disk writes!)
    if (playerState.isPartyMode) {
      const prevParty =
        get().partyVaults[playerId] || createEmptyPlayerVault(playerId, playerName);
      const updated = applyArcadeGameToCareerVault(prevParty, gameTitle, didWin);
      set((s) => ({
        partyVaults: {
          ...s.partyVaults,
          [playerId]: updated,
        },
      }));
      return;
    }

    const matched = playerState.players.find((p) => p.id === playerId);
    if (!matched || (!matched.isPrimary && matched.isSaved === false)) return;

    const currentVault = get().vault;
    const prevPlayerVault =
      currentVault.players[playerId] || createEmptyPlayerVault(playerId, playerName);

    const updatedPlayerVault = applyArcadeGameToCareerVault(prevPlayerVault, gameTitle, didWin);

    const nextVault: CareerVaultData = {
      ...currentVault,
      players: {
        ...currentVault.players,
        [playerId]: updatedPlayerVault,
      },
      updatedAt: Date.now(),
    };

    set({ vault: nextVault });
    persistVault(nextVault, (savedAt, ok) => set({ isDiskSynced: ok, lastSavedAt: savedAt }));
  },

  recordLeaderboardPerformance: (input) => {
    const playerState = usePlayerStore.getState();

    // PARTY MODE: Track live night leaderboards in RAM ONLY (NEVER written to disk/localStorage!)
    if (playerState.isPartyMode) {
      set((s) => ({
        partyLeaderboards: upsertLeaderboardEntry(s.partyLeaderboards, input),
      }));
      return;
    }

    const currentVault = get().vault;
    const nextBoards = upsertLeaderboardEntry(currentVault.gameLeaderboards || {}, input);

    const nextVault: CareerVaultData = {
      ...currentVault,
      gameLeaderboards: nextBoards,
      updatedAt: Date.now(),
    };

    set({ vault: nextVault });
    persistVault(nextVault, (savedAt, ok) => set({ isDiskSynced: ok, lastSavedAt: savedAt }));
  },

  rerollObjectives: (playerId, period) => {
    const playerState = usePlayerStore.getState();
    const now = new Date();
    const key =
      period === 'daily'
        ? `daily:${getLocalDateKey(now)}`
        : `weekly:${getWeekStartKey(now)}`;

    // PARTY MODE: Reroll temp user's objectives in RAM only (ZERO disk writes!)
    if (playerState.isPartyMode) {
      const activeParty = playerState.getActivePlayer();
      const targetId = playerId || activeParty.id;
      const prevParty =
        get().partyVaults[targetId] || createEmptyPlayerVault(targetId, activeParty.name);
      const prunedRerolls = pruneExpiredObjectiveRerolls(prevParty.objectiveRerolls, now);
      const nextSalt = (prunedRerolls[key] || 0) + 1;
      set((s) => ({
        partyVaults: {
          ...s.partyVaults,
          [targetId]: {
            ...prevParty,
            completedObjectiveIds: pruneExpiredObjectiveIds(prevParty.completedObjectiveIds, now),
            objectiveRerolls: {
              ...prunedRerolls,
              [key]: nextSalt,
            },
          },
        },
      }));
      return;
    }

    const matched = playerState.players.find((p) => p.id === playerId);
    const currentVault = get().vault;
    const prevPlayerVault =
      currentVault.players[playerId] ||
      createEmptyPlayerVault(playerId, matched?.name || 'Callum');

    const prunedRerolls = pruneExpiredObjectiveRerolls(prevPlayerVault.objectiveRerolls, now);
    const nextSalt = (prunedRerolls[key] || 0) + 1;

    const nextVault: CareerVaultData = {
      ...currentVault,
      players: {
        ...currentVault.players,
        [playerId]: {
          ...prevPlayerVault,
          completedObjectiveIds: pruneExpiredObjectiveIds(prevPlayerVault.completedObjectiveIds, now),
          objectiveRerolls: {
            ...prunedRerolls,
            [key]: nextSalt,
          },
        },
      },
      updatedAt: Date.now(),
    };

    set({ vault: nextVault });
    persistVault(nextVault, (savedAt, ok) => set({ isDiskSynced: ok, lastSavedAt: savedAt }));
  },

  dismissObjectiveToast: () => set({ recentlyCompletedObjective: null }),

  importVaultData: (data) => {
    if (!data || typeof data !== 'object' || !data.players) return;
    const normalized: CareerVaultData = {
      version: 1,
      players: data.players,
      gameLeaderboards: data.gameLeaderboards,
      updatedAt: Date.now(),
    };
    set({ vault: normalized });
    persistVault(normalized, (savedAt, ok) => set({ isDiskSynced: ok, lastSavedAt: savedAt }));
  },

  clearPlayerVault: (playerId) => {
    const currentVault = get().vault;
    const nextPlayers = { ...currentVault.players };
    delete nextPlayers[playerId];
    const nextVault: CareerVaultData = {
      ...currentVault,
      players: nextPlayers,
      updatedAt: Date.now(),
    };
    set({ vault: nextVault });
    persistVault(nextVault, (savedAt, ok) => set({ isDiskSynced: ok, lastSavedAt: savedAt }));
  },
}));
