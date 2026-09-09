'use client';

import React, { useState, useEffect } from 'react';
import { sounds } from './AudioController';
import { generateRandomBoard } from '@/lib/gameEngine';

interface BoardSetupScreenProps {
  initialAutoFill?: boolean;
  onConfirmBoard: (board: number[]) => void;
  onBack: () => void;
  loading: boolean;
}

export const BoardSetupScreen: React.FC<BoardSetupScreenProps> = ({
  initialAutoFill = true,
  onConfirmBoard,
  onBack,
  loading,
}) => {
  const [board, setBoard] = useState<(number | null)[]>(Array(25).fill(null));
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Initialize with auto-fill or empty
  useEffect(() => {
    if (initialAutoFill) {
      setBoard(generateRandomBoard());
      setActiveIndex(-1);
    }
  }, [initialAutoFill]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 1500);
  };

  const placedCount = board.filter(v => v !== null).length;
  const isComplete = placedCount === 25;
  const remainingCount = 25 - placedCount;

  // Used numbers set
  const usedNumbers = new Set(board.filter((v): v is number => v !== null));

  // Find next empty index
  const getNextEmptyIndex = (currentBoard: (number | null)[], fromIndex: number): number => {
    for (let i = 0; i < 25; i++) {
      const idx = (fromIndex + 1 + i) % 25;
      if (currentBoard[idx] === null) return idx;
    }
    return -1;
  };

  const handleCellClick = (idx: number) => {
    sounds.playTap();
    if (board[idx] !== null) {
      // Remove number from this slot
      const num = board[idx];
      const nextBoard = [...board];
      nextBoard[idx] = null;
      setBoard(nextBoard);
      setActiveIndex(idx);
      showToast(`Removed #${num}`);
    } else {
      setActiveIndex(idx);
    }
  };

  const handleTrayChipClick = (num: number) => {
    if (usedNumbers.has(num)) return;

    let target = activeIndex;
    if (target === -1 || board[target] !== null) {
      target = board.findIndex(v => v === null);
    }

    if (target === -1) {
      showToast('Board is full! Clear or tap a cell to replace.');
      return;
    }

    sounds.playDraft(440 + num * 18);
    const nextBoard = [...board];
    nextBoard[target] = num;
    setBoard(nextBoard);

    const nextEmpty = getNextEmptyIndex(nextBoard, target);
    setActiveIndex(nextEmpty);
    showToast(`Placed #${num} in slot ${target + 1}`);
  };

  const handleAutoFill = () => {
    sounds.playLineComplete();
    const randomized = generateRandomBoard();
    setBoard(randomized);
    setActiveIndex(-1);
    showToast('Auto-filled 25 balanced tiles!');
  };

  const handleClear = () => {
    sounds.playTap();
    setBoard(Array(25).fill(null));
    setActiveIndex(0);
    showToast('Board cleared');
  };

  const handleConfirm = () => {
    if (!isComplete || loading) return;
    sounds.playVictory();
    onConfirmBoard(board as number[]);
  };

  return (
    <div className="flex flex-col w-full max-w-md mx-auto select-none space-y-space-sm pb-space-lg">
      {/* Top Header & Breadcrumb */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            sounds.playTap();
            onBack();
          }}
          className="flex items-center gap-1 text-on-surface-variant hover:text-primary transition-all py-1.5 px-3 rounded-full bg-surface-container-high/60 text-xs font-bold"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>Back</span>
        </button>
        <div className="flex items-center gap-space-2xs px-space-xs py-1 rounded-full bg-surface-container-high shadow-sm border border-primary-container/30">
          <span className="material-symbols-outlined text-primary-container text-[14px]">auto_awesome</span>
          <span className="font-label-sm text-label-sm text-primary-fixed font-bold">
            Placed: {placedCount} / 25
          </span>
        </div>
      </div>

      {/* Header Info */}
      <div className="flex flex-col space-y-space-2xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-space-2xs">
            <span className="material-symbols-outlined text-primary-fixed-dim text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              grid_on
            </span>
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-extrabold">
              Setup Your 5x5 Board
            </h2>
          </div>
          <span className="text-tertiary-fixed-dim font-label-sm text-label-sm uppercase tracking-wider font-bold">
            {isComplete ? 'READY' : 'DRAFTING'}
          </span>
        </div>

        {/* Micro Progress Tracker Bar */}
        <div className="w-full h-1.5 rounded-full bg-surface-container-low overflow-hidden mt-1 p-[1px]">
          <div
            className="h-full rounded-full bg-primary-container shadow-[0_0_10px_#00dfc1] transition-all duration-300"
            style={{ width: `${(placedCount / 25) * 100}%` }}
          />
        </div>
      </div>

      {/* 5x5 Bingo Duel Board Matrix */}
      <div className="relative w-full aspect-square p-space-xs rounded-xl bg-surface-container shadow-2xl border border-outline-variant/30 backdrop-blur-xl flex flex-col justify-between">
        {/* Column Guides B-I-N-G-O */}
        <div className="grid grid-cols-5 gap-board-gap-mobile mb-1 text-center font-headline-sm text-headline-sm text-secondary-fixed-dim font-black">
          <div>B</div>
          <div>I</div>
          <div>N</div>
          <div>G</div>
          <div>O</div>
        </div>

        {/* The 25 Board Cells */}
        <div className="grid grid-cols-5 grid-rows-5 gap-board-gap-mobile w-full h-full" id="bingo-matrix">
          {board.map((val, idx) => {
            const isSelected = idx === activeIndex;
            const isFilled = val !== null;

            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleCellClick(idx)}
                className={`relative aspect-square rounded-[12px] flex items-center justify-center transition-all duration-200 outline-none select-none cursor-pointer ${
                  isSelected
                    ? 'bg-surface-bright shadow-[0_0_18px_rgba(0,245,212,0.45)] scale-[1.03] z-10 text-primary-container border-2 border-primary-container'
                    : isFilled
                    ? 'bg-surface-container-high/80 hover:bg-surface-bright text-primary shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] border border-outline-variant/20'
                    : 'bg-surface-container-high/40 hover:bg-surface-container-high text-on-surface-variant/40 border border-outline-variant/10'
                }`}
              >
                {isFilled ? (
                  <div className="flex flex-col items-center justify-center">
                    <span className="font-headline-sm text-headline-sm font-extrabold text-on-surface drop-shadow-[0_0_8px_#00dfc1]">
                      {val}
                    </span>
                    <div className="w-1.5 h-1.5 rounded-full bg-primary-container mt-0.5" />
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center rounded-[10px]">
                    <span className={`material-symbols-outlined text-[18px] ${isSelected ? 'opacity-100 text-primary-container animate-pulse' : 'opacity-30'}`}>
                      add
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Number Tray (1 - 25) */}
      <div className="w-full bg-surface-container/70 backdrop-blur-md rounded-xl p-space-xs border border-outline-variant/30 flex flex-col gap-1.5">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[16px] text-primary-fixed-dim">token</span>
            <span className="font-label-md text-label-md text-on-surface uppercase tracking-wider font-bold">
              Number Tray (1 - 25)
            </span>
          </div>
          <span className="font-label-sm text-label-sm text-tertiary-fixed-dim font-bold">
            {remainingCount} Remaining
          </span>
        </div>

        {/* 1-25 Wrapped Tray Chips */}
        <div className="grid grid-cols-7 gap-1.5 max-h-36 overflow-y-auto pr-0.5 pt-0.5">
          {Array.from({ length: 25 }, (_, i) => i + 1).map(num => {
            const isUsed = usedNumbers.has(num);
            return (
              <button
                key={num}
                type="button"
                disabled={isUsed}
                onClick={() => handleTrayChipClick(num)}
                className={`h-9 flex items-center justify-center rounded-lg font-label-md text-label-md transition-all select-none ${
                  isUsed
                    ? 'bg-surface-container-lowest/50 text-outline line-through opacity-30 cursor-not-allowed'
                    : 'bg-surface-container-high hover:bg-surface-bright active:scale-90 text-primary-fixed shadow-sm border border-outline-variant/20 cursor-pointer font-bold'
                }`}
              >
                {num}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Thumb Zone Actions */}
      <div className="grid grid-cols-12 gap-space-xs pt-space-2xs">
        {/* Clear Board */}
        <button
          type="button"
          onClick={handleClear}
          className="col-span-3 flex items-center justify-center gap-1 h-12 rounded-lg bg-surface-container-high text-on-surface hover:text-error hover:bg-surface-bright active:scale-95 transition-all shadow-md border border-outline-variant/30 font-bold"
        >
          <span className="material-symbols-outlined text-[18px]">delete_sweep</span>
          <span className="font-label-md text-label-md">Clear</span>
        </button>

        {/* Randomize Auto */}
        <button
          type="button"
          onClick={handleAutoFill}
          className="col-span-3 flex items-center justify-center gap-1 h-12 rounded-lg bg-surface-container-high text-on-surface hover:text-secondary-fixed-dim hover:bg-surface-bright active:scale-95 transition-all shadow-md border border-outline-variant/30 font-bold"
        >
          <span className="material-symbols-outlined text-[18px]">casino</span>
          <span className="font-label-md text-label-md">Auto</span>
        </button>

        {/* Confirm Board Neon Primary CTA */}
        <button
          type="button"
          disabled={!isComplete || loading}
          onClick={handleConfirm}
          className={`col-span-6 flex items-center justify-center gap-2 h-12 rounded-lg font-headline-sm text-headline-sm transition-all shadow-md font-extrabold ${
            isComplete && !loading
              ? 'bg-gradient-to-r from-primary-fixed to-primary-container text-on-primary-fixed shadow-[0_0_20px_rgba(0,245,212,0.5)] active:scale-[0.98] cursor-pointer'
              : 'bg-surface-container-highest text-on-surface-variant opacity-60 cursor-not-allowed'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">
            {isComplete ? 'check_circle' : 'lock_clock'}
          </span>
          <span>
            {loading ? 'Locking...' : isComplete ? 'Lock & Duel' : `Confirm (${placedCount}/25)`}
          </span>
        </button>
      </div>

      {/* Mini Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 px-space-md py-space-xs rounded-full bg-surface-container-highest text-primary-fixed shadow-2xl border border-primary-container/40 backdrop-blur-xl transition-all duration-300 font-label-sm text-label-sm flex items-center gap-2 z-50 animate-bounce">
          <span className="material-symbols-outlined text-[16px] text-primary-container">check_circle</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
