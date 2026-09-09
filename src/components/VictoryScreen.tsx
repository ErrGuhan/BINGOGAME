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
      // Confetti burst
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
    <div className="flex flex-col w-full max-w-md mx-auto pb-space-xl select-none pt-2">
      {/* Dynamic Victory Aura Centerpiece Stage */}
      <div className="relative w-full overflow-hidden flex flex-col items-center">
        {/* Ambient Aura Flares */}
        <div className="absolute -top-10 w-64 h-64 rounded-full bg-primary-container/20 blur-3xl pointer-events-none" />
        <div className="absolute top-28 -right-10 w-56 h-56 rounded-full bg-secondary-container/30 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center mt-space-sm px-space-xs w-full">
          {/* 3D Glowing Trophy Badge */}
          <div className="relative mb-space-sm group cursor-pointer">
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-primary-container via-secondary-container to-tertiary-container blur-xl opacity-70 animate-pulse" />
            <div className="relative w-28 h-28 rounded-full bg-surface-container-high/70 backdrop-blur-2xl flex items-center justify-center shadow-[0_8px_32px_rgba(0,0,0,0.5)] border border-white/20">
              <div className="w-20 h-20 rounded-full bg-surface-container-lowest/80 flex items-center justify-center">
                <span
                  className={`material-symbols-outlined text-[52px] drop-shadow-[0_0_16px_rgba(249,189,34,0.7)] ${
                    isWinner ? 'text-tertiary-fixed-dim' : 'text-outline'
                  }`}
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  {isWinner ? 'emoji_events' : 'military_tech'}
                </span>
              </div>
              <span className="material-symbols-outlined absolute -bottom-1 -left-1 text-secondary text-[22px] drop-shadow-[0_0_8px_#ddb7ff]" style={{ fontVariationSettings: "'FILL' 1" }}>
                star
              </span>
            </div>
          </div>

          {/* Victory Titles */}
          <div className="inline-flex items-center gap-space-2xs bg-secondary-container/40 backdrop-blur-md px-space-sm py-0.5 rounded-full mb-space-xs shadow-sm border border-secondary/30">
            <span className="material-symbols-outlined text-primary-fixed-dim text-[16px]">verified</span>
            <span className="font-label-sm text-label-sm text-secondary-fixed tracking-wider uppercase font-bold">
              Ranked Duel Result
            </span>
          </div>

          <h2 className="font-headline-xl-mobile text-headline-xl-mobile font-black tracking-tight bg-gradient-to-r from-primary-container via-primary to-secondary text-transparent bg-clip-text drop-shadow-[0_0_24px_rgba(0,245,212,0.45)]">
            {isWinner ? 'YOU WON!' : `${winnerName} WON!`}
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant mt-space-2xs">
            {isWinner ? (
              <>
                BINGO! Completed <span className="text-primary-fixed font-bold">{myLines} lines</span> in{' '}
                <span className="text-on-surface font-bold">{totalCalls} calls</span>
              </>
            ) : (
              <>
                Opponent completed <span className="text-secondary font-bold">{opponentLines} lines</span> for BINGO
              </>
            )}
          </p>

          {/* Tier Promotion Banner */}
          <div className="mt-space-md w-full bg-surface-container-high/40 backdrop-blur-xl rounded-xl p-space-sm shadow-md border border-outline-variant/30 flex items-center justify-between">
            <div className="flex items-center gap-space-xs">
              <div className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center">
                <span className="material-symbols-outlined text-primary-fixed-dim text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  diamond
                </span>
              </div>
              <div className="flex flex-col text-left">
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide font-bold">
                  Division Update
                </span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-extrabold text-sm">
                  Diamond League
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-primary-container/20 px-space-sm py-1 rounded-full text-primary-fixed border border-primary-container/30">
              <span className="material-symbols-outlined text-[16px]">trending_up</span>
              <span className="font-label-md text-label-md font-black">
                {isWinner ? '+45 ELO' : '+10 ELO'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Player Telemetry & Match Stats Breakdown Card */}
      <div className="w-full mt-space-md flex flex-col gap-space-sm">
        <div className="bg-surface-container/60 backdrop-blur-2xl rounded-2xl p-space-md shadow-xl border border-outline-variant/30 flex flex-col gap-space-md">
          <div className="flex items-center justify-between">
            {/* You */}
            <div className="flex items-center gap-space-xs">
              <div className="relative">
                <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-primary-container to-surface-container-lowest flex items-center justify-center shadow-[0_0_12px_rgba(0,245,212,0.4)]">
                  <span className="material-symbols-outlined text-surface-container-lowest text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                    smart_toy
                  </span>
                </div>
                {isWinner && (
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-primary-container text-on-primary flex items-center justify-center shadow-md">
                    <span className="material-symbols-outlined text-[10px] font-bold">military_tech</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col text-left">
                <span className="font-headline-sm text-headline-sm text-on-surface font-bold text-sm">
                  {playerName}
                </span>
                <span className={`font-label-sm text-label-sm text-[10px] font-bold ${isWinner ? 'text-primary-fixed-dim' : 'text-outline'}`}>
                  {isWinner ? 'Winner' : 'Runner Up'}
                </span>
              </div>
            </div>

            <div className="px-space-xs py-1 rounded-full bg-surface-container-highest/80 text-on-surface-variant font-label-sm text-label-sm font-black tracking-wider text-xs">
              VS
            </div>

            {/* Opponent */}
            <div className="flex items-center gap-space-xs flex-row-reverse text-right">
              <div className="relative">
                <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-secondary-container to-surface-container-lowest flex items-center justify-center shadow-[0_0_10px_rgba(111,0,190,0.4)]">
                  <span className="material-symbols-outlined text-secondary-fixed text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                    person_pin
                  </span>
                </div>
                {!isWinner && (
                  <div className="absolute -bottom-1 -left-1 w-4 h-4 rounded-full bg-secondary-container text-secondary-fixed flex items-center justify-center shadow-md">
                    <span className="material-symbols-outlined text-[10px] font-bold">military_tech</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col">
                <span className="font-headline-sm text-headline-sm text-on-surface-variant font-bold text-sm">
                  {opponentName}
                </span>
                <span className={`font-label-sm text-label-sm text-[10px] font-bold ${!isWinner ? 'text-secondary-fixed-dim' : 'text-outline'}`}>
                  {!isWinner ? 'Winner' : 'Runner Up'}
                </span>
              </div>
            </div>
          </div>

          {/* Stat Rows Grid */}
          <div className="flex flex-col gap-space-2xs pt-space-xs">
            {/* Lines Completed */}
            <div className="bg-surface-container-high/30 rounded-xl p-space-xs flex items-center justify-between border border-outline-variant/10">
              <div className="w-12 text-left font-headline-sm text-headline-sm text-primary-fixed font-black text-sm">
                {myLines}
              </div>
              <div className="flex items-center gap-space-2xs text-on-surface-variant text-xs">
                <span className="material-symbols-outlined text-[16px] text-primary-fixed-dim">view_agenda</span>
                <span className="font-label-md text-label-md">Lines Completed</span>
              </div>
              <div className="w-12 text-right font-headline-sm text-headline-sm text-on-surface-variant font-medium text-sm">
                {opponentLines}
              </div>
            </div>

            {/* Total Numbers Called */}
            <div className="bg-surface-container-high/30 rounded-xl p-space-xs flex items-center justify-between border border-outline-variant/10">
              <div className="w-12 text-left font-headline-sm text-headline-sm text-primary-fixed font-black text-sm">
                {totalCalls}
              </div>
              <div className="flex items-center gap-space-2xs text-on-surface-variant text-xs">
                <span className="material-symbols-outlined text-[16px] text-secondary-fixed-dim">pin</span>
                <span className="font-label-md text-label-md">Total Calls</span>
              </div>
              <div className="w-12 text-right font-headline-sm text-headline-sm text-on-surface-variant font-medium text-sm">
                {totalCalls}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Tactical Actions */}
      <div className="w-full mt-space-lg flex flex-col gap-space-xs">
        {/* Rematch CTA */}
        <button
          type="button"
          onClick={() => {
            sounds.playTap();
            onRematch();
          }}
          className="w-full h-14 rounded-2xl bg-gradient-to-r from-primary-container via-primary-fixed to-primary-fixed-dim text-on-primary font-headline-sm text-headline-sm font-extrabold flex items-center justify-center gap-space-xs shadow-[0_0_24px_rgba(0,245,212,0.45)] hover:shadow-[0_0_32px_rgba(0,245,212,0.6)] active:scale-[0.98] transition-all cursor-pointer"
        >
          <span className="material-symbols-outlined text-[24px]">replay</span>
          <span>Rematch / Play Again</span>
        </button>

        {/* Back to Home CTA */}
        <button
          type="button"
          onClick={() => {
            sounds.playTap();
            onBackToHome();
          }}
          className="w-full h-12 rounded-2xl bg-surface-container-high/40 hover:bg-surface-container-high/70 active:scale-[0.98] text-on-surface font-headline-sm text-headline-sm font-medium flex items-center justify-center gap-space-2xs backdrop-blur-xl transition-all border border-outline-variant/30 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">home</span>
          <span>Back to Home</span>
        </button>
      </div>
    </div>
  );
};
