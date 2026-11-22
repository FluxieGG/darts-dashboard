import React, { useRef } from 'react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useGameStore } from '../../store/useGameStore';
import { useReplayStore } from '../../store/useReplayStore';
import { Badge } from '../common/Badge';
import { DEFAULT_DART_COLOR, hexToRgbTriplet } from '../../lib/playerThemes';
import {
  Wifi,
  Cloud,
  ShieldCheck,
  Tablet,
  PartyPopper,
  Radio,
} from 'lucide-react';

interface HeaderProps {
  onOpenRemoteQr: () => void;
  onTriggerSecretDev: () => void;
  connectedRemotes: number;
  isLocalConnected: boolean;
}

/**
 * Pure Broadcast Kiosk Top Bar (8-foot glanceable, dark-room night aesthetic).
 * All controls live on the paired iPad Oche Command Deck (`/?remote=1`).
 * Secret Dev Console PIN (`0161`): 5-tap the `AD` crest or press Ctrl+Shift+D.
 */
export const Header: React.FC<HeaderProps> = ({
  onOpenRemoteQr,
  onTriggerSecretDev,
  connectedRemotes,
  isLocalConnected,
}) => {
  const isPartyMode = usePlayerStore((s) => s.isPartyMode);
  const activePlayer = usePlayerStore((s) => s.getActivePlayer());
  const dataMode = useSettingsStore((s) => s.dataMode);
  const activeView = useGameStore((s) => s.activeView);
  const replayStatus = useReplayStore((s) => s.status);
  const isGamesView = activeView !== 'dashboard';

  // Secret 5-tap on the AD crest opens PIN (0161) Dev Console QR Modal
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<number | null>(null);

  const handleCrestTap = () => {
    tapCountRef.current += 1;
    if (tapTimerRef.current !== null) {
      window.clearTimeout(tapTimerRef.current);
    }
    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      onTriggerSecretDev();
      return;
    }
    tapTimerRef.current = window.setTimeout(() => {
      tapCountRef.current = 0;
    }, 2400);
  };

  const playerColor = activePlayer.dartColor || DEFAULT_DART_COLOR;

  return (
    <header
      className={`sticky top-0 z-40 backdrop-blur-md border-b px-5 py-3.5 sm:px-6 transition-colors duration-300 ${
        isPartyMode
          ? 'bg-[#120A20]/92 border-purple-400/20 shadow-[0_4px_24px_-6px_rgba(168,85,247,0.22)]'
          : 'bg-[#0B0F17]/95 border-white/[0.08]'
      }`}
    >
      <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
        {/* Left: Broadcast Brand + Active Player Identity Pill */}
        <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
          <div
            onClick={handleCrestTap}
            className="flex items-center gap-3 select-none cursor-default"
          >
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${
                isPartyMode
                  ? 'bg-gradient-to-tr from-purple-600 via-fuchsia-500 to-amber-300 shadow-[0_0_20px_rgba(192,132,252,0.45)]'
                  : 'bg-gradient-to-tr from-emerald-500 to-emerald-300 shadow-[0_0_18px_rgba(16,185,129,0.45)]'
              }`}
            >
              <span className="font-mono font-black text-slate-950 text-base">AD</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-black text-white tracking-tight leading-tight">
                AUTODARTS
              </h1>
              <span
                className={`text-[11px] uppercase tracking-widest font-mono transition-colors ${
                  isPartyMode ? 'text-amber-300/90' : 'text-slate-400'
                }`}
              >
                {isPartyMode
                  ? isGamesView
                    ? 'Vice Party Arcade'
                    : 'Vice Party Mode'
                  : isGamesView
                  ? 'Tech Darts Arcade'
                  : 'Live Broadcast'}
              </span>
            </div>
          </div>

          <div className="h-7 w-px bg-white/12 hidden sm:block" />

          {/* Pure Display-Only Active Player Pill */}
          {isPartyMode ? (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-purple-950/70 border border-amber-400/35 text-sm sm:text-base font-bold text-amber-200 shadow-[0_0_16px_-4px_rgba(250,204,21,0.25)]">
              <ShieldCheck className="w-4 h-4 text-amber-300 shrink-0" />
              <span className="truncate">Party Session</span>
              <span className="hidden md:inline text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/25 text-purple-200 border border-purple-400/30">
                Unsaved
              </span>
            </div>
          ) : (
            <div
              className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-900/80 border text-sm sm:text-base font-bold text-white"
              style={{
                borderColor: `rgba(${hexToRgbTriplet(playerColor)}, 0.45)`,
              }}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center font-black text-xs text-slate-950 shrink-0"
                style={{ backgroundColor: playerColor }}
              >
                {activePlayer.name.charAt(0).toUpperCase()}
              </div>
              <span className="truncate max-w-[180px] sm:max-w-[240px]">
                {activePlayer.name}
              </span>
            </div>
          )}
        </div>

        {/* Right: Clean Broadcast Telemetry Pills Only (No Clutter Buttons) */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {isPartyMode && (
            <Badge variant="amber" size="sm" className="hidden sm:inline-flex">
              <PartyPopper className="w-3 h-3" />
              Party Mode
            </Badge>
          )}

          {(replayStatus === 'buffering' || replayStatus === 'capturing') && (
            <Badge
              variant={replayStatus === 'capturing' ? 'rose' : 'slate'}
              size="sm"
              className={
                replayStatus === 'capturing'
                  ? 'animate-pulse'
                  : 'border-rose-500/25 text-rose-200/90'
              }
            >
              <Radio className="w-3 h-3 text-rose-400" />
              {replayStatus === 'capturing' ? 'CLIPPING' : 'CAM LIVE'}
            </Badge>
          )}

          {/* Board Connection Status */}
          {dataMode === 'local' ? (
            <Badge variant={isLocalConnected ? 'emerald' : 'rose'} size="sm" dot>
              <Wifi className="w-3 h-3" />
              {isLocalConnected ? 'Board Live' : 'Board Offline'}
            </Badge>
          ) : dataMode === 'cloud' ? (
            <Badge variant="sky" size="sm" dot>
              <Cloud className="w-3 h-3" />
              Cloud API
            </Badge>
          ) : (
            <Badge variant="amber" size="sm" dot>
              Demo Mode
            </Badge>
          )}

          {/* iPad Oche Deck Status (Quiet badge when paired; subtle clickable QR chip ONLY if unpaired) */}
          {connectedRemotes > 0 ? (
            <Badge variant="emerald" size="sm" dot>
              <Tablet className="w-3 h-3" />
              <span className="hidden sm:inline">iPad Ready</span>
            </Badge>
          ) : (
            <button
              type="button"
              onClick={onOpenRemoteQr}
              title="Pair iPad Oche Deck"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/90 hover:bg-white/10 border border-white/15 text-[11px] font-mono font-bold text-slate-300 transition-colors cursor-pointer"
            >
              <Tablet className="w-3 h-3 text-sky-400" />
              <span>Pair iPad</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
