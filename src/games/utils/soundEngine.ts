/**
 * Silent Arcade Sound Engine (No-Op).
 *
 * This kiosk display has no audio output. All Web Audio / AudioContext code has
 * been removed so zero AudioContext instances or Web Audio API exceptions can
 * ever occur, while preserving the exported method signatures for all game modules.
 */
class SilentSoundEngine {
  /** Crisp subtle impact for a standard single hit (silent no-op) */
  public playDartHit(_enabled = true): void {}

  /** Bright upward chime for Doubles / Trebles / Bonus targets (silent no-op) */
  public playBonusHit(_enabled = true): void {}

  /** Energetic chord for Bullseye, 180, or Special Combo (silent no-op) */
  public playJackpot(_enabled = true): void {}

  /** Low descending buzz for Miss, Bust, Lava hit, or Penalty (silent no-op) */
  public playHazard(_enabled = true): void {}

  /** Dramatic drop for Player Elimination (silent no-op) */
  public playElimination(_enabled = true): void {}

  /** Subtle whoosh/pip when advancing to next player's turn (silent no-op) */
  public playTurnChange(_enabled = true): void {}

  /** Celebratory podium fanfare (silent no-op) */
  public playVictory(_enabled = true): void {}
}

export const soundEngine = new SilentSoundEngine();
