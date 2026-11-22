import React, { useState } from 'react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useLayoutStore } from '../../store/useLayoutStore';
import { useLiveBoardStore } from '../../store/useLiveBoardStore';
import { useGameStore } from '../../store/useGameStore';
import { useReplayStore } from '../../store/useReplayStore';
import { generateSimulatedVisit } from '../../services/simulator';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import {
  DART_COLOR_OPTIONS,
  DEFAULT_DART_COLOR,
  getDartColorLabel,
  hexToRgbTriplet,
} from '../../lib/playerThemes';
import {
  SlidersHorizontal,
  Gamepad2,
  PartyPopper,
  Square,
  Settings,
  Smartphone,
  Clapperboard,
  Maximize2,
  Minimize2,
  ChevronDown,
  UserPlus,
  Play,
  RotateCw,
  Wifi,
  Cloud,
  Check,
  ShieldCheck,
  Palette,
  Bookmark,
} from 'lucide-react';

interface HeaderProps {
  onOpenSettings: () => void;
  onOpenRemoteQr: () => void;
  connectedRemotes: number;
  isLocalConnected: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  onOpenRemoteQr,
  connectedRemotes,
  isLocalConnected,
}) => {
  const {
    activePlayerId,
    players,
    isPartyMode,
    setActivePlayer,
    addPlayer,
    updatePlayerProfile,
    getActivePlayer,
    startPartyMode,
    stopPartyMode,
  } = usePlayerStore();
  const activePlayer = getActivePlayer();

  const {
    dataMode,
    isAutoSimulating,
    toggleAutoSimulating,
  } = useSettingsStore();

  const openDrawer = useLayoutStore((s) => s.openDrawer);
  const addSimulatedDart = useLiveBoardStore((s) => s.addSimulatedDart);
  const resetBoardForModeSwitch = useLiveBoardStore((s) => s.resetBoardForModeSwitch);
  const { activeView, openGamesLobby, returnToDashboard } = useGameStore();
  const {
    status: replayStatus,
    clips: replayClips,
    devCaptureNextDartArmed,
    openGallery: openReplayGallery,
  } = useReplayStore();
  const isGamesView = activeView !== 'dashboard';

  const handleTogglePartyMode = () => {
    setIsPlayerMenuOpen(false);
    resetBoardForModeSwitch();
    if (isPartyMode) {
      stopPartyMode();
    } else {
      startPartyMode();
    }
  };

  const [isPlayerMenuOpen, setIsPlayerMenuOpen] = useState(false);
  const [isAddPlayerModalOpen, setIsAddPlayerModalOpen] = useState(false);
  const [editingColorPlayerId, setEditingColorPlayerId] = useState<string | null>(null);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerNickname, setNewPlayerNickname] = useState('');
  const [newPlayerDartColor, setNewPlayerDartColor] = useState<string>(DEFAULT_DART_COLOR);
  const [saveNewPlayerDetails, setSaveNewPlayerDetails] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  const handleSimulateFullVisit = () => {
    const simVisit = generateSimulatedVisit(activePlayerId, Date.now());
    simVisit.throws.forEach((t, i) => {
      setTimeout(() => {
        addSimulatedDart(t);
      }, i * 350);
    });
  };

  const handleCreatePlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return;
    addPlayer(newPlayerName.trim(), {
      nickname: newPlayerNickname.trim() || undefined,
      dartColor: newPlayerDartColor,
      isSaved: saveNewPlayerDetails,
    });
    setNewPlayerName('');
    setNewPlayerNickname('');
    setNewPlayerDartColor(DEFAULT_DART_COLOR);
    setSaveNewPlayerDetails(true);
    setIsAddPlayerModalOpen(false);
    setIsPlayerMenuOpen(false);
  };

  const editingColorPlayer = editingColorPlayerId
    ? players.find((p) => p.id === editingColorPlayerId) || null
    : null;

  return (
    <header
      className={`sticky top-0 z-40 backdrop-blur-md border-b px-4 py-3.5 sm:px-6 transition-colors duration-300 ${
        isPartyMode
          ? 'bg-[#120A20]/92 border-purple-400/20 shadow-[0_4px_24px_-6px_rgba(168,85,247,0.22)]'
          : 'bg-[#0B0F17]/95 border-white/[0.1]'
      }`}
    >
      <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Left: Brand + Active Player Switcher */}
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={returnToDashboard}
            title="Return to Live Dashboard"
            className="flex items-center gap-2.5 text-left hover:opacity-90 transition-opacity cursor-pointer"
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
              <h1 className="text-lg font-extrabold text-white tracking-tight leading-tight">
                AUTODARTS
              </h1>
              <span
                className={`text-[11px] uppercase tracking-widest font-mono transition-colors ${
                  isPartyMode ? 'text-amber-300/90' : 'text-slate-400'
                }`}
              >
                {isPartyMode
                  ? isGamesView
                    ? 'Party Arcade'
                    : 'Party Mode'
                  : isGamesView
                  ? 'Games Arcade'
                  : 'Live Dashboard'}
              </span>
            </div>
          </button>

          <div className="h-7 w-px bg-white/15 hidden sm:block" />

          {/* Player Switcher Dropdown (replaced with protected Party badge when Party Mode is live) */}
          {isPartyMode ? (
            <div
              title="Guest throws will NOT save to your personal stats or 3-Dart Average"
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-purple-950/70 border border-amber-400/35 text-sm font-bold text-amber-200 shadow-[0_0_16px_-4px_rgba(250,204,21,0.25)]"
            >
              <ShieldCheck className="w-4 h-4 text-amber-300 shrink-0" />
              <span className="truncate max-w-[160px] sm:max-w-[210px]">
                Party Session
              </span>
              <span className="hidden md:inline text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/25 text-purple-200 border border-purple-400/30">
                Unsaved
              </span>
            </div>
          ) : (
            <div className="relative">
              <button
                onClick={() => setIsPlayerMenuOpen(!isPlayerMenuOpen)}
                className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-900/90 border border-white/15 hover:border-white/30 transition-all text-sm sm:text-base font-bold text-white shadow-sm"
                style={{
                  borderColor: `rgba(${hexToRgbTriplet(activePlayer.dartColor)}, 0.45)`,
                }}
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center font-black text-xs text-slate-950 shrink-0"
                  style={{
                    backgroundColor: activePlayer.dartColor || DEFAULT_DART_COLOR,
                  }}
                >
                  {activePlayer.name.charAt(0)}
                </div>
                <span className="truncate max-w-[140px] sm:max-w-[180px]">
                  {activePlayer.name}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>

              {isPlayerMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsPlayerMenuOpen(false)}
                  />
                  <div className="absolute left-0 top-full mt-2 w-68 rounded-xl bg-[#131A26] border border-white/10 shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95">
                    <div className="px-3 py-1 text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                      Switch Profile &amp; Darts Theme
                    </div>
                    {players.map((p) => {
                      const isSelected = p.id === activePlayerId;
                      const pColor = p.dartColor || DEFAULT_DART_COLOR;
                      const isTemp = !p.isPrimary && p.isSaved === false;
                      return (
                        <div
                          key={p.id}
                          className="w-full flex items-center justify-between gap-1 px-2 py-1 hover:bg-white/5 transition-colors"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setActivePlayer(p.id);
                              setIsPlayerMenuOpen(false);
                            }}
                            className="flex-1 flex items-center gap-2.5 px-1.5 py-1 text-xs text-left min-w-0"
                          >
                            <span
                              className="w-3 h-3 rounded-full shrink-0 ring-2 ring-white/15"
                              style={{ backgroundColor: pColor }}
                              title={`Darts colour: ${p.dartColorName || getDartColorLabel(pColor)}`}
                            />
                            <div className="flex flex-col min-w-0">
                              <span
                                className={`font-semibold truncate ${
                                  isSelected ? 'text-white' : 'text-slate-200'
                                }`}
                              >
                                {p.name} {p.isPrimary && '(Primary)'}
                              </span>
                              <span className="text-[10px] text-slate-400 truncate">
                                {p.dartColorName || getDartColorLabel(pColor)}
                                {isTemp ? ' • Session Only' : p.nickname ? ` • ${p.nickname}` : ''}
                              </span>
                            </div>
                          </button>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingColorPlayerId(p.id);
                                setIsPlayerMenuOpen(false);
                              }}
                              title={`Customize ${p.name}'s darts colour`}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                            >
                              <Palette className="w-3.5 h-3.5" />
                            </button>
                            {isSelected && <Check className="w-4 h-4 text-emerald-400 mr-1" />}
                          </div>
                        </div>
                      );
                    })}
                    <div className="border-t border-white/10 my-1" />
                    <button
                      type="button"
                      onClick={() => {
                        setIsPlayerMenuOpen(false);
                        setIsAddPlayerModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-emerald-400 hover:bg-emerald-500/10 font-semibold transition-colors"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>+ Add Player / Guest</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Center/Right: Connection Status Pills */}
        <div className="flex items-center gap-2">
          {dataMode === 'local' ? (
            <Badge
              variant={isLocalConnected ? 'emerald' : 'rose'}
              size="sm"
              dot
            >
              <Wifi className="w-3 h-3 mr-1" />
              {isLocalConnected ? 'Autodarts Live' : 'Board Offline'}
            </Badge>
          ) : dataMode === 'cloud' ? (
            <Badge variant="sky" size="sm" dot>
              <Cloud className="w-3 h-3 mr-1" />
              Cloud API
            </Badge>
          ) : (
            <Badge variant="amber" size="sm" dot>
              Demo Simulator
            </Badge>
          )}

          {/* Quick Simulator Controls ONLY in Demo Mode */}
          {dataMode === 'demo' && (
            <div className="flex items-center gap-1.5 bg-slate-900/80 rounded-xl p-1 border border-white/10">
              <button
                onClick={handleSimulateFullVisit}
                title="Simulate 3-Dart Visit"
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors"
              >
                <Play className="w-3 h-3 fill-emerald-300" />
                <span className="hidden sm:inline">Visit</span>
              </button>
              <button
                onClick={toggleAutoSimulating}
                title={isAutoSimulating ? 'Pause Auto Simulator' : 'Auto Play Simulation'}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  isAutoSimulating
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <RotateCw className={`w-3 h-3 ${isAutoSimulating ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{isAutoSimulating ? 'Auto On' : 'Auto'}</span>
              </button>
            </div>
          )}

          {/* Dedicated Party Mode Toggle Button (Ephemeral Guest Session — Never Saves) */}
          <button
            type="button"
            onClick={handleTogglePartyMode}
            title={
              isPartyMode
                ? 'Stop Party Mode, clear temporary stats, and return to your saved profile'
                : 'Start Party Mode: moody Vice theme & live guest stats without saving to your personal average'
            }
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold tracking-wide transition-all cursor-pointer ${
              isPartyMode
                ? 'bg-gradient-to-r from-purple-600/35 via-fuchsia-600/30 to-amber-500/25 text-amber-200 border-amber-400/55 shadow-[0_0_18px_-3px_rgba(250,204,21,0.35)] hover:border-amber-300/80'
                : 'bg-slate-900/80 text-purple-200/90 hover:text-amber-200 hover:bg-purple-500/15 border-purple-400/25 hover:border-amber-400/40'
            }`}
          >
            {isPartyMode ? (
              <>
                <Square className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
                <span>Stop Party</span>
              </>
            ) : (
              <>
                <PartyPopper className="w-4 h-4 text-purple-300" />
                <span>Party Mode</span>
              </>
            )}
          </button>

          {/* Games Arcade Lobby Button (next to Customize Layout) */}
          <button
            type="button"
            onClick={() => (isGamesView ? returnToDashboard() : openGamesLobby())}
            title={isGamesView ? 'Back to Stats Dashboard' : 'Open Tech Darts Games Lobby'}
            className={`p-2 rounded-xl border transition-all ${
              isGamesView
                ? isPartyMode
                  ? 'bg-purple-500/25 text-amber-300 border-amber-400/50 shadow-[0_0_14px_rgba(250,204,21,0.3)]'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50 shadow-[0_0_14px_rgba(16,185,129,0.35)]'
                : 'bg-slate-900/80 text-slate-300 hover:text-white hover:bg-white/10 border-white/10'
            }`}
          >
            <Gamepad2 className="w-4 h-4" />
          </button>

          {/* Layout Customizer Drawer Button */}
          <button
            type="button"
            onClick={() => {
              if (isGamesView) returnToDashboard();
              openDrawer();
            }}
            title="Customize Bento Layout"
            className="p-2 rounded-xl bg-slate-900/80 text-slate-300 hover:text-white hover:bg-white/10 border border-white/10 transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          {/* Action Replays & Oche-Cam Gallery Button */}
          <button
            type="button"
            onClick={openReplayGallery}
            title={
              devCaptureNextDartArmed
                ? 'Oche-Cam DEV TEST ARMED (Throw any dart)'
                : replayStatus === 'buffering'
                ? `Oche-Cam Live (${replayClips.length} clips saved)`
                : `Action Replays Gallery (${replayClips.length} clips)`
            }
            className={`relative p-2 rounded-xl border transition-colors cursor-pointer ${
              devCaptureNextDartArmed
                ? 'bg-amber-500/20 text-amber-300 border-amber-400/60 shadow-[0_0_14px_rgba(245,158,11,0.35)]'
                : replayStatus === 'buffering' || replayStatus === 'capturing'
                ? 'bg-rose-500/15 text-rose-300 border-rose-400/45 hover:bg-rose-500/25'
                : 'bg-slate-900/80 text-slate-300 hover:text-white hover:bg-white/10 border-white/10'
            }`}
          >
            <Clapperboard className="w-4 h-4" />
            {(replayStatus === 'buffering' || replayStatus === 'capturing') && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-[#0B0F17] animate-pulse" />
            )}
            {devCaptureNextDartArmed && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-[#0B0F17] animate-ping" />
            )}
          </button>

          {/* Phone-at-the-Oche QR Remote Button */}
          <button
            type="button"
            onClick={onOpenRemoteQr}
            title={
              connectedRemotes > 0
                ? `Phone Remote (${connectedRemotes} connected)`
                : 'Pair Phone-at-the-Oche QR Remote'
            }
            className={`relative p-2 rounded-xl border transition-colors ${
              connectedRemotes > 0
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/45 hover:bg-emerald-500/25'
                : 'bg-slate-900/80 text-slate-300 hover:text-white hover:bg-white/10 border-white/10'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            {connectedRemotes > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-emerald-400 text-slate-950 font-mono text-[10px] font-black flex items-center justify-center shadow">
                {connectedRemotes}
              </span>
            )}
          </button>

          {/* Settings Modal Button */}
          <button
            onClick={onOpenSettings}
            title="Settings & Data Connections"
            className="p-2 rounded-xl bg-slate-900/80 text-slate-300 hover:text-white hover:bg-white/10 border border-white/10 transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Fullscreen Kiosk Button */}
          <button
            onClick={toggleFullscreen}
            title="Toggle Kiosk Fullscreen (F11)"
            className="p-2 rounded-xl bg-slate-900/80 text-slate-300 hover:text-white hover:bg-white/10 border border-white/10 transition-colors hidden sm:block"
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Add Player Modal (with Darts Colour Custom Theme + Save Account Toggle) */}
      <Modal
        isOpen={isAddPlayerModalOpen}
        onClose={() => setIsAddPlayerModalOpen(false)}
        title="Add New Player Profile"
        description="Choose their darts colour for a subtle custom theme tint whenever it's their turn."
      >
        <form onSubmit={handleCreatePlayer} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
              Player Name
            </label>
            <input
              type="text"
              required
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              placeholder="e.g. Sam"
              maxLength={24}
              className="w-full rounded-xl bg-slate-900 border border-white/10 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
              Nickname / Tag (Optional)
            </label>
            <input
              type="text"
              value={newPlayerNickname}
              onChange={(e) => setNewPlayerNickname(e.target.value)}
              placeholder="e.g. The Sniper"
              maxLength={28}
              className="w-full rounded-xl bg-slate-900 border border-white/10 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Darts Colour Picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase text-slate-400 flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5" />
                What colour are their darts?
              </label>
              <span className="text-xs font-mono font-bold text-slate-200">
                {getDartColorLabel(newPlayerDartColor)}
              </span>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {DART_COLOR_OPTIONS.map((opt) => {
                const selected = newPlayerDartColor.toLowerCase() === opt.hex.toLowerCase();
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setNewPlayerDartColor(opt.hex)}
                    title={`${opt.label} — ${opt.description}`}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all cursor-pointer ${
                      selected
                        ? 'bg-white/10 border-white/60 scale-[1.03]'
                        : 'bg-slate-900/70 border-white/10 hover:border-white/25'
                    }`}
                  >
                    <span
                      className="w-6 h-6 rounded-full shadow-inner ring-2 ring-black/30"
                      style={{ backgroundColor: opt.hex }}
                    />
                    <span className="text-[10px] font-medium text-slate-300 truncate max-w-full">
                      {opt.label.split(' ')[0]}
                    </span>
                  </button>
                );
              })}

              {/* Custom Hex Swatch */}
              <label
                title="Pick any custom colour"
                className="flex flex-col items-center justify-center gap-1 p-2 rounded-xl border border-dashed border-white/20 bg-slate-900/70 hover:border-white/40 cursor-pointer"
              >
                <input
                  type="color"
                  value={newPlayerDartColor}
                  onChange={(e) => setNewPlayerDartColor(e.target.value)}
                  className="w-6 h-6 rounded-full cursor-pointer bg-transparent border-0 p-0"
                />
                <span className="text-[10px] font-medium text-slate-300">Custom</span>
              </label>
            </div>

            {/* Live Subtle Gradient Theme Preview */}
            <div
              className="rounded-xl px-3.5 py-2.5 border flex items-center justify-between transition-all"
              style={{
                backgroundColor: '#141D2B',
                backgroundImage: `radial-gradient(ellipse 85% 95% at 10% 0%, rgba(${hexToRgbTriplet(
                  newPlayerDartColor
                )}, 0.24), transparent 65%)`,
                borderColor: `rgba(${hexToRgbTriplet(newPlayerDartColor)}, 0.45)`,
              }}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-slate-950"
                  style={{ backgroundColor: newPlayerDartColor }}
                >
                  {(newPlayerName.trim() || 'P').charAt(0).toUpperCase()}
                </span>
                <div>
                  <div className="text-xs font-bold text-white">
                    {newPlayerName.trim() || 'Player'}&apos;s Turn Tint Preview
                  </div>
                  <div className="text-[10px] text-slate-300/80">
                    Subtle gradient glow across dashboard &amp; arcade turns
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Save Details Checkbox */}
          <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/80 border border-white/10 hover:border-white/20 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={saveNewPlayerDetails}
              onChange={(e) => setSaveNewPlayerDetails(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded accent-emerald-500 cursor-pointer"
            />
            <div className="flex-1">
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <Bookmark className="w-3.5 h-3.5 text-emerald-400" />
                Save player details &amp; custom theme
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                {saveNewPlayerDetails
                  ? 'Account, darts colour theme, and stats will stay saved on this device.'
                  : 'Session-only guest: keeps their darts colour tonight, then clears when the app closes.'}
              </p>
            </div>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAddPlayerModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl text-xs bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold transition-colors"
            >
              {saveNewPlayerDetails ? 'Save Profile' : 'Add Session Guest'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Quick Customize Existing Player's Darts Colour Modal */}
      <Modal
        isOpen={Boolean(editingColorPlayer)}
        onClose={() => setEditingColorPlayerId(null)}
        title={editingColorPlayer ? `${editingColorPlayer.name}'s Darts Colour` : 'Darts Colour'}
        description="Updates the subtle custom gradient tint whenever it's their turn."
        maxWidth="sm"
      >
        {editingColorPlayer && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {DART_COLOR_OPTIONS.map((opt) => {
                const selected =
                  (editingColorPlayer.dartColor || DEFAULT_DART_COLOR).toLowerCase() ===
                  opt.hex.toLowerCase();
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      updatePlayerProfile(editingColorPlayer.id, {
                        dartColor: opt.hex,
                        dartColorName: opt.label,
                      });
                      setEditingColorPlayerId(null);
                    }}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      selected
                        ? 'bg-white/10 border-white/60'
                        : 'bg-slate-900/80 border-white/10 hover:border-white/30'
                    }`}
                  >
                    <span
                      className="w-5 h-5 rounded-full shrink-0"
                      style={{ backgroundColor: opt.hex }}
                    />
                    <span className="text-xs font-bold text-slate-200 truncate">
                      {opt.label.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/70 border border-white/10">
              <span className="text-xs font-semibold text-slate-300">Custom Colour</span>
              <input
                type="color"
                value={editingColorPlayer.dartColor || DEFAULT_DART_COLOR}
                onChange={(e) =>
                  updatePlayerProfile(editingColorPlayer.id, {
                    dartColor: e.target.value,
                    dartColorName: getDartColorLabel(e.target.value),
                  })
                }
                className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
              />
            </div>
          </div>
        )}
      </Modal>
    </header>
  );
};
