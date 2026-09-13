'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowLeftIcon,
  PlusIcon,
  SparklesIcon,
  ArrowPathIcon,
  TrashIcon,
  LockClosedIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import { sounds } from './AudioController';
import { BoardSize } from '@/types/bingo';

// ─── Memoized board cell for BoardSetup ────────────────────────────────────────
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
          ? 'bg-surface-container-high text-on-surface font-bold shadow-xs border border-outline-variant hover:border-error hover:text-error active:scale-95'
          : 'bg-surface-container-low text-on-surface-variant/30 border border-dashed border-outline-variant hover:bg-surface-container hover:border-primary-container active:scale-95 cursor-pointer'
      }`}
    >
      {isFilled ? (
        <span
          className={`font-bold text-on-surface ${
            boardSize === 10
              ? 'text-[11px] sm:text-xs leading-none'
              : 'text-base'
          }`}
        >
          {val}
        </span>
      ) : (
        <PlusIcon
          className={`opacity-30 ${
            boardSize === 10 ? 'w-2.5 h-2.5' : 'w-4 h-4'
          }`}
        />
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
  errorMessage?: string | null;
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
  errorMessage,
}) => {
  const totalCells = boardSize * boardSize;

  // Board: array of placed numbers (null = empty)
  const [board, setBoard] = useState<(number | null)[]>(() => Array(totalCells).fill(null));
  const placedCount = useMemo(() => board.filter(v => v !== null).length, [board]);
  const isComplete = placedCount === totalCells;
  const usedNumbers = useMemo(() => new Set(board.filter((v): v is number => v !== null)), [board]);

  // Find lowest unused number 1..totalCells for seamless sequential tap-to-assign
  const nextAvailableNumber = useMemo(() => {
    for (let i = 1; i <= totalCells; i++) {
      if (!usedNumbers.has(i)) return i;
    }
    return totalCells + 1;
  }, [totalCells, usedNumbers]);

  // Re-initialize board whenever boardSize changes
  useEffect(() => {
    setBoard(Array(totalCells).fill(null));
  }, [boardSize, totalCells]);

  // Tap-to-assign: empty cell → assign nextAvailableNumber; filled cell → clear it
  const handleCellClick = useCallback((idx: number) => {
    if (isReady) return;
    const current = board[idx];
    if (current !== null) {
      sounds.playTap();
      const nextBoard = [...board];
      nextBoard[idx] = null;
      setBoard(nextBoard);
    } else {
      if (nextAvailableNumber > totalCells) return;
      sounds.playDraft(440 + (nextAvailableNumber % (boardSize === 10 ? 50 : 25)) * 14);
      const nextBoard = [...board];
      nextBoard[idx] = nextAvailableNumber;
      setBoard(nextBoard);
    }
  }, [board, isReady, nextAvailableNumber, totalCells, boardSize]);

  // Shuffle = auto-fill ALL remaining empty cells with remaining unused numbers (random order)
  const handleShuffle = useCallback(() => {
    sounds.playLineComplete();
    const remainingNums: number[] = [];
    for (let i = 1; i <= totalCells; i++) {
      if (!usedNumbers.has(i)) remainingNums.push(i);
    }
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
  }, [board, totalCells, usedNumbers]);

  // Clear = reset board to all-empty
  const handleClear = useCallback(() => {
    sounds.playTap();
    setBoard(Array(totalCells).fill(null));
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
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container text-on-surface hover:bg-surface-container-high transition-all text-xs font-semibold border border-outline-variant disabled:opacity-40"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          <span>Back</span>
        </button>

        {/* Mode Tag & Status */}
        <div className="flex items-center gap-1.5">
          <span className="font-label-sm text-[11px] font-semibold uppercase tracking-wider bg-surface-container text-on-surface px-2.5 py-1 rounded-full border border-outline-variant">
            {boardSize === 10 ? 'Mega 10x10' : 'Classic 5x5'}
          </span>
          <span className={`font-label-sm text-xs font-semibold px-3 py-1 rounded-full border ${
            isComplete
              ? 'text-primary-container bg-primary-container/10 border-primary-container/30'
              : 'text-on-surface-variant bg-surface-container border-outline-variant'
          }`}>
            {isComplete ? `\u2713 ${totalCells}/${totalCells}` : `${placedCount}/${totalCells}`}
          </span>
        </div>
      </div>

      {/* Error Notice Banner */}
      {errorMessage && (
        <div className="w-full bg-error-container text-on-error-container rounded-xl p-2.5 border border-error/20 flex items-center gap-2 shadow-xs">
          <ExclamationCircleIcon className="w-4 h-4 text-error shrink-0" />
          <span className="text-xs font-semibold leading-tight">{errorMessage}</span>
        </div>
      )}

      {/* Host Mode Switcher Banner */}
      {isHost && onSwitchMode && !isReady && (
        <div className="w-full bg-surface-container/60 backdrop-blur-xl rounded-xl p-2 border border-outline-variant flex items-center justify-between gap-2 shadow-xs">
          <span className="font-label-sm text-[11px] text-on-surface-variant font-semibold pl-1">
            Duel Mode:
          </span>
          <div className="flex items-center p-0.5 rounded-lg bg-surface-container-low border border-outline-variant">
            <button
              type="button"
              onClick={() => {
                if (boardSize !== 5) {
                  sounds.playTap();
                  onSwitchMode(5);
                }
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                boardSize === 5
                  ? 'bg-surface-container-high text-primary-container shadow-xs border border-outline-variant'
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
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                boardSize === 10
                  ? 'bg-surface-container-high text-primary-container shadow-xs border border-outline-variant'
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
        <div className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl bg-surface-container/60 border border-outline-variant">
          <div className="flex items-center gap-1.5">
            <SparklesIcon className="w-3.5 h-3.5 text-primary-container" />
            <span className="text-[11px] text-on-surface-variant font-medium">
              Tap empty cells to place numbers in order
            </span>
          </div>
          <span className="text-[11px] text-on-surface font-semibold tabular-nums shrink-0">
            Next: <span className="text-primary-container">#{nextAvailableNumber}</span>
          </span>
        </div>
      )}

      {/* Bingo Board Container */}
      <div className="w-full aspect-square bg-surface-container/80 backdrop-blur-xl rounded-2xl p-2.5 sm:p-3 shadow-xs border border-outline-variant flex flex-col justify-between">
        {/* Column Headers (B-I-N-G-O or B-I-N-G-O-D-U-E-L-!) */}
        <div
          className={`grid gap-1 text-center font-headline-sm text-xs font-bold pb-1 text-on-surface-variant ${
            boardSize === 10
              ? 'grid-cols-10 text-[10px] sm:text-xs'
              : 'grid-cols-5 text-xs'
          }`}
        >
          {headers.map((letter, idx) => (
            <div key={idx} className="tracking-wider">
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
        <div className="w-full rounded-2xl bg-surface-container-high/90 backdrop-blur-xl p-4 shadow-xs border border-primary-container/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-primary-container animate-pulse" />
            <div className="flex flex-col text-left">
              <span className="font-headline-sm text-sm font-semibold text-on-surface">
                Board Ready &amp; Locked!
              </span>
              <span className="font-body-sm text-xs text-on-surface-variant">
                Waiting for {opponentName} to lock board...
              </span>
            </div>
          </div>
          <LockClosedIcon className="w-5 h-5 text-primary-container" />
        </div>
      ) : (
        <div className="flex flex-col gap-2 w-full">
          <div className="grid grid-cols-4 gap-2">
            {/* Shuffle button */}
            <button
              type="button"
              onClick={handleShuffle}
              disabled={isComplete}
              className="col-span-1 h-12 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface active:scale-95 transition-all text-xs font-semibold border border-outline-variant flex items-center justify-center gap-1 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            >
              <ArrowPathIcon className="w-4 h-4" />
              <span>Shuffle</span>
            </button>

            {/* Clear button */}
            <button
              type="button"
              onClick={handleClear}
              disabled={placedCount === 0}
              className="col-span-1 h-12 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface hover:text-error active:scale-95 transition-all text-xs font-semibold border border-outline-variant flex items-center justify-center gap-1 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            >
              <TrashIcon className="w-4 h-4" />
              <span>Clear</span>
            </button>

            {/* Lock Board & Play button */}
            <button
              type="button"
              disabled={!isComplete || loading}
              onClick={handleConfirm}
              className="col-span-2 h-12 rounded-xl bg-primary-container text-on-primary-container font-headline-sm text-sm font-semibold shadow-xs active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none hover:opacity-95 cursor-pointer"
            >
              {loading ? (
                <>
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  <span>Locking...</span>
                </>
              ) : isComplete ? (
                <>
                  <CheckCircleIcon className="w-4 h-4" />
                  <span>Lock &amp; Play</span>
                </>
              ) : (
                <>
                  <LockClosedIcon className="w-4 h-4" />
                  <span>Lock &amp; Play</span>
                </>
              )}
            </button>
          </div>
          {/* Partial-fill shortcut hint */}
          {placedCount > 0 && placedCount < totalCells && (
            <p className="text-center text-[10px] text-on-surface-variant font-medium">
              {totalCells - placedCount} remaining — tap Shuffle to auto-fill the rest
            </p>
          )}
        </div>
      )}
    </div>
  );
};
