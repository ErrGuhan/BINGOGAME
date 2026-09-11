'use client';

import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
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
      const colors = ['#00f5d4', '#ddb7ff', '#ffd57d', '#26fedc'];

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
      <div className="w-full rounded-2xl bg-surface-container/80 backdrop-blur-2xl p-6 shadow-2xl border border-outline-variant/30 flex flex-col items-center text-center gap-3">
        {/* Trophy Icon */}
        <div className="relative w-24 h-24 rounded-full bg-gradient-to-tr from-primary-container via-surface-container-high to-secondary-container flex items-center justify-center shadow-xl border border-white/20">
          <span
            className={`material-symbols-outlined text-[48px] ${
              isWinner ? 'text-tertiary-fixed drop-shadow-[0_0_16px_rgba(249,189,34,0.7)]' : 'text-outline'
            }`}
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            {isWinner ? 'emoji_events' : 'military_tech'}
          </span>
        </div>

        {/* Victory Title */}
        <div className="flex flex-col items-center gap-1">
          <h2 className="font-headline-xl-mobile text-3xl font-black tracking-tight bg-gradient-to-r from-primary-container via-primary-fixed to-secondary text-transparent bg-clip-text drop-shadow-[0_0_20px_rgba(0,245,212,0.4)]">
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
          <div className="bg-surface-container-high/80 rounded-xl p-3 border border-outline-variant/20 flex flex-col items-center">
            <span className="font-label-sm text-[10px] text-on-surface-variant uppercase font-bold">
              Your {boardSize === 10 ? 'Strikes' : 'Lines'}
            </span>
            <span className="font-headline-sm text-lg text-primary-fixed font-black">
              {myLines} / {targetLines}
            </span>
          </div>
          <div className="bg-surface-container-high/80 rounded-xl p-3 border border-outline-variant/20 flex flex-col items-center">
            <span className="font-label-sm text-[10px] text-on-surface-variant uppercase font-bold">
              Total Calls
            </span>
            <span className="font-headline-sm text-lg text-on-surface font-black">
              {totalCalls}
            </span>
          </div>
        </div>
      </div>

      {/* Rematch Challenge Prompt (When opponent sends a challenge) */}
      {rematchStatus === 'received' && (
        <div className="w-full rounded-2xl bg-surface-container-high/95 backdrop-blur-2xl p-5 border-2 border-primary-container shadow-[0_0_32px_rgba(0,245,212,0.35)] flex flex-col items-center text-center gap-3 animate-fadeIn">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary-container/20 border border-primary-container/40">
            <span className="w-2.5 h-2.5 rounded-full bg-primary-container animate-ping" />
            <span className="font-label-sm text-xs font-black text-primary-fixed uppercase tracking-wider">
              Rematch Challenge
            </span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <h3 className="font-headline-sm text-lg font-black text-on-surface">
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
              className="h-12 rounded-xl bg-gradient-to-r from-primary-fixed to-primary-container text-on-primary-fixed font-headline-sm text-sm font-black shadow-[0_0_20px_rgba(0,245,212,0.5)] hover:brightness-105 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">check_circle</span>
              <span>Accept</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                onDeclineRematch?.();
              }}
              className="h-12 rounded-xl bg-surface-container-highest hover:bg-surface-bright text-error font-bold text-sm border border-error/30 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">cancel</span>
              <span>Reject</span>
            </button>
          </div>
        </div>
      )}

      {/* Rematch Rejected Banner */}
      {rematchStatus === 'declined' && (
        <div className="w-full rounded-xl bg-error-container/40 border border-error/40 p-3 flex items-center justify-center gap-2 text-error text-xs font-bold animate-fadeIn">
          <span className="material-symbols-outlined text-[18px]">info</span>
          <span>{rematchRequesterName || opponentName} rejected the rematch. Returning to arena...</span>
        </div>
      )}

      {/* Primary Actions */}
      <div className="flex flex-col w-full gap-2.5">
        {rematchStatus === 'requesting' ? (
          <div className="w-full flex flex-col gap-2">
            <div className="w-full h-14 rounded-2xl bg-surface-container-high/90 border border-primary-container/40 text-primary-fixed font-headline-sm text-sm font-bold flex items-center justify-center gap-2.5 shadow-md">
              <span className="w-4 h-4 border-2 border-primary-container border-t-transparent rounded-full animate-spin" />
              <span>Waiting for {opponentName} to accept...</span>
            </div>
            <button
              type="button"
              onClick={() => {
                sounds.playTap();
                onCancelRematchRequest?.();
              }}
              className="text-xs text-on-surface-variant/70 hover:text-on-surface transition-colors text-center py-1 cursor-pointer"
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
            className="w-full h-14 rounded-2xl bg-gradient-to-r from-primary-fixed to-primary-container text-on-primary-fixed font-headline-sm text-base font-black shadow-[0_0_24px_rgba(0,245,212,0.45)] hover:brightness-105 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[22px]">replay</span>
            <span>Play Rematch</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            sounds.playTap();
            onBackToHome();
          }}
          className="w-full h-12 rounded-2xl bg-surface-container-high hover:bg-surface-bright text-on-surface font-bold text-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2 border border-outline-variant/25 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">home</span>
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
            className="w-full h-12 rounded-2xl bg-surface-container-high/60 hover:bg-surface-container-high text-primary-fixed font-bold text-sm border border-primary-container/40 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary-container/10 cursor-pointer mt-1"
          >
            <span className="material-symbols-outlined text-[20px]">install_mobile</span>
            <span>Install BingoDuel App</span>
          </button>
        )}
      </div>

      {/* iOS Install Instructions Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-surface-container-high p-6 border border-outline-variant/30 flex flex-col items-center text-center gap-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-primary-container/20 flex items-center justify-center text-primary-fixed">
              <span className="material-symbols-outlined text-[28px]">ios_share</span>
            </div>
            <h3 className="font-headline-sm text-lg font-black text-on-surface">Install on iOS</h3>
            <p className="font-body-sm text-xs text-on-surface-variant leading-relaxed">
              1. Tap the <strong className="text-on-surface font-semibold">Share</strong> button in Safari&apos;s bottom toolbar.<br />
              2. Scroll down and tap <strong className="text-on-surface font-semibold">&apos;Add to Home Screen&apos;</strong>.<br />
              3. Tap <strong className="text-primary-fixed font-semibold">&apos;Add&apos;</strong> in the top right.
            </p>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full h-10 rounded-xl bg-primary-container text-black font-bold text-xs hover:brightness-110 active:scale-95 transition-all cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
