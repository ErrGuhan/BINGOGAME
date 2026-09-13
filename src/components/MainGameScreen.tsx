'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  CheckIcon,
  SparklesIcon,
  BoltIcon,
  UserIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
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
  isMyTurn: _isMyTurn,
  boardSize,
  onSelect,
}: BingoGridCellProps) {
  const is10 = boardSize === 10;

  return (
    <button
      type="button"
      onClick={() => {
        sounds.playTap();
        if (!isMarked) {
          onSelect(num);
        }
      }}
      className={`aspect-square flex flex-col items-center justify-center relative transition-all cursor-pointer touch-manipulation ${
        is10 ? 'rounded-md p-0' : 'rounded-xl'
      } ${
        isWinningCell
          ? 'bg-primary-container text-on-primary-container shadow-xs border border-primary-container scale-[1.02] z-10'
          : isMarked
          ? 'bg-primary-container/10 text-primary-container border border-primary-container/20 cursor-default'
          : isSelected
          ? 'bg-surface-bright text-on-surface border-2 border-primary-container shadow-xs scale-[1.02] z-10'
          : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest active:scale-95 shadow-xs border border-outline-variant'
      }`}
    >
      <span
        className={`font-bold pointer-events-none select-none ${
          is10
            ? 'text-[10px] sm:text-xs leading-none'
            : 'font-label-tile-mobile text-label-tile-mobile'
        } ${isWinningCell ? 'text-on-primary-container' : isMarked ? 'text-primary-container' : 'text-on-surface'}`}
      >
        {num}
      </span>
      {isWinningCell ? (
        <CheckIcon
          className={`absolute text-on-primary-container pointer-events-none ${
            is10 ? 'w-2 h-2 bottom-0.5 right-0.5' : 'w-3.5 h-3.5 bottom-0.5 right-1'
          }`}
        />
      ) : isMarked ? (
        <CheckIcon
          className={`absolute text-primary-container pointer-events-none ${
            is10 ? 'w-2 h-2 bottom-0.5 right-0.5' : 'w-3.5 h-3.5 bottom-0.5 right-1'
          }`}
        />
      ) : null}
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
          ? 'bg-surface-container/40 text-on-surface-variant/30 line-through cursor-not-allowed'
          : isSelected
          ? 'bg-primary-container text-on-primary-container font-bold shadow-xs scale-95'
          : isMyTurn
          ? 'bg-surface-container text-on-surface hover:bg-surface-container-high active:scale-90 shadow-xs border border-outline-variant cursor-pointer font-semibold'
          : 'bg-surface-container/50 text-on-surface-variant/40 cursor-not-allowed'
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
  errorMessage?: string | null;
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
  errorMessage,
}) => {
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [isCalling, setIsCalling] = useState<boolean>(false);
  const [localCallError, setLocalCallError] = useState<string | null>(null);
  const [showNumberPad, setShowNumberPad] = useState<boolean>(false);
  const [callerTrayRangeIndex, setCallerTrayRangeIndex] = useState<number>(0);
  // Auto-dismiss completion banner
  const [showCompletionBanner, setShowCompletionBanner] = useState<boolean>(false);
  const prevLinesRef = useRef<number>(0);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resilient selection reset: ONLY clear selection when our turn actually ends
  // (transitions from true to false). This prevents premature wipes during polling updates.
  const prevIsMyTurnRef = useRef<boolean>(isMyTurn);
  useEffect(() => {
    if (prevIsMyTurnRef.current && !isMyTurn) {
      setSelectedNumber(null);
      setLocalCallError(null);
    }
    prevIsMyTurnRef.current = isMyTurn;
  }, [isMyTurn]);

  const totalNumbers = boardSize * boardSize;
  const allNumbers = useMemo(
    () => Array.from({ length: totalNumbers }, (_, i) => i + 1),
    [totalNumbers]
  );

  const handleSelectNumber = useCallback((num: number) => {
    setSelectedNumber(num);
    setLocalCallError(null);
  }, []);

  // Authoritative Set of called numbers from single source of truth
  const authoritativeCalledSet = useMemo(() => {
    return new Set(calledNumbers.map(c => c.number));
  }, [calledNumbers]);

  // Unified cell marking set
  const calledNumbersSet = useMemo(() => {
    const set = new Set(authoritativeCalledSet);
    if (optimisticCalled !== null && optimisticCalled !== undefined) {
      set.add(optimisticCalled);
    }
    return set;
  }, [authoritativeCalledSet, optimisticCalled]);

  // Calculate completed lines on player's board
  const { completedLines } = useMemo(() => {
    return calculateLines(board, Array.from(calledNumbersSet), boardSize);
  }, [board, calledNumbersSet, boardSize]);

  const winningCellIndices = useMemo(
    () => new Set(completedLines.flat()),
    [completedLines]
  );

  // Auto-dismiss banner when a new line is completed
  useEffect(() => {
    if (completedLines.length > prevLinesRef.current) {
      prevLinesRef.current = completedLines.length;
      setShowCompletionBanner(true);
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = setTimeout(() => setShowCompletionBanner(false), 800);
    }
    return () => {
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    };
  }, [completedLines.length]);

  // Handle number call submission with safety timeout and retry preservation
  const handleExecuteCall = useCallback(async () => {
    if (!isMyTurn || selectedNumber === null || isCalling || loading) return;
    if (calledNumbersSet.has(selectedNumber)) return;

    // Client-side variant-aware range validation for instant UI feedback
    const maxAllowedNumber = boardSize === 10 ? 100 : 25;
    if (selectedNumber < 1 || selectedNumber > maxAllowedNumber) {
      setLocalCallError(`Called number must be between 1 and ${maxAllowedNumber}`);
      return;
    }

    const numToCall = selectedNumber;
    setIsCalling(true);
    setLocalCallError(null);

    // 8-second safety timeout ensures button never gets stuck on "Calling..." if network hangs
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Couldn't reach server. Tap to retry.")), 8000)
    );

    try {
      await Promise.race([onCallNumber(numToCall), timeoutPromise]);
      setSelectedNumber(null);
    } catch (err: unknown) {
      const msg = (err as Error).message || "Couldn't call number, tap to retry";
      console.error('[MainGameScreen] Call failed:', msg);
      setLocalCallError(msg);
      // Keep selectedNumber intact so player can immediately tap again to retry
    } finally {
      setIsCalling(false);
    }
  }, [isMyTurn, selectedNumber, isCalling, loading, calledNumbersSet, boardSize, onCallNumber]);

  const latestCall = calledNumbers.length > 0 ? calledNumbers[calledNumbers.length - 1] : null;
  const historyCalls = calledNumbers.slice(0, -1).reverse();
  const headers = boardSize === 10 ? HEADERS_10 : HEADERS_5;

  // Numbers to display in the collapsible caller pad
  const activePadNumbers = useMemo(() => {
    if (boardSize === 5) return allNumbers;
    const r = TRAY_RANGES[callerTrayRangeIndex];
    return Array.from({ length: r.end - r.start + 1 }, (_, i) => r.start + i);
  }, [boardSize, allNumbers, callerTrayRangeIndex]);

  const activeError = localCallError || errorMessage;

  return (
    <div className="flex flex-col w-full max-w-md mx-auto space-y-2 select-none pb-6 pt-1">
      {/* Dynamic Error / Alert Banner */}
      {activeError && (
        <div className="w-full px-3 py-2 rounded-xl bg-error-container text-on-error-container text-xs font-semibold flex items-center justify-between gap-2 border border-error/20 animate-fadeIn">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="shrink-0 font-bold">⚠️</span>
            <span className="truncate">{activeError}</span>
          </div>
          {localCallError && (
            <button
              type="button"
              onClick={() => setLocalCallError(null)}
              className="text-[10px] uppercase font-bold text-on-error-container/70 hover:text-on-error-container shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* 1. Unified Scoreboard & Turn HUD */}
      <section className="w-full">
        <div className="w-full bg-surface-container/80 backdrop-blur-xl rounded-2xl p-2.5 shadow-xs border border-outline-variant flex items-center justify-between">
          {/* Player (You) */}
          <div
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl transition-all ${
              isMyTurn
                ? 'bg-surface-container-high border border-primary-container/40'
                : 'bg-surface-container/40 border border-transparent'
            }`}
          >
            <div className="relative shrink-0">
              <div className="w-8 h-8 rounded-full bg-surface-container-high border border-outline-variant flex items-center justify-center text-on-surface shadow-xs">
                <UserIcon className="w-4 h-4" />
              </div>
              {isMyTurn && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-primary-container rounded-full animate-pulse" />
              )}
            </div>
            <div className="flex flex-col min-w-0 text-left">
              <span className="font-headline-sm text-xs text-on-surface font-semibold truncate max-w-[80px]">
                {playerName}
              </span>
              <span className="font-label-sm text-[11px] text-primary-container font-bold leading-none mt-0.5">
                {Math.max(myLines, completedLines.length)} / {targetLines} {boardSize === 10 ? 'Strikes' : 'Lines'}
              </span>
            </div>
          </div>

          {/* Center Dynamic Turn Pill */}
          <div className="flex flex-col items-center px-1">
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all ${
                isMyTurn
                  ? 'bg-secondary-container/10 border-secondary-container/30 text-secondary-container'
                  : 'bg-surface-container-high border-outline-variant text-on-surface-variant'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isMyTurn ? 'bg-secondary-container animate-pulse' : 'bg-on-surface-variant/40'
                }`}
              />
              <span className="font-label-sm text-[11px] font-bold tracking-wider uppercase">
                {isMyTurn ? 'YOUR TURN' : 'RIVAL TURN'}
              </span>
            </div>
          </div>

          {/* Opponent */}
          <div
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl transition-all ${
              !isMyTurn
                ? 'bg-surface-container-high border border-outline-variant'
                : 'bg-surface-container/40 border border-transparent'
            }`}
          >
            <div className="flex flex-col min-w-0 text-right">
              <span className="font-headline-sm text-xs text-on-surface font-semibold truncate max-w-[80px]">
                {opponentName}
              </span>
              <span className="font-label-sm text-[11px] text-on-surface-variant font-medium leading-none mt-0.5">
                Rival
              </span>
            </div>
            <div className="relative shrink-0">
              <div className="w-8 h-8 rounded-full bg-surface-container-high border border-outline-variant flex items-center justify-center text-on-surface-variant shadow-xs">
                <UserIcon className="w-4 h-4" />
              </div>
              {!isMyTurn && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-on-surface-variant rounded-full animate-pulse" />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 2. Compact Live Number Reel */}
      <section className="w-full">
        <div className="bg-surface-container/60 backdrop-blur-md rounded-xl px-3 py-1.5 border border-outline-variant flex items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-label-sm text-[10px] text-on-surface-variant uppercase font-semibold tracking-wider shrink-0">
              Latest:
            </span>
            {latestCall ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="px-2.5 py-0.5 rounded-full bg-primary-container text-on-primary-container font-headline-sm text-xs font-bold shadow-xs flex items-center gap-1">
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
                className={`px-2 py-0.5 rounded-md bg-surface-container-high text-on-surface text-[11px] font-medium border border-outline-variant ${
                  idx > 2 ? 'opacity-50' : 'opacity-90'
                }`}
              >
                {call.number}
              </span>
            ))}
            <span className="font-label-sm text-[10px] text-on-surface-variant bg-surface-container-high border border-outline-variant px-1.5 py-0.5 rounded font-medium shrink-0">
              #{calledNumbers.length}
            </span>
          </div>
        </div>
      </section>

      {/* 3. Hero Bingo Matrix */}
      <section className="w-full relative">
        <div className="w-full aspect-square bg-surface-container/80 backdrop-blur-xl rounded-2xl p-2 sm:p-2.5 shadow-xs border border-outline-variant relative flex flex-col justify-between">
          {/* Winning Line Overlay Banner — auto-dismisses after 800ms */}
          {showCompletionBanner && (
            <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
              <div className="px-3.5 py-1.5 rounded-full bg-surface-container/95 shadow-md border border-primary-container flex items-center gap-1.5 animate-fadeIn">
                <SparklesIcon className="w-4 h-4 text-primary-container" />
                <span className="font-label-sm text-xs text-primary-container uppercase tracking-wider font-bold">
                  {completedLines.length}{' '}
                  {completedLines.length === 1
                    ? boardSize === 10 ? 'STRIKE' : 'LINE'
                    : boardSize === 10 ? 'STRIKES' : 'LINES'}{' '}
                  COMPLETE!
                </span>
              </div>
            </div>
          )}

          {/* Column Headers */}
          <div
            className={`grid gap-1 text-center font-headline-sm font-bold pb-1 relative z-10 text-on-surface-variant ${
              boardSize === 10
                ? 'grid-cols-10 text-[10px] sm:text-xs'
                : 'grid-cols-5 text-xs'
            }`}
          >
            {headers.map((letter, idx) => (
              <div
                key={idx}
                className={`tracking-wider transition-all ${
                  idx < completedLines.length
                    ? 'line-through opacity-40 text-primary-container'
                    : ''
                }`}
              >
                {letter}
              </div>
            ))}
          </div>

          {/* Grid Board */}
          <div
            className={`grid w-full h-full relative z-10 ${
              boardSize === 10
                ? 'grid-cols-10 grid-rows-10 gap-1'
                : 'grid-cols-5 grid-rows-5 gap-1.5'
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
          className={`w-full h-13 rounded-2xl font-headline-sm text-sm sm:text-base font-semibold flex items-center justify-center gap-2 transition-all ${
            isMyTurn && selectedNumber !== null && !isCalling && !loading
              ? 'bg-primary-container text-on-primary-container shadow-xs active:scale-[0.98] cursor-pointer hover:opacity-95'
              : 'bg-surface-container text-on-surface-variant/40 cursor-not-allowed border border-outline-variant'
          }`}
        >
          {isCalling || loading ? (
            <ArrowPathIcon className="w-5 h-5 animate-spin" />
          ) : (
            <BoltIcon className="w-5 h-5" />
          )}
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
          <span className="text-on-surface-variant flex items-center gap-1 font-normal">
            <SparklesIcon className="w-3.5 h-3.5 text-primary-container" />
            <span>Tap any board tile to select</span>
          </span>
          <button
            type="button"
            onClick={() => {
              sounds.playTap();
              setShowNumberPad(prev => !prev);
            }}
            className="text-on-surface-variant hover:text-primary-container transition-colors flex items-center gap-1 font-semibold text-[11px] cursor-pointer"
          >
            {showNumberPad ? (
              <ChevronUpIcon className="w-3.5 h-3.5" />
            ) : (
              <ChevronDownIcon className="w-3.5 h-3.5" />
            )}
            <span>{showNumberPad ? 'Hide Tray' : `Show 1-${totalNumbers} Tray`}</span>
          </button>
        </div>

        {/* Optional Collapsible Number Pad */}
        {showNumberPad && (
          <div className="flex flex-col gap-1.5 p-2 bg-surface-container-low rounded-xl border border-outline-variant transition-all duration-200 animate-fadeIn">
            {/* 10x10 Range Filter Tabs */}
            {boardSize === 10 && (
              <div className="grid grid-cols-4 gap-1 p-0.5 rounded-lg bg-surface-container border border-outline-variant">
                {TRAY_RANGES.map((r, i) => (
                  <button
                    key={r.label}
                    type="button"
                    onClick={() => {
                      sounds.playTap();
                      setCallerTrayRangeIndex(i);
                    }}
                    className={`py-1 rounded-md text-[10px] font-semibold transition-all cursor-pointer ${
                      callerTrayRangeIndex === i
                        ? 'bg-surface-container-high text-primary-container shadow-xs border border-outline-variant'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}

            {/* Numbers Grid */}
            <div className="grid grid-cols-7 sm:grid-cols-9 gap-1.5 max-h-36 overflow-y-auto p-0.5 scrollbar-none">
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
