'use client';

import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  TrophyIcon,
  ArrowPathIcon,
  HomeIcon,
  CheckCircleIcon,
  XCircleIcon,
  InformationCircleIcon,
  ArrowDownTrayIcon,
  ShareIcon,
} from '@heroicons/react/24/outline';
import { sounds } from './AudioController';
import { usePWA } from '@/context/PWAContext';
import { BoardSize } from '@/types/bingo';

interface VictoryScreenProps {
  isWinner: boolean;
  winnerName: string;
  playerName: string;
  opponentName: string;
  myLines: number;
  opponentLines: number;
  totalCalls: number;
  boardSize?: BoardSize;
  targetLines?: number;
  rematchStatus?: 'idle' | 'requesting' | 'received' | 'accepted' | 'declined';
  rematchRequesterName?: string | null;
  onRematch: () => void;
  onAcceptRematch?: () => void;
  onDeclineRematch?: () => void;
  onCancelRematchRequest?: () => void;
  onBackToHome: () => void;
}

export const VictoryScreen: React.FC<VictoryScreenProps> = ({
  isWinner,
  winnerName,
  playerName,
  opponentName,
  myLines,
  opponentLines,
  totalCalls,
  boardSize = 5,
  targetLines = 5,
  rematchStatus = 'idle',
  rematchRequesterName,
  onRematch,
  onAcceptRematch,
  onDeclineRematch,
  onCancelRematchRequest,
  onBackToHome,
}) => {
  const { isInstalled, installPromptEvent, isIOS, showInstallPrompt } = usePWA();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    sounds.playVictory();

    if (isWinner) {
      const end = Date.now() + 2.5 * 1000;
      // Apple aesthetic confetti palette
      const colors = ['#007AFF', '#34C759', '#FF9F0A', '#FF3B30'];

      (function frame() {
        confetti({
          particleCount: 4,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.65 },
          colors,
        });
        confetti({
          particleCount: 4,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.65 },
          colors,
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      })();
    }
  }, [isWinner]);

  return (
    <div className="flex flex-col w-full max-w-md mx-auto gap-4 select-none pt-4 pb-8">
      {/* Victory Card */}
      <div className="w-full rounded-2xl bg-surface-container/80 backdrop-blur-xl p-6 shadow-xs border border-outline-variant flex flex-col items-center text-center gap-3">
        {/* Trophy Icon */}
        <div className="relative w-20 h-20 rounded-full bg-surface-container-high border border-outline-variant flex items-center justify-center shadow-xs">
          <TrophyIcon
            className={`w-10 h-10 ${
              isWinner ? 'text-primary-container' : 'text-on-surface-variant'
            }`}
          />
        </div>

        {/* Victory Title */}
        <div className="flex flex-col items-center gap-1">
          <h2 className="font-headline-xl-mobile text-3xl font-bold tracking-tight text-on-surface">
            {isWinner ? 'VICTORY!' : `${winnerName.toUpperCase()} WON`}
          </h2>
          <p className="font-body-md text-sm text-on-surface-variant">
            {isWinner
              ? `Congratulations! You scored ${myLines} ${boardSize === 10 ? 'strikes' : 'lines'} for BINGO!`
              : `${opponentName} reached ${targetLines} ${boardSize === 10 ? 'strikes' : 'lines'} first.`}
          </p>
        </div>

        {/* Match Stats Summary */}
        <div className="w-full grid grid-cols-2 gap-2 mt-2">
          <div className="bg-surface-container-low rounded-xl p-3 border border-outline-variant flex flex-col items-center">
            <span className="font-label-sm text-[10px] text-on-surface-variant uppercase font-semibold">
              Your {boardSize === 10 ? 'Strikes' : 'Lines'}
            </span>
            <span className="font-headline-sm text-lg text-on-surface font-bold">
              {myLines} / {targetLines}
            </span>
          </div>
          <div className="bg-surface-container-low rounded-xl p-3 border border-outline-variant flex flex-col items-center">
            <span className="font-label-sm text-[10px] text-on-surface-variant uppercase font-semibold">
              Total Calls
            </span>
            <span className="font-headline-sm text-lg text-on-surface font-bold">
              {totalCalls}
            </span>
          </div>
        </div>
      </div>

      {/* Rematch Challenge Prompt */}
      {rematchStatus === 'received' && (
        <div className="w-full rounded-2xl bg-surface-container/90 backdrop-blur-xl p-5 border border-primary-container shadow-xs flex flex-col items-center text-center gap-3 animate-fadeIn">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary-container/10 border border-primary-container/20">
            <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
            <span className="font-label-sm text-xs font-semibold text-primary-container uppercase tracking-wider">
              Rematch Challenge
            </span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <h3 className="font-headline-sm text-base font-bold text-on-surface">
              {rematchRequesterName || opponentName} asks for a Rematch!
            </h3>
            <p className="font-body-sm text-xs text-on-surface-variant">
              Will you accept the duel on a fresh synchronized board?
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 w-full mt-1">
            <button
              type="button"
              onClick={() => {
                sounds.playVictory();
                onAcceptRematch?.();
              }}
              className="h-11 rounded-xl bg-primary-container text-on-primary-container font-semibold text-sm shadow-xs hover:opacity-95 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <CheckCircleIcon className="w-4 h-4" />
              <span>Accept</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                onDeclineRematch?.();
              }}
              className="h-11 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-error font-semibold text-sm border border-outline-variant active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <XCircleIcon className="w-4 h-4" />
              <span>Reject</span>
            </button>
          </div>
        </div>
      )}

      {/* Rematch Rejected Banner */}
      {rematchStatus === 'declined' && (
        <div className="w-full rounded-xl bg-error-container text-on-error-container border border-error/20 p-3 flex items-center justify-center gap-2 text-xs font-semibold animate-fadeIn">
          <InformationCircleIcon className="w-4 h-4 text-error shrink-0" />
          <span>{rematchRequesterName || opponentName} rejected the rematch. Returning to arena...</span>
        </div>
      )}

      {/* Primary Actions */}
      <div className="flex flex-col w-full gap-2.5">
        {rematchStatus === 'requesting' ? (
          <div className="w-full flex flex-col gap-2">
            <div className="w-full h-13 rounded-2xl bg-surface-container border border-outline-variant text-on-surface font-headline-sm text-sm font-semibold flex items-center justify-center gap-2.5 shadow-xs">
              <ArrowPathIcon className="w-4 h-4 animate-spin text-primary-container" />
              <span>Waiting for {opponentName} to accept...</span>
            </div>
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                onCancelRematchRequest?.();
              }}
              className="text-xs text-on-surface-variant hover:text-on-surface transition-colors text-center py-1 cursor-pointer font-medium"
            >
              Cancel Request
            </button>
          </div>
        ) : rematchStatus === 'received' ? null : (
          <button
            type="button"
            onClick={() => {
              sounds.playTap();
              onRematch();
            }}
            className="w-full h-13 rounded-2xl bg-primary-container text-on-primary-container font-headline-sm text-base font-semibold shadow-xs hover:opacity-95 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <ArrowPathIcon className="w-4 h-4" />
            <span>Play Rematch</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            sounds.playTap();
            onBackToHome();
          }}
          className="w-full h-12 rounded-2xl bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2 border border-outline-variant cursor-pointer"
        >
          <HomeIcon className="w-4 h-4" />
          <span>Back to Arena</span>
        </button>

        {/* Install BingoDuel App CTA */}
        {!isInstalled && (installPromptEvent || isIOS) && (
          <button
            type="button"
            onClick={async () => {
              sounds.playTap();
              if (installPromptEvent) {
                await showInstallPrompt();
              } else if (isIOS) {
                setShowIOSGuide(true);
              }
            }}
            className="w-full h-12 rounded-2xl bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-sm border border-outline-variant active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer mt-1"
          >
            <ArrowDownTrayIcon className="w-4 h-4 text-primary-container" />
            <span>Install BingoDuel App</span>
          </button>
        )}
      </div>

      {/* iOS Install Instructions Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-surface-container p-6 border border-outline-variant flex flex-col items-center text-center gap-4 shadow-xl">
            <div className="w-12 h-12 rounded-2xl bg-primary-container/10 border border-primary-container/20 flex items-center justify-center text-primary-container">
              <ShareIcon className="w-6 h-6" />
            </div>
            <h3 className="font-headline-sm text-lg font-bold text-on-surface">Install on iOS</h3>
            <p className="font-body-sm text-xs text-on-surface-variant leading-relaxed">
              1. Tap the <strong className="text-on-surface font-semibold">Share</strong> button in Safari&apos;s bottom toolbar.<br />
              2. Scroll down and tap <strong className="text-on-surface font-semibold">&apos;Add to Home Screen&apos;</strong>.<br />
              3. Tap <strong className="text-primary-container font-semibold">&apos;Add&apos;</strong> in the top right.
            </p>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full h-10 rounded-xl bg-primary-container text-on-primary-container font-semibold text-xs hover:opacity-95 active:scale-95 transition-all cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
