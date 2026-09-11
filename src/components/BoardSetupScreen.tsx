'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { sounds } from './AudioController';
import { BoardSize } from '@/types/bingo';

// ─── Memoized board cell for BoardSetup ────────────────────────────────────────
// Extracted so React.memo can bail out when a cell's props haven't changed.
interface BoardSetupCellProps {
  idx: number;
  val: number | null;
  isReady: boolean;
  boardSize: BoardSize;
  onClick: (idx: number) => void;
}

const BoardSetupCell = React.memo(function BoardSetupCell({
  idx,
  val,
  isReady,
  boardSize,
  onClick,
}: BoardSetupCellProps) {
  const isFilled = val !== null;
  return (
    <button
      key={idx}
      type="button"
      disabled={isReady}
      onClick={() => onClick(idx)}
      className={`relative aspect-square flex items-center justify-center transition-all ${
        boardSize === 10 ? 'rounded-md' : 'rounded-xl'
      } ${
        isFilled
          ? 'bg-surface-container-high/90 text-on-surface font-black shadow-sm border border-primary-container/30 hover:bg-error-container/20 hover:border-error/40 active:scale-95'
          : 'bg-surface-container-high/40 text-on-surface-variant/20 border border-dashed border-outline-variant/20 hover:bg-primary-container/10 hover:border-primary-container/40 active:scale-95 cursor-pointer'
      }`}
    >
      {isFilled ? (
        <span
          className={`font-black text-primary-fixed ${
            boardSize === 10
              ? 'text-[11px] sm:text-xs leading-none'
              : 'text-base'
          }`}
        >
          {val}
        </span>
      ) : (
        <span
          className={`material-symbols-outlined opacity-25 ${
            boardSize === 10 ? 'text-[10px]' : 'text-[14px]'
          }`}
        >
          add
        </span>
      )}
    </button>
  );
});
// ──────────────────────────────────────────────────────────────────────────────

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

export const BoardSetupScreen: React.FC<BoardSetupScreenProps> = ({
  boardSize = 5,
  targetLines = 5,
  initialAutoFill = false,
  isHost = false,
  onSwitchMode,
  onConfirmBoard,
  onBack,
  loading,
  isReady = false,
  opponentName = 'Opponent',
}) => {
  const totalCells = boardSize * boardSize;

  // Board: array of placed numbers (null = empty)
  const [board, setBoard] = useState<(number | null)[]>(() => Array(totalCells).fill(null));
  // nextNumber: sequence counter — next tap on an empty cell assigns this value
  const [nextNumber, setNextNumber] = useState<number>(1);

  // Re-initialize board whenever boardSize changes
  useEffect(() => {
    setBoard(Array(totalCells).fill(null));
    setNextNumber(1);
  }, [boardSize, totalCells]);

  const placedCount = useMemo(() => board.filter(v => v !== null).length, [board]);
  const isComplete = placedCount === totalCells;
  const usedNumbers = useMemo(() => new Set(board.filter((v): v is number => v !== null)), [board]);

  // Tap-to-assign: empty cell → assign nextNumber; filled cell → clear it
  const handleCellClick = useCallback((idx: number) => {
    if (isReady) return;
    const current = board[idx];
    if (current !== null) {
      // Clear the cell. nextNumber does NOT decrement — future taps continue from current counter.
      sounds.playTap();
      const nextBoard = [...board];
      nextBoard[idx] = null;
      setBoard(nextBoard);
    } else {
      // Only assign if we still have numbers left in sequence
      if (nextNumber > totalCells) return;
      sounds.playDraft(440 + (nextNumber % 25) * 18);
      const nextBoard = [...board];
      nextBoard[idx] = nextNumber;
      setBoard(nextBoard);
      setNextNumber(prev => prev + 1);
    }
  }, [board, isReady, nextNumber, totalCells]);

  // Shuffle = auto-fill ALL remaining empty cells with remaining unused numbers (random order)
  const handleShuffle = useCallback(() => {
    sounds.playLineComplete();
    const remainingNums: number[] = [];
    for (let i = 1; i <= totalCells; i++) {
      if (!usedNumbers.has(i)) remainingNums.push(i);
    }
    // Fisher-Yates shuffle of remaining numbers
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
    setNextNumber(totalCells + 1); // all filled
  }, [board, totalCells, usedNumbers]);

  // Clear = reset board to all-empty and restart counter from 1
  const handleClear = useCallback(() => {
    sounds.playTap();
    setBoard(Array(totalCells).fill(null));
    setNextNumber(1);
  }, [totalCells]);

  const handleConfirm = () => {
    if (!isComplete || loading) return;
    sounds.playVictory();
    onConfirmBoard(board as number[]);
  };

  const headers = boardSize === 10 ? HEADERS_10 : HEADERS_5;

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
          <span className={`font-label-sm text-xs font-black px-3 py-1 rounded-full border ${
            isComplete
              ? 'text-primary-fixed bg-primary-container/25 border-primary-container/40'
              : 'text-on-surface-variant bg-surface-container-high/60 border-outline-variant/20'
          }`}>
            {isComplete ? `\u2713 ${totalCells}/${totalCells}` : `${placedCount}/${totalCells}`}
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

      {/* Instruction hint: shows next number in sequence */}
      {!isReady && !isComplete && (
        <div className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl bg-surface-container/60 border border-outline-variant/15">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-primary-container text-[15px]">touch_app</span>
            <span className="text-[11px] text-on-surface-variant font-bold">
              Tap empty cells to place numbers in order
            </span>
          </div>
          <span className="text-[11px] text-primary-fixed font-black tabular-nums shrink-0">
            Next: <span className="text-primary-container">#{nextNumber}</span>
          </span>
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
          {board.map((val, idx) => (
            <BoardSetupCell
              key={idx}
              idx={idx}
              val={val}
              isReady={isReady}
              boardSize={boardSize}
              onClick={handleCellClick}
            />
          ))}
        </div>
      </div>

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
            {/* Shuffle = fills remaining empty cells randomly */}
            <button
              type="button"
              onClick={handleShuffle}
              disabled={isComplete}
              className="col-span-1 h-12 rounded-xl bg-surface-container-high hover:bg-surface-bright text-on-surface active:scale-95 transition-all text-xs font-bold border border-outline-variant/20 flex items-center justify-center gap-1 disabled:opacity-40 disabled:pointer-events-none"
            >
              <span className="material-symbols-outlined text-[18px]">casino</span>
              <span>Shuffle</span>
            </button>

            <button
              type="button"
              onClick={handleClear}
              disabled={placedCount === 0}
              className="col-span-1 h-12 rounded-xl bg-surface-container-high hover:bg-surface-bright text-on-surface hover:text-error active:scale-95 transition-all text-xs font-bold border border-outline-variant/20 flex items-center justify-center gap-1 disabled:opacity-40 disabled:pointer-events-none"
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
                {loading ? 'hourglass_top' : isComplete ? 'check_circle' : 'lock_clock'}
              </span>
              <span>{loading ? 'Locking...' : 'Lock Board & Play'}</span>
            </button>
          </div>
          {/* Partial-fill shortcut hint */}
          {placedCount > 0 && placedCount < totalCells && (
            <p className="text-center text-[10px] text-on-surface-variant/50 font-medium">
              {totalCells - placedCount} remaining — tap Shuffle to auto-fill the rest
            </p>
          )}
        </div>
      )}
    </div>
  );
};
