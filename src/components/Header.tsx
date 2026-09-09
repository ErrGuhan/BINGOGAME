'use client';

import React from 'react';
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
  const badgeColors = {
    live: 'text-primary-container bg-surface-container-high/90',
    match: 'text-secondary-fixed-dim bg-secondary-container/80',
    create: 'text-primary-container bg-surface-container-high/90',
    setup: 'text-secondary-fixed-dim bg-secondary-container/80',
  }[badgeType];

  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-surface-container-lowest/70 backdrop-blur-xl pt-safe shadow-[0_4px_24px_rgba(0,0,0,0.35)]">
      <div className="h-16 px-space-md flex items-center justify-between max-w-lg mx-auto">
        <div className="flex items-center gap-space-sm">
          {showBack && onBack && (
            <button
              aria-label="Go Back"
              className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-high/60 text-on-surface hover:text-primary transition-colors active:scale-95"
              onClick={() => {
                sounds.playTap();
                onBack();
              }}
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
          )}

          <div className="flex items-center gap-space-xs">
            <Image
              alt="BingoDuel Brand Logo"
              className="h-8 w-8 object-contain"
              src="/logo.svg"
              width={32}
              height={32}
              priority
            />
            <div className="flex flex-col">
              <div className="flex items-center gap-space-2xs">
                <span className="font-headline-sm text-headline-sm text-on-surface tracking-tight leading-none font-bold">
                  BINGO
                </span>
                <span className={`font-label-sm text-label-sm px-space-2xs py-0.5 rounded-full uppercase tracking-wider font-extrabold ${badgeColors}`}>
                  {badge}
                </span>
              </div>
              <span className="font-body-sm text-body-sm text-on-surface-variant leading-none">
                {subTitle}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-space-sm">
          <button
            aria-label="Sound Toggle"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-high/60 text-on-surface-variant hover:text-primary transition-colors active:scale-95"
            onClick={() => {
              const newState = sounds.toggleSound();
              sounds.playTap();
              alert(newState ? 'Sound enabled 🔊' : 'Sound muted 🔇');
            }}
          >
            <span className="material-symbols-outlined text-[20px]">volume_up</span>
          </button>
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary-container to-primary flex items-center justify-center shadow-[0_0_12px_rgba(0,245,212,0.4)]">
            <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
          </div>
        </div>
      </div>
    </header>
  );
};
