'use client';

import React, { useState } from 'react';
import {
  ArrowLeftIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  ShareIcon,
  CheckCircleIcon,
  Squares2X2Icon,
  TableCellsIcon,
  PlayIcon,
} from '@heroicons/react/24/outline';
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
          className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-full bg-surface-container text-on-surface hover:bg-surface-container-high transition-all text-xs font-semibold border border-outline-variant"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          <span>Back</span>
        </button>
        <span className="font-label-sm text-[11px] text-primary-container uppercase font-semibold tracking-wider bg-primary-container/10 px-2.5 py-0.5 rounded-full border border-primary-container/20">
          Room Live
        </span>
      </div>

      {/* Room Code Card */}
      <div className="w-full rounded-2xl bg-surface-container/80 backdrop-blur-xl p-6 shadow-xs border border-outline-variant flex flex-col items-center text-center gap-3">
        <span className="font-label-sm text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
          Room Invite Code
        </span>

        <div className="flex items-center justify-center gap-3 w-full py-2">
          <span
            className="font-headline-xl-mobile text-3xl tracking-[0.25em] text-on-surface font-bold pl-3"
            id="room-code-display"
          >
            {roomCode}
          </span>
          <button
            aria-label="Copy Room Code"
            className="w-11 h-11 rounded-xl bg-surface-container-high hover:bg-primary-container hover:text-white text-on-surface flex items-center justify-center transition-all active:scale-95 shadow-xs border border-outline-variant"
            onClick={handleCopyCode}
          >
            {copied ? (
              <CheckIcon className="w-5 h-5 text-secondary-container" />
            ) : (
              <ClipboardDocumentIcon className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Share Button */}
        <button
          onClick={handleShareLink}
          className="w-full h-11 rounded-xl bg-surface-container-high hover:bg-surface-container-highest active:scale-[0.98] text-on-surface flex items-center justify-center gap-2 transition-all text-xs font-semibold border border-outline-variant cursor-pointer"
        >
          <ShareIcon className="w-4 h-4 text-primary-container" />
          <span>{copied ? 'Code Copied to Clipboard!' : 'Share Room Link / Code'}</span>
        </button>
      </div>

      {/* Opponent Status Indicator */}
      <div className="w-full rounded-2xl bg-surface-container/60 backdrop-blur-xl p-4 border border-outline-variant flex items-center gap-3 shadow-xs">
        <div className="relative flex items-center justify-center w-10 h-10 shrink-0 rounded-full bg-surface-container-high border border-outline-variant">
          {opponentConnected ? (
            <CheckCircleIcon className="w-6 h-6 text-secondary-container" />
          ) : (
            <div className="w-3 h-3 rounded-full bg-primary-container animate-pulse" />
          )}
        </div>
        <div className="flex flex-col text-left min-w-0">
          <span className="font-headline-sm text-sm text-on-surface font-semibold truncate">
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
      <div className="w-full rounded-2xl bg-surface-container/60 backdrop-blur-xl p-3.5 border border-outline-variant flex flex-col gap-2.5 shadow-xs">
        <div className="flex items-center justify-between px-1">
          <span className="font-label-sm text-xs text-on-surface font-semibold">
            Game Variant:
          </span>
          <span className="font-label-sm text-[10px] text-primary-container uppercase tracking-wider font-semibold bg-primary-container/10 px-2 py-0.5 rounded-full border border-primary-container/20">
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
            className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 transition-all cursor-pointer ${
              boardSize === 5
                ? 'bg-primary-container/10 border-primary-container text-primary-container shadow-xs'
                : 'bg-surface-container border-outline-variant text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <div className="flex items-center gap-1.5 font-headline-sm text-xs font-bold">
              <Squares2X2Icon className="w-4 h-4" />
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
            className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 transition-all cursor-pointer ${
              boardSize === 10
                ? 'bg-primary-container/10 border-primary-container text-primary-container shadow-xs'
                : 'bg-surface-container border-outline-variant text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <div className="flex items-center gap-1.5 font-headline-sm text-xs font-bold">
              <TableCellsIcon className="w-4 h-4" />
              <span>Mega 10x10</span>
            </div>
            <span className="text-[10px] text-on-surface-variant leading-none">
              100 Numbers · 10 Strikes
            </span>
          </button>
        </div>
      </div>

      {/* Board Setup Mode Toggle */}
      <div className="w-full rounded-2xl bg-surface-container/60 backdrop-blur-xl p-3 border border-outline-variant flex items-center justify-between gap-2 shadow-xs">
        <span className="font-label-sm text-xs text-on-surface font-semibold pl-1">
          Board Setup:
        </span>
        <div className="flex items-center p-1 rounded-xl bg-surface-container-low border border-outline-variant">
          <button
            onClick={() => {
              sounds.playTap();
              setAutoFill(true);
            }}
            className={`px-3 min-h-[44px] rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              autoFill
                ? 'bg-surface-container-high text-primary-container shadow-xs border border-outline-variant'
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
            className={`px-3 min-h-[44px] rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              !autoFill
                ? 'bg-surface-container-high text-primary-container shadow-xs border border-outline-variant'
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
        className="w-full h-13 rounded-2xl bg-primary-container text-on-primary-container font-headline-sm text-base font-semibold shadow-xs active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer hover:opacity-95"
      >
        <PlayIcon className="w-5 h-5" />
        <span>Ready &amp; Setup Board</span>
      </button>
    </div>
  );
};
