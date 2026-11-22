import React, { useState } from 'react';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useLayoutStore } from '../../store/useLayoutStore';
import { useLiveBoardStore } from '../../store/useLiveBoardStore';
import { generateSimulatedVisit } from '../../services/simulator';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import {
  SlidersHorizontal,
  Settings,
  Maximize2,
  Minimize2,
  ChevronDown,
  UserPlus,
  Play,
  RotateCw,
  Wifi,
  Cloud,
  Check,
} from 'lucide-react';

interface HeaderProps {
  onOpenSettings: () => void;
  isLocalConnected: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onOpenSettings, isLocalConnected }) => {
  const { activePlayerId, players, setActivePlayer, addPlayer, getActivePlayer } =
    usePlayerStore();
  const activePlayer = getActivePlayer();

  const {
    dataMode,
    isAutoSimulating,
    toggleAutoSimulating,
  } = useSettingsStore();

  const openDrawer = useLayoutStore((s) => s.openDrawer);
  const addSimulatedDart = useLiveBoardStore((s) => s.addSimulatedDart);

  const [isPlayerMenuOpen, setIsPlayerMenuOpen] = useState(false);
  const [isAddPlayerModalOpen, setIsAddPlayerModalOpen] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerNickname, setNewPlayerNickname] = useState('');
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
    addPlayer(newPlayerName.trim(), newPlayerNickname.trim() || undefined);
    setNewPlayerName('');
    setNewPlayerNickname('');
    setIsAddPlayerModalOpen(false);
    setIsPlayerMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-[#0B0F17]/95 backdrop-blur-md border-b border-white/[0.1] px-4 py-3.5 sm:px-6">
      <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Left: Brand + Active Player Switcher */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-emerald-300 flex items-center justify-center shadow-[0_0_18px_rgba(16,185,129,0.45)]">
              <span className="font-mono font-black text-slate-950 text-base">AD</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-extrabold text-white tracking-tight leading-tight">
                AUTODARTS
              </h1>
              <span className="text-[11px] text-slate-400 uppercase tracking-widest font-mono">
                Live Dashboard
              </span>
            </div>
          </div>

          <div className="h-7 w-px bg-white/15 hidden sm:block" />

          {/* Player Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsPlayerMenuOpen(!isPlayerMenuOpen)}
              className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-900/90 border border-white/15 hover:border-white/30 transition-all text-sm sm:text-base font-bold text-white shadow-sm"
            >
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
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
                <div className="absolute left-0 top-full mt-2 w-56 rounded-xl bg-[#131A26] border border-white/10 shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95">
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                    Switch Profile
                  </div>
                  {players.map((p) => {
                    const isSelected = p.id === activePlayerId;
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          setActivePlayer(p.id);
                          setIsPlayerMenuOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-white/5 transition-colors"
                      >
                        <div className="flex flex-col">
                          <span className={`font-medium ${isSelected ? 'text-emerald-400' : 'text-slate-200'}`}>
                            {p.name} {p.isPrimary && '(Primary)'}
                          </span>
                          {p.nickname && (
                            <span className="text-[10px] text-slate-500">{p.nickname}</span>
                          )}
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-emerald-400" />}
                      </button>
                    );
                  })}
                  <div className="border-t border-white/10 my-1" />
                  <button
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

          {/* Layout Customizer Drawer Button */}
          <button
            onClick={openDrawer}
            title="Customize Bento Layout"
            className="p-2 rounded-xl bg-slate-900/80 text-slate-300 hover:text-white hover:bg-white/10 border border-white/10 transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4" />
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

      {/* Add Player Modal */}
      <Modal
        isOpen={isAddPlayerModalOpen}
        onClose={() => setIsAddPlayerModalOpen(false)}
        title="Add New Player Profile"
        description="Key stats by player to switch between practice profiles or friends."
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
              placeholder="e.g. Guest 1"
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
              placeholder="e.g. Practice Profile"
              className="w-full rounded-xl bg-slate-900 border border-white/10 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
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
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold transition-colors"
            >
              Add Profile
            </button>
          </div>
        </form>
      </Modal>
    </header>
  );
};
