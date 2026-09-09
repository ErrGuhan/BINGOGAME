'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { sounds } from './AudioController';

interface HeaderProps {
  badge?: string;
  badgeType?: 'live' | 'match' | 'create' | 'setup';
  subTitle?: string;
  onBack?: () => void;
  showBack?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  badge = 'LIVE',
  badgeType = 'live',
  subTitle = 'Arena',
  onBack,
  showBack = false,
}) => {
  const [isMuted, setIsMuted] = useState(false);

  const badgeColors = {
    live: 'text-primary-container bg-surface-container-high/90',
    match: 'text-secondary-fixed-dim bg-secondary-container/80',
    create: 'text-primary-container bg-surface-container-high/90',
    setup: 'text-secondary-fixed-dim bg-secondary-container/80',
  }[badgeType];

  const handleToggleSound = () => {
    const soundEnabled = sounds.toggleSound();
    setIsMuted(!soundEnabled);
    if (soundEnabled) {
      sounds.playTap();
    }
  };

  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-surface-container-lowest/80 backdrop-blur-xl pt-safe shadow-[0_4px_24px_rgba(0,0,0,0.35)] border-b border-outline-variant/15">
      <div className="h-14 px-space-md flex items-center justify-between max-w-md mx-auto">
        <div className="flex items-center gap-space-sm">
          {showBack && onBack && (
            <button
              aria-label="Go Back"
              className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-container-high/70 text-on-surface hover:text-primary transition-all active:scale-95 border border-outline-variant/20"
              onClick={() => {
                sounds.playTap();
                onBack();
              }}
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            <Image
              alt="BingoDuel Logo"
              className="h-7 w-7 object-contain drop-shadow-[0_0_8px_rgba(0,245,212,0.5)]"
              src="/logo.svg"
              width={28}
              height={28}
              priority
            />
            <div className="flex items-center gap-2">
              <span className="font-headline-sm text-sm text-on-surface tracking-tight font-black">
                BINGO
              </span>
              <span className={`font-label-sm text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold ${badgeColors}`}>
                {badge}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            aria-label="Sound Toggle"
            className={`w-9 h-9 flex items-center justify-center rounded-full transition-all active:scale-95 border ${
              isMuted
                ? 'bg-surface-container-high text-on-surface-variant/50 border-outline-variant/20'
                : 'bg-surface-container-high text-primary-container border-primary-container/30 shadow-[0_0_8px_rgba(0,245,212,0.2)]'
            }`}
            onClick={handleToggleSound}
          >
            <span className="material-symbols-outlined text-[18px]">
              {isMuted ? 'volume_off' : 'volume_up'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
