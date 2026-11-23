import React, { useMemo } from 'react';
import { useOnlineMatchStore } from '../../store/useOnlineMatchStore';
import { useLiveBoardStore } from '../../store/useLiveBoardStore';
import { DartCounterIcon } from '../common/DartCounterIcon';
import { cn } from '../../lib/utils';
import {
  BellRing,
  CheckCircle2,
  ExternalLink,
  Radio,
  ShieldCheck,
  Swords,
  Tablet,
  Users,
  VideoOff,
  Wifi,
} from 'lucide-react';

/**
 * Lightweight Target DartCounter Handoff Screen (Light / Vibrant Orange Theme).
 *
 * Instead of mirroring a heavy custom kiosk scoreboard or running Oche-Cam clipping
 * (which is disabled in DartCounter for rock-solid stability), this screen simply
 * directs players to use the official Target DartCounter web app (`app.dartcounter.net/match`)
 * while Autodarts auto-scoring streams every visit to the iPad for 1-tap confirmation.
 */
export const DartCounterKioskArena: React.FC = () => {
  const {
    isActive,
    source,
    startScore,
    opponentName,
    dcConnected,
    dcMode,
    dcMatchUrl,
    dcLastSubmitStatus,
    dcPendingInvites,
    dcOnlineFriends,
    dcOutgoingInviteTo,
  } = useOnlineMatchStore();

  const boardStatus = useLiveBoardStore((s) => s.boardStatus);
  const currentVisitThrows = useLiveBoardStore((s) => s.currentVisitThrows);
  const visitScore = useLiveBoardStore((s) => s.visitScore);

  const hasLiveMatch = isActive && source === 'dartcounter';
  const matchUrl =
    dcMatchUrl && /^https?:\/\//i.test(dcMatchUrl)
      ? dcMatchUrl
      : 'https://app.dartcounter.net/match';

  const activeFriends = useMemo(
    () =>
      (dcOnlineFriends || []).filter((f) =>
        ['online', 'in_lobby', 'in_queue', 'spectating', 'online_game', 'local_game', 'busy'].includes(
          (f.status || '').toLowerCase()
        )
      ),
    [dcOnlineFriends]
  );

  const scoringLabel =
    dcMode === 'confirm'
      ? 'iPad Confirm ON'
      : dcMode === 'auto'
      ? 'Auto-Log ON'
      : 'Sync Only';

  // =========================================================================
  // ONLINE MATCH STARTED -> HANDOFF TO OFFICIAL APP.DARTCOUNTER.NET/MATCH
  // =========================================================================
  if (hasLiveMatch) {
    return (
      <div className="max-w-4xl mx-auto px-5 sm:px-8 pt-8 pb-12 space-y-6">
        <section className="rounded-3xl bg-white border-2 border-[#F76505] shadow-[0_18px_48px_-12px_rgba(247,101,5,0.28)] overflow-hidden">
          <div className="h-3 w-full bg-gradient-to-r from-[#F76505] via-[#FF8533] to-[#107C41]" />

          <div className="p-8 sm:p-12 flex flex-col items-center text-center space-y-7">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-[#F76505] to-[#FF8A3D] text-white flex items-center justify-center shadow-[0_14px_36px_-6px_rgba(247,101,5,0.55)]">
              <DartCounterIcon className="w-14 h-14" />
            </div>

            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs sm:text-sm font-mono font-black uppercase tracking-widest border bg-emerald-50 border-emerald-400/70 text-[#107C41]">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                Target DartCounter • {startScore}
                {opponentName && opponentName !== 'DartCounter Opponent'
                  ? ` vs ${opponentName}`
                  : ''}
              </div>

              <h2 className="text-4xl sm:text-6xl font-black tracking-tight text-slate-950 leading-tight">
                Online Match Started
              </h2>

              <p className="text-lg sm:text-2xl text-slate-600 font-semibold leading-relaxed">
                Switch to Target DartCounter to play your match.
              </p>
            </div>

            {/* Prominent Destination Callout */}
            <a
              href={matchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group w-full max-w-xl rounded-2xl bg-[#FFF4EC] hover:bg-[#FFEAD9] border-2 border-[#F76505] px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 transition-colors"
            >
              <div className="text-center sm:text-left min-w-0">
                <div className="text-xs font-mono uppercase tracking-widest font-black text-[#C2410C]">
                  Go To Official App
                </div>
                <div className="text-2xl sm:text-3xl font-black font-mono text-slate-950 tracking-tight truncate mt-0.5">
                  app.dartcounter.net/match
                </div>
              </div>
              <span className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#F76505] group-hover:bg-[#E05600] text-white font-black text-sm uppercase tracking-wider shrink-0 shadow-md">
                <span>Open</span>
                <ExternalLink className="w-4 h-4" />
              </span>
            </a>

            {/* Clear iPad Auto-Scorer Instructions */}
            <div className="w-full max-w-xl rounded-2xl bg-[#F4F5F7] border border-slate-200 p-5 text-left flex items-start gap-4">
              <div className="w-11 h-11 rounded-2xl bg-[#107C41] text-white flex items-center justify-center shrink-0">
                <Tablet className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="text-base font-black text-slate-900">
                  Autodarts Auto-Scorer → iPad Confirm Active
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Throw as normal — Autodarts sends your 3-dart total straight to the{' '}
                  <strong className="text-slate-900">iPad Oche Deck</strong> so you can confirm and
                  submit it directly into DartCounter with 1 tap.
                </p>
              </div>
            </div>

            {/* Compact Live Telemetry Pills */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-emerald-50 border border-emerald-300 text-sm font-mono font-black text-emerald-800">
                <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
                {scoringLabel}
              </div>

              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-100 border border-slate-200 text-sm font-mono font-bold text-slate-700">
                <VideoOff className="w-4 h-4 text-slate-500" />
                Clipping Disabled
              </div>

              {currentVisitThrows.length > 0 && (
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#FFF3EB] border border-[#FDBA74] text-sm font-mono font-black text-[#C2410C]">
                  <span>
                    Board: {currentVisitThrows.map((t) => t.segment.name).join(' • ')} ={' '}
                    {visitScore}
                  </span>
                </div>
              )}
            </div>

            {dcLastSubmitStatus && (
              <div className="text-xs sm:text-sm font-mono font-bold text-slate-500 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#107C41] shrink-0" />
                <span>{dcLastSubmitStatus}</span>
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  // =========================================================================
  // STANDBY SCREEN (NO DARTCOUNTER MATCH DETECTED YET)
  // =========================================================================
  return (
    <div className="max-w-4xl mx-auto px-5 sm:px-8 pt-8 pb-12 space-y-6">
      <section className="rounded-3xl bg-white border border-slate-200 shadow-[0_12px_36px_-10px_rgba(15,23,42,0.1)] overflow-hidden">
        <div className="h-2.5 w-full bg-gradient-to-r from-[#F76505] via-[#FF8533] to-[#107C41]" />

        <div className="p-8 sm:p-12 flex flex-col items-center text-center space-y-6">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-[#F76505] to-[#FF8A3D] text-white flex items-center justify-center shadow-[0_12px_32px_-6px_rgba(247,101,5,0.48)]">
            <DartCounterIcon className="w-11 h-11" />
          </div>

          <div className="space-y-2.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs sm:text-sm font-mono font-black uppercase tracking-widest border bg-[#FFF3EB] border-[#FDBA74] text-[#C2410C]">
              <DartCounterIcon className="w-4 h-4 text-[#F76505]" />
              Target DartCounter • Auto-Scorer Mode
            </div>
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900">
              Start Your Match on DartCounter
            </h2>
            <p className="text-base sm:text-xl text-slate-600 font-medium leading-relaxed">
              Open <strong className="text-slate-900 font-mono">app.dartcounter.net/match</strong>{' '}
              in Brave (or launch a game from your iPad). Use DartCounter&apos;s own app on screen
              while Autodarts sends each visit to your{' '}
              <strong className="text-[#F76505]">iPad to confirm &amp; enter</strong>.
            </p>
          </div>

          {/* Live Connection Status Pills */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <div
              className={cn(
                'inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl border-2 text-sm font-mono font-black',
                dcConnected
                  ? 'bg-emerald-50 border-emerald-500/50 text-emerald-800'
                  : 'bg-rose-50 border-rose-400/50 text-rose-800'
              )}
            >
              <span
                className={cn(
                  'w-2.5 h-2.5 rounded-full',
                  dcConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                )}
              />
              <Wifi className="w-4 h-4" />
              {dcConnected ? 'Brave DartCounter Linked' : 'Awaiting Brave (app.dartcounter.net)'}
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#FFF3EB] border border-[#FDBA74] text-sm font-mono font-black text-[#C2410C]">
              <ShieldCheck className="w-4 h-4 text-[#F76505]" />
              {scoringLabel}
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-100 border border-slate-200 text-sm font-mono font-bold text-slate-700">
              <VideoOff className="w-4 h-4 text-slate-500" />
              Clipping Disabled
            </div>

            <div
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 rounded-2xl border text-sm font-mono font-bold',
                activeFriends.length > 0
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-slate-100 border-slate-200 text-slate-600'
              )}
            >
              <Users className="w-4 h-4 text-[#107C41]" />
              <span>
                {activeFriends.length > 0
                  ? `${activeFriends.length} Friend${activeFriends.length === 1 ? '' : 's'} Online`
                  : 'No Friends Online'}
              </span>
            </div>
          </div>

          <a
            href="https://app.dartcounter.net/match"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-sm uppercase tracking-wider transition-colors"
          >
            <span>Open app.dartcounter.net/match</span>
            <ExternalLink className="w-4 h-4 text-[#FF8A3D]" />
          </a>

          {boardStatus && currentVisitThrows.length > 0 && (
            <div className="text-xs font-mono font-bold text-slate-500">
              Live Board: {currentVisitThrows.map((t) => t.segment.name).join(' • ')} = {visitScore}
            </div>
          )}
        </div>
      </section>

      {/* Active Outgoing Friend Challenge Banner */}
      {dcOutgoingInviteTo && (
        <section className="rounded-3xl bg-[#FFF4EC] border-2 border-[#F76505] p-6 shadow-[0_12px_36px_-8px_rgba(247,101,5,0.25)] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#F76505] text-white flex items-center justify-center">
              <Swords className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="text-xs font-mono uppercase tracking-widest font-black text-[#C2410C]">
                Friend Challenge Sent
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900">
                Waiting for {dcOutgoingInviteTo} to accept...
              </h3>
            </div>
          </div>
          <span className="px-4 py-2 rounded-xl bg-white border border-orange-300 text-[#C2410C] font-mono font-black text-xs uppercase">
            Open Brave when accepted
          </span>
        </section>
      )}

      {/* Live Incoming Friend Invites Banner */}
      {dcPendingInvites.length > 0 && (
        <section className="rounded-3xl bg-[#FFF4EC] border-2 border-[#F76505] p-6 sm:p-8 shadow-[0_12px_36px_-8px_rgba(247,101,5,0.3)] space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[#F76505] text-white flex items-center justify-center animate-bounce">
                <BellRing className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-mono uppercase tracking-widest font-black text-[#C2410C]">
                  Incoming Friend Challenge
                </div>
                <h3 className="text-2xl sm:text-3xl font-black text-slate-900">
                  {dcPendingInvites[0].fromName} invited you to play!
                </h3>
              </div>
            </div>
            <span className="px-4 py-2 rounded-xl bg-[#F76505] text-white font-black text-sm uppercase tracking-wider">
              Tap Accept on iPad
            </span>
          </div>
          <div className="text-base sm:text-lg font-mono font-bold text-slate-700">
            {dcPendingInvites[0].summary}
          </div>
        </section>
      )}
    </div>
  );
};
