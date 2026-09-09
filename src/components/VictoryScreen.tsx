'use client';

import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { sounds } from './AudioController';

interface VictoryScreenProps {
  isWinner: boolean;
  winnerName: string;
  playerName: string;
  opponentName: string;
  myLines: number;
  opponentLines: number;
  totalCalls: number;
  onRematch: () => void;
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
  onRematch,
  onBackToHome,
}) => {
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
              ? `Congratulations! You scored ${myLines} lines for BINGO!`
              : `${opponentName} reached 5 lines first.`}
          </p>
        </div>

        {/* Match Stats Summary */}
        <div className="w-full grid grid-cols-2 gap-2 mt-2">
          <div className="bg-surface-container-high/80 rounded-xl p-3 border border-outline-variant/20 flex flex-col items-center">
            <span className="font-label-sm text-[10px] text-on-surface-variant uppercase font-bold">
              Your Lines
            </span>
            <span className="font-headline-sm text-lg text-primary-fixed font-black">
              {myLines} / 5
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

      {/* Primary Actions */}
      <div className="flex flex-col w-full gap-2.5">
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

        <button
          type="button"
          onClick={() => {
            sounds.playTap();
            onBackToHome();
          }}
          className="w-full h-12 rounded-2xl bg-surface-container-high hover:bg-surface-bright text-on-surface font-bold text-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2 border border-outline-variant/25"
        >
          <span className="material-symbols-outlined text-[18px]">home</span>
          <span>Back to Arena</span>
        </button>
      </div>
    </div>
  );
};
