import React, { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { useReplayStore } from '../../store/useReplayStore';
import { ReplayClipCategory } from '../../types/replay';
import {
  Clapperboard,
  Download,
  FolderOpen,
  Play,
  Settings,
  Trash2,
  Video,
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface ReplayGalleryModalProps {
  onOpenSettings: () => void;
}

type GalleryFilter = 'all' | ReplayClipCategory;

function formatBytes(bytes: number): string {
  const safe = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  if (safe < 1024 * 1024) return `${(safe / 1024).toFixed(0)} KB`;
  return `${(safe / (1024 * 1024)).toFixed(1)} MB`;
}

export const ReplayGalleryModal: React.FC<ReplayGalleryModalProps> = ({ onOpenSettings }) => {
  const {
    isGalleryOpen,
    closeGallery,
    clips,
    saveDir,
    status,
    openOverlayClip,
    deleteClip,
  } = useReplayStore(
    useShallow((s) => ({
      isGalleryOpen: s.isGalleryOpen,
      closeGallery: s.closeGallery,
      clips: s.clips,
      saveDir: s.saveDir,
      status: s.status,
      openOverlayClip: s.openOverlayClip,
      deleteClip: s.deleteClip,
    }))
  );

  const [filter, setFilter] = useState<GalleryFilter>('all');
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());

  const handleDeleteClip = async (clipId: string, clipKey: string) => {
    if (deletingIds.has(clipId)) return;
    setDeletingIds((prev) => {
      const next = new Set(prev);
      next.add(clipId);
      return next;
    });
    try {
      await deleteClip(clipKey);
    } finally {
      setDeletingIds((prev) => {
        if (!prev.has(clipId)) return prev;
        const next = new Set(prev);
        next.delete(clipId);
        return next;
      });
    }
  };

  const counts = useMemo(() => {
    let game = 0;
    let user = 0;
    let dev = 0;
    for (const c of clips) {
      const cat = c.category || (c.isDevTest ? 'dev' : 'game');
      if (cat === 'dev') dev++;
      else if (cat === 'user') user++;
      else game++;
    }
    return { all: clips.length, game, user, dev };
  }, [clips]);

  const visibleClips = useMemo(() => {
    if (filter === 'all') return clips;
    return clips.filter((c) => (c.category || (c.isDevTest ? 'dev' : 'game')) === filter);
  }, [clips, filter]);

  return (
    <Modal
      isOpen={isGalleryOpen}
      onClose={closeGallery}
      title="Oche-Cam Action Replays"
      description="Organized into Game Highlights, User Triggered, and Dev Tests."
      maxWidth="xl"
    >
      <div className="space-y-4">
        {/* Top Status & Storage Path Bar */}
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  status === 'buffering'
                    ? 'emerald'
                    : status === 'capturing'
                    ? 'rose'
                    : 'slate'
                }
                size="sm"
                dot
              >
                {status === 'buffering'
                  ? 'Split-Cam Rolling (10s Buffer)'
                  : status === 'capturing'
                  ? 'Capturing Clip...'
                  : 'Oche-Cam Off'}
              </Badge>
              <span className="text-xs font-mono text-slate-400">
                {clips.length} saved clip{clips.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5 truncate">
              <FolderOpen className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="truncate">{saveDir}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              closeGallery();
              onOpenSettings();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            Camera &amp; Dev Test
          </button>
        </div>

        {/* Subfolder Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'all' as const, label: 'All Clips', count: counts.all },
              { id: 'game' as const, label: 'Game Highlights', count: counts.game },
              { id: 'user' as const, label: 'User Triggered', count: counts.user },
              { id: 'dev' as const, label: 'Dev Tests', count: counts.dev },
            ] as const
          ).map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer',
                  active
                    ? 'bg-emerald-500/20 border-emerald-400/55 text-emerald-300'
                    : 'bg-slate-900/70 border-white/10 text-slate-400 hover:text-white'
                )}
              >
                <span>{tab.label}</span>
                <span className="text-[10px] font-mono opacity-80">({tab.count})</span>
              </button>
            );
          })}
        </div>

        {/* Saved Clips Grid */}
        {visibleClips.length === 0 ? (
          <div className="p-8 rounded-2xl bg-slate-900/50 border border-white/[0.06] text-center space-y-3">
            <Video className="w-10 h-10 text-slate-500 mx-auto" />
            <div className="text-sm font-bold text-white">
              {clips.length === 0
                ? 'No Action Replays Saved Yet'
                : 'No Clips In This Folder Yet'}
            </div>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              Clips are sorted automatically into{' '}
              <strong className="text-emerald-300">Game Highlights</strong>,{' '}
              <strong className="text-sky-300">User Triggered</strong> (from your iPad), and{' '}
              <strong className="text-amber-300">Dev Tests</strong>.
            </p>
            {clips.length === 0 && (
              <button
                type="button"
                onClick={() => {
                  closeGallery();
                  onOpenSettings();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs cursor-pointer"
              >
                <Clapperboard className="w-4 h-4" />
                Set Up Oche-Cam
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[52vh] overflow-y-auto pr-1">
            {visibleClips.map((clip) => {
              const cat = clip.category || (clip.isDevTest ? 'dev' : 'game');
              const folderLabel =
                clip.subfolder ||
                (cat === 'dev'
                  ? 'Dev Tests'
                  : cat === 'user'
                  ? 'User Triggered'
                  : 'Game Highlights');

              return (
                <div
                  key={clip.id}
                  className="rounded-2xl bg-slate-900/75 border border-white/10 hover:border-white/25 overflow-hidden flex flex-col justify-between transition-colors"
                >
                  <div className="p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-black text-white leading-tight">
                          {clip.playerName} • {clip.reason}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                          {new Date(clip.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <Badge
                        variant={cat === 'dev' ? 'amber' : cat === 'user' ? 'sky' : 'rose'}
                        size="sm"
                      >
                        {clip.segmentName}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400">
                      <span
                        className={cn(
                          'px-1.5 py-0.5 rounded border text-[10px] font-bold',
                          cat === 'dev'
                            ? 'bg-amber-500/10 border-amber-400/30 text-amber-300'
                            : cat === 'user'
                            ? 'bg-sky-500/10 border-sky-400/30 text-sky-300'
                            : 'bg-emerald-500/10 border-emerald-400/30 text-emerald-300'
                        )}
                      >
                        {folderLabel}
                      </span>
                      <span>
                        {(Number.isFinite(clip.durationSec) ? clip.durationSec : 0).toFixed(1)}s
                      </span>
                      <span>•</span>
                      <span>{formatBytes(clip.sizeBytes)}</span>
                      {clip.isDualCamera && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-300 font-bold">SPLIT-CAM</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="px-3.5 py-2.5 bg-slate-950/60 border-t border-white/[0.06] flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        closeGallery();
                        openOverlayClip(clip);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-300 text-xs font-bold cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Play Replay
                    </button>

                    <div className="flex items-center gap-1.5">
                      <a
                        href={clip.url}
                        download={clip.filename}
                        title="Download WebM"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      <button
                        type="button"
                        disabled={deletingIds.has(clip.id)}
                        onClick={() =>
                          void handleDeleteClip(clip.id, clip.relativePath || clip.filename)
                        }
                        title="Delete clip from disk"
                        className={cn(
                          'p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors',
                          deletingIds.has(clip.id)
                            ? 'opacity-40 cursor-not-allowed'
                            : 'cursor-pointer'
                        )}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
};
