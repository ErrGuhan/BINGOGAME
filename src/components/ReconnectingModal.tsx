'use client';

import React from 'react';
import {
  ArrowPathIcon,
  TrophyIcon,
  FlagIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-2xl bg-surface-container/95 backdrop-blur-xl p-6 flex flex-col items-center text-center shadow-2xl border border-outline-variant">
        {/* Network Spinner Graphic */}
        <div className="relative w-16 h-16 mb-4 flex items-center justify-center">
          <svg className="absolute inset-0 w-full h-full animate-spin [animation-duration:2.5s]" viewBox="0 0 100 100">
            <circle cx="50" cy="50" fill="none" r="40" stroke="var(--outline-variant)" strokeWidth="4" />
            <circle
              cx="50"
              cy="50"
              fill="none"
              r="40"
              stroke="var(--primary-container)"
              strokeDasharray="70 180"
              strokeLinecap="round"
              strokeWidth="4"
            />
          </svg>
          <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center border border-outline-variant">
            <ArrowPathIcon className="w-5 h-5 text-primary-container animate-spin" />
          </div>
        </div>

        {/* Match Paused Pill */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-surface-container rounded-full mb-2 border border-outline-variant">
          <span className="w-2 h-2 rounded-full bg-tertiary-fixed animate-pulse" />
          <span className="font-label-sm text-xs text-on-surface tracking-wide font-semibold">
            MATCH PAUSED
          </span>
        </div>

        <h2 className="font-headline-md text-lg text-on-surface font-bold tracking-tight mb-1">
          Network Interrupted
        </h2>
        <p className="font-body-md text-xs text-on-surface-variant mb-4 max-w-[280px]">
          Room <span className="text-on-surface font-semibold">#{roomCode}</span>: Waiting for opponent{' '}
          <span className="text-on-surface font-semibold">{opponentName}</span> to reconnect...
        </p>

        {/* Countdown Box */}
        <div className="w-full bg-surface-container-low rounded-xl p-3 mb-3 flex items-center justify-between border border-outline-variant">
          <div className="flex items-center gap-1.5">
            <ArrowPathIcon className="w-4 h-4 text-primary-container animate-spin" />
            <span className="font-body-sm text-xs text-on-surface-variant">Syncing socket</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-body-sm text-xs text-on-surface-variant">Timeout:</span>
            <span className="font-headline-sm text-sm text-on-surface font-bold tabular-nums">
              {countdown}s
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-surface-container-low rounded-full h-1.5 mb-5 overflow-hidden border border-outline-variant">
          <div
            className="h-full bg-primary-container transition-all duration-1000 ease-linear"
            style={{ width: `${(countdown / 60) * 100}%` }}
          />
        </div>

        {/* Actions */}
        <div className="flex flex-col w-full gap-2">
          {canClaimWin ? (
            <button
              onClick={() => {
                sounds.playVictory();
                onClaimTimeoutWin?.();
              }}
              className="w-full h-11 rounded-xl bg-primary-container text-on-primary-container font-semibold text-sm flex items-center justify-center gap-2 shadow-xs active:scale-[0.98] transition-transform cursor-pointer"
            >
              <TrophyIcon className="w-4 h-4" />
              <span>Claim Timeout Victory!</span>
            </button>
          ) : (
            <button
              onClick={() => sounds.playTap()}
              className="w-full h-11 rounded-xl bg-surface-container-high text-on-surface font-semibold text-sm flex items-center justify-center gap-2 border border-outline-variant active:scale-[0.98] transition-transform cursor-pointer"
            >
              <BoltIcon className="w-4 h-4 text-primary-container" />
              <span>Waiting for Reconnect...</span>
            </button>
          )}

          <button
            onClick={() => {
              sounds.playTap();
              onSurrender();
            }}
            className="w-full h-11 rounded-xl bg-surface-container hover:bg-surface-container-high text-error font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-colors border border-outline-variant cursor-pointer"
          >
            <FlagIcon className="w-4 h-4" />
            <span>Surrender / Leave Duel</span>
          </button>
        </div>
      </div>
    </div>
  );
};
