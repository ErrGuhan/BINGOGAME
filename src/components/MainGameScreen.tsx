'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Player, CalledNumber } from '@/types/bingo';
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
          ? 'bg-surface-bright text-primary-container border-2 border-primary-container shadow-[0_0_14px_rgba(0,245,212,0.4)] scale-95'
          : 'bg-surface-container-high/80 text-on-surface hover:bg-surface-bright active:scale-95 shadow-sm border border-outline-variant/15'
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
      className={`h-9 rounded-lg font-label-md text-label-md flex items-center justify-center transition-all ${
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
  opponentLines: number;
  playerName: string;
  opponentName: string;
  onCallNumber: (num: number) => Promise<void>;
  onSurrender?: () => void;
  loading: boolean;
  optimisticCalled?: number | null;
}

export const MainGameScreen: React.FC<MainGameScreenProps> = ({
  board,
  calledNumbers,
  isMyTurn,
  myLines,
  opponentLines,
  playerName,
  opponentName,
  onCallNumber,
  onSurrender,
  loading,
  optimisticCalled,
}) => {
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [isCalling, setIsCalling] = useState<boolean>(false);

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
      const firstAvailable = board.find(n => !calledNumbersSet.has(n)) || Array.from({ length: 25 }, (_, i) => i + 1).find(n => !calledNumbersSet.has(n));
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

  const handleClaimBingo = () => {
    sounds.playTap();
    if (myLines >= 5) {
      sounds.playVictory();
      alert("⚡ BINGO! Server confirmed 5 lines completed! Victory is yours!");
    } else {
      sounds.playAlert();
      alert(`⚠️ You have ${myLines}/5 lines completed. Keep calling numbers to reach 5 lines for BINGO!`);
    }
  };

  const latestCall = calledNumbers.length > 0 ? calledNumbers[calledNumbers.length - 1] : null;
  const historyCalls = calledNumbers.slice(0, -1).reverse();

  return (
    <div className="flex flex-col w-full max-w-md mx-auto space-y-2.5 select-none pb-8 pt-1">
      {/* 1v1 Battle Telemetry & Untimed Turn Status Header */}
      <section className="w-full relative">
        <div className="w-full bg-surface-container/80 backdrop-blur-xl rounded-xl p-2.5 shadow-xl border border-outline-variant/30 flex flex-col gap-2">
          {/* Turn Indicator Header Pill */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-container opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary-fixed" />
              </span>
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-primary-fixed font-bold text-[10px]">
                1v1 Duel Arena
              </span>
            </div>

            {/* Center Dynamic Turn Pill with Untimed No-Limit Badge */}
            <div
              className={`flex items-center gap-2 px-3 py-1 rounded-full border transition-all ${
                isMyTurn
                  ? 'bg-primary-container/20 border-primary-container shadow-[0_0_18px_rgba(0,245,212,0.4)]'
                  : 'bg-secondary-container/20 border-secondary shadow-[0_0_18px_rgba(168,85,247,0.3)]'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isMyTurn ? 'bg-primary-fixed animate-ping' : 'bg-secondary-fixed animate-pulse'}`} />
              <span className={`font-label-sm text-label-sm uppercase tracking-wider font-extrabold text-[11px] ${isMyTurn ? 'text-primary-fixed' : 'text-secondary-fixed'}`}>
                {isMyTurn ? 'YOUR TURN' : 'OPPONENT TURN'}
              </span>
              <div className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold ${
                isMyTurn
                  ? 'bg-primary-container/30 text-on-primary-fixed'
                  : 'bg-secondary-container/30 text-secondary-fixed'
              }`}>
                <span className="material-symbols-outlined text-[12px]">all_inclusive</span>
                <span>UNTIMED</span>
              </div>
            </div>

            <div className="flex items-center gap-1 text-primary-fixed-dim font-label-sm text-label-sm text-[10px] font-bold">
              <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                all_inclusive
              </span>
              <span>No Limit</span>
            </div>
          </div>

          {/* Duelists Split Row */}
          <div className="grid grid-cols-2 gap-2 pt-0.5">
            {/* Player: You */}
            <div className={`flex items-center justify-between p-2 rounded-lg bg-surface-container-high/90 shadow-md border ${isMyTurn ? 'border-primary-container/40' : 'border-outline-variant/20'}`}>
              <div className="flex items-center gap-2 min-w-0">
                <div className="relative shrink-0">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-primary-container to-surface-container-lowest flex items-center justify-center shadow-[0_0_12px_rgba(0,245,212,0.4)]">
                    <span className="material-symbols-outlined text-surface-container-lowest text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                      smart_toy
                    </span>
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-primary-container rounded-full flex items-center justify-center text-surface-container-lowest text-[9px] font-bold">
                    ✓
                  </span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-headline-sm text-headline-sm text-on-surface truncate leading-tight font-bold">
                    {playerName}
                  </span>
                  <span className="font-label-sm text-label-sm text-primary-fixed font-bold text-[11px]">
                    Lines: {myLines}/5
                  </span>
                </div>
              </div>

              {/* 5-Pip Mini Line Indicators */}
              <div className="flex flex-col gap-1 items-end pl-1 shrink-0">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map(step => (
                    <span
                      key={step}
                      className={`w-1.5 h-2.5 rounded-full transition-all ${
                        step <= myLines
                          ? 'bg-primary-container shadow-[0_0_6px_#00dfc1]'
                          : 'bg-surface-bright'
                      }`}
                    />
                  ))}
                </div>
                <span className="font-label-sm text-label-sm text-primary-fixed-dim text-[9px] font-bold">
                  {myLines >= 5 ? 'BINGO!' : `${5 - myLines} to win`}
                </span>
              </div>
            </div>

            {/* Opponent */}
            <div className={`flex items-center justify-between p-2 rounded-lg bg-surface-container-high/70 shadow-md border ${!isMyTurn ? 'border-secondary/40' : 'border-outline-variant/20'}`}>
              <div className="flex items-center gap-2 min-w-0">
                <div className="relative shrink-0">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-secondary-container to-surface-container-lowest flex items-center justify-center shadow-[0_0_10px_rgba(111,0,190,0.4)]">
                    <span className="material-symbols-outlined text-secondary-fixed text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                      person_pin
                    </span>
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-secondary-container rounded-full flex items-center justify-center text-secondary-fixed text-[9px] font-bold">
                    •
                  </span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-headline-sm text-headline-sm text-on-surface truncate leading-tight font-bold">
                    {opponentName}
                  </span>
                  <span className="font-label-sm text-label-sm text-secondary-fixed-dim font-bold text-[11px]">
                    Lines: {opponentLines}/5
                  </span>
                </div>
              </div>

              {/* Opponent Lines Pips */}
              <div className="flex flex-col gap-1 items-end pl-1 shrink-0">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map(step => (
                    <span
                      key={step}
                      className={`w-1.5 h-2.5 rounded-full transition-all ${
                        step <= opponentLines
                          ? 'bg-secondary-fixed-dim shadow-[0_0_6px_#ddb7ff]'
                          : 'bg-surface-bright'
                      }`}
                    />
                  ))}
                </div>
                <span className="font-label-sm text-label-sm text-on-surface-variant text-[9px]">
                  Rival
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Called Numbers History Strip (Hopper) */}
      <section className="w-full">
        <div className="bg-surface-container-low/90 backdrop-blur-md rounded-xl p-2 shadow-inner border border-outline-variant/20">
          <div className="flex items-center justify-between pb-1 px-1">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-primary-fixed-dim text-[16px]">history</span>
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold text-[10px]">
                Live Number Reel
              </span>
            </div>
            <span className="font-label-sm text-label-sm text-tertiary-fixed-dim bg-tertiary-container/20 px-2 py-0.5 rounded-full font-bold text-[10px]">
              Call #{calledNumbers.length}
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none px-1">
            {latestCall ? (
              <div className="relative shrink-0 flex items-center">
                <div className="w-11 h-11 rounded-full bg-gradient-to-b from-primary-fixed to-primary-container text-on-primary-fixed flex flex-col items-center justify-center shadow-[0_0_20px_rgba(0,245,212,0.6)] transform scale-105 border border-white/40">
                  <span className="font-label-sm text-label-sm text-[8px] uppercase font-black leading-none opacity-80">
                    LATEST
                  </span>
                  <span className="font-label-tile-mobile text-label-tile-mobile font-extrabold leading-tight">
                    {latestCall.number}
                  </span>
                </div>
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-fixed opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-primary-container" />
                </span>
              </div>
            ) : (
              <div className="text-on-surface-variant text-xs italic py-1 px-2">
                Waiting for the first call...
              </div>
            )}

            {/* History Queue Chips */}
            <div className="flex items-center gap-1.5 shrink-0">
              {historyCalls.slice(0, 7).map((call, idx) => (
                <div
                  key={call.id}
                  className={`w-9 h-9 rounded-full bg-surface-container-high/90 text-on-surface flex items-center justify-center shadow-md border border-outline-variant/20 font-bold ${
                    idx > 3 ? 'opacity-50' : 'opacity-90'
                  }`}
                >
                  <span className="font-headline-sm text-headline-sm text-xs">
                    {call.number}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Center: 5x5 Bingo Matrix with Laser Streak Line Completer */}
      <section className="w-full relative">
        <div className="w-full aspect-square bg-surface-container/90 backdrop-blur-2xl rounded-2xl p-2.5 shadow-2xl border border-outline-variant/30 relative overflow-hidden flex flex-col justify-between">
          {/* Ambient Glow Behind Grid */}
          <div className="absolute -top-12 left-1/4 w-36 h-36 bg-primary-container/20 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-10 right-10 w-32 h-32 bg-secondary-container/30 rounded-full blur-2xl pointer-events-none" />

          {/* Winning Line Laser Streak Overlay */}
          {completedLines.length > 0 && (
            <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
              <div className="px-3 py-1 rounded-full bg-surface-container-lowest/95 shadow-[0_0_20px_rgba(0,245,212,0.8)] border border-primary-container flex items-center gap-1.5 animate-bounce">
                <span className="material-symbols-outlined text-primary-fixed text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  stars
                </span>
                <span className="font-label-sm text-label-sm text-primary-fixed uppercase tracking-wider font-black">
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

      {/* Bottom: Number Caller Pad (Thumb Ergonomics Zone) */}
      <section className="w-full bg-surface-container-low/95 backdrop-blur-xl rounded-2xl p-3 shadow-2xl border border-outline-variant/30 flex flex-col gap-2">
        {/* Action Prompt and Selection Tracker */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-primary-container text-[18px]">touch_app</span>
            <span className="font-headline-sm text-headline-sm text-on-surface font-bold text-sm">
              {isMyTurn ? 'Take your time — Call any number' : 'Untimed duel: Waiting for rival...'}
            </span>
          </div>
          <div className="flex items-center gap-1 bg-surface-container-high px-2 py-0.5 rounded-full border border-outline-variant/30">
            <span className="font-label-sm text-label-sm text-on-surface-variant text-[11px]">Chosen:</span>
            <span className="font-headline-sm text-headline-sm text-primary-fixed font-extrabold text-sm">
              {selectedNumber ? `#${selectedNumber}` : '--'}
            </span>
          </div>
        </div>

        {/* 1-25 Compact Thumb Matrix (Memoized Tiles) */}
        <div className="grid grid-cols-7 gap-1.5 p-1 bg-surface-container-lowest/80 rounded-xl max-h-32 overflow-y-auto border border-outline-variant/20">
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

        {/* Master Action Call Button & Tactical Bingo Claim Button */}
        <div className="grid grid-cols-3 gap-2 pt-0.5">
          <button
            type="button"
            disabled={!isMyTurn || selectedNumber === null || isCalling || loading}
            onClick={handleExecuteCall}
            className={`col-span-2 h-12 py-2.5 rounded-xl font-headline-sm text-headline-sm font-extrabold flex items-center justify-center gap-2 transition-all ${
              isMyTurn && selectedNumber !== null && !isCalling && !loading
                ? 'bg-gradient-to-r from-primary-fixed to-primary-container text-on-primary-fixed shadow-[0_0_24px_rgba(0,245,212,0.5)] active:scale-[0.98] cursor-pointer'
                : 'bg-surface-container-high text-on-surface-variant/40 cursor-not-allowed border border-outline-variant/20'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              campaign
            </span>
            <span>
              {isCalling
                ? 'Calling...'
                : selectedNumber
                ? `CALL NUMBER ${selectedNumber}`
                : 'SELECT NUMBER'}
            </span>
          </button>

          {/* High-Stakes 'CLAIM BINGO' Shout Button */}
          <button
            type="button"
            onClick={handleClaimBingo}
            className={`col-span-1 h-12 py-2 rounded-xl flex flex-col items-center justify-center active:scale-95 transition-transform ${
              myLines >= 5
                ? 'bg-gradient-to-r from-secondary to-secondary-container text-on-secondary shadow-[0_0_20px_rgba(168,85,247,0.8)] animate-pulse'
                : 'bg-secondary-container/80 text-secondary-fixed shadow-[0_0_12px_rgba(111,0,190,0.4)]'
            }`}
          >
            <span className="leading-none text-[10px] text-secondary-fixed-dim font-bold">CLAIM</span>
            <span className="leading-tight tracking-wider text-xs font-black">BINGO!</span>
          </button>
        </div>
      </section>
    </div>
  );
};
