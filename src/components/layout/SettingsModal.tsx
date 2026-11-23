import React, { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useReplayStore } from '../../store/useReplayStore';
import { ocheCamService } from '../../services/ocheCamService';
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
  Video,
  VideoOff,
  FolderOpen,
  FlaskConical,
  RefreshCw,
  Mic,
  Clapperboard,
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
  const {
    status: camStatus,
    errorMessage: camError,
    boardFeedError,
    availableCameras,
    autoStartCamera,
    selectedDeviceId,
    includeAudio,
    saveDir,
    triggers,
    devCaptureNextDartArmed,
    refreshCameras,
    startCamera,
    stopCamera,
    setAutoStartCamera,
    setSelectedDeviceId,
    setIncludeAudio,
    setSaveDir,
    updateTrigger,
    armDevNextDartCapture,
    cancelDevNextDartCapture,
    openGallery,
  } = useReplayStore();

  const [clientIdInput, setClientIdInput] = useState(cloudClientId);
  const [wsUrlInput, setWsUrlInput] = useState(localWsUrl);
  const [httpUrlInput, setHttpUrlInput] = useState(localHttpUrl);
  const [saveDirInput, setSaveDirInput] = useState(saveDir);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [dirSaved, setDirSaved] = useState(false);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      void refreshCameras();
      setSaveDirInput(saveDir);
      setWsUrlInput(localWsUrl);
      setHttpUrlInput(localHttpUrl);
      setClientIdInput(cloudClientId);
    }
  }, [isOpen, refreshCameras, saveDir, localWsUrl, localHttpUrl, cloudClientId]);

  useEffect(() => {
    const videoEl = previewVideoRef.current;
    if (!videoEl) return;
    if (isOpen && (camStatus === 'buffering' || camStatus === 'capturing')) {
      videoEl.srcObject = ocheCamService.getStream();
    } else {
      videoEl.srcObject = null;
    }
  }, [isOpen, camStatus]);

  /* [DEV-TEST: REMOVE WHEN DONE] Auto-starts camera if idle and arms next-dart capture */
  const handleArmDevCapture = async () => {
    if (devCaptureNextDartArmed) {
      cancelDevNextDartCapture();
      return;
    }
    if (camStatus !== 'buffering' && camStatus !== 'capturing') {
      await startCamera();
    }
    if (ocheCamService.isRunning()) {
      armDevNextDartCapture();
    }
  };

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

        {/* Oche-Cam & Action Replays (Auto-Clipper) */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-rose-500/20 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Video className="w-4 h-4 text-rose-400" />
              <h4 className="font-semibold text-white text-xs uppercase tracking-wider">
                Oche-Cam &amp; Action Replays (10s Rolling Buffer)
              </h4>
            </div>
            <span
              className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-full border ${
                camStatus === 'buffering'
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : camStatus === 'capturing'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-400/50 animate-pulse'
                  : camStatus === 'error'
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                  : 'bg-slate-800 text-slate-400 border-white/10'
              }`}
            >
              {camStatus === 'buffering'
                ? 'Live Buffer Armed'
                : camStatus === 'capturing'
                ? 'Capturing Clip...'
                : camStatus === 'starting'
                ? 'Starting...'
                : camStatus === 'error'
                ? 'Camera Error'
                : 'Off'}
            </span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Stitches your <strong className="text-slate-200">Oche Reaction Cam (Left)</strong> and{' '}
            <strong className="text-slate-200">Dartboard Cam (Right)</strong> side-by-side into one
            10-second broadcast WebM clip (~5s before impact + ~5s reaction).
          </p>

          {/* LEFT CAMERA: Oche / Player Reaction Cam */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-rose-300 font-bold">
              Left Split — Oche / Reaction Webcam
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedDeviceId}
                onChange={(e) => {
                  setSelectedDeviceId(e.target.value);
                  if (camStatus === 'buffering' || camStatus === 'error') {
                    void startCamera({ ocheDeviceId: e.target.value, strictSelection: true });
                  }
                }}
                className="flex-1 min-w-[180px] bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-rose-400"
              >
                {availableCameras.length === 0 ? (
                  <option value="">Default Webcam (click Start to grant permission)</option>
                ) : (
                  availableCameras.map((cam) => (
                    <option key={cam.deviceId} value={cam.deviceId}>
                      {cam.label}
                      {cam.isAutodartsBoardCam ? ' [Autodarts Board Cam]' : ''}
                    </option>
                  ))
                )}
              </select>

              <button
                type="button"
                onClick={() => void refreshCameras()}
                title="Refresh camera list"
                className="p-2 rounded-lg bg-slate-950 border border-white/10 text-slate-300 hover:text-white cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>

              {camStatus === 'buffering' || camStatus === 'capturing' ? (
                <button
                  type="button"
                  onClick={stopCamera}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-rose-200 text-xs font-bold cursor-pointer"
                >
                  <VideoOff className="w-3.5 h-3.5" />
                  Stop Cams
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void startCamera()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-300 text-xs font-bold cursor-pointer"
                >
                  <Video className="w-3.5 h-3.5" />
                  Start Split-Cam
                </button>
              )}
            </div>
          </div>

          {/* RIGHT CAMERA: Consolidated 3-in-1 Straight-On Board Cam */}
          <div className="p-3 rounded-xl bg-slate-950/60 border border-emerald-500/25 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-[11px] font-mono uppercase tracking-wider text-emerald-300 font-bold">
                Right Split — 3-in-1 Straight-On Board Cam (Locked)
              </label>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-[10px] font-mono font-bold text-emerald-300">
                3-Cam Fused Front View • Port 3180
              </span>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Reads Autodarts&apos; lightweight raw 3-camera stream from{' '}
              <code className="text-slate-200">127.0.0.1:3180/api/streams/live</code> (zero impact on
              Autodarts scoring) and renders a GPU WebGL straight-on Virtual Board Camera exclusively
              for action replay clips.
            </p>

            {boardFeedError && (
              <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-400/35 text-[11px] text-amber-200">
                {boardFeedError}
              </div>
            )}
          </div>

          {camError && (
            <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200">
              {camError}
            </div>
          )}

          {/* Live Side-by-Side Composite Preview */}
          {(camStatus === 'buffering' || camStatus === 'capturing') && (
            <div className="relative rounded-xl overflow-hidden bg-black border border-white/15">
              <video
                ref={previewVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full max-h-48 object-contain block mx-auto"
              />
              <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/75 text-[10px] font-mono font-bold text-emerald-300 flex items-center gap-1.5 border border-white/10">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                OCHE + 3 BOARD CAMS LIVE
              </span>
            </div>
          )}

          {/* Save Folder Path */}
          <div className="space-y-1">
            <label className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
              Clip Output Folder
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={saveDirInput}
                onChange={(e) => setSaveDirInput(e.target.value)}
                className="flex-1 bg-slate-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => {
                  setSaveDir(saveDirInput.trim());
                  setDirSaved(true);
                  setTimeout(() => setDirSaved(false), 1800);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                {dirSaved ? 'Saved ✓' : 'Set Folder'}
              </button>
            </div>
          </div>

          {/* Auto-Clip Trigger Checkboxes */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
            {[
              { key: 'onBullseye' as const, label: 'Bullseye (50)' },
              { key: 'onT20' as const, label: 'Treble 20' },
              { key: 'onTonPlus' as const, label: '100+ Visits' },
              { key: 'on140Plus' as const, label: '140+ / 180s' },
              { key: 'autoShowOverlay' as const, label: 'Auto-Pop Replay' },
            ].map((item) => (
              <label
                key={item.key}
                className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/60 border border-white/[0.07] text-xs text-slate-200 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={triggers[item.key]}
                  onChange={(e) => updateTrigger(item.key, e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-rose-500 cursor-pointer"
                />
                <span>{item.label}</span>
              </label>
            ))}

            <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/60 border border-white/[0.07] text-xs text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={includeAudio}
                onChange={(e) => setIncludeAudio(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-rose-500 cursor-pointer"
              />
              <Mic className="w-3 h-3 text-slate-400" />
              <span>Mic Audio</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/60 border border-emerald-500/20 text-xs text-emerald-200 cursor-pointer col-span-2 sm:col-span-3">
              <input
                type="checkbox"
                checked={autoStartCamera}
                onChange={(e) => setAutoStartCamera(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-emerald-500 cursor-pointer"
              />
              <span>Auto-Start Side-by-Side Split-Cam during Kiosk Boot (Default)</span>
            </label>
          </div>

          {/* =================================================================
              [DEV-TEST: REMOVE WHEN DONE]
              One-shot Next-Dart Debug Capture (records ANY next dart thrown)
              ================================================================= */}
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-400/35 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-mono font-black uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                <FlaskConical className="w-3.5 h-3.5" />
                Dev Test: Capture Next Dart
              </span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  openGallery();
                }}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-300 hover:text-sky-200 cursor-pointer"
              >
                <Clapperboard className="w-3.5 h-3.5" />
                Open Gallery
              </button>
            </div>
            <p className="text-[11px] text-amber-100/80 leading-snug">
              Arms a one-shot debug watch for the very next dart (any bed). Clips ~5s before impact
              + dart landing spot + ~5s reaction straight to your autoclipper folder.
            </p>
            <button
              type="button"
              onClick={() => void handleArmDevCapture()}
              className={`w-full py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider border transition-all cursor-pointer ${
                devCaptureNextDartArmed
                  ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.45)]'
                  : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border-amber-400/50'
              }`}
            >
              {devCaptureNextDartArmed
                ? 'ARMED — Close Settings & Throw Any Dart (Click to Cancel)'
                : 'Arm Next-Dart 10s Debug Capture'}
            </button>
          </div>
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
