'use client';

import React, { useState, useEffect } from 'react';
import { sounds } from './AudioController';
import { generateRandomBoard } from '@/lib/gameEngine';

interface BoardSetupScreenProps {
  initialAutoFill?: boolean;
  onConfirmBoard: (board: number[]) => void;
  onBack: () => void;
  loading: boolean;
  isReady?: boolean;
  opponentName?: string;
}

export const BoardSetupScreen: React.FC<BoardSetupScreenProps> = ({
  initialAutoFill = true,
  onConfirmBoard,
  onBack,
  loading,
  isReady = false,
  opponentName = 'Opponent',
}) => {
  const [board, setBoard] = useState<(number | null)[]>(Array(25).fill(null));
  const [activeIndex, setActiveIndex] = useState<number>(0);

  useEffect(() => {
    if (initialAutoFill) {
      setBoard(generateRandomBoard());
      setActiveIndex(-1);
    }
  }, [initialAutoFill]);

  const placedCount = board.filter(v => v !== null).length;
  const isComplete = placedCount === 25;
  const usedNumbers = new Set(board.filter((v): v is number => v !== null));

  const handleCellClick = (idx: number) => {
    if (isReady) return;
    sounds.playTap();
    if (board[idx] !== null) {
      const nextBoard = [...board];
      nextBoard[idx] = null;
      setBoard(nextBoard);
      setActiveIndex(idx);
    } else {
      setActiveIndex(idx);
    }
  };

  const handleTrayChipClick = (num: number) => {
    if (isReady || usedNumbers.has(num)) return;

    let target = activeIndex;
    if (target === -1 || board[target] !== null) {
      target = board.findIndex(v => v === null);
    }
    if (target === -1) return;

    sounds.playDraft(440 + num * 18);
    const nextBoard = [...board];
    nextBoard[target] = num;
    setBoard(nextBoard);

    // Find next empty index
    const nextEmpty = nextBoard.findIndex(v => v === null);
    setActiveIndex(nextEmpty);
  };

  const handleShuffle = () => {
    sounds.playLineComplete();
    setBoard(generateRandomBoard());
    setActiveIndex(-1);
  };

  const handleClear = () => {
    sounds.playTap();
    setBoard(Array(25).fill(null));
    setActiveIndex(0);
  };

  const handleConfirm = () => {
    if (!isComplete || loading) return;
    sounds.playVictory();
    onConfirmBoard(board as number[]);
  };

  return (
    <div className="flex flex-col w-full max-w-md mx-auto gap-3 select-none pt-1 pb-6">
      {/* Top Header */}
      <div className="flex items-center justify-between w-full">
        <button
          onClick={() => {
            sounds.playTap();
            onBack();
          }}
          disabled={isReady}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-surface-container-high/70 text-on-surface-variant hover:text-primary transition-all text-xs font-bold border border-outline-variant/20 disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>Back</span>
        </button>

        <span className="font-label-sm text-xs font-black text-primary-fixed bg-primary-container/20 px-3 py-1 rounded-full border border-primary-container/30">
          {isComplete ? 'Board Complete (25/25)' : `Placed: ${placedCount}/25`}
        </span>
      </div>

      {/* 5x5 Bingo Board */}
      <div className="w-full aspect-square bg-surface-container/90 backdrop-blur-2xl rounded-2xl p-3 shadow-2xl border border-outline-variant/30 flex flex-col justify-between">
        {/* Column Headers B-I-N-G-O */}
        <div className="grid grid-cols-5 gap-1.5 text-center font-headline-sm text-xs text-secondary-fixed font-black pb-1">
          <div>B</div>
          <div>I</div>
          <div>N</div>
          <div>G</div>
          <div>O</div>
        </div>

        {/* 25 Board Tiles */}
        <div className="grid grid-cols-5 grid-rows-5 gap-1.5 w-full h-full" id="bingo-matrix">
          {board.map((val, idx) => {
            const isSelected = idx === activeIndex;
            const isFilled = val !== null;

            return (
              <button
                key={idx}
                type="button"
                disabled={isReady}
                onClick={() => handleCellClick(idx)}
                className={`relative aspect-square rounded-xl flex items-center justify-center transition-all ${
                  isSelected
                    ? 'bg-surface-bright border-2 border-primary-container shadow-[0_0_16px_rgba(0,245,212,0.45)] text-primary-fixed scale-[1.02] z-10'
                    : isFilled
                    ? 'bg-surface-container-high/90 text-on-surface hover:bg-surface-bright font-black text-base shadow-sm border border-outline-variant/20'
                    : 'bg-surface-container-high/40 text-on-surface-variant/30 border border-outline-variant/15 hover:bg-surface-container-high'
                }`}
              >
                {isFilled ? (
                  <span>{val}</span>
                ) : (
                  <span className="material-symbols-outlined text-[16px] opacity-40">add</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Number Tray (Shown if board is not complete) */}
      {!isComplete && (
        <div className="w-full bg-surface-container/70 backdrop-blur-md rounded-2xl p-3 border border-outline-variant/30 flex flex-col gap-2 shadow-md">
          <div className="flex items-center justify-between px-1">
            <span className="font-label-sm text-[11px] text-on-surface font-bold">
              Tap Numbers to Place (1 - 25):
            </span>
            <span className="font-label-sm text-[11px] text-tertiary-fixed font-bold">
              {25 - placedCount} Remaining
            </span>
          </div>

          <div className="grid grid-cols-7 gap-1.5 max-h-32 overflow-y-auto p-1">
            {Array.from({ length: 25 }, (_, i) => i + 1).map(num => {
              const isUsed = usedNumbers.has(num);
              return (
                <button
                  key={num}
                  type="button"
                  disabled={isUsed || isReady}
                  onClick={() => handleTrayChipClick(num)}
                  className={`h-8 rounded-lg font-bold text-xs transition-all flex items-center justify-center ${
                    isUsed
                      ? 'bg-surface-container-lowest/40 text-outline line-through opacity-30 cursor-not-allowed'
                      : 'bg-surface-container-high hover:bg-surface-bright text-primary-fixed border border-outline-variant/20 active:scale-95'
                  }`}
                >
                  {num}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      {isReady ? (
        <div className="w-full rounded-2xl bg-surface-container-high/90 backdrop-blur-xl p-4 shadow-xl border border-primary-container/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-primary-container animate-ping" />
            <div className="flex flex-col text-left">
              <span className="font-headline-sm text-sm font-bold text-primary-fixed">
                Board Ready &amp; Locked!
              </span>
              <span className="font-body-sm text-xs text-on-surface-variant">
                Waiting for {opponentName} to lock board...
              </span>
            </div>
          </div>
          <span className="material-symbols-outlined text-primary-container text-[24px]">lock</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2 w-full">
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={handleShuffle}
              className="col-span-1 h-12 rounded-xl bg-surface-container-high hover:bg-surface-bright text-on-surface active:scale-95 transition-all text-xs font-bold border border-outline-variant/20 flex items-center justify-center gap-1"
            >
              <span className="material-symbols-outlined text-[18px]">casino</span>
              <span>Shuffle</span>
            </button>

            <button
              type="button"
              onClick={handleClear}
              className="col-span-1 h-12 rounded-xl bg-surface-container-high hover:bg-surface-bright text-on-surface hover:text-error active:scale-95 transition-all text-xs font-bold border border-outline-variant/20 flex items-center justify-center gap-1"
            >
              <span className="material-symbols-outlined text-[18px]">delete_sweep</span>
              <span>Clear</span>
            </button>

            <button
              type="button"
              disabled={!isComplete || loading}
              onClick={handleConfirm}
              className="col-span-2 h-12 rounded-xl bg-gradient-to-r from-primary-fixed to-primary-container text-on-primary-fixed font-headline-sm text-sm font-black shadow-[0_0_20px_rgba(0,245,212,0.4)] active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none hover:brightness-105"
            >
              <span className="material-symbols-outlined text-[20px]">
                {isComplete ? 'check_circle' : 'lock_clock'}
              </span>
              <span>{loading ? 'Locking...' : 'Lock Board & Play'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
