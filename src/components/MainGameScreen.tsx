'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CalledNumber, BoardSize } from '@/types/bingo';
import { calculateLines } from '@/lib/gameEngine';
import { sounds } from './AudioController';

interface BingoGridCellProps {
  num: number;
  isMarked: boolean;
  isWinningCell: boolean;
  isSelected: boolean;
  isMyTurn: boolean;
  boardSize: BoardSize;
  onSelect: (num: number) => void;
}

const BingoGridCell = React.memo(function BingoGridCell({
  num,
  isMarked,
  isWinningCell,
  isSelected,
  isMyTurn,
  boardSize,
  onSelect,
}: BingoGridCellProps) {
  const is10 = boardSize === 10;

  return (
    <button
      type="button"
      onClick={() => {
        sounds.playTap();
        if (!isMarked && isMyTurn) {
          onSelect(num);
        }
      }}
      className={`aspect-square flex flex-col items-center justify-center relative transition-all ${
        is10 ? 'rounded-md p-0' : 'rounded-xl'
      } ${
        isWinningCell
          ? 'bg-gradient-to-br from-primary-fixed to-primary-container text-on-primary-fixed shadow-[0_0_18px_rgba(0,245,212,0.8)] border-2 border-white scale-[1.02] z-10'
          : isMarked
          ? 'bg-gradient-to-br from-primary-container to-on-primary-container text-on-primary-fixed shadow-[0_0_14px_rgba(0,245,212,0.4)]'
          : isSelected
          ? 'bg-surface-bright text-primary-container border-2 border-primary-container shadow-[0_0_16px_rgba(0,245,212,0.6)] scale-[1.03] z-10'
          : 'bg-surface-container-high/85 text-on-surface hover:bg-surface-bright active:scale-95 shadow-sm border border-outline-variant/15'
      }`}
    >
      <span
        className={`font-bold ${
          is10
            ? 'text-[10px] sm:text-xs leading-none font-black'
            : 'font-label-tile-mobile text-label-tile-mobile'
        } ${isMarked ? 'line-through opacity-90 font-extrabold' : ''}`}
      >
        {num}
      </span>
      {isMarked && (
        <span
          className={`material-symbols-outlined absolute font-black text-on-primary-fixed ${
            is10 ? 'text-[9px] sm:text-[11px] bottom-0.5 right-0.5' : 'text-[13px] bottom-0.5 right-1'
          }`}
        >
          check
        </span>
      )}
    </button>
  );
});

interface CallerPadTileProps {
  num: number;
  isCalled: boolean;
  isSelected: boolean;
  isMyTurn: boolean;
  onSelect: (num: number) => void;
}

const CallerPadTile = React.memo(function CallerPadTile({
  num,
  isCalled,
  isSelected,
  isMyTurn,
  onSelect,
}: CallerPadTileProps) {
  return (
    <button
      type="button"
      disabled={isCalled || !isMyTurn}
      onClick={() => {
        sounds.playTap();
        onSelect(num);
      }}
      className={`h-7 sm:h-8 rounded-lg font-label-md text-xs flex items-center justify-center transition-all ${
        isCalled
          ? 'bg-surface-container-lowest/40 text-on-surface-variant/30 line-through cursor-not-allowed'
          : isSelected
          ? 'bg-primary-container text-on-primary-container font-black shadow-[0_0_12px_rgba(0,245,212,0.8)] scale-95'
          : isMyTurn
          ? 'bg-surface-container-high/90 text-on-surface hover:bg-surface-bright active:scale-90 shadow-sm cursor-pointer font-bold'
          : 'bg-surface-container-high/50 text-on-surface-variant/40 cursor-not-allowed'
      }`}
    >
      {num}
    </button>
  );
});

interface MainGameScreenProps {
  board: number[];
  calledNumbers: CalledNumber[];
  isMyTurn: boolean;
  myLines: number;
  playerName: string;
  opponentName: string;
  onCallNumber: (num: number) => Promise<void>;
  loading: boolean;
  optimisticCalled?: number | null;
  boardSize?: BoardSize;
  targetLines?: number;
}

const HEADERS_5 = ['B', 'I', 'N', 'G', 'O'];
const HEADERS_10 = ['B', 'I', 'N', 'G', 'O', 'D', 'U', 'E', 'L', '!'];

const TRAY_RANGES = [
  { label: '1–25', start: 1, end: 25 },
  { label: '26–50', start: 26, end: 50 },
  { label: '51–75', start: 51, end: 75 },
  { label: '76–100', start: 76, end: 100 },
];

export const MainGameScreen: React.FC<MainGameScreenProps> = ({
  board,
  calledNumbers,
  isMyTurn,
  myLines,
  playerName,
  opponentName,
  onCallNumber,
  loading,
  optimisticCalled,
  boardSize = 5,
  targetLines = 5,
}) => {
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [isCalling, setIsCalling] = useState<boolean>(false);
  const [showNumberPad, setShowNumberPad] = useState<boolean>(false);
  const [callerTrayRangeIndex, setCallerTrayRangeIndex] = useState<number>(0);

  const totalNumbers = boardSize * boardSize;
  const allNumbers = useMemo(
    () => Array.from({ length: totalNumbers }, (_, i) => i + 1),
    [totalNumbers]
  );

  const handleSelectNumber = useCallback((num: number) => {
    setSelectedNumber(num);
  }, []);

  // Set of all called numbers including optimistic call
  const calledNumbersSet = useMemo(() => {
    const set = new Set(calledNumbers.map(c => c.number));
    if (optimisticCalled) set.add(optimisticCalled);
    return set;
  }, [calledNumbers, optimisticCalled]);

  // Calculate completed lines on player's board
  const { completedLines } = useMemo(() => {
    return calculateLines(board, Array.from(calledNumbersSet), boardSize);
  }, [board, calledNumbersSet, boardSize]);

  // Pre-compute a flat Set of winning cell indices for O(1) lookup in render.
  // Replaces the previous O(lines × cells) completedLines.some(line=>line.includes(idx))
  // which was running up to 2,200 array searches per render on a full 10x10 board.
  const winningCellIndices = useMemo(
    () => new Set(completedLines.flat()),
    [completedLines]
  );

  // Pre-select first available number on board when it becomes player's turn
  useEffect(() => {
    if (isMyTurn && (selectedNumber === null || calledNumbersSet.has(selectedNumber))) {
      const firstAvailable =
        board.find(n => !calledNumbersSet.has(n)) ||
        allNumbers.find(n => !calledNumbersSet.has(n));
      if (firstAvailable) setSelectedNumber(firstAvailable);
    }
  }, [isMyTurn, calledNumbersSet, board, selectedNumber, allNumbers]);

  // Handle number call submission — memoized so the Call button skips re-renders
  // when isMyTurn, selectedNumber, isCalling, and loading are all unchanged.
  const handleExecuteCall = useCallback(async () => {
    if (!isMyTurn || selectedNumber === null || isCalling || loading) return;
    if (calledNumbersSet.has(selectedNumber)) return;

    setIsCalling(true);
    try {
      await onCallNumber(selectedNumber);
    } finally {
      setIsCalling(false);
    }
  }, [isMyTurn, selectedNumber, isCalling, loading, calledNumbersSet, onCallNumber]);

  const latestCall = calledNumbers.length > 0 ? calledNumbers[calledNumbers.length - 1] : null;
  const historyCalls = calledNumbers.slice(0, -1).reverse();
  const headers = boardSize === 10 ? HEADERS_10 : HEADERS_5;

  // Numbers to display in the collapsible caller pad
  const activePadNumbers = useMemo(() => {
    if (boardSize === 5) return allNumbers;
    const r = TRAY_RANGES[callerTrayRangeIndex];
    return Array.from({ length: r.end - r.start + 1 }, (_, i) => r.start + i);
  }, [boardSize, allNumbers, callerTrayRangeIndex]);

  return (
    <div className="flex flex-col w-full max-w-md mx-auto space-y-2 select-none pb-6 pt-1">
      {/* 1. Unified Scoreboard & Turn HUD */}
      <section className="w-full">
        <div className="w-full bg-surface-container/85 backdrop-blur-xl rounded-2xl p-2.5 shadow-xl border border-outline-variant/30 flex items-center justify-between">
          {/* Player (You) */}
          <div
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl transition-all ${
              isMyTurn
                ? 'bg-primary-container/20 border border-primary-container/50 shadow-[0_0_12px_rgba(0,245,212,0.3)]'
                : 'bg-surface-container-high/60 border border-transparent'
            }`}
          >
            <div className="relative shrink-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary-container to-surface-container-lowest flex items-center justify-center text-surface-container-lowest shadow-sm">
                <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  smart_toy
                </span>
              </div>
              {isMyTurn && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary-container rounded-full animate-ping" />
              )}
            </div>
            <div className="flex flex-col min-w-0 text-left">
              <span className="font-headline-sm text-xs text-on-surface font-bold truncate max-w-[80px]">
                {playerName}
              </span>
              <span className="font-label-sm text-[11px] text-primary-fixed font-extrabold leading-none mt-0.5">
                {myLines} / {targetLines} {boardSize === 10 ? 'Strikes' : 'Lines'}
              </span>
            </div>
          </div>

          {/* Center Dynamic Turn Pill */}
          <div className="flex flex-col items-center px-1">
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all ${
                isMyTurn
                  ? 'bg-primary-container/25 border-primary-container text-primary-fixed shadow-[0_0_16px_rgba(0,245,212,0.5)]'
                  : 'bg-secondary-container/25 border-secondary/40 text-secondary-fixed shadow-[0_0_12px_rgba(168,85,247,0.3)]'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isMyTurn ? 'bg-primary-fixed animate-ping' : 'bg-secondary-fixed animate-pulse'
                }`}
              />
              <span className="font-label-sm text-[11px] font-black tracking-wider uppercase">
                {isMyTurn ? 'YOUR TURN' : 'RIVAL TURN'}
              </span>
            </div>
          </div>

          {/* Opponent */}
          <div
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl transition-all ${
              !isMyTurn
                ? 'bg-secondary-container/20 border border-secondary/40 shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                : 'bg-surface-container-high/60 border border-transparent'
            }`}
          >
            <div className="flex flex-col min-w-0 text-right">
              <span className="font-headline-sm text-xs text-on-surface font-bold truncate max-w-[80px]">
                {opponentName}
              </span>
              <span className="font-label-sm text-[11px] text-secondary-fixed font-bold leading-none mt-0.5">
                Rival
              </span>
            </div>
            <div className="relative shrink-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-secondary-container to-surface-container-lowest flex items-center justify-center text-secondary-fixed shadow-sm">
                <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  person
                </span>
              </div>
              {!isMyTurn && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-secondary-fixed rounded-full animate-ping" />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 2. Compact Live Number Reel */}
      <section className="w-full">
        <div className="bg-surface-container-low/85 backdrop-blur-md rounded-xl px-3 py-1.5 border border-outline-variant/25 flex items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-label-sm text-[10px] text-on-surface-variant uppercase font-bold tracking-wider shrink-0">
              Latest:
            </span>
            {latestCall ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="px-2.5 py-0.5 rounded-full bg-primary-container text-on-primary-fixed font-headline-sm text-xs font-black shadow-[0_0_12px_rgba(0,245,212,0.6)] flex items-center gap-1">
                  <span className="text-[10px]">#</span>
                  <span>{latestCall.number}</span>
                </div>
              </div>
            ) : (
              <span className="text-on-surface-variant text-[11px] italic">Waiting for first call...</span>
            )}
          </div>

          {/* Recent Call Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            {historyCalls.slice(0, 5).map((call, idx) => (
              <span
                key={call.id}
                className={`px-2 py-0.5 rounded-md bg-surface-container-high text-on-surface text-[11px] font-bold ${
                  idx > 2 ? 'opacity-40' : 'opacity-80'
                }`}
              >
                {call.number}
              </span>
            ))}
            <span className="font-label-sm text-[10px] text-tertiary-fixed-dim bg-tertiary-container/20 px-1.5 py-0.5 rounded font-bold shrink-0">
              #{calledNumbers.length}
            </span>
          </div>
        </div>
      </section>

      {/* 3. Hero Bingo Matrix (Direct Tap to Select) */}
      <section className="w-full relative">
        <div className="w-full aspect-square bg-surface-container/90 backdrop-blur-2xl rounded-2xl p-2 sm:p-2.5 shadow-2xl border border-outline-variant/30 relative overflow-hidden flex flex-col justify-between">
          {/* Winning Line Overlay Banner */}
          {completedLines.length > 0 && (
            <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
              <div className="px-3.5 py-1.5 rounded-full bg-surface-container-lowest/95 shadow-[0_0_24px_rgba(0,245,212,0.85)] border-2 border-primary-container flex items-center gap-1.5 animate-bounce">
                <span className="material-symbols-outlined text-primary-fixed text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  stars
                </span>
                <span className="font-label-sm text-xs text-primary-fixed uppercase tracking-wider font-black">
                  {completedLines.length}{' '}
                  {completedLines.length === 1
                    ? boardSize === 10 ? 'STRIKE' : 'LINE'
                    : boardSize === 10 ? 'STRIKES' : 'LINES'}{' '}
                  COMPLETE!
                </span>
              </div>
            </div>
          )}

          {/* Column Headers (B-I-N-G-O or B-I-N-G-O-D-U-E-L-!) */}
          <div
            className={`grid gap-1 text-center font-headline-sm font-black pb-1 relative z-10 ${
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

          {/* Grid Board (Memoized Cells) */}
          <div
            className={`grid w-full h-full relative z-10 ${
              boardSize === 10 ? 'grid-cols-10 gap-1' : 'grid-cols-5 gap-1.5'
            }`}
            id="bingo-board"
          >
            {board.map((num, idx) => (
              <BingoGridCell
                key={idx}
                num={num}
                isMarked={calledNumbersSet.has(num)}
                isWinningCell={winningCellIndices.has(idx)}
                isSelected={selectedNumber === num}
                isMyTurn={isMyTurn}
                boardSize={boardSize}
                onSelect={handleSelectNumber}
              />
            ))}
          </div>
        </div>
      </section>

      {/* 4. Streamlined Fast Action Bar */}
      <section className="w-full flex flex-col gap-2 pt-0.5">
        {/* Primary Call Action Button */}
        <button
          type="button"
          disabled={!isMyTurn || selectedNumber === null || isCalling || loading}
          onClick={handleExecuteCall}
          className={`w-full h-14 rounded-2xl font-headline-sm text-sm sm:text-base font-black flex items-center justify-center gap-2 transition-all ${
            isMyTurn && selectedNumber !== null && !isCalling && !loading
              ? 'bg-gradient-to-r from-primary-fixed to-primary-container text-on-primary-fixed shadow-[0_0_24px_rgba(0,245,212,0.6)] active:scale-[0.98] cursor-pointer hover:brightness-110'
              : 'bg-surface-container-high text-on-surface-variant/40 cursor-not-allowed border border-outline-variant/20'
          }`}
        >
          <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            bolt
          </span>
          <span>
            {isCalling
              ? 'Calling...'
              : !isMyTurn
              ? 'Opponent Calling...'
              : selectedNumber
              ? `CALL NUMBER #${selectedNumber}`
              : 'TAP A NUMBER ON BOARD'}
          </span>
        </button>

        {/* Selection Hint & Optional Number Pad Toggle */}
        <div className="flex items-center justify-between px-1 text-xs">
          <span className="text-on-surface-variant flex items-center gap-1">
            <span className="material-symbols-outlined text-[15px] text-primary-container">touch_app</span>
            <span>Tap any board tile to select</span>
          </span>
          <button
            type="button"
            onClick={() => {
              sounds.playTap();
              setShowNumberPad(prev => !prev);
            }}
            className="text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1 font-bold text-[11px]"
          >
            <span className="material-symbols-outlined text-[14px]">
              {showNumberPad ? 'expand_less' : 'dialpad'}
            </span>
            <span>{showNumberPad ? 'Hide Tray' : `Show 1-${totalNumbers} Tray`}</span>
          </button>
        </div>

        {/* Optional Collapsible Number Pad */}
        {showNumberPad && (
          <div className="flex flex-col gap-1.5 p-2 bg-surface-container-lowest/80 rounded-xl border border-outline-variant/20 transition-all duration-200 animate-fadeIn">
            {/* 10x10 Range Filter Tabs */}
            {boardSize === 10 && (
              <div className="grid grid-cols-4 gap-1 p-0.5 rounded-lg bg-surface-container-high/60 border border-outline-variant/15">
                {TRAY_RANGES.map((r, i) => (
                  <button
                    key={r.label}
                    type="button"
                    onClick={() => {
                      sounds.playTap();
                      setCallerTrayRangeIndex(i);
                    }}
                    className={`py-1 rounded-md text-[10px] font-black transition-all ${
                      callerTrayRangeIndex === i
                        ? 'bg-surface-bright text-primary-fixed shadow-sm border border-primary-container/30'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}

            {/* Numbers Grid */}
            <div className="grid grid-cols-7 sm:grid-cols-9 gap-1.5 max-h-36 overflow-y-auto p-0.5 scrollbar-thin">
              {activePadNumbers.map(num => (
                <CallerPadTile
                  key={num}
                  num={num}
                  isCalled={calledNumbersSet.has(num)}
                  isSelected={selectedNumber === num}
                  isMyTurn={isMyTurn}
                  onSelect={handleSelectNumber}
                />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
