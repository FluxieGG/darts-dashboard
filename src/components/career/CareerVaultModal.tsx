import React, { useMemo, useRef, useState } from 'react';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useCareerStore } from '../../store/useCareerStore';
import {
  computeStreaks,
  formatReadableDate,
  getBestDaysEver,
} from '../../lib/careerEngine';
import { CareerVaultData } from '../../types/career';
import {
  Crown,
  Download,
  Flame,
  HardDrive,
  Target,
  Trash2,
  Trophy,
  Upload,
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface CareerVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CareerVaultModal: React.FC<CareerVaultModalProps> = ({ isOpen, onClose }) => {
  const activePlayer = usePlayerStore((s) => s.getActivePlayer());
  const vaultData = useCareerStore((s) => s.vault);
  const isDiskSynced = useCareerStore((s) => s.isDiskSynced);
  const getPlayerVault = useCareerStore((s) => s.getPlayerVault);
  const importVaultData = useCareerStore((s) => s.importVaultData);
  const clearPlayerVault = useCareerStore((s) => s.clearPlayerVault);

  const [confirmClear, setConfirmClear] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const playerVault = useMemo(
    () => getPlayerVault(activePlayer.id, activePlayer.name),
    [vaultData, activePlayer.id, activePlayer.name, getPlayerVault]
  );

  const streaks = useMemo(() => computeStreaks(playerVault.dailyLogs), [playerVault.dailyLogs]);
  const bestDays = useMemo(() => getBestDaysEver(playerVault.dailyLogs, 10), [playerVault.dailyLogs]);
  const rec = playerVault.records;

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(vaultData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `autodarts-career-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as CareerVaultData;
        if (parsed && parsed.players) {
          importVaultData(parsed);
          setImportStatus('Career Vault imported & synced!');
          setTimeout(() => setImportStatus(null), 2500);
        } else {
          setImportStatus('Invalid Career Vault JSON file.');
        }
      } catch {
        setImportStatus('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${activePlayer.name}'s Career Vault`}
      description="All-time personal records, best days ever, and local disk backup."
      maxWidth="xl"
    >
      <div className="space-y-5">
        {/* Sync Status Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-900/80 border border-white/10">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <HardDrive className="w-4 h-4 text-emerald-400" />
            <span>
              Storage:{' '}
              <code className="font-mono text-emerald-300">data/career-vault.json</code>
            </span>
          </div>
          <Badge variant={isDiskSynced ? 'emerald' : 'amber'} size="sm" dot>
            {isDiskSynced ? 'Disk Synced' : 'Browser Cache Mode'}
          </Badge>
        </div>

        {/* All-Time Personal Records Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3 rounded-xl bg-slate-900/75 border border-emerald-400/25">
            <div className="text-[10px] font-mono uppercase text-slate-400">Best Day 3DA</div>
            <div className="text-2xl font-black font-mono tabular-nums text-emerald-400 mt-1">
              {rec.bestDay3DA ? rec.bestDay3DA.value.toFixed(1) : '0.0'}
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              {rec.bestDay3DA ? formatReadableDate(rec.bestDay3DA.date) : '—'}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/75 border border-amber-400/25">
            <div className="text-[10px] font-mono uppercase text-slate-400">Highest Visit</div>
            <div className="text-2xl font-black font-mono tabular-nums text-amber-300 mt-1">
              {rec.highestVisit ? rec.highestVisit.value : 0}
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              {rec.highestVisit?.detail || '—'}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/75 border border-purple-400/25">
            <div className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1">
              <Flame className="w-3 h-3 text-amber-400" />
              Longest Streak
            </div>
            <div className="text-2xl font-black font-mono tabular-nums text-white mt-1">
              {streaks.longestStreak}d
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              Current: {streaks.currentStreak}d
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/75 border border-sky-400/25">
            <div className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1">
              <Target className="w-3 h-3 text-sky-400" />
              Career Darts
            </div>
            <div className="text-2xl font-black font-mono tabular-nums text-sky-300 mt-1">
              {rec.totalCareerDarts.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              {streaks.totalDaysPlayed} active days
            </div>
          </div>
        </div>

        {/* Lifetime Milestones Strip */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
          {[
            { label: '180s', val: rec.total180s, color: 'text-amber-300' },
            { label: '100+ Visits', val: rec.total100Plus, color: 'text-emerald-300' },
            { label: 'Trebles', val: rec.totalTrebles, color: 'text-sky-300' },
            { label: 'Doubles', val: rec.totalDoubles, color: 'text-purple-300' },
            { label: 'Bullseyes', val: rec.totalBulls, color: 'text-rose-300' },
            { label: 'Objectives', val: playerVault.completedObjectiveIds.length, color: 'text-white' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="p-2.5 rounded-xl bg-slate-900/60 border border-white/[0.07]"
            >
              <div className={cn('text-lg font-black font-mono tabular-nums', stat.color)}>
                {stat.val}
              </div>
              <div className="text-[10px] font-mono uppercase text-slate-400">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Best Days Ever Leaderboard */}
        <div className="space-y-2">
          <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Crown className="w-3.5 h-3.5 text-amber-400" />
            Best Days Ever (Top {Math.max(1, bestDays.length)})
          </h4>

          {bestDays.length === 0 ? (
            <div className="p-6 rounded-xl bg-slate-900/50 border border-white/[0.06] text-center text-xs text-slate-400">
              Throw your first visits outside Party Mode to begin building your Best Days Ever
              archive!
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {bestDays.map((day, idx) => (
                <div
                  key={day.date}
                  className={cn(
                    'flex items-center justify-between gap-3 p-3 rounded-xl border',
                    idx === 0
                      ? 'bg-amber-500/10 border-amber-400/35'
                      : 'bg-slate-900/60 border-white/[0.07]'
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono font-black text-sm text-amber-400 w-6">
                      #{idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        <span>{formatReadableDate(day.date)}</span>
                        {day.ton180 > 0 && (
                          <Badge variant="amber" size="sm">
                            {day.ton180}× 180
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 truncate">
                        {day.totalDarts} darts • High {day.highestVisit} • {day.treblesHit}T /{' '}
                        {day.doublesHit}D / {day.bullsHit} Bull
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-black font-mono tabular-nums text-emerald-400">
                      {day.threeDartAvg.toFixed(1)}
                    </div>
                    <div className="text-[10px] font-mono uppercase text-slate-500">3DA</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Backup / Restore / Clear Controls */}
        <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-white/10 border border-white/15 text-xs font-bold text-slate-200 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export Backup
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={handleImportFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-white/10 border border-white/15 text-xs font-bold text-slate-200 transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Import JSON
            </button>
          </div>

          {!confirmClear ? (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Reset {activePlayer.name}&apos;s Vault
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  clearPlayerVault(activePlayer.id);
                  setConfirmClear(false);
                }}
                className="px-3 py-1.5 rounded-xl bg-rose-500 text-white text-xs font-bold cursor-pointer"
              >
                Confirm Wipe
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {importStatus && (
          <div className="text-xs font-mono text-emerald-300 flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5" />
            {importStatus}
          </div>
        )}
      </div>
    </Modal>
  );
};
