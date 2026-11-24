import React, { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { fetchRemoteInfo } from '../../services/remoteBridge';
import { RemoteNetworkInfo } from '../../types/remote';
import { DEV_CONSOLE_PIN } from '../../types/devConsole';
import {
  Terminal,
  Lock,
  Unlock,
  Copy,
  Check,
  ExternalLink,
  Wifi,
  Delete,
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface DevConsoleQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectedDevs: number;
}

export const DevConsoleQrModal: React.FC<DevConsoleQrModalProps> = ({
  isOpen,
  onClose,
  connectedDevs,
}) => {
  const [pin, setPin] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [pinError, setPinError] = useState(false);

  const [info, setInfo] = useState<RemoteNetworkInfo | null>(null);
  const [selectedDevUrl, setSelectedDevUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const pinRef = useRef('');
  const pinErrorTimerRef = useRef<number | null>(null);
  const copiedTimerRef = useRef<number | null>(null);

  const clearPinErrorTimer = useCallback(() => {
    if (pinErrorTimerRef.current !== null) {
      window.clearTimeout(pinErrorTimerRef.current);
      pinErrorTimerRef.current = null;
    }
  }, []);

  const clearCopiedTimer = useCallback(() => {
    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = null;
    }
  }, []);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      clearPinErrorTimer();
      clearCopiedTimer();
    };
  }, [clearPinErrorTimer, clearCopiedTimer]);

  // Always re-lock when closed so the dev QR stays completely hidden behind PIN 0161
  useEffect(() => {
    if (!isOpen) {
      clearPinErrorTimer();
      clearCopiedTimer();
      pinRef.current = '';
      setPin('');
      setUnlocked(false);
      setPinError(false);
      setCopied(false);
      setQrDataUrl('');
    }
  }, [isOpen, clearPinErrorTimer, clearCopiedTimer]);

  const handleClearPin = useCallback(() => {
    clearPinErrorTimer();
    pinRef.current = '';
    setPin('');
    setPinError(false);
  }, [clearPinErrorTimer]);

  const handleBackspace = useCallback(() => {
    if (unlocked) return;
    clearPinErrorTimer();
    const next = pinRef.current.slice(0, -1);
    pinRef.current = next;
    setPin(next);
    setPinError(false);
  }, [unlocked, clearPinErrorTimer]);

  const handleDigit = useCallback(
    (digit: string) => {
      if (unlocked || pinRef.current.length >= 4) return;
      clearPinErrorTimer();
      const next = pinRef.current + digit;
      pinRef.current = next;
      setPinError(false);
      setPin(next);

      if (next.length === 4) {
        if (next === DEV_CONSOLE_PIN) {
          setUnlocked(true);
        } else {
          setPinError(true);
          pinErrorTimerRef.current = window.setTimeout(() => {
            pinRef.current = '';
            setPin('');
            setPinError(false);
            pinErrorTimerRef.current = null;
          }, 550);
        }
      }
    },
    [unlocked, clearPinErrorTimer]
  );

  // Allow typing the 4-digit PIN via keyboard too
  useEffect(() => {
    if (!isOpen || unlocked) return;
    const handleKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, unlocked, handleDigit, handleBackspace]);

  // Load LAN dev URLs once unlocked (ignore stale promise on close/unmount)
  useEffect(() => {
    if (!isOpen || !unlocked) return;
    let cancelled = false;
    fetchRemoteInfo()
      .then((data) => {
        if (cancelled) return;
        if (data) {
          setInfo(data);
          const best =
            data.interfaces[0]?.devUrl ||
            data.fallbackDevUrl ||
            `${window.location.origin}/?dev=1`;
          setSelectedDevUrl(best);
        } else {
          setSelectedDevUrl(`${window.location.origin}/?dev=1`);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedDevUrl(`${window.location.origin}/?dev=1`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, unlocked]);

  useEffect(() => {
    if (!isOpen || !unlocked || !selectedDevUrl) return;
    let cancelled = false;
    QRCode.toDataURL(selectedDevUrl, {
      width: 260,
      margin: 2,
      color: { dark: '#0B0F17', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, unlocked, selectedDevUrl]);

  const handleCopy = () => {
    if (!selectedDevUrl) return;
    navigator.clipboard?.writeText(selectedDevUrl).catch(() => {});
    setCopied(true);
    clearCopiedTimer();
    copiedTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      copiedTimerRef.current = null;
    }, 1800);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={unlocked ? 'Dev Debug Console QR' : 'Restricted Dev Access'}
      description={
        unlocked
          ? 'Separate mobile debug console showing live listeners, dart telemetry, camera status & errors.'
          : 'Enter the 4-digit developer PIN to reveal the Dev Console QR code.'
      }
      maxWidth="sm"
    >
      {!unlocked ? (
        <div className="space-y-5 py-1">
          {/* PIN Dots */}
          <div className="flex flex-col items-center gap-2.5">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-white/10 flex items-center justify-center text-sky-400">
              <Lock className="w-6 h-6" />
            </div>

            <div className="flex items-center gap-3 pt-1">
              {[0, 1, 2, 3].map((idx) => {
                const filled = idx < pin.length;
                return (
                  <div
                    key={idx}
                    className={cn(
                      'w-4 h-4 rounded-full border-2 transition-all',
                      pinError
                        ? 'bg-rose-500 border-rose-400 scale-110'
                        : filled
                        ? 'bg-sky-400 border-sky-300 scale-110 shadow-[0_0_12px_rgba(56,189,248,0.6)]'
                        : 'bg-slate-900 border-white/20'
                    )}
                  />
                );
              })}
            </div>

            <div className="h-4 text-xs font-mono text-rose-400 font-bold">
              {pinError ? 'Invalid PIN — Try Again' : ''}
            </div>
          </div>

          {/* 0-9 Numeric Keypad */}
          <div className="grid grid-cols-3 gap-2.5 max-w-[240px] mx-auto">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => handleDigit(d)}
                className="h-12 rounded-xl bg-slate-900 hover:bg-white/10 border border-white/10 font-mono text-lg font-black text-white active:scale-95 transition-all cursor-pointer"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClearPin}
              className="h-12 rounded-xl bg-slate-900/60 hover:bg-white/10 border border-white/10 font-mono text-xs font-bold text-slate-400 cursor-pointer"
            >
              CLR
            </button>
            <button
              type="button"
              onClick={() => handleDigit('0')}
              className="h-12 rounded-xl bg-slate-900 hover:bg-white/10 border border-white/10 font-mono text-lg font-black text-white active:scale-95 transition-all cursor-pointer"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="h-12 rounded-xl bg-slate-900/60 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-300 cursor-pointer"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Status Header */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-sky-400/25">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-sky-300">
              <Unlock className="w-4 h-4" />
              <span>Dev Stream Ready</span>
            </div>
            <Badge variant={connectedDevs > 0 ? 'sky' : 'slate'} size="sm" dot>
              {connectedDevs > 0 ? `${connectedDevs} Dev Paired` : 'Waiting for Scan'}
            </Badge>
          </div>

          {/* Separate Dev Console QR Code */}
          <div className="flex flex-col items-center py-1">
            <div className="p-3.5 rounded-2xl bg-white shadow-[0_0_30px_-6px_rgba(56,189,248,0.5)]">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Dev Console QR Code"
                  className="w-52 h-52 block rounded-lg"
                />
              ) : (
                <div className="w-52 h-52 flex items-center justify-center text-slate-600 text-xs font-mono">
                  Generating QR...
                </div>
              )}
            </div>
          </div>

          {/* Adapter Selector if multiple LAN NICs */}
          {info && info.interfaces.length > 1 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1">
                <Wifi className="w-3 h-3" />
                LAN Adapter
              </div>
              <div className="flex flex-wrap gap-1.5">
                {info.interfaces.map((iface) => {
                  const target = iface.devUrl || iface.url.replace('?remote=1', '?dev=1');
                  return (
                    <button
                      key={iface.address}
                      type="button"
                      onClick={() => setSelectedDevUrl(target)}
                      className={cn(
                        'px-2 py-1 rounded-lg text-[11px] font-mono border cursor-pointer',
                        selectedDevUrl === target
                          ? 'bg-sky-500/20 border-sky-400/60 text-sky-300 font-bold'
                          : 'bg-slate-900 border-white/10 text-slate-400'
                      )}
                    >
                      {iface.address}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="p-2.5 rounded-xl bg-slate-950 border border-white/10 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-sky-400 shrink-0" />
            <code className="text-[11px] font-mono text-sky-300 truncate select-all flex-1">
              {selectedDevUrl}
            </code>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-white/10 border border-white/15 text-xs font-bold text-slate-200 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy Link'}
            </button>

            <a
              href={selectedDevUrl || '/?dev=1'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-xs font-bold text-sky-300"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Tab
            </a>
          </div>
        </div>
      )}
    </Modal>
  );
};
