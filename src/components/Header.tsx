'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
  ArrowLeftIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
} from '@heroicons/react/24/outline';
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
    live: 'text-primary-container bg-primary-container/10 border border-primary-container/20',
    match: 'text-secondary-container bg-secondary-container/10 border border-secondary-container/20',
    create: 'text-primary-container bg-primary-container/10 border border-primary-container/20',
    setup: 'text-secondary-container bg-secondary-container/10 border border-secondary-container/20',
  }[badgeType];

  const handleToggleSound = () => {
    const soundEnabled = sounds.toggleSound();
    setIsMuted(!soundEnabled);
    if (soundEnabled) {
      sounds.playTap();
    }
  };

  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-surface/80 backdrop-blur-md pt-safe border-b border-outline-variant">
      <div className="h-14 px-space-md flex items-center justify-between max-w-md mx-auto">
        <div className="flex items-center gap-space-sm">
          {showBack && onBack && (
            <button
              aria-label="Go Back"
              className="w-11 h-11 flex items-center justify-center rounded-full bg-surface-container text-on-surface hover:bg-surface-container-high transition-all active:scale-95 border border-outline-variant"
              onClick={() => {
                sounds.playTap();
                onBack();
              }}
            >
              <ArrowLeftIcon className="w-4 h-4 text-on-surface" />
            </button>
          )}

          <div className="flex items-center gap-2">
            <Image
              alt="BingoDuel Logo"
              className="h-6 w-6 object-contain"
              src="/logo.svg"
              width={24}
              height={24}
              priority
            />
            <div className="flex items-center gap-2">
              <span className="font-headline-sm text-sm text-on-surface tracking-tight font-bold">
                BINGO
              </span>
              <span className={`font-label-sm text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold ${badgeColors}`}>
                {badge}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            aria-label="Sound Toggle"
            className={`w-11 h-11 flex items-center justify-center rounded-full transition-all active:scale-95 border border-outline-variant bg-surface-container ${
              isMuted
                ? 'text-on-surface-variant/50'
                : 'text-primary-container'
            }`}
            onClick={handleToggleSound}
          >
            {isMuted ? (
              <SpeakerXMarkIcon className="w-4 h-4" />
            ) : (
              <SpeakerWaveIcon className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
