import React, { useEffect, useRef, useState } from 'react';
import { useReplayStore } from '../../store/useReplayStore';
import { Badge } from '../common/Badge';
import {
  CheckCircle2,
  Clapperboard,
  Columns2,
  FolderOpen,
  Gauge,
  Loader2,
  Radio,
  Tablet,
  Target,
} from 'lucide-react';

/**
 * Pure Full-Viewport Broadcast Action Replay Cinema (Kiosk Display).
 * Zero interactive buttons — playback speed, saving, and dismissal are controlled
 * remotely from the iPad Oche Command Deck.
 *
 * When the user taps "Save Clip" on the iPad, the video keeps playing smoothly
 * underneath a celebratory ~2.2s "CLIP SAVED!" broadcast animation, then automatically
 * returns to the live game with zero black flicker and zero extra Dismiss tap.
 */
export const ActionReplayOverlay: React.FC = () => {
  const {
    activeOverlayClip,
    playbackRate,
    devCaptureNextDartArmed,
    status,
    lastCaptureBanner,
    isSavingLastClip,
    savedConfirmation,
  } = useReplayStore();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [showStinger, setShowStinger] = useState(false);

  // Trigger spinning broadcast stinger whenever a new replay clip opens
  useEffect(() => {
    if (!activeOverlayClip) {
      setShowStinger(false);
      return;
    }

    setShowStinger(true);
    const timer = window.setTimeout(() => {
      setShowStinger(false);
    }, 920);

    return () => window.clearTimeout(timer);
  }, [activeOverlayClip?.id]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, activeOverlayClip, showStinger]);

  const isSaved = activeOverlayClip ? activeOverlayClip.isSavedToDisk !== false : true;

  return (
    <>
      {/* Passive Floating Live Status Pills (Dev Test Armed OR Currently Recording Post-Roll) */}
      {(devCaptureNextDartArmed || status === 'capturing') && !activeOverlayClip && (
        <div className="fixed top-20 right-4 sm:right-6 z-50 flex flex-col items-end gap-2 pointer-events-none">
          {status === 'capturing' && (
            <div className="px-4 py-2.5 rounded-2xl bg-rose-950/95 border-2 border-rose-400/70 text-rose-100 shadow-[0_0_28px_rgba(244,63,94,0.5)] flex items-center gap-2.5 animate-pulse">
              <Radio className="w-4 h-4 text-rose-400" />
              <span className="text-xs sm:text-sm font-black uppercase tracking-wider">
                {lastCaptureBanner || 'Capturing Split-Cam 5s Reaction...'}
              </span>
            </div>
          )}

          {/* [DEV-TEST: REMOVE WHEN DONE] Armed Banner */}
          {devCaptureNextDartArmed && status !== 'capturing' && (
            <div className="px-4 py-2.5 rounded-2xl bg-amber-950/95 border-2 border-amber-400/70 text-amber-100 shadow-[0_0_28px_rgba(245,158,11,0.45)] flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
              <div className="text-xs sm:text-sm font-black">
                DEV TEST ARMED: Throw any dart to record 10s split-cam replay
              </div>
            </div>
          )}
        </div>
      )}

      {/* Standalone "CLIP SAVED!" Banner if user saved from iPad after already closing the replay */}
      {savedConfirmation && !activeOverlayClip && (
        <div
          key={savedConfirmation.id}
          className="fixed inset-0 z-[60] pointer-events-none flex items-center justify-center p-6"
        >
          <div className="animate-clip-saved-pop px-8 py-6 rounded-3xl bg-[#0B0F17]/95 border-2 border-emerald-400/70 shadow-[0_0_70px_rgba(16,185,129,0.55)] text-center space-y-2 backdrop-blur-xl">
            <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto" />
            <div className="text-3xl font-black tracking-widest uppercase text-white">
              CLIP SAVED!
            </div>
            <div className="text-xs font-mono text-emerald-300">
              {savedConfirmation.subfolder} • {savedConfirmation.title}
            </div>
          </div>
        </div>
      )}

      {/* FULL-SCREEN MAX-SIZE FLIGHT CLUB ACTION REPLAY OVERLAY */}
      {activeOverlayClip && (
        <div className="fixed inset-0 z-50 bg-[#060911]/98 backdrop-blur-lg flex flex-col overflow-hidden">
          {/* Spinning Broadcast Stinger Intro (~0.92s) */}
          {showStinger && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#060911]/95 pointer-events-none">
              <div className="relative flex items-center justify-center">
                {/* Expanding Outer Orbit Ring */}
                <div className="absolute w-72 h-72 sm:w-96 sm:h-96 rounded-full border-4 border-dashed border-amber-400/70 animate-replay-orbit" />

                {/* Spinning Dartboard Reticle Crest */}
                <div className="animate-replay-stinger flex flex-col items-center justify-center">
                  <div className="w-40 h-40 sm:w-52 sm:h-52 rounded-full bg-gradient-to-tr from-rose-600 via-amber-500 to-emerald-400 p-2 shadow-[0_0_80px_rgba(244,63,94,0.85)]">
                    <div className="w-full h-full rounded-full bg-[#0B0F17] border-4 border-white/20 flex flex-col items-center justify-center relative">
                      <Target className="w-16 h-16 sm:w-20 sm:h-20 text-amber-300" />
                      <span className="font-mono font-black text-xl sm:text-2xl text-white mt-1">
                        {activeOverlayClip.segmentName}
                      </span>
                    </div>
                  </div>
                  <div className="mt-6 px-6 py-2 rounded-full bg-rose-600 text-white font-mono font-black text-lg sm:text-2xl uppercase tracking-[0.25em] shadow-[0_0_40px_rgba(244,63,94,0.8)]">
                    ACTION REPLAY
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Smooth "SAVING..." Spinner Pill over Live Video (zero black screen) */}
          {isSavingLastClip && !savedConfirmation && (
            <div className="absolute inset-0 z-40 bg-[#060911]/45 backdrop-blur-xs flex items-center justify-center pointer-events-none">
              <div className="px-7 py-5 rounded-3xl bg-[#0B0F17]/95 border-2 border-emerald-400/60 shadow-[0_0_50px_rgba(16,185,129,0.45)] flex items-center gap-4">
                <Loader2 className="w-8 h-8 text-emerald-400 animate-spin shrink-0" />
                <div>
                  <div className="text-xl sm:text-2xl font-black tracking-wide uppercase text-white">
                    Saving Clip...
                  </div>
                  <div className="text-xs font-mono text-emerald-300/90">
                    Writing HD split-cam video to disk
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Celebratory ~2.2s "CLIP SAVED!" Broadcast Overlay -> Auto-Resumes Game */}
          {savedConfirmation && (
            <div
              key={savedConfirmation.id}
              className="absolute inset-0 z-40 bg-[#060911]/72 backdrop-blur-md flex flex-col items-center justify-center p-6 pointer-events-none"
            >
              <div className="relative flex flex-col items-center justify-center animate-clip-saved-pop">
                {/* Expanding Emerald Shockwave Rings */}
                <div className="absolute w-48 h-48 sm:w-64 sm:h-64 rounded-full border-4 border-emerald-400/75 animate-clip-saved-ring" />
                <div
                  className="absolute w-48 h-48 sm:w-64 sm:h-64 rounded-full border-2 border-teal-300/60 animate-clip-saved-ring"
                  style={{ animationDelay: '0.45s' }}
                />

                {/* Glowing Checkmark Crest */}
                <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-gradient-to-tr from-emerald-600 via-emerald-400 to-teal-300 p-2 shadow-[0_0_90px_rgba(16,185,129,0.9)]">
                  <div className="w-full h-full rounded-full bg-[#0B0F17] border-4 border-white/25 flex items-center justify-center">
                    <CheckCircle2 className="w-20 h-20 sm:w-24 sm:h-24 text-emerald-400" />
                  </div>
                </div>

                {/* Bold 8ft-Glanceable Confirmation Title */}
                <div className="mt-6 px-8 py-2.5 rounded-full bg-emerald-500 text-slate-950 font-mono font-black text-2xl sm:text-4xl uppercase tracking-[0.22em] shadow-[0_0_50px_rgba(16,185,129,0.85)]">
                  CLIP SAVED!
                </div>

                <div className="mt-3 text-sm sm:text-lg font-bold text-white text-center max-w-xl">
                  {savedConfirmation.title}
                </div>
                <div className="mt-1 inline-flex items-center gap-1.5 text-xs sm:text-sm font-mono text-emerald-300/90">
                  <FolderOpen className="w-4 h-4" />
                  <span>{savedConfirmation.subfolder}</span>
                </div>

                {/* Smooth Auto-Resume Progress Bar */}
                <div className="mt-6 w-64 sm:w-80 space-y-1.5 text-center">
                  <div className="h-2 rounded-full bg-white/15 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-300 animate-clip-saved-progress" />
                  </div>
                  <div className="text-[11px] font-mono uppercase tracking-widest text-slate-300">
                    Resuming Game...
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Slim Broadcast Top Strip */}
          <div className="shrink-0 px-4 py-3 sm:px-6 bg-gradient-to-r from-rose-600/35 via-amber-500/20 to-emerald-600/25 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500 text-white font-mono text-xs sm:text-sm font-black uppercase tracking-widest shadow">
                <Clapperboard className="w-4 h-4" />
                Action Replay
              </span>
              <div className="min-w-0">
                <div className="text-base sm:text-2xl font-black text-white leading-tight truncate">
                  {activeOverlayClip.reason
                    .toLowerCase()
                    .includes(activeOverlayClip.playerName.toLowerCase())
                    ? activeOverlayClip.reason
                    : `${activeOverlayClip.playerName} — ${activeOverlayClip.reason}`}
                </div>
                <div className="text-[11px] font-mono text-slate-300/85">
                  {activeOverlayClip.durationSec.toFixed(1)}s clip (~{activeOverlayClip.preSeconds}s
                  before impact + {activeOverlayClip.postSeconds}s reaction)
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {activeOverlayClip.isDualCamera && (
                <Badge variant="sky" size="sm">
                  <Columns2 className="w-3 h-3" />
                  Side-by-Side
                </Badge>
              )}

              {isSaved ? (
                <Badge variant="emerald" size="sm" dot>
                  <CheckCircle2 className="w-3 h-3" />
                  Saved to Disk
                </Badge>
              ) : (
                <Badge variant="amber" size="sm" dot className="animate-pulse">
                  <Tablet className="w-3 h-3" />
                  Unsaved • Tap Save on iPad
                </Badge>
              )}

              {activeOverlayClip.isDevTest && (
                <Badge variant="amber" size="sm">
                  DEV TEST
                </Badge>
              )}
            </div>
          </div>

          {/* MAX-SIZE Edge-to-Edge Video Stage */}
          <div className="flex-1 min-h-0 w-full relative bg-black flex items-center justify-center p-2 sm:p-3 animate-replay-stage">
            <video
              ref={videoRef}
              src={activeOverlayClip.url}
              autoPlay
              loop
              playsInline
              onLoadedMetadata={() => {
                if (videoRef.current) {
                  videoRef.current.playbackRate = playbackRate;
                }
              }}
              className="w-full h-full object-contain rounded-xl"
            />

            {/* Floating Broadcast Score Bug */}
            <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-3 px-6 py-3 rounded-2xl bg-black/80 backdrop-blur-md border border-white/20 shadow-2xl">
              <Target className="w-5 h-5 text-emerald-400" />
              <span className="font-mono text-xl sm:text-3xl font-black text-white">
                {activeOverlayClip.segmentName}
              </span>
              <span className="h-6 w-px bg-white/20" />
              <span className="font-mono text-xl sm:text-3xl font-black text-amber-300 tabular-nums">
                {activeOverlayClip.score} PTS
              </span>
            </div>
          </div>

          {/* Slim Broadcast Bottom Telemetry Strip */}
          <div className="shrink-0 px-4 py-3 sm:px-6 bg-[#0B0F17] border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs font-mono text-slate-300">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-400/35 text-emerald-300 font-bold">
                <Gauge className="w-3.5 h-3.5" />
                {playbackRate === 1 ? '1.0x Normal' : `${playbackRate}x Slow-Mo`}
              </span>
              <span className="inline-flex items-center gap-1.5 text-slate-400">
                <Tablet className="w-3.5 h-3.5 text-sky-400" />
                Control speed, save or dismiss on iPad Oche Deck
              </span>
            </div>

            {isSaved && activeOverlayClip.filePath && (
              <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 max-w-full">
                <FolderOpen className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span
                  className="truncate max-w-[340px] sm:max-w-[560px]"
                  title={activeOverlayClip.filePath}
                >
                  {activeOverlayClip.filePath}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
