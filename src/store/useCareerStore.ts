import { create } from 'zustand';
import { DartThrow } from '../types/darts';
import { CareerVaultData, PlayerCareerVault } from '../types/career';
import {
  applyArcadeGameToCareerVault,
  applyVisitToCareerVault,
  createEmptyPlayerVault,
  evaluateObjectives,
  getLocalDateKey,
  getWeekStartKey,
} from '../lib/careerEngine';
import { usePlayerStore } from './usePlayerStore';
import { useGameStore } from './useGameStore';
import { soundEngine } from '../games/utils/soundEngine';

const LOCAL_FALLBACK_KEY = 'autodarts_career_vault_v1';

interface CareerStoreState {
  vault: CareerVaultData;
  isDiskSynced: boolean;
  lastSavedAt: number | null;
  recentlyCompletedObjective: string | null;

  // Lifecycle
  hydrateVault: () => Promise<void>;
  getPlayerVault: (playerId: string, playerName?: string) => PlayerCareerVault;

  // Recorders (automatically respect Party Mode & unsaved guests!)
  recordVisitForActivePlayer: (throws: DartThrow[]) => void;
  recordArcadeResultForPlayer: (playerId: string, playerName: string, gameTitle: string, didWin: boolean) => void;

  // Objective Management
  rerollObjectives: (playerId: string, period: 'daily' | 'weekly') => void;
  dismissObjectiveToast: () => void;

  // Backup / Reset
  importVaultData: (data: CareerVaultData) => void;
  clearPlayerVault: (playerId: string) => void;
}

function loadLocalFallback(): CareerVaultData {
  try {
    const raw = localStorage.getItem(LOCAL_FALLBACK_KEY);
    if (raw) {
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

function persistVault(vault: CareerVaultData, onDiskSaved: (savedAt: number, ok: boolean) => void): void {
  try {
    localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(vault));
  } catch {
    // ignore quota errors
  }

  if (diskSaveTimer !== null) {
    window.clearTimeout(diskSaveTimer);
  }
  diskSaveTimer = window.setTimeout(() => {
    diskSaveTimer = null;
    fetch('/api/career/vault', {
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
  }, 350);
}

export const useCareerStore = create<CareerStoreState>((set, get) => ({
  vault: loadLocalFallback(),
  isDiskSynced: false,
  lastSavedAt: null,
  recentlyCompletedObjective: null,

  hydrateVault: async () => {
    try {
      const res = await fetch('/api/career/vault', { cache: 'no-store' });
      if (!res.ok) return;
      const diskVault = (await res.json()) as CareerVaultData;
      if (!diskVault || typeof diskVault !== 'object' || !diskVault.players) return;

      const localVault = get().vault;
      // Prefer whichever vault is newer (or has more player logs)
      const diskHasData = Object.keys(diskVault.players).length > 0;
      const localHasData = Object.keys(localVault.players).length > 0;

      if (diskHasData && (diskVault.updatedAt >= localVault.updatedAt || !localHasData)) {
        try {
          localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(diskVault));
        } catch {
          // ignore
        }
        set({
          vault: diskVault,
          isDiskSynced: true,
          lastSavedAt: diskVault.updatedAt || Date.now(),
        });
      } else if (localHasData && !diskHasData) {
        // Seed disk file from local fallback
        persistVault(localVault, (savedAt, ok) =>
          set({ isDiskSynced: ok, lastSavedAt: savedAt })
        );
      } else {
        set({ isDiskSynced: true });
      }
    } catch {
      set({ isDiskSynced: false });
    }
  },

  getPlayerVault: (playerId, playerName = 'Callum') => {
    const existing = get().vault.players[playerId];
    if (existing) return existing;
    return createEmptyPlayerVault(playerId, playerName);
  },

  recordVisitForActivePlayer: (throws) => {
    if (throws.length === 0) return;

    const playerState = usePlayerStore.getState();
    // STRICT GUARD: Never record Party Mode or unsaved session-only guests into Career Vault!
    if (playerState.isPartyMode) return;
    const activePlayer = playerState.getActivePlayer();
    if (!activePlayer.isPrimary && activePlayer.isSaved === false) return;

    const currentVault = get().vault;
    const prevPlayerVault =
      currentVault.players[activePlayer.id] ||
      createEmptyPlayerVault(activePlayer.id, activePlayer.name);

    const updatedPlayerVault = applyVisitToCareerVault(prevPlayerVault, throws);

    // Check if any Daily or Weekly Objective just crossed 100%!
    const { daily, weekly } = evaluateObjectives(updatedPlayerVault);
    const allObjectives = [...daily, ...weekly];
    const alreadyDone = new Set(updatedPlayerVault.completedObjectiveIds);
    const newlyCompleted = allObjectives.filter((obj) => obj.completed && !alreadyDone.has(obj.id));

    let finalPlayerVault = updatedPlayerVault;
    let toastLabel: string | null = get().recentlyCompletedObjective;

    if (newlyCompleted.length > 0) {
      finalPlayerVault = {
        ...updatedPlayerVault,
        completedObjectiveIds: [
          ...updatedPlayerVault.completedObjectiveIds,
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
    if (playerState.isPartyMode) return;
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

  rerollObjectives: (playerId, period) => {
    const playerState = usePlayerStore.getState();
    const matched = playerState.players.find((p) => p.id === playerId);
    const currentVault = get().vault;
    const prevPlayerVault =
      currentVault.players[playerId] ||
      createEmptyPlayerVault(playerId, matched?.name || 'Callum');

    const key =
      period === 'daily'
        ? `daily:${getLocalDateKey()}`
        : `weekly:${getWeekStartKey()}`;

    const nextSalt = (prevPlayerVault.objectiveRerolls[key] || 0) + 1;

    const nextVault: CareerVaultData = {
      ...currentVault,
      players: {
        ...currentVault.players,
        [playerId]: {
          ...prevPlayerVault,
          objectiveRerolls: {
            ...prevPlayerVault.objectiveRerolls,
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
    if (!data || !data.players) return;
    const nextVault: CareerVaultData = {
      version: 1,
      players: data.players,
      updatedAt: Date.now(),
    };
    set({ vault: nextVault });
    persistVault(nextVault, (savedAt, ok) => set({ isDiskSynced: ok, lastSavedAt: savedAt }));
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
