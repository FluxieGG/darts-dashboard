/**
 * Lightweight Web Audio API Arcade Sound Synthesizer.
 * Provides crisp Flight Club / Roxy Ballroom style audio feedback
 * with zero external audio assets or network requests.
 */
class ArcadeSoundEngine {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    durationSec: number,
    type: OscillatorType = 'sine',
    volume = 0.14,
    delaySec = 0,
    endFreq?: number
  ): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + durationSec);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  /** Crisp subtle impact for a standard single hit */
  public playDartHit(enabled = true): void {
    if (!enabled) return;
    this.playTone(220, 0.07, 'triangle', 0.12, 0, 110);
  }

  /** Bright upward chime for Doubles / Trebles / Bonus targets */
  public playBonusHit(enabled = true): void {
    if (!enabled) return;
    this.playTone(523.25, 0.12, 'triangle', 0.15, 0);
    this.playTone(783.99, 0.18, 'sine', 0.14, 0.07);
  }

  /** Energetic chord for Bullseye, 180, or Special Combo */
  public playJackpot(enabled = true): void {
    if (!enabled) return;
    this.playTone(523.25, 0.16, 'triangle', 0.15, 0);
    this.playTone(659.25, 0.16, 'triangle', 0.15, 0.07);
    this.playTone(783.99, 0.22, 'triangle', 0.15, 0.14);
    this.playTone(1046.5, 0.32, 'sine', 0.16, 0.21);
  }

  /** Low descending buzz for Miss, Bust, Lava hit, or Penalty */
  public playHazard(enabled = true): void {
    if (!enabled) return;
    this.playTone(180, 0.22, 'sawtooth', 0.11, 0, 75);
    this.playTone(130, 0.25, 'sawtooth', 0.09, 0.08, 55);
  }

  /** Dramatic drop for Player Elimination (e.g., Killer / Lava knockout) */
  public playElimination(enabled = true): void {
    if (!enabled) return;
    this.playTone(320, 0.16, 'sawtooth', 0.12, 0, 220);
    this.playTone(220, 0.2, 'sawtooth', 0.12, 0.14, 140);
    this.playTone(140, 0.35, 'sawtooth', 0.13, 0.3, 60);
  }

  /** Subtle whoosh/pip when advancing to next player's turn */
  public playTurnChange(enabled = true): void {
    if (!enabled) return;
    this.playTone(392, 0.09, 'sine', 0.08, 0, 493.88);
  }

  /** Celebratory podium fanfare */
  public playVictory(enabled = true): void {
    if (!enabled) return;
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
    const delays = [0, 0.1, 0.2, 0.3, 0.48, 0.6];
    const durations = [0.14, 0.14, 0.14, 0.2, 0.12, 0.45];
    notes.forEach((n, i) => {
      this.playTone(n, durations[i], 'triangle', 0.16, delays[i]);
    });
  }
}

export const soundEngine = new ArcadeSoundEngine();
