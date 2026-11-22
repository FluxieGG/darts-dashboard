import React, { useState } from 'react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { cloudService } from '../../services/cloudApi';
import { Modal } from '../common/Modal';
import {
  Wifi,
  Cloud,
  PlayCircle,
  Key,
  RotateCcw,
  ExternalLink,
  ShieldAlert,
  Server,
} from 'lucide-react';
import { DataConnectionMode } from '../../types/config';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLocalConnected: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  isLocalConnected,
}) => {
  const {
    dataMode,
    setDataMode,
    localWsUrl,
    setLocalWsUrl,
    localHttpUrl,
    setLocalHttpUrl,
    cloudClientId,
    setCloudClientId,
    cloudRedirectUri,
  } = useSettingsStore();

  const resetActiveStats = usePlayerStore((s) => s.resetSessionStats);
  const [clientIdInput, setClientIdInput] = useState(cloudClientId);
  const [wsUrlInput, setWsUrlInput] = useState(localWsUrl);
  const [httpUrlInput, setHttpUrlInput] = useState(localHttpUrl);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSaveUrls = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalWsUrl(wsUrlInput);
    setLocalHttpUrl(httpUrlInput);
    setCloudClientId(clientIdInput);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleConnectCloud = async () => {
    try {
      await cloudService.login();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Data Sources & Connectivity"
      description="Configure Autodarts Board Manager, Cloud OAuth, and simulator behavior"
      maxWidth="lg"
    >
      <div className="space-y-6 text-sm">
        {/* Mode Selector */}
        <div>
          <label className="block text-xs font-semibold uppercase text-slate-400 mb-2">
            Active Data Provider Mode
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: 'demo', label: 'Demo Simulator', icon: PlayCircle },
                { id: 'local', label: 'Local Board (3180)', icon: Wifi },
                { id: 'cloud', label: 'Autodarts Cloud', icon: Cloud },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const isSelected = dataMode === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setDataMode(item.id as DataConnectionMode)}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold transition-all ${
                    isSelected
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-[0_0_15px_-3px_rgba(16,185,129,0.2)]'
                      : 'bg-slate-900/60 border-white/5 text-slate-400 hover:border-white/20'
                  }`}
                >
                  <Icon className="w-5 h-5 mb-1.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Local Board Manager Settings */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-400" />
              <h4 className="font-semibold text-white text-xs uppercase tracking-wider">
                Local Board Manager (Zero-Auth)
              </h4>
            </div>
            <span
              className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-full border ${
                isLocalConnected
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
              }`}
            >
              {isLocalConnected ? 'Connected (Port 3180)' : 'Not Connected'}
            </span>
          </div>

          <p className="text-xs text-slate-400">
            Streams real-time dart coordinates directly from Autodarts Desktop / Board Manager
            running on your darts PC.
          </p>

          <form onSubmit={handleSaveUrls} className="space-y-2.5 pt-1">
            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">
                WebSocket Stream URL
              </label>
              <input
                type="text"
                value={wsUrlInput}
                onChange={(e) => setWsUrlInput(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">
                HTTP Poll Fallback URL
              </label>
              <input
                type="text"
                value={httpUrlInput}
                onChange={(e) => setHttpUrlInput(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                {savedSuccess ? 'Saved ✓' : 'Save Connection URLs'}
              </button>
            </div>
          </form>
        </div>

        {/* Autodarts Cloud OAuth 2.0 (PKCE) */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-white/5 space-y-3">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-sky-400" />
            <h4 className="font-semibold text-white text-xs uppercase tracking-wider">
              Autodarts Cloud API (OAuth 2.0 + PKCE)
            </h4>
          </div>

          <p className="text-xs text-slate-400">
            For online matches, historical stats, and cloud profiles. Uses Autodarts OIDC
            discovery at <code className="text-slate-300">api.autodarts.io</code>.
          </p>

          <div className="space-y-2">
            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">
                Client ID (Public Client)
              </label>
              <input
                type="text"
                value={clientIdInput}
                onChange={(e) => setClientIdInput(e.target.value)}
                placeholder="e.g. your-autodarts-client-id"
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="text-[11px] text-slate-500 font-mono">
              Redirect URI: <span className="text-slate-400">{cloudRedirectUri}</span>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleConnectCloud}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 border border-sky-500/30 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Authenticate with Autodarts</span>
              </button>
            </div>
          </div>
        </div>

        {/* Session Reset & Danger Zone */}
        <div className="pt-2 border-t border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span>Reset current session stats & throws</span>
          </div>
          <button
            onClick={() => {
              if (confirm('Clear current session stats and board coordinates?')) {
                resetActiveStats();
                onClose();
              }
            }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-400 hover:bg-rose-500/10 border border-rose-500/30 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Session</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};
