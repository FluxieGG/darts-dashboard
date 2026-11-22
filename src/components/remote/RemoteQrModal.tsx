import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { fetchRemoteInfo } from '../../services/remoteBridge';
import { RemoteNetworkInfo } from '../../types/remote';
import { Smartphone, Copy, Check, ExternalLink, Wifi, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';

interface RemoteQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectedRemotes: number;
}

export const RemoteQrModal: React.FC<RemoteQrModalProps> = ({
  isOpen,
  onClose,
  connectedRemotes,
}) => {
  const [info, setInfo] = useState<RemoteNetworkInfo | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadNetworkInfo = async () => {
    setLoading(true);
    const data = await fetchRemoteInfo();
    setLoading(false);
    if (data) {
      setInfo(data);
      const bestUrl = data.interfaces[0]?.url || data.fallbackUrl;
      setSelectedUrl(bestUrl);
    } else {
      const originFallback = `${window.location.origin}/?remote=1`;
      setSelectedUrl(originFallback);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void loadNetworkInfo();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!selectedUrl) return;
    QRCode.toDataURL(selectedUrl, {
      width: 280,
      margin: 2,
      color: {
        dark: '#0B0F17',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [selectedUrl]);

  const handleCopy = () => {
    if (!selectedUrl) return;
    navigator.clipboard?.writeText(selectedUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="iPad & Phone Oche Remote"
      description="Scan with your iPad or phone on the same Wi-Fi to launch the full Oche Command Deck."
      maxWidth="md"
    >
      <div className="space-y-5">
        {/* Status Strip */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-white/10">
          <div className="flex items-center gap-2.5">
            <Smartphone className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-bold text-white">Oche Deck Status</span>
          </div>
          <Badge variant={connectedRemotes > 0 ? 'emerald' : 'slate'} size="sm" dot>
            {connectedRemotes > 0
              ? `${connectedRemotes} Device${connectedRemotes > 1 ? 's' : ''} Paired`
              : 'Waiting for Scan'}
          </Badge>
        </div>

        {/* High-Contrast Scannable QR Code */}
        <div className="flex flex-col items-center justify-center py-2">
          <div className="p-4 rounded-2xl bg-white shadow-[0_0_32px_-6px_rgba(16,185,129,0.4)]">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="iPad Oche Remote QR Code"
                className="w-56 h-56 sm:w-64 sm:h-64 block rounded-lg"
              />
            ) : (
              <div className="w-56 h-56 sm:w-64 sm:h-64 flex items-center justify-center text-slate-600 text-xs font-mono">
                {loading ? 'Generating QR...' : 'QR unavailable'}
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-3 text-center">
            On your <strong className="text-slate-200">iPad</strong>, scan the QR code then tap{' '}
            <strong className="text-emerald-300">Share → Add to Home Screen</strong> for a dedicated
            fullscreen Oche Deck app.
          </p>
        </div>

        {/* Network Adapter Selector (if PC has multiple LAN IPs) */}
        {info && info.interfaces.length > 1 && (
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5" />
              Select PC Wi-Fi / LAN Address
            </label>
            <div className="flex flex-wrap gap-1.5">
              {info.interfaces.map((iface) => {
                const active = selectedUrl === iface.url;
                return (
                  <button
                    key={iface.address}
                    type="button"
                    onClick={() => setSelectedUrl(iface.url)}
                    className={cn(
                      'px-2.5 py-1.5 rounded-lg text-xs font-mono border transition-colors',
                      active
                        ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300 font-bold'
                        : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                    )}
                  >
                    {iface.address} ({iface.name})
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Direct URL + Copy / Test Actions */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-950/80 border border-white/10">
            <code className="flex-1 text-xs font-mono text-emerald-300 truncate select-all">
              {selectedUrl || 'Detecting LAN address...'}
            </code>
            <button
              type="button"
              onClick={() => void loadNetworkInfo()}
              title="Refresh LAN IP"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-white/10 border border-white/15 text-xs font-bold text-slate-200 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied URL' : 'Copy Link'}
            </button>

            <a
              href={selectedUrl || '/?remote=1'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-xs font-bold text-emerald-300 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Test in New Tab
            </a>
          </div>
        </div>

        {/* Helpful Tip */}
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.07] text-[11px] text-slate-400 leading-relaxed">
          <strong className="text-slate-200">What you can control from your phone:</strong> Undo
          darts, Pull Darts / Next Turn, toggle GTA VI Party Mode, launch any of the 8 Arcade
          Games, add guest players, mute audio, and use the quick throw keypad.
        </div>
      </div>
    </Modal>
  );
};
