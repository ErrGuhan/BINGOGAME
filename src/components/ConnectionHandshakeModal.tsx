'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircleIcon, BoltIcon, UserIcon } from '@heroicons/react/24/outline';
import { BoardSize } from '@/types/bingo';
import { sounds } from './AudioController';

interface ConnectionHandshakeModalProps {
  roomCode: string;
  hostName: string;
  challengerName: string;
  boardSize?: BoardSize;
  onComplete: () => void;
  durationMs?: number;
}

export const ConnectionHandshakeModal: React.FC<ConnectionHandshakeModalProps> = ({
  roomCode,
  hostName,
  challengerName,
  boardSize = 5,
  onComplete,
  durationMs = 1500,
}) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    sounds.playDraft(660);

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / durationMs) * 100));
      setProgress(pct);
      if (elapsed >= durationMs) {
        clearInterval(interval);
        onComplete();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [durationMs, onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xl animate-fadeIn select-none">
      <div className="w-full max-w-md bg-surface-container/95 border border-primary-container/30 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center gap-5 relative overflow-hidden">
        {/* Glow ambient background effect */}
        <div className="absolute -top-12 -left-12 w-40 h-40 bg-primary-container/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -right-12 w-40 h-40 bg-secondary-container/20 rounded-full blur-3xl pointer-events-none" />

        {/* Top Status Badge */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-container/10 border border-primary-container/30 text-primary-container font-label-sm text-xs font-bold uppercase tracking-wider">
          <BoltIcon className="w-3.5 h-3.5 animate-pulse" />
          <span>Duelists Connected!</span>
        </div>

        {/* Room Code */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-widest">
            Joined Room
          </span>
          <span className="font-headline-xl-mobile text-3xl font-black tracking-[0.2em] text-on-surface">
            #{roomCode}
          </span>
        </div>

        {/* Dual Player Face-off Cards */}
        <div className="grid grid-cols-5 items-center w-full gap-2 px-1">
          {/* Host Card */}
          <div className="col-span-2 flex flex-col items-center gap-2 p-3 rounded-2xl bg-surface-container-high border border-outline-variant">
            <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center border border-outline-variant shadow-xs text-on-surface">
              <UserIcon className="w-6 h-6 text-primary-container" />
            </div>
            <span className="font-headline-sm text-xs font-bold text-on-surface truncate max-w-[100px]">
              {hostName || 'Host'}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant bg-surface px-2 py-0.5 rounded-full border border-outline-variant">
              Host
            </span>
          </div>

          {/* VS Center Pillar */}
          <div className="col-span-1 flex flex-col items-center justify-center gap-1">
            <div className="w-9 h-9 rounded-full bg-primary-container/20 border border-primary-container flex items-center justify-center shadow-xs">
              <span className="font-black text-xs text-primary-container">VS</span>
            </div>
            <span className="text-[9px] font-bold text-secondary-container uppercase tracking-tight">
              Ready
            </span>
          </div>

          {/* Challenger Card */}
          <div className="col-span-2 flex flex-col items-center gap-2 p-3 rounded-2xl bg-surface-container-high border border-outline-variant">
            <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center border border-outline-variant shadow-xs text-on-surface">
              <UserIcon className="w-6 h-6 text-secondary-container" />
            </div>
            <span className="font-headline-sm text-xs font-bold text-on-surface truncate max-w-[100px]">
              {challengerName || 'You'}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-secondary-container bg-secondary-container/10 px-2 py-0.5 rounded-full border border-secondary-container/20">
              Challenger
            </span>
          </div>
        </div>

        {/* Mode Sync Badge */}
        <div className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant">
          <span className="text-xs font-bold text-on-surface">
            {boardSize === 10 ? '⚔️ Mega 10x10 Mode · 10 Strikes to Win' : '⚔️ Classic 5x5 Mode · 5 Lines to Win'}
          </span>
        </div>

        {/* Progress Bar & Transition Trigger */}
        <div className="w-full flex flex-col items-center gap-2 mt-1">
          <div className="w-full h-1.5 bg-surface-container-low rounded-full overflow-hidden border border-outline-variant">
            <div
              className="h-full bg-primary-container transition-all duration-75 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
          <button
            type="button"
            onClick={onComplete}
            className="text-[11px] font-bold text-on-surface-variant hover:text-primary-container transition-colors cursor-pointer"
          >
            Entering Board Setup Arena... (Tap to Skip)
          </button>
        </div>
      </div>
    </div>
  );
};
