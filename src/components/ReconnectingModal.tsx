'use client';

import React from 'react';
import { sounds } from './AudioController';

interface ReconnectingModalProps {
  roomCode: string;
  opponentName: string;
  countdown: number;
  onClaimTimeoutWin?: () => void;
  onSurrender: () => void;
}

export const ReconnectingModal: React.FC<ReconnectingModalProps> = ({
  roomCode,
  opponentName,
  countdown,
  onClaimTimeoutWin,
  onSurrender,
}) => {
  const canClaimWin = countdown <= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-container-padding-mobile bg-surface-container-lowest/80 backdrop-blur-xl">
      <div className="relative w-full max-w-sm rounded-[24px] bg-surface-container-high/95 backdrop-blur-2xl p-space-lg flex flex-col items-center text-center shadow-[0_16px_48px_rgba(0,0,0,0.65)] border border-outline-variant/30">
        {/* Animated Spin & Wifi Off Graphic */}
        <div className="relative w-20 h-20 mb-space-md flex items-center justify-center">
          <svg className="absolute inset-0 w-full h-full animate-spin [animation-duration:3s]" viewBox="0 0 100 100">
            <circle cx="50" cy="50" fill="none" r="42" stroke="#26293a" strokeWidth="6" />
            <circle
              className="drop-shadow-[0_0_8px_#00f5d4]"
              cx="50"
              cy="50"
              fill="none"
              r="42"
              stroke="#00f5d4"
              strokeDasharray="80 180"
              strokeLinecap="round"
              strokeWidth="6"
            />
          </svg>
          <div className="w-14 h-14 rounded-full bg-surface-container-highest flex items-center justify-center shadow-[0_0_24px_rgba(249,189,34,0.35)] animate-pulse">
            <span
              className="material-symbols-outlined text-[30px] text-tertiary-fixed-dim"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              wifi_off
            </span>
          </div>
        </div>

        {/* Match Paused Pill */}
        <div className="inline-flex items-center space-x-space-2xs px-space-sm py-space-2xs bg-surface-container-lowest rounded-full mb-space-xs border border-tertiary-fixed-dim/30">
          <span className="w-2 h-2 rounded-full bg-tertiary-fixed-dim animate-ping" />
          <span className="font-label-sm text-label-sm text-tertiary-fixed-dim tracking-wide font-bold">
            MATCH PAUSED
          </span>
        </div>

        <h2 className="font-headline-md text-headline-md text-on-surface font-extrabold tracking-tight mb-space-2xs">
          Connection Interrupted
        </h2>
        <p className="font-body-md text-body-md text-on-surface-variant mb-space-sm max-w-[260px]">
          Reconnecting to room <span className="text-primary font-bold">#{roomCode}</span>... Opponent{' '}
          <span className="text-secondary font-bold">{opponentName}</span> is waiting.
        </p>

        {/* Countdown Box */}
        <div className="w-full bg-surface-container-lowest rounded-xl p-space-xs mb-space-md flex items-center justify-between border border-outline-variant/20">
          <div className="flex items-center space-x-space-2xs">
            <span className="material-symbols-outlined text-[16px] text-primary-fixed-dim animate-spin" style={{ animationDuration: '2s' }}>
              sync
            </span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">Syncing socket</span>
          </div>
          <div className="flex items-center space-x-space-2xs">
            <span className="font-body-sm text-body-sm text-on-surface-variant">Timeout:</span>
            <span className="font-headline-sm text-headline-sm text-tertiary-fixed-dim font-black tracking-tight">
              {countdown}s
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-surface-container rounded-full h-1.5 mb-space-lg overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-tertiary-fixed-dim via-primary-container to-primary-fixed transition-all duration-1000 ease-linear"
            style={{ width: `${(countdown / 60) * 100}%` }}
          />
        </div>

        {/* Actions */}
        <div className="flex flex-col w-full space-y-space-xs">
          {canClaimWin ? (
            <button
              onClick={() => {
                sounds.playVictory();
                onClaimTimeoutWin?.();
              }}
              className="w-full py-space-sm px-space-md rounded-xl bg-primary-container text-on-primary font-headline-sm text-headline-sm font-extrabold flex items-center justify-center space-x-space-2xs shadow-[0_0_20px_rgba(0,245,212,0.6)] active:scale-[0.98] transition-transform animate-pulse"
            >
              <span className="material-symbols-outlined text-[20px]">emoji_events</span>
              <span>Claim Timeout Victory!</span>
            </button>
          ) : (
            <button
              onClick={() => sounds.playTap()}
              className="w-full py-space-sm px-space-md rounded-xl bg-primary-container/90 text-on-primary-container font-headline-sm text-headline-sm font-extrabold flex items-center justify-center space-x-space-2xs shadow-[0_0_20px_rgba(0,245,212,0.4)] active:scale-[0.98] transition-transform"
            >
              <span className="material-symbols-outlined text-[20px]">bolt</span>
              <span>Waiting for Reconnect...</span>
            </button>
          )}

          <button
            onClick={() => {
              sounds.playTap();
              onSurrender();
            }}
            className="w-full py-space-sm px-space-md rounded-xl bg-surface-container-highest text-error font-label-lg text-label-lg flex items-center justify-center space-x-space-2xs active:scale-[0.98] transition-colors border border-error/30"
          >
            <span className="material-symbols-outlined text-[18px]">flag</span>
            <span>Surrender / Leave Duel</span>
          </button>
        </div>
      </div>
    </div>
  );
};
