import { useEffect } from 'react';
import { useGameStore } from '../../store/useGameStore';

/**
 * Syncs the current turn player's darts colour to the global app tint
 * so the subtle ambient gradient & card rims smoothly shift to whoever is at the oche.
 */
export function useActiveTurnTint(colorHex?: string | null): void {
  const setActiveTurnPlayerColor = useGameStore((s) => s.setActiveTurnPlayerColor);

  useEffect(() => {
    setActiveTurnPlayerColor(colorHex ?? null);
    return () => {
      setActiveTurnPlayerColor(null);
    };
  }, [colorHex, setActiveTurnPlayerColor]);
}
