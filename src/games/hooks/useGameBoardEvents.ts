import { useEffect, useRef } from 'react';
import { DartThrow } from '../../types/darts';
import { GameBoardEvent } from '../../types/games';
import { gameEventBus } from '../../services/gameEventBus';

export interface UseGameBoardEventsOptions {
  /** Only fire callbacks when true (defaults to true). Set false during animations/victory/pause. */
  enabled?: boolean;
  /** Fired immediately when a new dart lands in the board (sub-50ms from Autodarts WS) */
  onDartThrown?: (dart: DartThrow, dartIndex: number, visitThrows: DartThrow[]) => void;
  /** Fired if Autodarts revises a previously detected dart before takeout */
  onDartCorrected?: (
    dart: DartThrow,
    previousDart: DartThrow,
    dartIndex: number,
    visitThrows: DartThrow[]
  ) => void;
  /** Fired once when darts are pulled from the board (takeout finished) -> advance turn */
  onVisitCompleted?: (throws: DartThrow[], totalScore: number) => void;
  /** Fired when board status transitions ('throw' | 'takeout' | 'waiting') */
  onBoardStatusChange?: (status: string, event: string) => void;
}

/**
 * Primary React hook for every modular game cartridge to listen to live dartboard telemetry.
 *
 * Uses latest-ref handlers so games never suffer stale closures or miss a dart
 * during React re-renders.
 */
export function useGameBoardEvents(options: UseGameBoardEventsOptions): void {
  const { enabled = true } = options;

  const handlersRef = useRef(options);
  handlersRef.current = options;

  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = gameEventBus.subscribe((ev: GameBoardEvent) => {
      const h = handlersRef.current;
      switch (ev.type) {
        case 'dart_thrown':
          h.onDartThrown?.(ev.dart, ev.dartIndex, ev.visitThrows);
          break;
        case 'dart_corrected':
          h.onDartCorrected?.(ev.dart, ev.previousDart, ev.dartIndex, ev.visitThrows);
          break;
        case 'visit_completed':
          h.onVisitCompleted?.(ev.throws, ev.totalScore);
          break;
        case 'board_status':
          h.onBoardStatusChange?.(ev.status, ev.event);
          break;
      }
    });

    return unsubscribe;
  }, [enabled]);
}
