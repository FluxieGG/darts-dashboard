import React, { useState } from 'react';
import { RemoteCommand, RemoteKioskState } from '../../types/remote';
import { DartCounterIcon } from '../common/DartCounterIcon';
import { cn } from '../../lib/utils';
import {
  ArrowRight,
  BellRing,
  Bot,
  Check,
  Clapperboard,
  Crosshair,
  Globe,
  LogOut,
  Play,
  RotateCcw,
  Send,
  Undo2,
  Users,
  Wifi,
  X,
} from 'lucide-react';

interface DartCounterRemoteScreenProps {
  state: RemoteKioskState | null;
  dispatch: (cmd: RemoteCommand, feedbackLabel?: string) => Promise<void>;
}

const BOT_LEVEL_AVGS: Record<number, string> = {
  1: '~25',
  2: '~30',
  3: '~35',
  4: '~42',
  5: '~48',
  6: '~55',
  7: '~62',
  8: '~70',
  9: '~78',
  10: '~86',
  11: '~95',
  12: '~105',
};

const QUICK_TARGETS = ['T20', 'S20', 'T19', 'T18', 'D20', 'D16', 'Bull', '25', 'Miss'] as const;

/**
 * Dedicated Target DartCounter Light / Vibrant Orange iPad Controller Screen.
 * Lets you start DartBot/Online games, accept/decline incoming friend invites,
 * monitor live scores & checkout routes, switch Auto-Score mode, and send/undo scores
 * directly in Brave's `app.dartcounter.net` webapp from the oche.
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
  const pendingInvites = om?.dcPendingInvites || [];
  const camBuffering = state?.replayStatus === 'buffering';
  const camCapturing = state?.replayStatus === 'capturing';

  return (
    <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 pt-4 pb-24 md:pb-8 space-y-4">
      {/* =====================================================================
          TOP TARGET DARTCOUNTER STATUS & AUTO-SCORE CONTROL BAR
         ===================================================================== */}
      <section className="rounded-3xl bg-white border border-slate-200 p-4 sm:p-5 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.08)] space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#F76505] to-[#FF8A3D] text-white flex items-center justify-center shrink-0 shadow-[0_6px_18px_-4px_rgba(247,101,5,0.5)]">
              <DartCounterIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-tight">
                Target DartCounter Controller
              </h2>
              <p className="text-xs font-mono text-slate-500 truncate">
                {om?.dcLastControlStatus ||
                  om?.dcLastSubmitStatus ||
                  (dcConnected
                    ? 'Brave webapp linked — control games & auto-scoring live'
                    : 'Waiting for Brave (app.dartcounter.net) extension...')}
              </p>
            </div>
          </div>

          {/* Crisp Red / Green Live Status Pill */}
          {hasLiveMatch ? (
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border-2 border-emerald-500/60 text-xs font-mono font-black text-emerald-800">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              Connected • Match Live
            </span>
          ) : dcConnected ? (
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FFF3EB] border-2 border-[#F76505]/55 text-xs font-mono font-black text-[#C2410C]">
              <Wifi className="w-3.5 h-3.5 text-[#F76505]" />
              Brave Ready • No Match
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-50 border-2 border-rose-400/60 text-xs font-mono font-black text-rose-700">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              Brave Offline
            </span>
          )}
        </div>

        {/* Auto-Scoring Mode Switcher */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
          {(
            [
              { id: 'auto', label: 'Auto-Log Scores', desc: 'Instant on 3rd dart' },
              { id: 'confirm', label: 'iPad Confirm', desc: '1-tap send' },
              { id: 'read-only', label: 'Sync TV Only', desc: 'Read-only' },
            ] as const
          ).map((m) => {
            const active = (om?.dcMode || 'auto') === m.id;
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
                    ? 'bg-[#F76505] border-[#F76505] text-white shadow-[0_6px_16px_-4px_rgba(247,101,5,0.45)]'
                    : 'bg-[#F4F5F7] border-slate-200 text-slate-700 hover:border-[#F76505]/40'
                )}
              >
                <div className="text-xs font-black leading-tight">{m.label}</div>
                <div
                  className={cn(
                    'text-[10px] font-mono mt-0.5',
                    active ? 'text-orange-100' : 'text-slate-500'
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
          MAIN 2-COLUMN IPAD CONTROLLER LAYOUT
         ===================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN (7 cols): Live Match Scoreboard + Oche Controls */}
        <div className="md:col-span-7 space-y-4">
          {/* Live Match / Current Visit Card */}
          <section className="rounded-3xl bg-white border border-slate-200 p-4 sm:p-5 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.08)] space-y-4">
            {hasLiveMatch && om ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {/* You */}
                  <div
                    className={cn(
                      'p-3.5 rounded-2xl border-2 transition-all',
                      om.isPlayerTurn
                        ? 'bg-[#FFF7F2] border-[#F76505]'
                        : 'bg-[#F4F5F7] border-slate-200'
                    )}
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono uppercase font-black">
                      <span className={om.isPlayerTurn ? 'text-[#F76505]' : 'text-slate-500'}>
                        {state?.activePlayer.name || 'You'}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-slate-900 text-white tabular-nums">
                        {om.playerLegs}
                      </span>
                    </div>
                    <div className="text-4xl sm:text-5xl font-black font-mono tabular-nums text-slate-950 leading-none mt-1.5">
                      {om.remaining}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 mt-1">
                      3DA {om.legThreeDartAvg.toFixed(1)} • {om.dartsInLeg}d
                    </div>
                  </div>

                  {/* Opponent */}
                  <div
                    className={cn(
                      'p-3.5 rounded-2xl border-2 transition-all',
                      !om.isPlayerTurn
                        ? 'bg-[#FFF7F2] border-[#F76505]'
                        : 'bg-[#F4F5F7] border-slate-200'
                    )}
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono uppercase font-black">
                      <span className="text-slate-600 truncate pr-1">{om.opponentName}</span>
                      <span className="px-2 py-0.5 rounded-lg bg-slate-700 text-white tabular-nums">
                        {om.opponentLegs}
                      </span>
                    </div>
                    <div className="text-4xl sm:text-5xl font-black font-mono tabular-nums text-slate-800 leading-none mt-1.5">
                      {om.opponentRemaining ?? '—'}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 mt-1">
                      {om.opponentAvg !== null ? `3DA ${om.opponentAvg.toFixed(1)}` : 'Live Sync'}
                    </div>
                  </div>
                </div>

                {/* Checkout Route Strip */}
                {om.checkoutRoute && (
                  <div className="p-3 rounded-2xl bg-[#107C41] text-white flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-black uppercase tracking-wider">
                      Checkout ({om.remaining})
                    </span>
                    <div className="flex items-center gap-1.5">
                      {om.checkoutRoute.map((step, i) => (
                        <span
                          key={`${step}-${i}`}
                          className={cn(
                            'px-2.5 py-1 rounded-lg font-mono font-black text-sm',
                            i === 0 ? 'bg-[#F76505] text-white' : 'bg-white text-slate-950'
                          )}
                        >
                          {step}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="p-4 rounded-2xl bg-[#F4F5F7] border border-slate-200 text-center space-y-1">
                <div className="text-sm font-black text-slate-800">
                  No Active DartCounter Match Yet
                </div>
                <div className="text-xs font-mono text-slate-500">
                  Launch a DartBot match or open Online Friends on the right — TV updates automatically.
                </div>
              </div>
            )}

            {/* Live 3-Dart Visit Pills */}
            <div className="grid grid-cols-4 gap-2">
              {[0, 1, 2].map((idx) => {
                const dart = state?.currentVisitThrows[idx];
                return (
                  <div
                    key={idx}
                    className={cn(
                      'h-16 rounded-2xl border-2 flex flex-col items-center justify-center',
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
                    <span className="text-lg font-black font-mono leading-none">
                      {dart ? dart.name : '—'}
                    </span>
                    {dart && <span className="text-[10px] font-mono opacity-80 mt-0.5">{dart.score}</span>}
                  </div>
                );
              })}

              <div className="h-16 rounded-2xl bg-slate-900 text-white flex flex-col items-center justify-center">
                <span className="text-[10px] font-mono uppercase text-slate-400">Visit</span>
                <span className="text-2xl font-black font-mono tabular-nums text-[#FF8A3D] leading-none mt-0.5">
                  {state?.visitScore ?? 0}
                </span>
              </div>
            </div>

            {/* 1-Tap Confirm or Force-Send Current Visit to DartCounter */}
            {om?.dcPendingVisit ? (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border-2 border-[#107C41] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-black text-emerald-900">
                    Ready to Submit:{' '}
                    <span className="font-mono text-base text-[#107C41]">
                      {om.dcPendingVisit.score} pts
                    </span>{' '}
                    ({om.dcPendingVisit.throws.join(' • ')})
                  </div>
                  <button
                    type="button"
                    onClick={() => void dispatch({ type: 'dc_discard_visit' }, 'Skipped Visit')}
                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-xs font-bold text-slate-600 cursor-pointer"
                  >
                    Skip
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void dispatch(
                      { type: 'dc_confirm_visit' },
                      `Sent ${om.dcPendingVisit!.score} to DartCounter!`
                    )
                  }
                  className="w-full py-3 rounded-xl bg-[#107C41] hover:bg-emerald-700 text-white font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  Send {om.dcPendingVisit.score} to DartCounter
                </button>
              </div>
            ) : (
              hasLiveMatch &&
              (state?.currentVisitThrows.length || 0) > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    void dispatch(
                      { type: 'dc_force_send_visit' },
                      `Sending ${state?.visitScore ?? 0} to DartCounter...`
                    )
                  }
                  className="w-full py-2.5 px-4 rounded-xl bg-[#107C41] hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  Send Current Visit ({state?.visitScore ?? 0}) to DartCounter Now
                </button>
              )
            )}
          </section>

          {/* Primary Oche Action Pads */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => void dispatch({ type: 'next_turn_takeout' }, 'Next Turn / Pull Darts')}
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

          {/* Match Utility Row: Clip That, Rematch, Leave Match */}
          <div className="grid grid-cols-3 gap-2.5">
            <button
              type="button"
              disabled={!camBuffering || camCapturing}
              onClick={() =>
                void dispatch({ type: 'trigger_manual_replay' }, 'Recording 20s Clip!')
              }
              className={cn(
                'p-3 rounded-2xl border font-black text-xs flex items-center justify-center gap-1.5 active:scale-[0.97] cursor-pointer',
                camBuffering
                  ? 'bg-rose-50 border-rose-300 text-rose-700 hover:bg-rose-100'
                  : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
              )}
            >
              <Clapperboard className="w-4 h-4" />
              <span>{camCapturing ? 'Clipping...' : 'Clip (20s)'}</span>
            </button>

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
              <span>Leave</span>
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

            {/* DartBot Level Stepper */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono font-bold">
                <span className="uppercase text-slate-500">DartBot Level</span>
                <span className="text-[#F76505] font-black">
                  Level {botLevel} ({BOT_LEVEL_AVGS[botLevel] || '~50'} 3DA)
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={12}
                value={botLevel}
                onChange={(e) => setBotLevel(Number(e.target.value))}
                className="w-full accent-[#F76505] cursor-pointer"
              />
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

          {/* Online Lobby & Friend Invites Control Card */}
          <section className="rounded-3xl bg-white border border-slate-200 p-4 sm:p-5 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.08)] space-y-3">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[#107C41]" />
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
                Online Play &amp; Friends
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  void dispatch(
                    { type: 'dc_control', command: { action: 'open_online' } },
                    'Opened Online Lobby in Brave'
                  )
                }
                className="py-3 px-3 rounded-2xl bg-[#F4F5F7] hover:bg-orange-50 border border-slate-200 hover:border-[#F76505]/50 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
              >
                <Globe className="w-4 h-4 text-[#F76505]" />
                Online Lobby
              </button>

              <button
                type="button"
                onClick={() =>
                  void dispatch(
                    { type: 'dc_control', command: { action: 'open_friends' } },
                    'Opened Friends & Invites in Brave'
                  )
                }
                className="py-3 px-3 rounded-2xl bg-[#F4F5F7] hover:bg-emerald-50 border border-slate-200 hover:border-[#107C41]/50 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
              >
                <Users className="w-4 h-4 text-[#107C41]" />
                Friends / Invites
              </button>
            </div>

            <button
              type="button"
              onClick={() =>
                void dispatch(
                  { type: 'dc_control', command: { action: 'accept_invite' } },
                  'Checking & accepting latest invite in Brave...'
                )
              }
              className="w-full py-3 px-4 rounded-2xl bg-[#107C41] hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Accept Pending Friend Invite
            </button>
          </section>
        </div>
      </div>
    </main>
  );
};
