'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { sounds } from './AudioController';
import { generateRandomBoard } from '@/lib/gameEngine';
import { BoardSize } from '@/types/bingo';

interface BoardSetupScreenProps {
  boardSize?: BoardSize;
  targetLines?: number;
  initialAutoFill?: boolean;
  isHost?: boolean;
  onSwitchMode?: (size: BoardSize) => void;
  onConfirmBoard: (board: number[]) => void;
  onBack: () => void;
  loading: boolean;
  isReady?: boolean;
  opponentName?: string;
}

const HEADERS_5 = ['B', 'I', 'N', 'G', 'O'];
const HEADERS_10 = ['B', 'I', 'N', 'G', 'O', 'D', 'U', 'E', 'L', '!'];

const TRAY_RANGES = [
  { label: '1–25', start: 1, end: 25 },
  { label: '26–50', start: 26, end: 50 },
  { label: '51–75', start: 51, end: 75 },
  { label: '76–100', start: 76, end: 100 },
];

export const BoardSetupScreen: React.FC<BoardSetupScreenProps> = ({
  boardSize = 5,
  targetLines = 5,
  initialAutoFill = true,
  isHost = false,
  onSwitchMode,
  onConfirmBoard,
  onBack,
  loading,
  isReady = false,
  opponentName = 'Opponent',
}) => {
  const totalCells = boardSize * boardSize;
  const [board, setBoard] = useState<(number | null)[]>(() => Array(totalCells).fill(null));
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [trayRangeIndex, setTrayRangeIndex] = useState<number>(0);

  // Initialize or re-initialize board when boardSize or initialAutoFill changes
  useEffect(() => {
    if (initialAutoFill) {
      setBoard(generateRandomBoard(boardSize));
      setActiveIndex(-1);
    } else {
      setBoard(Array(totalCells).fill(null));
      setActiveIndex(0);
    }
  }, [boardSize, initialAutoFill, totalCells]);

  const placedCount = useMemo(() => board.filter(v => v !== null).length, [board]);
  const isComplete = placedCount === totalCells;
  const usedNumbers = useMemo(() => new Set(board.filter((v): v is number => v !== null)), [board]);

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

    sounds.playDraft(440 + (num % 25) * 18);
    const nextBoard = [...board];
    nextBoard[target] = num;
    setBoard(nextBoard);

    // Find next empty index
    const nextEmpty = nextBoard.findIndex(v => v === null);
    setActiveIndex(nextEmpty);
  };

  const handleShuffle = () => {
    sounds.playLineComplete();
    setBoard(generateRandomBoard(boardSize));
    setActiveIndex(-1);
  };

  const handleClear = () => {
    sounds.playTap();
    setBoard(Array(totalCells).fill(null));
    setActiveIndex(0);
  };

  const handleFillRemaining = () => {
    sounds.playLineComplete();
    const remainingNums: number[] = [];
    for (let i = 1; i <= totalCells; i++) {
      if (!usedNumbers.has(i)) remainingNums.push(i);
    }
    // Shuffle remaining numbers
    for (let i = remainingNums.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remainingNums[i], remainingNums[j]] = [remainingNums[j], remainingNums[i]];
    }

    let remIdx = 0;
    const nextBoard = board.map(val => {
      if (val !== null) return val;
      return remainingNums[remIdx++];
    });
    setBoard(nextBoard);
    setActiveIndex(-1);
  };

  const handleConfirm = () => {
    if (!isComplete || loading) return;
    sounds.playVictory();
    onConfirmBoard(board as number[]);
  };

  const headers = boardSize === 10 ? HEADERS_10 : HEADERS_5;

  // Numbers to display in the tray
  const trayNumbers = useMemo(() => {
    if (boardSize === 5) {
      return Array.from({ length: 25 }, (_, i) => i + 1);
    }
    const currentRange = TRAY_RANGES[trayRangeIndex];
    return Array.from({ length: currentRange.end - currentRange.start + 1 }, (_, i) => currentRange.start + i);
  }, [boardSize, trayRangeIndex]);

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

        {/* Mode Tag & Status */}
        <div className="flex items-center gap-1.5">
          <span className="font-label-sm text-[11px] font-black uppercase tracking-wider bg-secondary-container/25 text-secondary-fixed px-2.5 py-1 rounded-full border border-secondary/30">
            {boardSize === 10 ? 'Mega 10x10' : 'Classic 5x5'}
          </span>
          <span className="font-label-sm text-xs font-black text-primary-fixed bg-primary-container/20 px-3 py-1 rounded-full border border-primary-container/30">
            {isComplete ? `Complete (${totalCells}/${totalCells})` : `${placedCount}/${totalCells}`}
          </span>
        </div>
      </div>

      {/* Host Mode Switcher Banner (Shown before locking board) */}
      {isHost && onSwitchMode && !isReady && (
        <div className="w-full bg-surface-container/70 backdrop-blur-md rounded-xl p-2 border border-outline-variant/30 flex items-center justify-between gap-2 shadow-sm">
          <span className="font-label-sm text-[11px] text-on-surface-variant font-bold pl-1">
            Duel Mode:
          </span>
          <div className="flex items-center p-0.5 rounded-lg bg-surface-container-lowest/80 border border-outline-variant/20">
            <button
              type="button"
              onClick={() => {
                if (boardSize !== 5) {
                  sounds.playTap();
                  onSwitchMode(5);
                }
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                boardSize === 5
                  ? 'bg-surface-container-high text-primary-container shadow-sm border border-primary-container/30'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              5x5 (5 Lines)
            </button>
            <button
              type="button"
              onClick={() => {
                if (boardSize !== 10) {
                  sounds.playTap();
                  onSwitchMode(10);
                }
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                boardSize === 10
                  ? 'bg-surface-container-high text-secondary shadow-sm border border-secondary/30'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              10x10 (10 Strikes)
            </button>
          </div>
        </div>
      )}

      {/* Bingo Board Container */}
      <div className="w-full aspect-square bg-surface-container/90 backdrop-blur-2xl rounded-2xl p-2.5 sm:p-3 shadow-2xl border border-outline-variant/30 flex flex-col justify-between">
        {/* Column Headers (B-I-N-G-O or B-I-N-G-O-D-U-E-L-!) */}
        <div
          className={`grid gap-1 text-center font-headline-sm text-xs font-black pb-1 ${
            boardSize === 10
              ? 'grid-cols-10 text-[10px] sm:text-xs text-primary-fixed'
              : 'grid-cols-5 text-xs text-secondary-fixed'
          }`}
        >
          {headers.map((letter, idx) => (
            <div key={idx} className="tracking-wider drop-shadow-sm">
              {letter}
            </div>
          ))}
        </div>

        {/* Board Tiles Grid */}
        <div
          className={`grid w-full h-full ${
            boardSize === 10
              ? 'grid-cols-10 grid-rows-10 gap-1'
              : 'grid-cols-5 grid-rows-5 gap-1.5'
          }`}
          id="bingo-matrix"
        >
          {board.map((val, idx) => {
            const isSelected = idx === activeIndex;
            const isFilled = val !== null;

            return (
              <button
                key={idx}
                type="button"
                disabled={isReady}
                onClick={() => handleCellClick(idx)}
                className={`relative aspect-square flex items-center justify-center transition-all ${
                  boardSize === 10 ? 'rounded-md' : 'rounded-xl'
                } ${
                  isSelected
                    ? 'bg-surface-bright border-2 border-primary-container shadow-[0_0_16px_rgba(0,245,212,0.45)] text-primary-fixed scale-[1.03] z-10'
                    : isFilled
                    ? 'bg-surface-container-high/90 text-on-surface hover:bg-surface-bright font-black shadow-sm border border-outline-variant/20'
                    : 'bg-surface-container-high/40 text-on-surface-variant/30 border border-outline-variant/15 hover:bg-surface-container-high'
                }`}
              >
                {isFilled ? (
                  <span
                    className={`font-black ${
                      boardSize === 10
                        ? 'text-[11px] sm:text-xs leading-none'
                        : 'text-base'
                    }`}
                  >
                    {val}
                  </span>
                ) : (
                  <span
                    className={`material-symbols-outlined opacity-40 ${
                      boardSize === 10 ? 'text-[12px]' : 'text-[16px]'
                    }`}
                  >
                    add
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Number Tray (Shown if board is not complete) */}
      {!isComplete && (
        <div className="w-full bg-surface-container/70 backdrop-blur-md rounded-2xl p-3 border border-outline-variant/30 flex flex-col gap-2 shadow-md">
          {/* Header with Tray Title and Fill Remaining */}
          <div className="flex items-center justify-between px-1">
            <span className="font-label-sm text-[11px] text-on-surface font-bold">
              Tap Numbers to Place:
            </span>
            <div className="flex items-center gap-2">
              <span className="font-label-sm text-[11px] text-tertiary-fixed font-bold">
                {totalCells - placedCount} Remaining
              </span>
              {placedCount > 0 && placedCount < totalCells && (
                <button
                  type="button"
                  onClick={handleFillRemaining}
                  className="text-[10px] font-black uppercase text-primary-fixed bg-primary-container/20 hover:bg-primary-container/35 px-2 py-0.5 rounded-full border border-primary-container/30 transition-all active:scale-95"
                >
                  ⚡ Fill Remaining
                </button>
              )}
            </div>
          </div>

          {/* 10x10 Range Tabs */}
          {boardSize === 10 && (
            <div className="grid grid-cols-4 gap-1 p-0.5 rounded-xl bg-surface-container-lowest/70 border border-outline-variant/20">
              {TRAY_RANGES.map((r, i) => (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => {
                    sounds.playTap();
                    setTrayRangeIndex(i);
                  }}
                  className={`py-1 rounded-lg text-[10px] font-black transition-all ${
                    trayRangeIndex === i
                      ? 'bg-surface-container-high text-primary-fixed shadow-sm border border-primary-container/30'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}

          {/* Chips Grid */}
          <div className="grid grid-cols-7 sm:grid-cols-9 gap-1.5 max-h-32 overflow-y-auto p-1 scrollbar-thin">
            {trayNumbers.map(num => {
              const isUsed = usedNumbers.has(num);
              return (
                <button
                  key={num}
                  type="button"
                  disabled={isUsed || isReady}
                  onClick={() => handleTrayChipClick(num)}
                  className={`h-7 rounded-lg font-bold text-xs transition-all flex items-center justify-center ${
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
