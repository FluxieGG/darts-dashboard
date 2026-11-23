import React, { useEffect, useState } from 'react';
import { RemoteCommand, RemoteKioskState } from '../../types/remote';
import { DartCounterIcon } from '../common/DartCounterIcon';
import { cn } from '../../lib/utils';
import {
  ArrowRight,
  BellRing,
  Bot,
  Check,
  CheckCircle2,
  Crosshair,
  ExternalLink,
  Globe,
  LogOut,
  Minus,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Swords,
  Undo2,
  Users,
  VideoOff,
  Wifi,
  X,
} from 'lucide-react';

interface DartCounterRemoteScreenProps {
  state: RemoteKioskState | null;
  dispatch: (cmd: RemoteCommand, feedbackLabel?: string) => Promise<void>;
}

const BOT_LEVEL_AVGS: Record<number, string> = {
  1: '~20',
  2: '~25',
  3: '~30',
  4: '~35',
  5: '~40',
  6: '~45',
  7: '~50',
  8: '~55',
  9: '~60',
  10: '~65',
  11: '~70',
  12: '~75',
  13: '~80',
  14: '~85',
  15: '~90',
  16: '~95',
  17: '~100',
  18: '~105',
  19: '~110',
  20: '~115',
};

function getFriendStatusMeta(status: string): {
  label: string;
  dotClass: string;
  badgeClass: string;
  canInvite: boolean;
  sortOrder: number;
} {
  const s = (status || 'offline').toLowerCase();
  if (s === 'online' || s === 'in_lobby') {
    return {
      label: s === 'in_lobby' ? 'In Lobby' : 'Online',
      dotClass: 'bg-emerald-500',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      canInvite: true,
      sortOrder: 0,
    };
  }
  if (s === 'in_queue' || s === 'spectating') {
    return {
      label: s === 'in_queue' ? 'In Queue' : 'Spectating',
      dotClass: 'bg-emerald-400',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      canInvite: true,
      sortOrder: 1,
    };
  }
  if (s === 'online_game' || s === 'local_game' || s === 'busy') {
    return {
      label:
        s === 'online_game'
          ? 'In Online Game'
          : s === 'local_game'
          ? 'In Local Game'
          : 'Busy',
      dotClass: 'bg-amber-500',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      canInvite: false,
      sortOrder: 2,
    };
  }
  return {
    label: 'Offline',
    dotClass: 'bg-slate-300',
    badgeClass: 'bg-slate-100 text-slate-500 border-slate-200',
    canInvite: false,
    sortOrder: 3,
  };
}

const QUICK_TARGETS = ['T20', 'S20', 'T19', 'T18', 'D20', 'D16', 'Bull', '25', 'Miss'] as const;

/**
 * Dedicated Target DartCounter iPad Auto-Scorer & Confirm Controller.
 *
 * - Clipping / Action Replays are DISABLED in DartCounter for rock-solid stability.
 * - Play matches directly in Target DartCounter (`app.dartcounter.net/match`), while
 *   Autodarts sends each visit total here so you can verify (or tweak) and submit it
 *   into DartCounter with 1 giant tap from the oche.
 */
export const DartCounterRemoteScreen: React.FC<DartCounterRemoteScreenProps> = ({
  state,
  dispatch,
}) => {
  const [startScore, setStartScore] = useState<501 | 301 | 701>(501);
  const [outRule, setOutRule] = useState<'double' | 'straight'>('double');
  const [legsToWin, setLegsToWin] = useState<number>(3);
  const [botLevel, setBotLevel] = useState<number>(4);
  const [showQuickPad, setShowQuickPad] = useState(false);

  const om = state?.onlineMatch;
  const dcConnected = Boolean(om?.dcConnected);
  const hasLiveMatch = Boolean(om?.isActive && om.source === 'dartcounter');
  const pendingVisit = om?.dcPendingVisit || null;
  const pendingInvites = om?.dcPendingInvites || [];
  const onlineFriends = [...(om?.dcOnlineFriends || [])].sort(
    (a, b) =>
      getFriendStatusMeta(a.status).sortOrder - getFriendStatusMeta(b.status).sortOrder ||
      a.name.localeCompare(b.name)
  );
  const activeFriendsCount = onlineFriends.filter(
    (f) => getFriendStatusMeta(f.status).sortOrder < 3
  ).length;
  const outgoingInviteTo = om?.dcOutgoingInviteTo || null;

  // Editable score state synced to the currently queued pending visit (lets player fix misreads in 1 second!)
  const [editedPendingScore, setEditedPendingScore] = useState<number | null>(null);
  const [editedVisitId, setEditedVisitId] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingVisit) {
      setEditedPendingScore(null);
      setEditedVisitId(null);
      return;
    }
    if (pendingVisit.id !== editedVisitId) {
      setEditedVisitId(pendingVisit.id);
      setEditedPendingScore(pendingVisit.score);
    }
  }, [pendingVisit, editedVisitId]);

  const effectivePendingScore =
    pendingVisit !== null
      ? editedPendingScore !== null
        ? editedPendingScore
        : pendingVisit.score
      : null;

  const adjustPendingScore = (delta: number) => {
    if (effectivePendingScore === null) return;
    setEditedPendingScore(Math.max(0, Math.min(180, effectivePendingScore + delta)));
  };

  const handleConfirmPending = () => {
    if (!pendingVisit || effectivePendingScore === null) return;
    const isModified = effectivePendingScore !== pendingVisit.score;
    void dispatch(
      {
        type: 'dc_confirm_visit',
        overrideScore: isModified ? effectivePendingScore : undefined,
      },
      `Sent ${effectivePendingScore} to DartCounter!`
    );
  };

  const liveBoardThrows = state?.currentVisitThrows || [];
  const liveVisitTotal = state?.visitScore ?? 0;

  return (
    <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 pt-4 pb-24 md:pb-8 space-y-4">
      {/* =====================================================================
          TOP TARGET DARTCOUNTER STATUS & AUTO-SCORE MODE BAR
         ===================================================================== */}
      <section className="rounded-3xl bg-white border border-slate-200 p-4 sm:p-5 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.08)] space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#F76505] to-[#FF8A3D] text-white flex items-center justify-center shrink-0 shadow-[0_6px_18px_-4px_rgba(247,101,5,0.5)]">
              <DartCounterIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-tight">
                Target DartCounter Auto-Scorer
              </h2>
              <p className="text-xs font-mono text-slate-500 truncate">
                {om?.dcLastSubmitStatus ||
                  om?.dcLastControlStatus ||
                  (dcConnected
                    ? 'Brave linked — confirm Autodarts totals here to submit into DartCounter'
                    : 'Waiting for Brave (app.dartcounter.net/match) extension...')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Clipping Disabled Stability Pill */}
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-[11px] font-mono font-bold text-slate-600">
              <VideoOff className="w-3.5 h-3.5 text-slate-500" />
              Clips Off
            </span>

            {/* Crisp Red / Green Live Status Pill */}
            {hasLiveMatch ? (
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border-2 border-emerald-500/60 text-xs font-mono font-black text-emerald-800">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                Match Active
              </span>
            ) : dcConnected ? (
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FFF3EB] border-2 border-[#F76505]/55 text-xs font-mono font-black text-[#C2410C]">
                <Wifi className="w-3.5 h-3.5 text-[#F76505]" />
                Brave Linked
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-50 border-2 border-rose-400/60 text-xs font-mono font-black text-rose-700">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                Brave Offline
              </span>
            )}
          </div>
        </div>

        {/* Auto-Scoring Mode Switcher (iPad Confirm is primary default) */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
          {(
            [
              { id: 'confirm', label: 'iPad Confirm', desc: 'Confirm & send total' },
              { id: 'auto', label: 'Auto-Log', desc: 'Instant on 3rd dart' },
              { id: 'read-only', label: 'Off / Manual', desc: 'Don’t submit scores' },
            ] as const
          ).map((m) => {
            const active = (om?.dcMode || 'confirm') === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() =>
                  void dispatch({ type: 'dc_set_mode', mode: m.id }, `DartCounter → ${m.label}`)
                }
                className={cn(
                  'py-2.5 px-2 rounded-2xl border-2 text-center transition-all active:scale-[0.98] cursor-pointer',
                  active
                    ? m.id === 'confirm'
                      ? 'bg-[#107C41] border-[#107C41] text-white shadow-[0_6px_16px_-4px_rgba(16,124,65,0.45)]'
                      : 'bg-[#F76505] border-[#F76505] text-white shadow-[0_6px_16px_-4px_rgba(247,101,5,0.45)]'
                    : 'bg-[#F4F5F7] border-slate-200 text-slate-700 hover:border-[#F76505]/40'
                )}
              >
                <div className="text-xs font-black leading-tight">{m.label}</div>
                <div
                  className={cn(
                    'text-[10px] font-mono mt-0.5',
                    active ? 'text-white/85' : 'text-slate-500'
                  )}
                >
                  {m.desc}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* =====================================================================
          INCOMING FRIEND INVITES ALERT (Accept / Decline Directly From iPad!)
         ===================================================================== */}
      {pendingInvites.length > 0 && (
        <section className="rounded-3xl bg-[#FFF4EC] border-2 border-[#F76505] p-4 sm:p-5 shadow-[0_10px_28px_-6px_rgba(247,101,5,0.3)] space-y-3">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest font-black text-[#C2410C]">
            <BellRing className="w-4 h-4 text-[#F76505] animate-bounce" />
            Incoming Friend Invites ({pendingInvites.length})
          </div>
          <div className="space-y-2.5">
            {pendingInvites.map((inv) => (
              <div
                key={inv.id}
                className="p-3.5 rounded-2xl bg-white border border-orange-200 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-base font-black text-slate-900 truncate">
                    {inv.fromName}
                  </div>
                  <div className="text-xs font-mono text-slate-600 truncate">{inv.summary}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      void dispatch(
                        {
                          type: 'dc_control',
                          command: {
                            action: 'accept_invite',
                            inviteId: inv.id,
                            fromName: inv.fromName,
                          },
                        },
                        `Accepted ${inv.fromName}'s invite!`
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#107C41] hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider active:scale-95 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void dispatch(
                        {
                          type: 'dc_control',
                          command: {
                            action: 'decline_invite',
                            inviteId: inv.id,
                            fromName: inv.fromName,
                          },
                        },
                        `Declined ${inv.fromName}'s invite`
                      )
                    }
                    className="inline-flex items-center gap-1 px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-rose-50 border border-slate-200 text-slate-700 hover:text-rose-700 font-bold text-xs uppercase tracking-wider active:scale-95 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* =====================================================================
          MAIN 2-COLUMN IPAD AUTO-SCORER CONFIRM LAYOUT
         ===================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN (7 cols): HERO AUTODARTS CONFIRM & SEND DECK */}
        <div className="md:col-span-7 space-y-4">
          {/* Online Match Handoff Strip */}
          {hasLiveMatch && om ? (
            <section className="rounded-3xl bg-[#FFF4EC] border-2 border-[#F76505] p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-mono uppercase tracking-wider font-black text-[#C2410C] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Online Match Started • Use app.dartcounter.net/match
                </div>
                <div className="text-sm sm:text-base font-black text-slate-900 mt-0.5 truncate">
                  {state?.activePlayer.name || 'You'} ({om.remaining}) vs {om.opponentName} (
                  {om.opponentRemaining ?? '—'}) • Legs {om.playerLegs}–{om.opponentLegs}
                </div>
              </div>
              <a
                href={om.dcMatchUrl || 'https://app.dartcounter.net/match'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-orange-300 text-xs font-black text-[#C2410C] hover:bg-orange-50 shrink-0"
              >
                <span>DartCounter</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </section>
          ) : (
            <section className="rounded-3xl bg-white border border-slate-200 p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-black text-slate-900">
                  Play directly on app.dartcounter.net/match
                </div>
                <div className="text-xs font-mono text-slate-500">
                  Autodarts throws appear below for 1-tap score confirmation into DartCounter.
                </div>
              </div>
              <a
                href="https://app.dartcounter.net/match"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F4F5F7] border border-slate-200 text-xs font-bold text-slate-700 shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5 text-[#F76505]" />
                <span>Open</span>
              </a>
            </section>
          )}

          {/* HERO AUTO-SCORER CARD: LIVE BOARD THROWS + GIANT CONFIRM & SEND */}
          <section className="rounded-3xl bg-white border border-slate-200 p-4 sm:p-5 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.08)] space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono uppercase tracking-wider font-black text-slate-500">
                Autodarts Live Board Readout
              </span>
              <span className="text-xs font-mono font-bold text-slate-500">
                {state?.isLocalConnected ? 'Board Live (3180)' : 'Board Offline'}
              </span>
            </div>

            {/* Live 3-Dart Visit Pills + Total */}
            <div className="grid grid-cols-4 gap-2.5">
              {[0, 1, 2].map((idx) => {
                const dart = liveBoardThrows[idx];
                return (
                  <div
                    key={idx}
                    className={cn(
                      'h-20 rounded-2xl border-2 flex flex-col items-center justify-center transition-all',
                      dart
                        ? dart.bouncer || dart.score === 0
                          ? 'bg-rose-50 border-rose-400 text-rose-700'
                          : dart.multiplier === 3
                          ? 'bg-[#FFF3EB] border-[#F76505] text-[#C2410C]'
                          : dart.multiplier === 2
                          ? 'bg-emerald-50 border-[#107C41] text-[#107C41]'
                          : 'bg-slate-900 border-slate-900 text-white'
                        : 'bg-[#F4F5F7] border-dashed border-slate-300 text-slate-400'
                    )}
                  >
                    <span className="text-xl font-black font-mono leading-none">
                      {dart ? dart.name : '—'}
                    </span>
                    {dart && (
                      <span className="text-[11px] font-mono opacity-80 mt-1">{dart.score}</span>
                    )}
                  </div>
                );
              })}

              <div className="h-20 rounded-2xl bg-slate-900 text-white flex flex-col items-center justify-center">
                <span className="text-[10px] font-mono uppercase text-slate-400">Total</span>
                <span className="text-3xl font-black font-mono tabular-nums text-[#FF8A3D] leading-none mt-0.5">
                  {liveVisitTotal}
                </span>
              </div>
            </div>

            {/* ===============================================================
                GIANT IPAD CONFIRM & SUBMIT VISIT BOX
               =============================================================== */}
            {pendingVisit && effectivePendingScore !== null ? (
              <div className="rounded-3xl bg-emerald-50 border-2 border-[#107C41] p-4 sm:p-5 space-y-4 shadow-[0_12px_32px_-8px_rgba(16,124,65,0.3)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-mono uppercase tracking-widest font-black text-[#107C41] flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      Confirm Score for DartCounter
                    </div>
                    <div className="text-xs sm:text-sm font-mono font-bold text-slate-600 mt-1">
                      Darts: {pendingVisit.throws.join(' • ')}
                      {pendingVisit.isCheckout && (
                        <span className="ml-2 px-2 py-0.5 rounded-md bg-[#107C41] text-white text-[10px] font-black uppercase">
                          Checkout
                        </span>
                      )}
                      {pendingVisit.isBust && (
                        <span className="ml-2 px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-black uppercase">
                          Bust
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void dispatch({ type: 'dc_discard_visit' }, 'Skipped Visit')}
                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 border border-slate-300 text-xs font-bold text-slate-700 hover:text-rose-700 cursor-pointer shrink-0"
                  >
                    Skip
                  </button>
                </div>

                {/* Big Editable Total Score Stepper (fix any misread dart in 1 second) */}
                <div className="flex items-center justify-between gap-2 bg-white rounded-2xl border border-emerald-200 p-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => adjustPendingScore(-5)}
                      className="px-2.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-mono font-black text-xs active:scale-95 cursor-pointer"
                    >
                      -5
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustPendingScore(-1)}
                      className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center justify-center active:scale-95 cursor-pointer"
                      aria-label="Decrease score by 1"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex flex-col items-center">
                    <input
                      type="number"
                      min={0}
                      max={180}
                      inputMode="numeric"
                      value={effectivePendingScore}
                      onChange={(e) => {
                        const raw = parseInt(e.target.value, 10);
                        setEditedPendingScore(
                          Number.isNaN(raw) ? 0 : Math.max(0, Math.min(180, raw))
                        );
                      }}
                      className="w-28 text-center text-5xl font-black font-mono tabular-nums text-slate-950 bg-transparent focus:outline-none focus:ring-2 focus:ring-[#107C41]/40 rounded-xl"
                      aria-label="Total visit score to submit"
                    />
                    {effectivePendingScore !== pendingVisit.score && (
                      <button
                        type="button"
                        onClick={() => setEditedPendingScore(pendingVisit.score)}
                        className="text-[10px] font-mono font-bold text-[#F76505] underline cursor-pointer"
                      >
                        Reset to {pendingVisit.score}
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => adjustPendingScore(1)}
                      className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center justify-center active:scale-95 cursor-pointer"
                      aria-label="Increase score by 1"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustPendingScore(5)}
                      className="px-2.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-mono font-black text-xs active:scale-95 cursor-pointer"
                    >
                      +5
                    </button>
                  </div>
                </div>

                {/* GIANT 1-TAP CONFIRM & SEND BUTTON */}
                <button
                  type="button"
                  onClick={handleConfirmPending}
                  className="w-full py-4 px-5 rounded-2xl bg-[#107C41] hover:bg-emerald-700 text-white font-black text-base sm:text-lg uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-[0_10px_24px_-4px_rgba(16,124,65,0.5)] active:scale-[0.98] cursor-pointer"
                >
                  <Send className="w-5 h-5" />
                  <span>Confirm &amp; Send {effectivePendingScore} to DartCounter</span>
                </button>
              </div>
            ) : liveBoardThrows.length > 0 ? (
              <button
                type="button"
                onClick={() =>
                  void dispatch(
                    { type: 'dc_force_send_visit' },
                    `Sending ${liveVisitTotal} to DartCounter...`
                  )
                }
                className="w-full py-3.5 px-4 rounded-2xl bg-[#107C41] hover:bg-emerald-700 text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer shadow-md"
              >
                <Send className="w-4 h-4" />
                Confirm &amp; Send {liveVisitTotal} to DartCounter Now
              </button>
            ) : (
              <div className="p-4 rounded-2xl bg-[#F4F5F7] border border-dashed border-slate-300 text-center space-y-1">
                <div className="text-sm font-black text-slate-800">
                  Waiting for Your Next Visit...
                </div>
                <div className="text-xs font-mono text-slate-500">
                  Throw 3 darts on the board — your total will pop up here ready to confirm &amp;
                  send into DartCounter.
                </div>
              </div>
            )}

            {/* Latest Submit Result Feedback */}
            {om?.dcLastSubmitStatus && (
              <div className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-xs font-mono">
                <span className="text-slate-500 font-bold uppercase">Last Submit</span>
                <span className="text-slate-900 font-bold truncate">{om.dcLastSubmitStatus}</span>
              </div>
            )}
          </section>

          {/* Primary Oche Action Pads */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => void dispatch({ type: 'next_turn_takeout' }, 'Next Turn / Clear Board')}
              className="p-4 rounded-2xl bg-[#F76505] hover:bg-[#E05600] text-white flex flex-col items-center justify-center gap-1 shadow-[0_8px_20px_-4px_rgba(247,101,5,0.45)] active:scale-[0.97] cursor-pointer"
            >
              <ArrowRight className="w-6 h-6" />
              <span className="text-sm font-black">Next Turn</span>
              <span className="text-[10px] font-mono text-orange-100">Pull Darts / Commit</span>
            </button>

            <button
              type="button"
              onClick={() =>
                void dispatch(
                  { type: 'dc_control', command: { action: 'undo_score' } },
                  'Sent Undo to DartCounter'
                )
              }
              className="p-4 rounded-2xl bg-white hover:bg-slate-50 border-2 border-slate-200 text-slate-800 flex flex-col items-center justify-center gap-1 active:scale-[0.97] cursor-pointer"
            >
              <Undo2 className="w-6 h-6 text-[#F76505]" />
              <span className="text-sm font-black">Undo in DartCounter</span>
              <span className="text-[10px] font-mono text-slate-500">Revert last score</span>
            </button>
          </div>

          {/* Match Utility Row: Rematch & Leave Match (No Clip Button!) */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() =>
                void dispatch(
                  { type: 'dc_control', command: { action: 'rematch' } },
                  'Sent Rematch to DartCounter'
                )
              }
              className="p-3 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-[0.97] cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-[#F76505]" />
              <span>Rematch</span>
            </button>

            <button
              type="button"
              onClick={() =>
                void dispatch(
                  { type: 'dc_control', command: { action: 'leave_match' } },
                  'Leaving DartCounter Match...'
                )
              }
              className="p-3 rounded-2xl bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-300 text-rose-700 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-[0.97] cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Leave Match</span>
            </button>
          </div>

          {/* Collapsible Manual Quick Throw Pad */}
          <button
            type="button"
            onClick={() => setShowQuickPad((v) => !v)}
            className="w-full py-2.5 px-4 rounded-2xl bg-white border border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Crosshair className="w-4 h-4 text-[#F76505]" />
            {showQuickPad ? 'Hide Quick Throw Pad' : 'Open Manual Throw / Correction Pad'}
          </button>

          {showQuickPad && (
            <div className="rounded-2xl bg-white border border-slate-200 p-3.5 grid grid-cols-3 sm:grid-cols-9 gap-1.5">
              {QUICK_TARGETS.map((target) => (
                <button
                  key={target}
                  type="button"
                  onClick={() => void dispatch({ type: 'inject_dart', target }, `Threw ${target}`)}
                  className={cn(
                    'py-2.5 rounded-xl font-mono font-black text-xs border active:scale-95 cursor-pointer',
                    target === 'Miss'
                      ? 'bg-rose-50 border-rose-300 text-rose-700'
                      : target === 'Bull' || target.startsWith('T')
                      ? 'bg-[#FFF3EB] border-[#FDBA74] text-[#C2410C]'
                      : 'bg-[#F4F5F7] border-slate-200 text-slate-900'
                  )}
                >
                  {target}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN (5 cols): Start Games & Online / Friend Invites Launcher */}
        <div className="md:col-span-5 space-y-4">
          {/* Quick-Start DartBot Match Card */}
          <section className="rounded-3xl bg-white border border-slate-200 p-4 sm:p-5 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.08)] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-[#F76505]" />
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
                  Start DartBot Match
                </h3>
              </div>
              <span className="text-[11px] font-mono font-bold text-slate-500">in Brave</span>
            </div>

            {/* X01 Score Selector */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-mono uppercase font-bold text-slate-500">
                Starting Score
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {([501, 301, 701] as const).map((sc) => (
                  <button
                    key={sc}
                    type="button"
                    onClick={() => setStartScore(sc)}
                    className={cn(
                      'py-2 rounded-xl text-sm font-mono font-black border-2 transition-colors cursor-pointer',
                      startScore === sc
                        ? 'bg-[#F76505] border-[#F76505] text-white'
                        : 'bg-[#F4F5F7] border-slate-200 text-slate-700'
                    )}
                  >
                    {sc}
                  </button>
                ))}
              </div>
            </div>

            {/* Out Rule + Legs */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono uppercase font-bold text-slate-500">
                  Finish Rule
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {(
                    [
                      { id: 'double', label: 'Double' },
                      { id: 'straight', label: 'Straight' },
                    ] as const
                  ).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setOutRule(r.id)}
                      className={cn(
                        'py-2 rounded-xl text-[11px] font-black border cursor-pointer',
                        outRule === r.id
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : 'bg-[#F4F5F7] border-slate-200 text-slate-600'
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[10px] font-mono uppercase font-bold text-slate-500">
                  First To Legs
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {[1, 3, 5].map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLegsToWin(l)}
                      className={cn(
                        'py-2 rounded-xl text-xs font-mono font-black border cursor-pointer',
                        legsToWin === l
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : 'bg-[#F4F5F7] border-slate-200 text-slate-600'
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* DartBot Level Stepper (1..20 matching DartCounter) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono font-bold">
                <span className="uppercase text-slate-500">DartBot Level (1–20)</span>
                <span className="text-[#F76505] font-black">
                  Level {botLevel} ({BOT_LEVEL_AVGS[botLevel] || '~50'} 3DA)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBotLevel((v) => Math.max(1, v - 1))}
                  className="w-9 h-9 rounded-xl bg-[#F4F5F7] hover:bg-orange-50 border border-slate-200 text-slate-700 flex items-center justify-center shrink-0 active:scale-95 cursor-pointer"
                  aria-label="Decrease DartBot level"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={botLevel}
                  onChange={(e) => setBotLevel(Number(e.target.value))}
                  className="flex-1 accent-[#F76505] cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => setBotLevel((v) => Math.min(20, v + 1))}
                  className="w-9 h-9 rounded-xl bg-[#F4F5F7] hover:bg-orange-50 border border-slate-200 text-slate-700 flex items-center justify-center shrink-0 active:scale-95 cursor-pointer"
                  aria-label="Increase DartBot level"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                void dispatch(
                  {
                    type: 'dc_control',
                    command: {
                      action: 'start_dartbot',
                      startScore,
                      outRule,
                      legsToWin,
                      botLevel,
                    },
                  },
                  `Starting DartBot ${startScore} (Lvl ${botLevel}) in Brave!`
                )
              }
              className="w-full py-3.5 px-4 rounded-2xl bg-[#F76505] hover:bg-[#E05600] text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_8px_24px_-4px_rgba(247,101,5,0.5)] active:scale-[0.98] cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              Start DartBot {startScore}
            </button>
          </section>

          {/* Online Play & Live Friends List Card */}
          <section className="rounded-3xl bg-white border border-slate-200 p-4 sm:p-5 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.08)] space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Users className="w-5 h-5 text-[#107C41] shrink-0" />
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 truncate">
                  Online Friends
                </h3>
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-mono font-black border',
                    activeFriendsCount > 0
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : 'bg-slate-100 border-slate-200 text-slate-500'
                  )}
                >
                  {activeFriendsCount} online
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  void dispatch(
                    { type: 'dc_control', command: { action: 'refresh_friends' } },
                    'Refreshing DartCounter Friends...'
                  )
                }
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#F4F5F7] hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-slate-700 text-[11px] font-bold active:scale-95 cursor-pointer shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#107C41]" />
                Refresh
              </button>
            </div>

            {/* Active Outgoing Friend Challenge Banner */}
            {outgoingInviteTo && (
              <div className="p-3 rounded-2xl bg-[#FFF4EC] border-2 border-[#F76505] flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-mono uppercase font-black text-[#C2410C]">
                    Challenge Sent
                  </div>
                  <div className="text-xs font-black text-slate-900 truncate">
                    Waiting for {outgoingInviteTo}...
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void dispatch(
                      { type: 'dc_control', command: { action: 'cancel_invite' } },
                      'Cancelled friend invite'
                    )
                  }
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 border border-orange-300 text-rose-700 text-[11px] font-black uppercase active:scale-95 cursor-pointer shrink-0"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Live Friends List */}
            {onlineFriends.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
                {onlineFriends.map((friend) => {
                  const meta = getFriendStatusMeta(friend.status);
                  return (
                    <div
                      key={String(friend.userId)}
                      className="p-2.5 rounded-2xl bg-[#F4F5F7] border border-slate-200/90 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={cn(
                            'w-2.5 h-2.5 rounded-full shrink-0',
                            meta.dotClass,
                            meta.sortOrder === 0 && 'animate-pulse'
                          )}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-black text-slate-900 truncate">
                            {friend.name}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span
                              className={cn(
                                'px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold border leading-none',
                                meta.badgeClass
                              )}
                            >
                              {meta.label}
                            </span>
                            {typeof friend.avg === 'number' && friend.avg > 0 && (
                              <span className="text-[10px] font-mono text-slate-500">
                                {friend.avg.toFixed(1)} avg
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {meta.canInvite && (
                        <button
                          type="button"
                          onClick={() =>
                            void dispatch(
                              {
                                type: 'dc_control',
                                command: {
                                  action: 'invite_friend',
                                  userId: friend.userId,
                                  friendName: friend.name,
                                  startScore,
                                  outRule,
                                  legsToWin,
                                },
                              },
                              `Challenging ${friend.name} (${startScore}, First to ${legsToWin})!`
                            )
                          }
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#F76505] hover:bg-[#E05600] text-white text-[11px] font-black uppercase tracking-wide active:scale-95 cursor-pointer shrink-0 shadow-sm"
                        >
                          <Swords className="w-3.5 h-3.5" />
                          Play
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl bg-[#F4F5F7] border border-dashed border-slate-300 text-center space-y-1.5">
                <div className="text-xs font-bold text-slate-700">
                  {dcConnected
                    ? 'No friends synced yet'
                    : 'Waiting for Brave (app.dartcounter.net)'}
                </div>
                <div className="text-[11px] font-mono text-slate-500">
                  Tap Refresh or Friends Lobby below to pull your live DartCounter friends list.
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() =>
                  void dispatch(
                    { type: 'dc_control', command: { action: 'open_online' } },
                    'Opened Online Lobby in Brave'
                  )
                }
                className="py-2.5 px-3 rounded-2xl bg-[#F4F5F7] hover:bg-orange-50 border border-slate-200 hover:border-[#F76505]/50 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
              >
                <Globe className="w-4 h-4 text-[#F76505]" />
                Online Lobby
              </button>

              <button
                type="button"
                onClick={() =>
                  void dispatch(
                    { type: 'dc_control', command: { action: 'open_friends' } },
                    'Opened Friends Lobby in Brave'
                  )
                }
                className="py-2.5 px-3 rounded-2xl bg-[#F4F5F7] hover:bg-emerald-50 border border-slate-200 hover:border-[#107C41]/50 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
              >
                <Users className="w-4 h-4 text-[#107C41]" />
                Friends Lobby
              </button>
            </div>

            {pendingInvites.length === 0 && (
              <button
                type="button"
                onClick={() =>
                  void dispatch(
                    { type: 'dc_control', command: { action: 'accept_invite' } },
                    'Checking & accepting latest invite in Brave...'
                  )
                }
                className="w-full py-2.5 px-4 rounded-2xl bg-[#107C41] hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Accept Pending Friend Invite
              </button>
            )}
          </section>
        </div>
      </div>
    </main>
  );
};
