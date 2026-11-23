import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Crosshair,
  Gauge,
  LayoutDashboard,
  LogOut,
  Monitor,
  Play,
  RotateCcw,
  Save,
  Sliders,
  Sparkles,
  Square,
  Trophy,
  Undo2,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { GameDefinition } from '../../types/games';
import { RemoteActiveGameSnapshot, RemoteCommand, RemoteKioskState } from '../../types/remote';
import { DART_COLOR_OPTIONS, DEFAULT_DART_COLOR } from '../../lib/playerThemes';
import { Badge } from '../common/Badge';
import { cn } from '../../lib/utils';

interface CompanionGameProfile {
  /** Compact oche cheat-sheet chips tailored to this exact game/drill */
  quickKey: Array<{ label: string; value: string; tone?: 'emerald' | 'amber' | 'rose' | 'sky' | 'purple' }>;
  /** Helpful 1-line oche tip for players using the iPad */
  tip: string;
  /** Default multiplier selected on the manual correction pad */
  defaultMult?: 'S' | 'D' | 'T';
  /** Tailored quick-target buttons for manual correction / testing */
  quickTargets?: string[];
}

const DEFAULT_QUICK_TARGETS = ['T20', 'S20', 'T19', 'D20', 'D16', 'D8', 'Bull', '25', 'Miss'];
const BOARD_NUMBERS = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

const COMPANION_PROFILES: Record<string, CompanionGameProfile> = {
  'cals-quest': {
    quickKey: [
      { label: 'RPG Hits', value: 'S=1 • D=2 • T=3', tone: 'purple' },
      { label: 'Health Potion', value: '25 (+1♥)', tone: 'emerald' },
      { label: 'Greater Heal', value: 'Bull (+2♥ & Crit)', tone: 'amber' },
      { label: 'Path Choice', value: 'LEFT vs RIGHT Board', tone: 'sky' },
    ],
    tip: 'Between rooms, throw 1 dart at the LEFT HALF (11–19) or RIGHT HALF (6–17) to claim your Roguelike reward!',
    quickTargets: ['Bull', '25', 'T20', 'D20', 'S11', 'S6', 'T19', 'D16', 'Miss'],
  },
  'darts-golf': {
    quickKey: [
      { label: 'Treble / Double', value: '-2 Eagle • -1 Birdie', tone: 'amber' },
      { label: 'Any Single', value: 'E Par', tone: 'emerald' },
      { label: 'Miss on Board', value: '+1 Bogey', tone: 'sky' },
      { label: 'Off Board / Bull', value: '+2 Dbl • Gimme E', tone: 'rose' },
    ],
    tip: 'Every hole picks a fresh random target number (9 or 20 holes)! Any Single scores Par (E); missing on the board is +1 and off-board is +2.',
    quickTargets: ['T20', 'D20', 'T19', 'D16', 'T18', 'Bull', '25', 'S20', 'Miss'],
  },
  battleship: {
    quickKey: [
      { label: 'Hit / Sunk', value: 'Crimson / Rose', tone: 'rose' },
      { label: 'Sonar Ping', value: 'Doubles • Trebles • Bull', tone: 'amber' },
      { label: 'Victory', value: 'Sink Full Rival Fleet', tone: 'sky' },
    ],
    tip: 'Land a Double, Treble, or Bullseye to trigger an Amber Sonar Ping revealing an adjacent hidden enemy hull.',
  },
  cricket: {
    quickKey: [
      { label: 'Targets', value: '20 • 19 • 18 • 17 • 16 • 15 • Bull', tone: 'emerald' },
      { label: 'Marks', value: 'S=1 (/) • D=2 (X) • T=3 (⊗)', tone: 'amber' },
      { label: 'Bull', value: '25 = 1 Mark • Bull = 2 Marks', tone: 'sky' },
    ],
    tip: 'Close a number with 3 marks to open scoring — or dump penalty points onto open rivals in Cut-Throat!',
    quickTargets: ['T20', 'T19', 'T18', 'T17', 'T16', 'T15', 'Bull', '25', 'Miss'],
  },
  'sniper-bingo': {
    quickKey: [
      { label: 'Card', value: '3×3 Grid + Center Bull', tone: 'purple' },
      { label: 'Amber Pulse', value: '1 Square From Bingo!', tone: 'amber' },
      { label: 'Win', value: 'Line or Full Blackout', tone: 'emerald' },
    ],
    tip: 'Only your remaining un-stamped squares glow on the vertical dartboard during your turn.',
  },
  'board-is-lava': {
    quickKey: [
      { label: 'Safe Zone', value: 'Bank Points (D/T Bonus)', tone: 'emerald' },
      { label: 'Lava Wedge', value: 'Lose 1 Life!', tone: 'rose' },
      { label: 'Cool Down', value: 'Bull / 25 Extinguishes', tone: 'sky' },
    ],
    tip: 'More wedges ignite every round — hit Bull or 25 to extinguish an active lava segment!',
  },
  killer: {
    quickKey: [
      { label: 'Own Wedge', value: 'S+1 • D+2 • T+3 Lives', tone: 'emerald' },
      { label: 'Full Lives', value: 'KILLER UNLOCKED', tone: 'amber' },
      { label: 'Hunt Rivals', value: 'Hit Rival Wedge to Strip', tone: 'rose' },
    ],
    tip: 'Charge your own wedge to max lives first, then hunt rival wedges until you are the last player standing.',
  },
  snooker: {
    quickKey: [
      { label: 'Red', value: '1 pt', tone: 'rose' },
      { label: 'Yel / Grn / Brn', value: '2 / 3 / 4 pts', tone: 'amber' },
      { label: 'Blu / Pnk / Blk', value: '5 / 6 / 7 pts', tone: 'sky' },
    ],
    tip: 'Alternate potting glowing Reds and Colours to build your break — then clear Yellow → Black in strict order.',
  },
  demolition: {
    quickKey: [
      { label: 'In / Out', value: 'Single In • Double/Bull Out', tone: 'sky' },
      { label: 'Finish Guide', value: 'Live ≤170 Route on TV', tone: 'emerald' },
      { label: 'Bust', value: 'Below 0, Leave 1, or Non-Double 0', tone: 'rose' },
    ],
    tip: 'Watch the vertical monitor once ≤170 for automatic PDC Double-Out route highlights after every dart.',
  },
  shanghai: {
    quickKey: [
      { label: 'Active Target', value: 'Current Round Number', tone: 'purple' },
      { label: 'Scoring', value: 'S=1× • D=2× • T=3×', tone: 'emerald' },
      { label: 'Instant KO', value: 'S + D + T = SHANGHAI!', tone: 'amber' },
    ],
    tip: 'Nail a Single, Double, and Treble of the active round number in one visit to win immediately!',
  },
  'snakes-and-ladders': {
    quickKey: [
      { label: 'Advance', value: 'Darts Move Your Token', tone: 'sky' },
      { label: 'Ladders', value: 'Vault Up the Grid', tone: 'emerald' },
      { label: 'Snakes', value: 'Slide Down on Heads', tone: 'rose' },
    ],
    tip: 'Hit big beds to race up the 100-tile neon grid — watch out for exact bounce-back on the final square!',
  },
  'halve-it': {
    quickKey: [
      { label: 'Challenge Hit', value: 'Add Score to Bank', tone: 'emerald' },
      { label: '0 / 3 Hits', value: 'TOTAL SCORE HALVED!', tone: 'rose' },
      { label: 'Final Round', value: 'Bullseye Showdown', tone: 'amber' },
    ],
    tip: 'One safe hit protects your entire bank — missing all 3 darts slices your score in half!',
  },
  'donkey-derby': {
    quickKey: [
      { label: 'Your Lane', value: 'S+1 • D+2 • T+3 Steps', tone: 'emerald' },
      { label: 'Bullseye', value: 'Turbo Boost (+2 / +1)', tone: 'amber' },
      { label: 'Rival Wedge', value: 'Pushes Rival Forward!', tone: 'rose' },
    ],
    tip: 'Hammer your own assigned wedge and avoid gifting free furlongs to rivals in adjacent beds!',
  },
  'bobs-27': {
    quickKey: [
      { label: 'Start', value: '27 Points', tone: 'emerald' },
      { label: 'Hit Double', value: '+Double Value Each', tone: 'sky' },
      { label: 'Miss All 3', value: '-Double Value', tone: 'rose' },
    ],
    tip: '3 darts per double from D1 through D20 and Bull — stay above 0 to complete the classic PDC drill!',
    defaultMult: 'D',
    quickTargets: ['D20', 'D16', 'D8', 'D10', 'D12', 'D18', 'D4', 'Bull', 'Miss'],
  },
  'checkout-121': {
    quickKey: [
      { label: 'Budget', value: '9 Darts (3 Visits)', tone: 'sky' },
      { label: 'Checkout', value: 'Climb +1 Target', tone: 'emerald' },
      { label: 'Fail', value: 'Step Back -1', tone: 'rose' },
    ],
    tip: 'Follow the pulsing PDC checkout route on the vertical monitor — finish on any Double or Inner Bull!',
  },
  'jdc-challenge': {
    quickKey: [
      { label: 'Stage 1', value: 'Shanghai 10 → 15', tone: 'purple' },
      { label: 'Stage 2', value: 'Doubles D1–D20 & Bull', tone: 'sky' },
      { label: 'Stage 3', value: 'Shanghai 15 → 20', tone: 'amber' },
    ],
    tip: 'Hit S + D + T on any Shanghai round for a massive +100 bonus toward your official JDC Belt rank!',
  },
  'scoring-gauntlet': {
    quickKey: [
      { label: 'Focus', value: 'T20 / T19 / Bull / Free', tone: 'amber' },
      { label: 'Tracked', value: 'Live 3DA • Hit % • Ton+', tone: 'emerald' },
    ],
    tip: 'Lock into rhythm and throw all darts in your set to benchmark your 3-Dart Average and Ton+ bursts.',
    defaultMult: 'T',
  },
  'around-the-clock': {
    quickKey: [
      { label: 'Route', value: '1 → 20 → Bull', tone: 'emerald' },
      { label: 'Turbo Skip', value: 'Double = +2 • Treble = +3', tone: 'amber' },
      { label: 'Goal', value: 'Fewest Darts Record', tone: 'sky' },
    ],
    tip: 'Aim for Doubles and Trebles in Any-Bed mode with Turbo Skip ON to leap multiple numbers at once!',
  },
  'catch-40': {
    quickKey: [
      { label: '2 Darts', value: '+3 Pts (Gold)', tone: 'amber' },
      { label: '3 Darts', value: '+2 Pts (Emerald)', tone: 'emerald' },
      { label: '4–6 Darts', value: '+1 Pt (Sky)', tone: 'sky' },
      { label: 'Fail / Bust V2', value: '0 Pts', tone: 'rose' },
    ],
    tip: 'Every finish from 61 to 100 gets 6 darts (2 visits) Double-Out — follow live PDC routes on the TV!',
  },
  'precision-sniper': {
    quickKey: [
      { label: 'Rule', value: 'Exact Target Bed Only', tone: 'purple' },
      { label: 'Advance', value: 'Fill All Hit Pips', tone: 'emerald' },
      { label: 'Metric', value: 'Lowest Darts-Per-Hit', tone: 'sky' },
    ],
    tip: 'Only direct hits inside the pulsing target ring light up a pip — chase your lowest Darts-Per-Hit ratio!',
    defaultMult: 'T',
  },
};

const TONE_CLASSES: Record<string, string> = {
  emerald: 'bg-emerald-500/12 border-emerald-400/35 text-emerald-200',
  amber: 'bg-amber-500/12 border-amber-400/35 text-amber-200',
  rose: 'bg-rose-500/12 border-rose-400/35 text-rose-200',
  sky: 'bg-sky-500/12 border-sky-400/35 text-sky-200',
  purple: 'bg-purple-500/12 border-purple-400/35 text-purple-200',
};

interface GameCompanionScreenProps {
  state: RemoteKioskState;
  activeGame: RemoteActiveGameSnapshot;
  gameDef: GameDefinition;
  dispatch: (cmd: RemoteCommand, feedbackLabel?: string) => Promise<void>;
  newPlayerName: string;
  setNewPlayerName: (v: string) => void;
  newPlayerColor: string;
  setNewPlayerColor: (v: string) => void;
  saveNewPlayer: boolean;
  setSaveNewPlayer: (v: boolean) => void;
  onAddPlayerSubmit: (e: React.FormEvent) => void;
}

export const GameCompanionScreen: React.FC<GameCompanionScreenProps> = ({
  state,
  activeGame,
  gameDef,
  dispatch,
  newPlayerName,
  setNewPlayerName,
  newPlayerColor,
  setNewPlayerColor,
  saveNewPlayer,
  setSaveNewPlayer,
  onAddPlayerSubmit,
}) => {
  const profile = COMPANION_PROFILES[gameDef.id] ?? {
    quickKey: [],
    tip: gameDef.tagline,
  };

  const isPractice = activeGame.mode === 'practice';
  const Icon = gameDef.icon;

  // Smart default multiplier for the manual correction pad
  const computedDefaultMult: 'S' | 'D' | 'T' =
    gameDef.id === 'precision-sniper' && activeGame.matchConfig?.circuit === 'doubles'
      ? 'D'
      : gameDef.id === 'around-the-clock' && activeGame.matchConfig?.ringMode === 'doubles'
      ? 'D'
      : gameDef.id === 'around-the-clock' && activeGame.matchConfig?.ringMode === 'trebles'
      ? 'T'
      : profile.defaultMult || 'S';

  const [throwMult, setThrowMult] = useState<'S' | 'D' | 'T'>(computedDefaultMult);
  const [showThrowPad, setShowThrowPad] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'exit' | 'restart' | 'setup' | null>(null);

  // Sync default multiplier when switching games or config
  useEffect(() => {
    setThrowMult(computedDefaultMult);
  }, [gameDef.id, computedDefaultMult]);

  // Auto-cancel 2-tap safety confirmation after 3.5 seconds
  useEffect(() => {
    if (!confirmAction) return;
    const t = window.setTimeout(() => setConfirmAction(null), 3500);
    return () => window.clearTimeout(t);
  }, [confirmAction]);

  // Reset confirmation when phase changes
  useEffect(() => {
    setConfirmAction(null);
  }, [activeGame.phase, activeGame.id]);

  const canUndoNow = activeGame.phase === 'playing' && activeGame.canUndo;
  const camBuffering = state.replayStatus === 'buffering';
  const camCapturing = state.replayStatus === 'capturing';
  const quickTargets = profile.quickTargets || DEFAULT_QUICK_TARGETS;

  const handleToggleRulesOnTv = () => {
    void dispatch(
      { type: 'toggle_rules_overlay' },
      state.isRulesOpen ? 'Closed Guide on Vertical TV' : `Showing ${gameDef.title} Guide on Vertical TV!`
    );
  };

  const handleSafeExit = () => {
    if (activeGame.phase === 'playing' && confirmAction !== 'exit') {
      setConfirmAction('exit');
      return;
    }
    setConfirmAction(null);
    void dispatch(
      { type: 'exit_game' },
      isPractice ? 'Stopped Drill & Returned to Practice' : 'Stopped Game & Returned to Arcade'
    );
  };

  const handleSafeRestart = () => {
    if (activeGame.phase === 'playing' && confirmAction !== 'restart') {
      setConfirmAction('restart');
      return;
    }
    setConfirmAction(null);
    void dispatch(
      { type: 'restart_match' },
      isPractice ? `Restarted ${gameDef.title}` : `Restarted ${gameDef.title}`
    );
  };

  const handleSafeBackToSetup = () => {
    if (activeGame.phase === 'playing' && confirmAction !== 'setup') {
      setConfirmAction('setup');
      return;
    }
    setConfirmAction(null);
    void dispatch({ type: 'return_to_setup' }, `${gameDef.title} Setup`);
  };

  // Active Match Settings formatted nicely for quick reference during play
  const activeSettingsChips = gameDef.configOptions.map((opt) => {
    const val = activeGame.matchConfig?.[opt.key] ?? opt.defaultValue;
    const displayVal =
      opt.type === 'toggle'
        ? val
          ? 'ON'
          : 'OFF'
        : opt.options?.find((c) => c.value === val)?.label ?? String(val);
    return { key: opt.key, label: opt.label, value: displayVal };
  });

  // Shared Replay Banner when a clip just recorded or replay is active on TV
  const renderReplayAlert = () => {
    if (!state.hasActiveReplayOverlay && !state.lastRecording) return null;
    return (
      <div
        className={cn(
          'rounded-2xl p-3.5 border-2 space-y-3 transition-all',
          state.hasActiveReplayOverlay
            ? 'bg-rose-950/35 border-rose-400/65 shadow-[0_0_28px_-4px_rgba(244,63,94,0.45)]'
            : state.lastRecording?.isSaved
            ? 'bg-emerald-500/10 border-emerald-400/35'
            : 'bg-emerald-500/15 border-emerald-400/75 shadow-[0_0_24px_-4px_rgba(16,185,129,0.45)]'
        )}
      >
        {state.lastRecording && (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-mono uppercase tracking-wider font-black text-emerald-300 flex items-center gap-1.5">
                {state.lastRecording.isSaved ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Last Clip Saved to PC
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 animate-bounce" />
                    Unsaved Replay Ready
                  </>
                )}
              </div>
              <div className="text-sm font-bold text-white truncate mt-0.5">
                {state.lastRecording.playerName} • {state.lastRecording.reason} (
                {state.lastRecording.durationSec.toFixed(1)}s)
              </div>
            </div>

            {!state.lastRecording.isSaved && (
              <button
                type="button"
                disabled={state.isSavingReplay}
                onClick={() =>
                  void dispatch({ type: 'save_last_replay' }, 'Saved clip to darts-autoclipper!')
                }
                className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider active:scale-95 transition-transform cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {state.isSavingReplay ? 'Saving...' : 'Save Clip'}
              </button>
            )}
          </div>
        )}

        {state.hasActiveReplayOverlay && (
          <div className="pt-2.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1 mr-0.5">
                <Gauge className="w-3.5 h-3.5" />
                Speed
              </span>
              {([0.5, 0.75, 1] as const).map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() =>
                    void dispatch({ type: 'set_replay_speed', rate }, `Replay ${rate}x`)
                  }
                  className={cn(
                    'px-2.5 py-1.5 rounded-lg text-xs font-mono font-black border cursor-pointer transition-colors',
                    state.replayPlaybackRate === rate
                      ? 'bg-emerald-500/25 border-emerald-400/65 text-emerald-200'
                      : 'bg-slate-900/90 border-white/15 text-slate-300 hover:text-white'
                  )}
                >
                  {rate === 1 ? '1.0x' : `${rate}x`}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void dispatch({ type: 'dismiss_replay' }, 'Closed Replay on TV')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-black text-xs uppercase tracking-wider active:scale-95 cursor-pointer"
            >
              <X className="w-4 h-4" />
              Dismiss Replay
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <main className="w-full max-w-6xl mx-auto px-4 sm:px-5 pt-4 pb-8 space-y-4">
      {/* =====================================================================
          DEDICATED GAME / PRACTICE COMPANION HEADER BAR
         ===================================================================== */}
      <section
        className={cn(
          'card-matte rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3',
          isPractice ? 'border-sky-400/40' : 'border-emerald-400/40'
        )}
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div
            className={cn(
              'w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0',
              isPractice
                ? 'bg-sky-500/15 border-sky-400/40 text-sky-300'
                : 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
            )}
          >
            <Icon className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'text-[10px] font-mono uppercase tracking-widest font-black',
                  isPractice ? 'text-sky-400' : 'text-emerald-400'
                )}
              >
                {isPractice ? 'Practice Companion' : 'Game Companion'}
              </span>
              <Badge
                variant={
                  activeGame.phase === 'playing'
                    ? state.boardStatus === 'takeout'
                      ? 'amber'
                      : 'emerald'
                    : activeGame.phase === 'finished'
                    ? 'purple'
                    : 'sky'
                }
                size="sm"
                dot
              >
                {activeGame.phase === 'setup'
                  ? 'SETUP'
                  : activeGame.phase === 'finished'
                  ? 'COMPLETE'
                  : state.boardStatus === 'takeout'
                  ? 'PULL DARTS'
                  : 'LIVE'}
              </Badge>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight truncate mt-0.5">
              {gameDef.title}
            </h2>
          </div>
        </div>

        {/* Dedicated Companion Quick-Actions: How to Play (TV Popup) + Stop & Exit */}
        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleToggleRulesOnTv}
            className={cn(
              'flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 text-xs sm:text-sm font-black uppercase tracking-wider active:scale-[0.97] transition-all cursor-pointer',
              state.isRulesOpen
                ? 'bg-sky-400 text-slate-950 border-sky-300 shadow-[0_0_24px_rgba(56,189,248,0.5)] animate-pulse'
                : 'bg-sky-500/15 hover:bg-sky-500/25 border-sky-400/50 text-sky-200'
            )}
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            <span>{state.isRulesOpen ? 'Hide Guide on TV' : 'How to Play'}</span>
          </button>

          <button
            type="button"
            onClick={handleSafeExit}
            className={cn(
              'flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 text-xs sm:text-sm font-black uppercase tracking-wider active:scale-[0.97] transition-all cursor-pointer',
              confirmAction === 'exit'
                ? 'bg-rose-500 border-rose-300 text-white shadow-[0_0_24px_rgba(244,63,94,0.5)]'
                : 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-400/45 text-rose-200'
            )}
          >
            {activeGame.phase === 'playing' ? (
              <Square className="w-3.5 h-3.5 fill-current shrink-0" />
            ) : (
              <LogOut className="w-4 h-4 shrink-0" />
            )}
            <span>
              {confirmAction === 'exit'
                ? 'Tap Again to Exit'
                : activeGame.phase === 'playing'
                ? 'Stop & Exit'
                : 'Exit'}
            </span>
          </button>
        </div>
      </section>

      {/* Active Guide-On-TV Banner (impossible to miss while rules popup is open on vertical monitor!) */}
      {state.isRulesOpen && (
        <div className="rounded-2xl p-3.5 sm:p-4 bg-sky-500/15 border-2 border-sky-400/65 flex flex-wrap items-center justify-between gap-3 shadow-[0_0_28px_-6px_rgba(56,189,248,0.45)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <Monitor className="w-5 h-5 text-sky-300 shrink-0 animate-pulse" />
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
                &ldquo;How to Play&rdquo; Guide is Live on Vertical TV
              </div>
              <div className="text-[11px] sm:text-xs text-sky-200/85">
                Everyone at the oche can read the rules on the main display.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleRulesOnTv}
            className="px-4 py-2 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-black text-xs uppercase tracking-wider active:scale-95 cursor-pointer"
          >
            Close Guide on TV
          </button>
        </div>
      )}

      {/* =====================================================================
          PHASE 1: DEDICATED SETUP COMPANION SCREEN
         ===================================================================== */}
      {activeGame.phase === 'setup' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
          {/* LEFT: Overview + Player Lineup */}
          <div className="md:col-span-7 space-y-4">
            <section className="card-matte rounded-2xl p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono uppercase tracking-wider font-black text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Overview
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {gameDef.estimatedMinutes} • {gameDef.difficulty}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                {gameDef.description}
              </p>

              {profile.quickKey.length > 0 && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {profile.quickKey.map((item) => (
                    <div
                      key={item.label}
                      className={cn(
                        'px-3 py-2 rounded-xl border text-left',
                        TONE_CLASSES[item.tone || 'sky']
                      )}
                    >
                      <div className="text-[10px] font-mono uppercase opacity-75">{item.label}</div>
                      <div className="text-xs sm:text-sm font-black leading-tight mt-0.5">
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Players / Solo Trainer Lineup */}
            <section className="card-matte rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" />
                  {isPractice ? 'Solo Player' : 'Match Lineup'}
                </h3>
                <Badge
                  variant={
                    activeGame.roster.length >= activeGame.minPlayers ? 'emerald' : 'amber'
                  }
                  size="sm"
                >
                  {isPractice
                    ? activeGame.roster[0]?.name || state.activePlayer.name
                    : `${activeGame.roster.length} / ${activeGame.maxPlayers} (min ${activeGame.minPlayers})`}
                </Badge>
              </div>

              {isPractice ? (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-900/80 border border-sky-400/35">
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0"
                      style={{
                        backgroundColor:
                          activeGame.roster[0]?.colorHex ||
                          state.activePlayer.dartColor ||
                          DEFAULT_DART_COLOR,
                      }}
                    />
                    <div className="min-w-0">
                      <div className="text-sm sm:text-base font-black text-white truncate">
                        {activeGame.roster[0]?.name || state.activePlayer.name}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">
                        {state.isPartyMode
                          ? 'Party Mode Temp Session (Not Saved)'
                          : 'Records saved to Hall of Fame & Career Vault'}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Active Roster Chips */}
                  <div className="flex flex-wrap gap-2">
                    {activeGame.roster.map((p, idx) => (
                      <span
                        key={p.id}
                        className="inline-flex items-center gap-2 pl-3 pr-2 py-2 rounded-xl bg-slate-900 border border-white/15 text-xs sm:text-sm font-bold text-white"
                        style={{ borderColor: `${p.colorHex}55` }}
                      >
                        <span className="text-[10px] font-mono text-slate-400">#{idx + 1}</span>
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: p.colorHex }}
                        />
                        {p.name}
                        <button
                          type="button"
                          onClick={() =>
                            void dispatch(
                              { type: 'remove_roster_player', playerId: p.id },
                              `Removed ${p.name}`
                            )
                          }
                          className="p-0.5 text-slate-400 hover:text-rose-400 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>

                  {/* Quick-Add Saved Profiles */}
                  {state.players.some((sp) => !activeGame.roster.some((r) => r.id === sp.id)) && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-mono uppercase text-slate-400 mr-1">
                        Quick Add:
                      </span>
                      {state.players
                        .filter((sp) => !activeGame.roster.some((r) => r.id === sp.id))
                        .map((sp) => (
                          <button
                            key={sp.id}
                            type="button"
                            onClick={() =>
                              void dispatch(
                                { type: 'add_saved_to_roster', playerId: sp.id },
                                `Added ${sp.name}`
                              )
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-white/10 hover:border-emerald-400/50 text-xs font-bold text-slate-200 cursor-pointer"
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: sp.dartColor || DEFAULT_DART_COLOR }}
                            />
                            + {sp.name}
                          </button>
                        ))}
                    </div>
                  )}

                  {/* Add Guest + Darts Colour + Save Toggle */}
                  <form onSubmit={onAddPlayerSubmit} className="space-y-2.5 pt-1 border-t border-white/10">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newPlayerName}
                        onChange={(e) => setNewPlayerName(e.target.value)}
                        placeholder="Add guest player to lineup..."
                        maxLength={20}
                        className="flex-1 rounded-xl bg-slate-900 border border-white/15 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-400"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2.5 rounded-xl bg-emerald-500/20 border border-emerald-400/45 text-emerald-300 text-xs font-black uppercase tracking-wider cursor-pointer"
                      >
                        + Add
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {DART_COLOR_OPTIONS.slice(0, 8).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setNewPlayerColor(opt.hex)}
                            className={cn(
                              'w-5 h-5 rounded-full cursor-pointer transition-transform',
                              newPlayerColor === opt.hex
                                ? 'ring-2 ring-white scale-110'
                                : 'opacity-70'
                            )}
                            style={{ backgroundColor: opt.hex }}
                          />
                        ))}
                      </div>
                      <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={saveNewPlayer}
                          onChange={(e) => setSaveNewPlayer(e.target.checked)}
                          className="w-3.5 h-3.5 rounded accent-emerald-500"
                        />
                        Save profile
                      </label>
                    </div>
                  </form>
                </>
              )}
            </section>
          </div>

          {/* RIGHT: Match/Drill Rules Config + Big Start CTA */}
          <div className="md:col-span-5 space-y-4">
            <section className="card-matte rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-sky-400" />
                  {isPractice ? 'Drill Settings' : 'Match Settings'}
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    void dispatch(
                      { type: 'toggle_sound' },
                      state.soundEnabled ? 'Sound Muted' : 'Sound Unmuted'
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-xs font-bold text-slate-200 cursor-pointer"
                >
                  {state.soundEnabled ? (
                    <>
                      <Volume2 className="w-3.5 h-3.5 text-sky-400" />
                      SFX On
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                      Muted
                    </>
                  )}
                </button>
              </div>

              {gameDef.configOptions.length === 0 ? (
                <div className="p-3.5 rounded-xl bg-slate-900/70 border border-white/[0.08] text-xs text-slate-300">
                  Official standard format — ready to launch!
                </div>
              ) : (
                <div className="space-y-2.5">
                  {gameDef.configOptions.map((opt) => {
                    const currentVal = activeGame.matchConfig?.[opt.key] ?? opt.defaultValue;
                    return (
                      <div
                        key={opt.key}
                        className="p-3 rounded-xl bg-slate-900/75 border border-white/[0.08] space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-xs sm:text-sm font-bold text-white">
                              {opt.label}
                            </div>
                            {opt.description && (
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                {opt.description}
                              </div>
                            )}
                          </div>
                          {opt.type === 'toggle' && (
                            <button
                              type="button"
                              onClick={() =>
                                void dispatch({
                                  type: 'set_match_config',
                                  key: opt.key,
                                  value: !currentVal,
                                })
                              }
                              className={cn(
                                'w-12 h-6 rounded-full p-0.5 transition-colors cursor-pointer shrink-0',
                                currentVal
                                  ? isPractice
                                    ? 'bg-sky-500'
                                    : 'bg-emerald-500'
                                  : 'bg-slate-700'
                              )}
                            >
                              <div
                                className={cn(
                                  'w-5 h-5 rounded-full bg-white transition-transform',
                                  currentVal ? 'translate-x-6' : 'translate-x-0'
                                )}
                              />
                            </button>
                          )}
                        </div>
                        {opt.type === 'select' && opt.options && (
                          <div className="flex flex-wrap gap-1.5">
                            {opt.options.map((choice) => (
                              <button
                                key={String(choice.value)}
                                type="button"
                                onClick={() =>
                                  void dispatch({
                                    type: 'set_match_config',
                                    key: opt.key,
                                    value: choice.value,
                                  })
                                }
                                className={cn(
                                  'px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer',
                                  currentVal === choice.value
                                    ? isPractice
                                      ? 'bg-sky-500/20 border-sky-400/65 text-sky-200'
                                      : 'bg-emerald-500/20 border-emerald-400/65 text-emerald-200'
                                    : 'bg-slate-950/70 border-white/10 text-slate-400 hover:text-white'
                                )}
                              >
                                {choice.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Primary Start CTA */}
              <button
                type="button"
                disabled={activeGame.roster.length < activeGame.minPlayers}
                onClick={() =>
                  void dispatch({ type: 'start_match' }, `Started ${gameDef.title}!`)
                }
                className={cn(
                  'w-full py-4 px-5 rounded-2xl font-black text-sm sm:text-base uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed',
                  isPractice
                    ? 'bg-sky-400 hover:bg-sky-300 text-slate-950 shadow-[0_0_28px_rgba(56,189,248,0.4)]'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-[0_0_28px_rgba(16,185,129,0.4)]'
                )}
              >
                <Play className="w-5 h-5 fill-current" />
                {activeGame.roster.length < activeGame.minPlayers
                  ? `Add at least ${activeGame.minPlayers} players`
                  : `Start ${gameDef.title}`}
              </button>

              <button
                type="button"
                onClick={handleToggleRulesOnTv}
                className={cn(
                  'w-full py-3 rounded-xl border text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors',
                  state.isRulesOpen
                    ? 'bg-sky-500/25 border-sky-400/65 text-sky-200'
                    : 'bg-slate-900/80 border-white/15 text-sky-300 hover:border-sky-400/45'
                )}
              >
                <BookOpen className="w-4 h-4" />
                {state.isRulesOpen
                  ? 'Hide "How to Play" on Vertical TV'
                  : 'Show "How to Play" on Vertical TV'}
              </button>
            </section>
          </div>
        </div>
      )}

      {/* =====================================================================
          PHASE 2: DEDICATED LIVE MATCH / DRILL COMPANION SCREEN
         ===================================================================== */}
      {activeGame.phase === 'playing' && (
        <div className="space-y-4">
          {renderReplayAlert()}

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
            {/* LEFT COLUMN (7 cols): Live Visit Strip + Big Oche Controls + Tailored Quick Pad */}
            <div className="md:col-span-7 space-y-4">
              {/* Live 3-Dart Visit Telemetry */}
              <section className="card-matte rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{
                        backgroundColor:
                          state.activeTintHex ||
                          state.activePlayer.dartColor ||
                          DEFAULT_DART_COLOR,
                      }}
                    />
                    <span className="text-xs font-mono uppercase tracking-wider font-black text-slate-300 truncate">
                      Current Visit on Board
                    </span>
                  </div>
                  <Badge
                    variant={
                      state.boardStatus === 'takeout'
                        ? 'amber'
                        : state.isLocalConnected
                        ? 'emerald'
                        : 'slate'
                    }
                    size="sm"
                  >
                    {state.boardStatus === 'takeout'
                      ? 'PULL DARTS'
                      : state.isLocalConnected
                      ? 'AUTODARTS LIVE'
                      : state.dataMode.toUpperCase()}
                  </Badge>
                </div>

                <div className="grid grid-cols-4 gap-2.5">
                  {[0, 1, 2].map((idx) => {
                    const dart = state.currentVisitThrows[idx];
                    return (
                      <div
                        key={idx}
                        className={cn(
                          'h-16 sm:h-20 rounded-xl border-2 flex flex-col items-center justify-center transition-all',
                          dart
                            ? dart.bouncer || dart.score === 0
                              ? 'bg-rose-500/15 border-rose-400/45 text-rose-300'
                              : dart.multiplier === 3
                              ? 'bg-amber-500/20 border-amber-400/55 text-amber-300'
                              : dart.multiplier === 2
                              ? 'bg-emerald-500/20 border-emerald-400/55 text-emerald-300'
                              : 'bg-slate-800/85 border-white/20 text-white'
                            : 'bg-slate-900/50 border-dashed border-white/10 text-slate-600'
                        )}
                      >
                        <span className="text-lg sm:text-2xl font-black font-mono leading-none">
                          {dart ? dart.name : '—'}
                        </span>
                        {dart && (
                          <span className="text-[11px] font-mono opacity-80 mt-0.5">
                            {dart.score} pts
                          </span>
                        )}
                      </div>
                    );
                  })}

                  <div className="h-16 sm:h-20 rounded-xl bg-slate-900/90 border-2 border-white/15 flex flex-col items-center justify-center">
                    <span className="text-[10px] font-mono uppercase text-slate-400">Visit</span>
                    <span className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-white leading-none mt-0.5">
                      {state.visitScore}
                    </span>
                  </div>
                </div>
              </section>

              {/* Giant Oche Touch Pads: Next Turn + Undo Dart */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() =>
                    void dispatch({ type: 'next_turn_takeout' }, 'Next Turn / Pull Darts')
                  }
                  className="card-matte p-5 sm:p-6 rounded-2xl border-amber-400/55 bg-amber-500/12 hover:bg-amber-500/20 flex flex-col items-center justify-center gap-1.5 active:scale-[0.97] transition-all cursor-pointer"
                >
                  <ArrowRight className="w-8 h-8 text-amber-300" />
                  <span className="text-base sm:text-lg font-black text-amber-200">Next Turn</span>
                  <span className="text-[11px] font-mono text-slate-400">
                    Commit / Pull Darts
                  </span>
                </button>

                <button
                  type="button"
                  disabled={!canUndoNow}
                  onClick={() => void dispatch({ type: 'undo_last_action' }, 'Undid Last Dart')}
                  className={cn(
                    'card-matte p-5 sm:p-6 rounded-2xl flex flex-col items-center justify-center gap-1.5 active:scale-[0.97] transition-all',
                    canUndoNow
                      ? 'border-sky-400/55 bg-sky-500/12 hover:bg-sky-500/20 text-sky-200 cursor-pointer'
                      : 'opacity-45 text-slate-500 cursor-not-allowed'
                  )}
                >
                  <Undo2 className="w-8 h-8" />
                  <span className="text-base sm:text-lg font-black">Undo Dart</span>
                  <span className="text-[11px] font-mono text-slate-400">
                    {canUndoNow ? 'Step Back 1 Throw' : 'No Moves Yet'}
                  </span>
                </button>
              </div>

              {/* Game-Tailored Quick Reference Card */}
              <section className="card-matte rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono uppercase tracking-wider font-black text-slate-300">
                    {gameDef.title} — Oche Cheat Sheet
                  </span>
                  {activeSettingsChips.length > 0 && (
                    <span className="text-[10px] font-mono text-emerald-300 truncate">
                      {activeSettingsChips.map((c) => c.value).join(' • ')}
                    </span>
                  )}
                </div>

                {profile.quickKey.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {profile.quickKey.map((item) => (
                      <div
                        key={item.label}
                        className={cn(
                          'px-3 py-2 rounded-xl border',
                          TONE_CLASSES[item.tone || 'sky']
                        )}
                      >
                        <div className="text-[10px] font-mono uppercase opacity-75">
                          {item.label}
                        </div>
                        <div className="text-xs sm:text-sm font-black mt-0.5 leading-tight">
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-xs text-slate-300/90 leading-relaxed">{profile.tip}</p>
              </section>

              {/* Expandable Tailored Quick Throw / Manual Correction Pad */}
              <section className="card-matte rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowThrowPad((v) => !v)}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-white/[0.03] transition-colors cursor-pointer"
                >
                  <span className="text-xs font-mono font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <Crosshair className="w-4 h-4 text-emerald-400" />
                    Manual Throw / Correction Pad
                  </span>
                  {showThrowPad ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                {showThrowPad && (
                  <div className="px-4 pb-4 space-y-3 border-t border-white/10 pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono text-slate-400">
                        Quick {gameDef.title} Beds
                      </span>
                      <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-0.5 border border-white/10">
                        {(['S', 'D', 'T'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setThrowMult(m)}
                            className={cn(
                              'px-2.5 py-1 rounded-md text-[11px] font-black uppercase transition-colors cursor-pointer',
                              throwMult === m
                                ? m === 'T'
                                  ? 'bg-amber-500 text-slate-950'
                                  : m === 'D'
                                  ? 'bg-emerald-500 text-slate-950'
                                  : 'bg-sky-500 text-slate-950'
                                : 'text-slate-400 hover:text-white'
                            )}
                          >
                            {m === 'S' ? 'Single' : m === 'D' ? 'Double' : 'Treble'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-9 gap-1.5">
                      {quickTargets.map((target) => (
                        <button
                          key={target}
                          type="button"
                          onClick={() =>
                            void dispatch({ type: 'inject_dart', target }, `Threw ${target}`)
                          }
                          className={cn(
                            'py-2.5 rounded-xl font-mono font-black text-xs border active:scale-95 transition-transform cursor-pointer',
                            target === 'Miss'
                              ? 'bg-rose-500/15 border-rose-400/40 text-rose-300'
                              : target === 'Bull' || target.startsWith('T')
                              ? 'bg-amber-500/15 border-amber-400/40 text-amber-200'
                              : 'bg-slate-900/90 border-white/15 text-white'
                          )}
                        >
                          {target}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                      {BOARD_NUMBERS.map((num) => {
                        const target = `${throwMult}${num}`;
                        return (
                          <button
                            key={num}
                            type="button"
                            onClick={() =>
                              void dispatch({ type: 'inject_dart', target }, `Threw ${target}`)
                            }
                            className="py-2.5 rounded-xl bg-slate-900/80 border border-white/10 hover:border-white/30 font-mono font-black text-xs text-white active:scale-95 transition-transform cursor-pointer"
                          >
                            {target}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            </div>

            {/* RIGHT COLUMN (5 cols): TV Guide Popup + Replay/Audio + Roster + Stop/Restart */}
            <div className="md:col-span-5 space-y-4">
              {/* Vertical TV & Media Controls */}
              <section className="card-matte rounded-2xl p-4 space-y-3">
                <div className="text-xs font-mono uppercase tracking-wider font-black text-slate-400 flex items-center gap-1.5">
                  <Monitor className="w-3.5 h-3.5 text-sky-400" />
                  Vertical TV &amp; Broadcast Controls
                </div>

                <button
                  type="button"
                  onClick={handleToggleRulesOnTv}
                  className={cn(
                    'w-full p-4 rounded-2xl border-2 flex items-center justify-between gap-3 active:scale-[0.98] transition-all cursor-pointer',
                    state.isRulesOpen
                      ? 'bg-sky-400 text-slate-950 border-sky-300 shadow-[0_0_24px_rgba(56,189,248,0.45)]'
                      : 'bg-sky-500/12 hover:bg-sky-500/20 border-sky-400/45 text-sky-100'
                  )}
                >
                  <div className="flex items-center gap-3 text-left">
                    <BookOpen className="w-6 h-6 shrink-0" />
                    <div>
                      <div className="text-sm font-black uppercase tracking-wider">
                        {state.isRulesOpen ? 'Hide Guide on Vertical TV' : 'How to Play (TV Popup)'}
                      </div>
                      <div
                        className={cn(
                          'text-[11px] mt-0.5',
                          state.isRulesOpen ? 'text-slate-900/80 font-bold' : 'text-sky-200/80'
                        )}
                      >
                        {state.isRulesOpen
                          ? 'Rulebook is currently open on the main screen'
                          : 'Pop the full rules guide onto the vertical monitor'}
                      </div>
                    </div>
                  </div>
                </button>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={!camBuffering || camCapturing}
                    onClick={() =>
                      void dispatch(
                        { type: 'trigger_manual_replay' },
                        'Recording 20s Clip (15s back + 5s)!'
                      )
                    }
                    className={cn(
                      'p-3.5 rounded-xl border flex items-center justify-center gap-2 text-xs font-black transition-all active:scale-[0.97]',
                      camCapturing
                        ? 'bg-rose-500/25 border-rose-400/60 text-rose-200 animate-pulse'
                        : camBuffering
                        ? 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-400/45 text-rose-200 cursor-pointer'
                        : 'bg-slate-900/60 border-white/10 opacity-45 text-slate-500 cursor-not-allowed'
                    )}
                  >
                    <Clapperboard className="w-4 h-4 shrink-0" />
                    <span>{camCapturing ? 'Capturing...' : 'Clip That! (20s)'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void dispatch(
                        { type: 'toggle_sound' },
                        state.soundEnabled ? 'Sound Muted' : 'Sound Unmuted'
                      )
                    }
                    className="p-3.5 rounded-xl bg-slate-900/80 border border-white/15 hover:border-white/30 flex items-center justify-center gap-2 text-xs font-black text-slate-200 active:scale-[0.97] cursor-pointer"
                  >
                    {state.soundEnabled ? (
                      <>
                        <Volume2 className="w-4 h-4 text-sky-400 shrink-0" />
                        <span>Audio On</span>
                      </>
                    ) : (
                      <>
                        <VolumeX className="w-4 h-4 text-rose-400 shrink-0" />
                        <span className="text-rose-300">Muted</span>
                      </>
                    )}
                  </button>
                </div>
              </section>

              {/* Active Players Roster */}
              <section className="card-matte rounded-2xl p-4 space-y-2.5">
                <div className="text-xs font-mono uppercase tracking-wider font-black text-slate-400 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-emerald-400" />
                  {isPractice ? 'Solo Trainer' : `Players (${activeGame.roster.length})`}
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeGame.roster.map((p, idx) => (
                    <span
                      key={p.id}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/85 border text-xs font-bold text-white"
                      style={{ borderColor: `${p.colorHex}55` }}
                    >
                      {!isPractice && (
                        <span className="text-[10px] font-mono text-slate-400">#{idx + 1}</span>
                      )}
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: p.colorHex }}
                      />
                      {p.name}
                    </span>
                  ))}
                </div>
              </section>

              {/* Match Session Controls (Restart / Setup / Stop & Exit) */}
              <section className="card-matte rounded-2xl p-4 space-y-2.5">
                <div className="text-xs font-mono uppercase tracking-wider font-black text-slate-400">
                  {isPractice ? 'Drill Controls' : 'Match Controls'}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={handleSafeRestart}
                    className={cn(
                      'p-3 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 active:scale-[0.97] transition-all cursor-pointer',
                      confirmAction === 'restart'
                        ? 'bg-amber-400 border-amber-300 text-slate-950'
                        : 'bg-slate-900/85 border-white/12 text-slate-200 hover:border-amber-400/45'
                    )}
                  >
                    <RotateCcw className="w-4 h-4 shrink-0" />
                    <span>{confirmAction === 'restart' ? 'Confirm Restart' : 'Restart'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSafeBackToSetup}
                    className={cn(
                      'p-3 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 active:scale-[0.97] transition-all cursor-pointer',
                      confirmAction === 'setup'
                        ? 'bg-sky-400 border-sky-300 text-slate-950'
                        : 'bg-slate-900/85 border-white/12 text-slate-200 hover:border-sky-400/45'
                    )}
                  >
                    <Sliders className="w-4 h-4 shrink-0" />
                    <span>{confirmAction === 'setup' ? 'Confirm Setup' : 'Change Rules'}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleSafeExit}
                  className={cn(
                    'w-full p-3.5 rounded-xl border-2 text-xs sm:text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.97] transition-all cursor-pointer',
                    confirmAction === 'exit'
                      ? 'bg-rose-500 border-rose-300 text-white shadow-[0_0_24px_rgba(244,63,94,0.5)]'
                      : 'bg-rose-500/12 hover:bg-rose-500/20 border-rose-400/45 text-rose-200'
                  )}
                >
                  <Square className="w-4 h-4 fill-current shrink-0" />
                  <span>
                    {confirmAction === 'exit'
                      ? `Tap Again to Stop ${gameDef.title} & Exit`
                      : `Stop ${isPractice ? 'Drill' : 'Game'} & Exit to Lobby`}
                  </span>
                </button>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          PHASE 3: DEDICATED FINISHED / POST-MATCH COMPANION SCREEN
         ===================================================================== */}
      {activeGame.phase === 'finished' && (
        <div className="max-w-2xl mx-auto space-y-4">
          {renderReplayAlert()}

          <section className="card-matte rounded-3xl p-6 sm:p-8 border-amber-400/50 text-center space-y-5 shadow-[0_0_40px_-10px_rgba(245,158,11,0.3)]">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center mx-auto">
              <Trophy className="w-9 h-9 text-amber-400" />
            </div>

            <div>
              <div className="text-xs font-mono uppercase tracking-widest text-amber-300 font-bold">
                {isPractice ? 'Practice Drill Complete' : 'Match Complete'}
              </div>
              <h3 className="text-2xl sm:text-3xl font-black text-white mt-1">
                {activeGame.winnerHeadline || `${gameDef.title} Finished`}
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Final podium &amp; stats are live on the vertical monitor.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() =>
                  void dispatch(
                    { type: 'rematch' },
                    isPractice ? `Restarted ${gameDef.title}!` : `Rematch: ${gameDef.title}!`
                  )
                }
                className={cn(
                  'py-4 px-5 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer',
                  isPractice
                    ? 'bg-sky-400 hover:bg-sky-300 text-slate-950'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                )}
              >
                <RotateCcw className="w-4 h-4" />
                {isPractice ? 'Run Drill Again' : 'Play Rematch'}
              </button>

              <button
                type="button"
                onClick={() =>
                  void dispatch({ type: 'return_to_setup' }, `${gameDef.title} Setup`)
                }
                className="py-4 px-5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-white/15 text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
              >
                <Sliders className="w-4 h-4 text-sky-400" />
                Rules &amp; Players
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() =>
                  void dispatch(
                    { type: 'exit_game' },
                    isPractice ? 'Back to Solo Drills' : 'Back to Arcade Lobby'
                  )
                }
                className="py-3 rounded-xl bg-slate-900/80 border border-white/15 text-slate-200 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                {isPractice ? 'All Drills' : 'All Games'}
              </button>

              <button
                type="button"
                onClick={() =>
                  void dispatch({ type: 'navigate', view: 'dashboard' }, 'Stats Dashboard')
                }
                className="py-3 rounded-xl bg-slate-900/80 border border-white/15 text-slate-200 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LayoutDashboard className="w-3.5 h-3.5 text-emerald-400" />
                Dashboard
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
};
