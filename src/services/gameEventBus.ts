import { DartThrow } from '../types/darts';
import { GameBoardEvent } from '../types/games';

type GameEventListener = (event: GameBoardEvent) => void;

/**
 * Generates a lightweight comparison signature for a single dart so we can detect
 * mid-visit camera corrections from Autodarts Desktop without false positives.
 */
function dartSignature(d: DartThrow): string {
  return `${d.segment.name}|${d.segment.number}|${d.segment.multiplier}|${d.score}|${Boolean(d.bouncer)}`;
}

/**
 * Centralized Game Event Bus ("The Game Socket").
 *
 * Bridges the continuous snapshot stream from Autodarts Local Board Manager
 * (ws://127.0.0.1:3180/api/events + HTTP poll) AND Demo/Dev throw injections
 * into clean, discrete gameplay events:
 *  - `dart_thrown`     -> fired immediately when a new dart lands (sub-50ms)
 *  - `dart_corrected`  -> fired if Autodarts revises a dart before takeout
 *  - `visit_completed` -> fired once when darts are pulled (takeout finished)
 *  - `board_status`    -> fired when status transitions ('throw' <-> 'takeout')
 */
class GameEventBus {
  private listeners = new Set<GameEventListener>();
  private previousVisitThrows: DartThrow[] = [];
  private lastBoardStatus = 'waiting';
  private lastBoardEvent = '';

  public subscribe(listener: GameEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: GameBoardEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('[GameEventBus] Listener error:', err);
      }
    });
  }

  /**
   * Called by useLiveBoardStore whenever Autodarts pushes a visit snapshot
   * (or Demo Simulator adds a dart).
   */
  public processVisitSync(throws: DartThrow[], status?: string, event?: string): void {
    const now = Date.now();
    const nextStatus = status || (throws.length > 0 ? 'throw' : 'waiting');
    const nextEvent = event || '';

    // 1. Diff each dart slot against previous snapshot
    for (let i = 0; i < throws.length; i++) {
      const nextDart = throws[i];
      const prevDart = this.previousVisitThrows[i];

      if (!prevDart) {
        // Brand-new dart landed in slot i
        this.emit({
          type: 'dart_thrown',
          dart: nextDart,
          dartIndex: i,
          visitThrows: throws,
          timestamp: now,
        });
      } else if (dartSignature(prevDart) !== dartSignature(nextDart)) {
        // Mid-visit camera correction on slot i
        this.emit({
          type: 'dart_corrected',
          dart: nextDart,
          previousDart: prevDart,
          dartIndex: i,
          visitThrows: throws,
          timestamp: now,
        });
      }
    }

    this.previousVisitThrows = throws.map((t) => ({ ...t }));

    // 2. Emit board status transition if changed
    if (nextStatus !== this.lastBoardStatus || nextEvent !== this.lastBoardEvent) {
      this.lastBoardStatus = nextStatus;
      this.lastBoardEvent = nextEvent;
      this.emit({
        type: 'board_status',
        status: nextStatus,
        event: nextEvent,
        timestamp: now,
      });
    }
  }

  /**
   * Called once when all darts are removed from the board (takeout finished).
   */
  public processVisitCompleted(throws: DartThrow[]): void {
    const now = Date.now();
    const totalScore = throws.reduce((sum, d) => sum + d.score, 0);

    this.previousVisitThrows = [];
    this.emit({
      type: 'visit_completed',
      throws,
      totalScore,
      timestamp: now,
    });
  }

  /**
   * Resets internal diffing buffer (e.g., when starting or restarting a match)
   * so leftover board state doesn't leak as a phantom throw.
   */
  public resetVisitBuffer(currentThrows: DartThrow[] = []): void {
    this.previousVisitThrows = currentThrows.map((t) => ({ ...t }));
  }

  /**
   * Manual / Dev-Simulator helper used by GameHost to inject a throw
   * directly into the active game without requiring a physical dartboard.
   */
  public injectManualDart(dart: DartThrow): void {
    const nextThrows =
      this.previousVisitThrows.length >= 3
        ? [dart]
        : [...this.previousVisitThrows, { ...dart, visitDartIndex: this.previousVisitThrows.length }];

    if (this.previousVisitThrows.length >= 3) {
      this.processVisitCompleted(this.previousVisitThrows);
    }

    const nextStatus = nextThrows.length >= 3 ? 'takeout' : 'throw';
    this.processVisitSync(nextThrows, nextStatus, 'manual_inject');
  }

  /**
   * Manual / Dev-Simulator helper to simulate pulling darts from the board.
   */
  public injectManualTakeout(): void {
    const throwsToCommit = [...this.previousVisitThrows];
    this.processVisitCompleted(throwsToCommit);
    this.processVisitSync([], 'throw', 'manual_takeout');
  }
}

export const gameEventBus = new GameEventBus();
