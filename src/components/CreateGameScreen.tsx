'use client';

import React, { useState } from 'react';
import { sounds } from './AudioController';

import { BoardSize } from '@/types/bingo';

interface CreateGameScreenProps {
  roomCode: string;
  opponentConnected: boolean;
  opponentName?: string;
  boardSize: BoardSize;
  onSwitchMode: (size: BoardSize) => void;
  onProceedToSetup: (autoFill: boolean) => void;
  onBack: () => void;
}

export const CreateGameScreen: React.FC<CreateGameScreenProps> = ({
  roomCode,
  opponentConnected,
  opponentName = 'Challenger',
  boardSize,
  onSwitchMode,
  onProceedToSetup,
  onBack,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [autoFill, setAutoFill] = useState<boolean>(true);

  const handleCopyCode = async () => {
    sounds.playTap();
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleShareLink = async () => {
    sounds.playTap();
    const url = typeof window !== 'undefined' ? `${window.location.origin}/game/${roomCode}` : '';
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join my 1v1 BINGO Duel!',
          text: `Enter room code ${roomCode} to play real-time BINGO against me!`,
          url,
        });
      } catch {
        handleCopyCode();
      }
    } else {
      handleCopyCode();
    }
  };

  return (
    <div className="flex flex-col w-full max-w-md mx-auto gap-4 select-none pt-2">
      {/* Top Header */}
      <div className="flex items-center justify-between w-full">
        <button
          onClick={() => {
            sounds.playTap();
            onBack();
          }}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-surface-container-high/70 text-on-surface-variant hover:text-primary transition-all text-xs font-bold border border-outline-variant/20"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>Back</span>
        </button>
        <span className="font-label-sm text-[11px] text-primary-fixed uppercase font-black tracking-wider bg-primary-container/20 px-2.5 py-0.5 rounded-full border border-primary-container/30">
          Room Live
        </span>
      </div>

      {/* Room Code Card */}
      <div className="w-full rounded-2xl bg-surface-container/80 backdrop-blur-xl p-6 shadow-xl border border-outline-variant/30 flex flex-col items-center text-center gap-3">
        <span className="font-label-sm text-xs text-on-surface-variant uppercase tracking-wider font-bold">
          Room Invite Code
        </span>

        <div className="flex items-center justify-center gap-3 w-full py-2">
          <span
            className="font-headline-xl-mobile text-3xl tracking-[0.25em] text-primary-container drop-shadow-[0_0_18px_rgba(0,245,212,0.65)] font-black pl-3"
            id="room-code-display"
          >
            {roomCode}
          </span>
          <button
            aria-label="Copy Room Code"
            className="w-10 h-10 rounded-xl bg-surface-container-high hover:bg-primary-container hover:text-on-primary text-primary-container flex items-center justify-center transition-all active:scale-95 shadow-md border border-outline-variant/20"
            onClick={handleCopyCode}
          >
            <span className="material-symbols-outlined text-[20px]">
              {copied ? 'check' : 'content_copy'}
            </span>
          </button>
        </div>

        {/* Share Button */}
        <button
          onClick={handleShareLink}
          className="w-full h-11 rounded-xl bg-surface-container-high hover:bg-surface-bright active:scale-[0.98] text-on-surface flex items-center justify-center gap-2 transition-all text-xs font-bold border border-outline-variant/25"
        >
          <span className="material-symbols-outlined text-[18px] text-secondary">share</span>
          <span>{copied ? 'Code Copied to Clipboard!' : 'Share Room Link / Code'}</span>
        </button>
      </div>

      {/* Opponent Status Indicator */}
      <div className="w-full rounded-2xl bg-surface-container/70 backdrop-blur-xl p-4 border border-outline-variant/30 flex items-center gap-3 shadow-md">
        <div className="relative flex items-center justify-center w-10 h-10 shrink-0 rounded-full bg-surface-container-high">
          {opponentConnected ? (
            <span className="material-symbols-outlined text-secondary text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              check_circle
            </span>
          ) : (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-primary-container animate-ping absolute" />
              <span className="w-3 h-3 rounded-full bg-primary-container shadow-[0_0_8px_#00f5d4]" />
            </>
          )}
        </div>
        <div className="flex flex-col text-left min-w-0">
          <span className="font-headline-sm text-sm text-on-surface font-bold truncate">
            {opponentConnected ? `${opponentName} Connected!` : 'Waiting for Rival to Join...'}
          </span>
          <span className="font-body-sm text-xs text-on-surface-variant truncate">
            {opponentConnected
              ? 'Rival is in the lobby! Ready up your board to start.'
              : 'Share the 4-letter code with your opponent.'}
          </span>
        </div>
      </div>

      {/* Game Mode Selector */}
      <div className="w-full rounded-2xl bg-surface-container/70 backdrop-blur-xl p-3.5 border border-outline-variant/30 flex flex-col gap-2.5 shadow-md">
        <div className="flex items-center justify-between px-1">
          <span className="font-label-sm text-xs text-on-surface font-bold">
            Game Variant:
          </span>
          <span className="font-label-sm text-[10px] text-primary-fixed uppercase tracking-wider font-extrabold bg-primary-container/20 px-2 py-0.5 rounded-full border border-primary-container/30">
            {boardSize === 10 ? '10 Strikes to Win' : '5 Lines to Win'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              sounds.playTap();
              onSwitchMode(5);
            }}
            className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 transition-all ${
              boardSize === 5
                ? 'bg-primary-container/25 border-primary-container text-primary-fixed shadow-[0_0_16px_rgba(0,245,212,0.35)]'
                : 'bg-surface-container-high/60 border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <div className="flex items-center gap-1.5 font-headline-sm text-xs font-black">
              <span className="material-symbols-outlined text-[16px]">grid_4x4</span>
              <span>Classic 5x5</span>
            </div>
            <span className="text-[10px] text-on-surface-variant leading-none">
              25 Numbers · 5 Lines
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              sounds.playTap();
              onSwitchMode(10);
            }}
            className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 transition-all ${
              boardSize === 10
                ? 'bg-secondary-container/25 border-secondary text-secondary-fixed shadow-[0_0_16px_rgba(168,85,247,0.35)]'
                : 'bg-surface-container-high/60 border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <div className="flex items-center gap-1.5 font-headline-sm text-xs font-black">
              <span className="material-symbols-outlined text-[16px]">grid_on</span>
              <span>Mega 10x10</span>
            </div>
            <span className="text-[10px] text-on-surface-variant leading-none">
              100 Numbers · 10 Strikes
            </span>
          </button>
        </div>
      </div>

      {/* Board Setup Mode Toggle */}
      <div className="w-full rounded-2xl bg-surface-container/70 backdrop-blur-xl p-3 border border-outline-variant/30 flex items-center justify-between gap-2 shadow-md">
        <span className="font-label-sm text-xs text-on-surface font-bold pl-1">
          Board Setup:
        </span>
        <div className="flex items-center p-1 rounded-xl bg-surface-container-lowest/80 border border-outline-variant/20">
          <button
            onClick={() => {
              sounds.playTap();
              setAutoFill(true);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              autoFill
                ? 'bg-surface-container-high text-primary-container shadow-sm border border-primary-container/30'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            ⚡ Auto-fill
          </button>
          <button
            onClick={() => {
              sounds.playTap();
              setAutoFill(false);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              !autoFill
                ? 'bg-surface-container-high text-secondary shadow-sm border border-secondary/30'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            ✏️ Manual
          </button>
        </div>
      </div>

      {/* Primary Action Button */}
      <button
        onClick={() => {
          sounds.playTap();
          onProceedToSetup(autoFill);
        }}
        className="w-full h-14 rounded-2xl bg-gradient-to-r from-primary-fixed to-primary-container text-on-primary-fixed font-headline-sm text-base font-black shadow-[0_0_24px_rgba(0,245,212,0.4)] hover:brightness-105 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
      >
        <span className="material-symbols-outlined text-[22px]">play_circle</span>
        <span>Ready &amp; Setup Board</span>
      </button>
    </div>
  );
};
