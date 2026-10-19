'use client';

import React, { useState, useId } from 'react';
import {
  XMarkIcon,
  WifiIcon,
  QrCodeIcon,
  DevicePhoneMobileIcon,
  CpuChipIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  ArrowRightIcon,
  SignalIcon,
} from '@heroicons/react/24/outline';
import { sounds } from './AudioController';
import { BoardSize } from '@/types/bingo';
import { generateRoomCode } from '@/lib/offlineGameEngine';

export type OfflineConnectMode = 'p2p-hotspot' | 'webrtc' | 'wifi-ip' | 'pass-and-play' | 'bot';

interface OfflineConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartOfflineDuel: (mode: OfflineConnectMode, options?: any) => void;
}

export const OfflineConnectionModal: React.FC<OfflineConnectionModalProps> = ({
  isOpen,
  onClose,
  onStartOfflineDuel,
}) => {
  const [role, setRole] = useState<'host' | 'join'>('host');
  const [boardSize, setBoardSize] = useState<BoardSize>(5);
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [previewHostCode] = useState<string>(() => generateRoomCode());

  if (!isOpen) return null;

  const handleCopyCode = () => {
    sounds.playTap();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(previewHostCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleStartHost = () => {
    sounds.playTap();
    onStartOfflineDuel('p2p-hotspot', {
      role: 'host',
      boardSize,
      targetCode: previewHostCode,
    });
    onClose();
  };

  const handleStartJoin = () => {
    if (!joinCodeInput.trim()) return;
    sounds.playTap();
    onStartOfflineDuel('p2p-hotspot', {
      role: 'join',
      targetCode: joinCodeInput.trim().toUpperCase(),
    });
    onClose();
  };

  const handleStartBot = () => {
    sounds.playTap();
    onStartOfflineDuel('bot', { boardSize });
    onClose();
  };

  const handleStartPassAndPlay = () => {
    sounds.playTap();
    onStartOfflineDuel('pass-and-play', { boardSize });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-background/85 backdrop-blur-xl animate-fadeIn select-none">
      <div className="relative w-full max-w-md bg-surface-container/95 border border-primary-container/30 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col gap-4 overflow-hidden">
        {/* Ambient Glow */}
        <div className="absolute -top-12 -left-12 w-44 h-44 bg-primary-container/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -right-12 w-44 h-44 bg-secondary-container/20 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary-container/20 border border-primary-container/40 flex items-center justify-center text-primary-container">
              <SignalIcon className="w-5 h-5 animate-pulse" />
            </div>
            <div className="flex flex-col text-left">
              <h2 className="text-lg font-black text-on-surface leading-tight">Local Hotspot Duel</h2>
              <span className="text-[11px] text-on-surface-variant">Play offline on local Wi-Fi or Hotspot</span>
            </div>
          </div>
          <button
            onClick={() => {
              sounds.playTap();
              onClose();
            }}
            className="p-1.5 rounded-full bg-surface-container-high border border-outline-variant text-on-surface-variant hover:text-on-surface cursor-pointer"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Primary Role Toggle: Host vs Join */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-surface-container-low border border-outline-variant">
          <button
            type="button"
            onClick={() => {
              sounds.playTap();
              setRole('host');
            }}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              role === 'host'
                ? 'bg-primary-container text-on-primary-container shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <WifiIcon className="w-4 h-4" />
            <span>Host Match</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sounds.playTap();
              setRole('join');
            }}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              role === 'join'
                ? 'bg-primary-container text-on-primary-container shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <QrCodeIcon className="w-4 h-4" />
            <span>Join Match</span>
          </button>
        </div>

        {/* HOST VIEW */}
        {role === 'host' ? (
          <div className="flex flex-col gap-3.5">
            {/* Variant Selector */}
            <div className="flex items-center justify-between p-2.5 rounded-2xl bg-surface-container-low border border-outline-variant">
              <span className="text-xs font-bold text-on-surface">Game Mode</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    sounds.playTap();
                    setBoardSize(5);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                    boardSize === 5
                      ? 'bg-primary-container text-on-primary-container'
                      : 'bg-surface-container text-on-surface-variant'
                  }`}
                >
                  Classic 5x5
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sounds.playTap();
                    setBoardSize(10);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                    boardSize === 10
                      ? 'bg-primary-container text-on-primary-container'
                      : 'bg-surface-container text-on-surface-variant'
                  }`}
                >
                  Mega 10x10
                </button>
              </div>
            </div>

            {/* Room Code Showcase */}
            <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-surface-container-low border border-primary-container/30 gap-2 relative">
              <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                Your Room Code
              </span>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-black font-mono tracking-[0.25em] text-primary-container">
                  {previewHostCode}
                </span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="p-1.5 rounded-xl bg-surface-container border border-outline-variant hover:border-primary-container text-on-surface-variant cursor-pointer transition-all"
                  title="Copy room code"
                >
                  {copiedCode ? (
                    <CheckIcon className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <ClipboardDocumentIcon className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-[11px] text-on-surface-variant text-center max-w-[280px] leading-relaxed">
                Connect your devices to the same <strong>Wi-Fi</strong> or turn on <strong>Mobile Hotspot</strong>.
                Tell your rival to enter code <strong>{previewHostCode}</strong>.
              </p>
            </div>

            {/* Launch Button */}
            <button
              type="button"
              onClick={handleStartHost}
              className="w-full h-12 rounded-xl bg-primary-container text-on-primary-container font-black text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer hover:brightness-110"
            >
              <span>Start Hotspot Room</span>
              <ArrowRightIcon className="w-4 h-4" />
            </button>
          </div>
        ) : (
          /* JOIN VIEW */
          <div className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-2 p-4 rounded-2xl bg-surface-container-low border border-outline-variant">
              <span className="text-xs font-bold text-on-surface">Enter Host Room Code</span>
              <input
                type="text"
                maxLength={4}
                placeholder="e.g. 7X9K"
                value={joinCodeInput}
                onChange={e => setJoinCodeInput(e.target.value.toUpperCase().slice(0, 4))}
                className="w-full h-12 px-4 rounded-xl bg-surface-container border border-outline-variant text-center text-xl font-mono font-black uppercase tracking-[0.3em] text-on-surface outline-none focus:border-primary-container"
              />
              <span className="text-[11px] text-on-surface-variant text-center">
                Ensure you are on the same Wi-Fi or connected to the Host's Hotspot.
              </span>
            </div>

            <button
              type="button"
              disabled={joinCodeInput.trim().length < 4}
              onClick={handleStartJoin}
              className="w-full h-12 rounded-xl bg-primary-container text-on-primary-container font-black text-sm shadow-md disabled:opacity-40 disabled:pointer-events-none active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer hover:brightness-110"
            >
              <span>Connect to Host</span>
              <ArrowRightIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Quick Offline Solo / Pass & Play Footers */}
        <div className="pt-2 border-t border-outline-variant/60 flex items-center justify-between text-[11px]">
          <button
            type="button"
            onClick={handleStartBot}
            className="flex items-center gap-1.5 text-on-surface-variant hover:text-primary-container font-bold cursor-pointer transition-colors"
          >
            <CpuChipIcon className="w-3.5 h-3.5" />
            <span>Play vs CyberBot AI</span>
          </button>

          <button
            type="button"
            onClick={handleStartPassAndPlay}
            className="flex items-center gap-1.5 text-on-surface-variant hover:text-primary-container font-bold cursor-pointer transition-colors"
          >
            <DevicePhoneMobileIcon className="w-3.5 h-3.5" />
            <span>Pass & Play (1 Phone)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
