'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CalledNumber } from '@/types/bingo';
import { calculateLines } from '@/lib/gameEngine';
import { sounds } from './AudioController';

const ALL_NUMBERS = Array.from({ length: 25 }, (_, i) => i + 1);

interface BingoGridCellProps {
  num: number;
  isMarked: boolean;
  isWinningCell: boolean;
  isSelected: boolean;
  isMyTurn: boolean;
  onSelect: (num: number) => void;
}

const BingoGridCell = React.memo(function BingoGridCell({
  num,
  isMarked,
  isWinningCell,
  isSelected,
  isMyTurn,
  onSelect,
}: BingoGridCellProps) {
  return (
    <button
      type="button"
      onClick={() => {
        sounds.playTap();
        if (!isMarked && isMyTurn) {
          onSelect(num);
        }
      }}
      style={{ willChange: 'transform', transform: 'translateZ(0)' }}
      className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all ${
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
        className={`font-label-tile-mobile text-label-tile-mobile font-bold ${
          isMarked ? 'line-through opacity-90 font-extrabold' : ''
        }`}
      >
        {num}
      </span>
      {isMarked && (
        <span className="material-symbols-outlined text-[13px] absolute bottom-0.5 right-1 text-on-primary-fixed font-black">
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
      style={{ willChange: 'transform', transform: 'translateZ(0)' }}
      className={`h-8 rounded-lg font-label-md text-xs flex items-center justify-center transition-all ${
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
}

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
}) => {
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [isCalling, setIsCalling] = useState<boolean>(false);
  const [showNumberPad, setShowNumberPad] = useState<boolean>(false);

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
    return calculateLines(board, Array.from(calledNumbersSet));
  }, [board, calledNumbersSet]);

  // Pre-select first available number when it becomes player's turn
  useEffect(() => {
    if (isMyTurn && (selectedNumber === null || calledNumbersSet.has(selectedNumber))) {
      const firstAvailable =
        board.find(n => !calledNumbersSet.has(n)) ||
        ALL_NUMBERS.find(n => !calledNumbersSet.has(n));
      if (firstAvailable) setSelectedNumber(firstAvailable);
    }
  }, [isMyTurn, calledNumbersSet, board, selectedNumber]);

  // Handle number call submission
  const handleExecuteCall = async () => {
    if (!isMyTurn || selectedNumber === null || isCalling || loading) return;
    if (calledNumbersSet.has(selectedNumber)) return;

    setIsCalling(true);
    try {
      await onCallNumber(selectedNumber);
    } finally {
      setIsCalling(false);
    }
  };

  const latestCall = calledNumbers.length > 0 ? calledNumbers[calledNumbers.length - 1] : null;
  const historyCalls = calledNumbers.slice(0, -1).reverse();

  return (
    <div className="flex flex-col w-full max-w-md mx-auto space-y-2 select-none pb-6 pt-1">
      {/* 1. Redesigned Unified Scoreboard & Turn HUD (No clutter, No "need to win" bar) */}
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
                {myLines} / 5 Lines
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

      {/* 3. Hero 5x5 Bingo Matrix (Direct Tap to Select) */}
      <section className="w-full relative">
        <div className="w-full aspect-square bg-surface-container/90 backdrop-blur-2xl rounded-2xl p-2.5 shadow-2xl border border-outline-variant/30 relative overflow-hidden flex flex-col justify-between">
          {/* Winning Line Overlay Banner */}
          {completedLines.length > 0 && (
            <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
              <div className="px-3.5 py-1.5 rounded-full bg-surface-container-lowest/95 shadow-[0_0_24px_rgba(0,245,212,0.85)] border-2 border-primary-container flex items-center gap-1.5 animate-bounce">
                <span className="material-symbols-outlined text-primary-fixed text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  stars
                </span>
                <span className="font-label-sm text-xs text-primary-fixed uppercase tracking-wider font-black">
                  {completedLines.length} {completedLines.length === 1 ? 'LINE' : 'LINES'} COMPLETE!
                </span>
              </div>
            </div>
          )}

          {/* 5x5 Grid Board (Memoized Cells) */}
          <div className="grid grid-cols-5 gap-1.5 w-full h-full relative z-10" id="bingo-board">
            {board.map((num, idx) => (
              <BingoGridCell
                key={idx}
                num={num}
                isMarked={calledNumbersSet.has(num)}
                isWinningCell={completedLines.some(line => line.includes(idx))}
                isSelected={selectedNumber === num}
                isMyTurn={isMyTurn}
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
            <span>{showNumberPad ? 'Hide Tray' : 'Show 1-25 Tray'}</span>
          </button>
        </div>

        {/* Optional Collapsible Number Pad (1-25) */}
        {showNumberPad && (
          <div className="grid grid-cols-7 gap-1.5 p-1.5 bg-surface-container-lowest/80 rounded-xl border border-outline-variant/20 transition-all duration-200 animate-fadeIn">
            {ALL_NUMBERS.map(num => (
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
        )}
      </section>
    </div>
  );
};
