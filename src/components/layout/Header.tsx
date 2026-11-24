import React, { useEffect, useRef } from 'react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useGameStore } from '../../store/useGameStore';
import { useReplayStore } from '../../store/useReplayStore';
import { useOnlineMatchStore } from '../../store/useOnlineMatchStore';
import { getGameDefinition } from '../../games/gameRegistry';
import { Badge } from '../common/Badge';
import { DartCounterIcon } from '../common/DartCounterIcon';
import { DEFAULT_DART_COLOR } from '../../lib/playerThemes';
import {
  Cloud,
  Tablet,
  PartyPopper,
  Radio,
  AlertTriangle,
  VideoOff,
} from 'lucide-react';

interface HeaderProps {
  onOpenRemoteQr: () => void;
  onTriggerSecretDev: () => void;
  connectedRemotes: number;
  isLocalConnected: boolean;
}

/**
 * Swiss Minimalist Matte Top Bar (8-foot glanceable, zero visual clutter).
 * All interactive controls live on the iPad Oche Deck (`/?remote=1`);
 * all debug & hardware settings live on the Dev Center (`/?dev=1`, 5-tap AD crest or Ctrl+Shift+D).
 */
export const Header: React.FC<HeaderProps> = React.memo(
  ({ onOpenRemoteQr, onTriggerSecretDev, connectedRemotes, isLocalConnected }) => {
    const isPartyMode = usePlayerStore((s) => s.isPartyMode);
    const activePlayer = usePlayerStore((s) => s.getActivePlayer());
    const dataMode = useSettingsStore((s) => s.dataMode);
    const activeView = useGameStore((s) => s.activeView);
    const activeGameId = useGameStore((s) => s.activeGameId);
    const replayStatus = useReplayStore((s) => s.status);
    const replayError = useReplayStore((s) => s.errorMessage);
    const replayBoardFeedError = useReplayStore((s) => s.boardFeedError);
    const isOnlineMatchActive = useOnlineMatchStore((s) => s.isActive);
    const isOnlineMatchFullscreen = useOnlineMatchStore((s) => s.isFullscreenKiosk);
    const onlineMatchSource = useOnlineMatchStore((s) => s.source);

    const isDartCounterTheme =
      activeView === 'dartcounter' ||
      (activeView === 'dashboard' &&
        isOnlineMatchActive &&
        isOnlineMatchFullscreen &&
        onlineMatchSource === 'dartcounter');

    const hasCameraIssue =
      replayStatus === 'error' || Boolean(replayError) || Boolean(replayBoardFeedError);

    const activeGameDef = activeGameId ? getGameDefinition(activeGameId) : undefined;
    const isPracticeView =
      activeView === 'practice-lobby' ||
      (activeView === 'game-active' && activeGameDef?.mode === 'practice');
    const isArcadeView =
      activeView === 'games-lobby' ||
      (activeView === 'game-active' && activeGameDef?.mode !== 'practice');

    // Secret 5-tap on the AD crest opens PIN (0161) Dev Console QR Modal
    const tapCountRef = useRef(0);
    const tapTimerRef = useRef<number | null>(null);

    useEffect(() => {
      return () => {
        if (tapTimerRef.current !== null) {
          window.clearTimeout(tapTimerRef.current);
          tapTimerRef.current = null;
        }
      };
    }, []);

    const handleCrestTap = () => {
      tapCountRef.current += 1;
      if (tapTimerRef.current !== null) {
        window.clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
      if (tapCountRef.current >= 5) {
        tapCountRef.current = 0;
        onTriggerSecretDev();
        return;
      }
      tapTimerRef.current = window.setTimeout(() => {
        tapCountRef.current = 0;
        tapTimerRef.current = null;
      }, 2400);
    };

    const playerName = activePlayer?.name || 'Player';
    const playerColor = activePlayer?.dartColor || DEFAULT_DART_COLOR;

    const viewLabel = isDartCounterTheme
      ? 'DartCounter'
      : isPartyMode
      ? isArcadeView
        ? 'Party Arcade'
        : 'Party Mode'
      : isPracticeView
      ? 'Practice'
      : isArcadeView
      ? 'Arcade'
      : 'Dashboard';

    return (
      <header
        className={`sticky top-0 z-40 border-b px-5 py-3 sm:px-6 transition-colors duration-200 ${
          isDartCounterTheme
            ? 'bg-white/95 border-slate-200'
            : isPartyMode
            ? 'bg-[#0D0A14]/95 border-purple-400/15'
            : 'bg-[#0A0C10]/95 border-white/[0.06]'
        }`}
      >
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
          {/* Left: Minimal Crest + Active Player + View Context */}
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              onClick={handleCrestTap}
              className="flex items-center gap-2.5 select-none cursor-default shrink-0"
              title="Autodarts"
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  isDartCounterTheme
                    ? 'bg-[#F76505] text-white'
                    : isPartyMode
                    ? 'bg-purple-500/20 border border-purple-400/35 text-amber-300'
                    : 'bg-white/[0.06] border border-white/[0.1] text-white'
                }`}
              >
                {isDartCounterTheme ? (
                  <DartCounterIcon className="w-4 h-4 text-white" />
                ) : (
                  <span className="font-mono font-bold text-xs tracking-tight">AD</span>
                )}
              </div>
              <span
                className={`hidden sm:inline text-xs font-mono uppercase tracking-[0.16em] ${
                  isDartCounterTheme
                    ? 'text-[#F76505] font-semibold'
                    : isPartyMode
                    ? 'text-purple-300/80'
                    : 'text-slate-500'
                }`}
              >
                {viewLabel}
              </span>
            </div>

            <div
              className={`h-4 w-px shrink-0 ${
                isDartCounterTheme ? 'bg-slate-200' : 'bg-white/[0.08]'
              }`}
            />

            {/* Minimal Active Player Identity */}
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{
                  backgroundColor: isDartCounterTheme
                    ? '#F76505'
                    : isPartyMode
                    ? '#FACC15'
                    : playerColor,
                }}
              />
              <span
                className={`text-base sm:text-lg font-semibold tracking-tight truncate max-w-[200px] sm:max-w-[280px] ${
                  isDartCounterTheme ? 'text-[#111827]' : 'text-white'
                }`}
              >
                {playerName}
              </span>
              {isPartyMode && !isDartCounterTheme && (
                <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider bg-purple-500/15 text-amber-300 border border-purple-400/25">
                  <PartyPopper className="w-2.5 h-2.5" />
                  Unsaved
                </span>
              )}
            </div>
          </div>

          {/* Right: Quiet Telemetry Status Indicators */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {isDartCounterTheme || (isOnlineMatchActive && onlineMatchSource === 'dartcounter') ? (
              <Badge
                variant="slate"
                size="sm"
                className={
                  isDartCounterTheme
                    ? 'bg-slate-100 border-slate-200 text-slate-500'
                    : 'bg-white/[0.03] border-white/[0.08] text-slate-500'
                }
              >
                <VideoOff className="w-3 h-3" />
                Clips Off
              </Badge>
            ) : hasCameraIssue ? (
              <Badge variant="amber" size="sm">
                <AlertTriangle className="w-3 h-3" />
                Cam Issue
              </Badge>
            ) : (
              (replayStatus === 'buffering' || replayStatus === 'capturing') && (
                <Badge
                  variant={replayStatus === 'capturing' ? 'rose' : 'slate'}
                  size="sm"
                  className={
                    replayStatus === 'capturing'
                      ? undefined
                      : 'bg-white/[0.03] border-white/[0.08] text-slate-400'
                  }
                >
                  <Radio
                    className={`w-3 h-3 ${
                      replayStatus === 'capturing' ? 'text-rose-400' : 'text-rose-400/70'
                    }`}
                  />
                  {replayStatus === 'capturing' ? 'Clipping' : 'Cam'}
                </Badge>
              )
            )}

            {/* Board Live Indicator */}
            {dataMode === 'local' ? (
              <Badge
                variant={isLocalConnected ? 'emerald' : 'rose'}
                size="sm"
                dot
                className={
                  isDartCounterTheme
                    ? isLocalConnected
                      ? 'bg-[#E6F5EC] border-[#107C41]/25 text-[#107C41]'
                      : 'bg-rose-50 border-rose-200 text-rose-700'
                    : undefined
                }
              >
                {isLocalConnected ? 'Live' : 'Offline'}
              </Badge>
            ) : dataMode === 'cloud' ? (
              <Badge variant="sky" size="sm" dot>
                <Cloud className="w-3 h-3" />
                Cloud
              </Badge>
            ) : (
              <Badge variant="amber" size="sm" dot>
                Demo
              </Badge>
            )}

            {/* iPad Status (Quiet dot when paired; subtle clickable button only if unpaired) */}
            {connectedRemotes > 0 ? (
              <Badge
                variant="slate"
                size="sm"
                dot
                className={
                  isDartCounterTheme
                    ? 'bg-[#FFF3EB] border-[#F76505]/25 text-[#D95300]'
                    : 'bg-white/[0.03] border-white/[0.08] text-slate-300'
                }
              >
                <Tablet className="w-3 h-3" />
                <span className="hidden sm:inline">iPad</span>
              </Badge>
            ) : (
              <button
                type="button"
                onClick={onOpenRemoteQr}
                title="Pair iPad Oche Deck"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors cursor-pointer ${
                  isDartCounterTheme
                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                    : 'bg-white/[0.04] hover:bg-white/[0.09] border-white/[0.1] text-slate-300'
                }`}
              >
                <Tablet className="w-3 h-3 text-slate-400" />
                <span>Pair iPad</span>
              </button>
            )}
          </div>
        </div>
      </header>
    );
  }
);

Header.displayName = 'Header';
