'use client';

import React, { useState } from 'react';
import { sounds } from './AudioController';

interface CreateGameScreenProps {
  roomCode: string;
  opponentConnected: boolean;
  opponentName?: string;
  onProceedToSetup: (autoFill: boolean) => void;
  onBack: () => void;
}

export const CreateGameScreen: React.FC<CreateGameScreenProps> = ({
  roomCode,
  opponentConnected,
  opponentName = 'Challenger',
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
    } catch {
      // Fallback
    }
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
    <div className="flex flex-col w-full max-w-md mx-auto gap-space-md select-none">
      {/* Top Navigation & Breadcrumb */}
      <div className="flex items-center justify-between w-full">
        <button
          onClick={() => {
            sounds.playTap();
            onBack();
          }}
          className="inline-flex items-center gap-space-xs px-space-sm py-space-2xs rounded-full bg-surface-container-high/60 backdrop-blur-md text-on-surface-variant hover:text-primary transition-colors shadow-sm"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          <span className="font-label-md text-label-md">Arena</span>
        </button>
        <div className="flex items-center gap-space-xs px-space-sm py-space-2xs rounded-full bg-surface-container-low/80 backdrop-blur-md shadow-sm border border-primary-container/20">
          <span className="w-2 h-2 rounded-full bg-primary-container animate-ping" />
          <span className="font-label-sm text-label-sm text-primary uppercase font-bold">Lobby Live</span>
        </div>
      </div>

      {/* Main Glass Card: Duel Room Ready */}
      <div className="relative w-full rounded-2xl bg-surface-container/80 backdrop-blur-xl p-space-md shadow-xl border border-outline-variant/30 overflow-hidden flex flex-col gap-space-md">
        {/* Ambient Interior Sheen */}
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-primary-container/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-40 h-40 bg-secondary-container/20 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col gap-space-2xs">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-primary-container text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              bolt
            </span>
            <span className="font-label-md text-label-md text-primary-container uppercase font-extrabold tracking-wider">
              Head-to-Head Duel
            </span>
          </div>
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface tracking-tight font-extrabold">
            Your Duel Room is Ready
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Send the room credentials to your rival. Untimed duel — take all the time you need for each call.
          </p>
        </div>

        {/* Room Code Hero Glass Chamber */}
        <div className="relative w-full rounded-xl bg-surface-container-lowest/80 backdrop-blur-2xl p-space-lg flex flex-col items-center justify-center gap-space-sm shadow-2xl border border-primary-container/30 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary-container/10 via-primary-container/25 to-secondary/10 opacity-70 animate-pulse pointer-events-none" />
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider relative z-10">
            Room Invite Code
          </span>
          <div className="flex items-center justify-center gap-space-md relative z-10 w-full">
            <span
              className="font-headline-xl-mobile text-headline-xl-mobile tracking-[0.25em] text-primary-container drop-shadow-[0_0_18px_rgba(0,245,212,0.65)] font-extrabold pl-3"
              id="room-code-display"
            >
              {roomCode}
            </span>
            <button
              aria-label="Copy Room Code"
              className="w-10 h-10 rounded-full bg-surface-container-high/90 hover:bg-primary-container hover:text-on-primary-container text-primary-container flex items-center justify-center transition-all duration-200 active:scale-95 shadow-md"
              onClick={handleCopyCode}
            >
              <span className="material-symbols-outlined text-[20px]">
                {copied ? 'check' : 'content_copy'}
              </span>
            </button>
          </div>
          <div className="inline-flex items-center gap-space-2xs px-space-xs py-0.5 rounded-full bg-surface-container/60 text-on-surface-variant text-[11px] font-body-sm relative z-10">
            <span className="material-symbols-outlined text-[13px] text-tertiary-fixed-dim">verified_user</span>
            <span>End-to-end synced seed active</span>
          </div>
        </div>

        {/* Action Buttons in Thumb Zone */}
        <div className="grid grid-cols-2 gap-space-sm w-full relative z-10">
          <button
            onClick={handleCopyCode}
            className="relative overflow-hidden w-full min-h-[48px] rounded-xl bg-surface-container-highest/70 hover:bg-surface-container-highest active:scale-[0.98] text-on-surface flex items-center justify-center gap-space-xs px-space-sm transition-all shadow-md border border-outline-variant/30"
          >
            <span className="material-symbols-outlined text-[18px] text-primary-container">
              {copied ? 'check' : 'copy_all'}
            </span>
            <span className="font-label-lg text-label-lg font-bold">
              {copied ? 'Copied!' : 'Copy Code'}
            </span>
          </button>
          <button
            onClick={handleShareLink}
            className="relative overflow-hidden w-full min-h-[48px] rounded-xl bg-surface-container-highest/70 hover:bg-surface-container-highest active:scale-[0.98] text-on-surface flex items-center justify-center gap-space-xs px-space-sm transition-all shadow-md border border-outline-variant/30"
          >
            <span className="material-symbols-outlined text-[18px] text-secondary">share</span>
            <span className="font-label-lg text-label-lg font-bold">Share Link</span>
          </button>
        </div>

        {/* Status Card: Opponent Radar */}
        <div className="relative w-full rounded-xl bg-surface-container-low/70 backdrop-blur-md p-space-md shadow-inner border border-outline-variant/20 flex items-center gap-space-md">
          <div className="relative flex items-center justify-center w-14 h-14 shrink-0 rounded-full bg-surface-container-lowest/80">
            {opponentConnected ? (
              <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center text-secondary shadow-[0_0_15px_rgba(168,85,247,0.5)]">
                <span className="material-symbols-outlined text-[24px]">person</span>
              </div>
            ) : (
              <>
                <div className="absolute inset-0 rounded-full bg-primary-container/20 animate-ping" />
                <div className="absolute w-10 h-10 rounded-full bg-secondary-container/30 animate-pulse" />
                <div className="w-3 h-3 rounded-full bg-primary-container shadow-[0_0_10px_#00f5d4]" />
                <div className="absolute top-1 right-2 w-1.5 h-1.5 rounded-full bg-secondary animate-bounce" />
              </>
            )}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-space-xs">
              <span className="font-headline-sm text-headline-sm text-on-surface truncate font-bold">
                {opponentConnected ? `${opponentName} Connected!` : 'Waiting for opponent'}
              </span>
              {!opponentConnected && (
                <span className="flex gap-1">
                  <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                  <span className="w-1 h-1 rounded-full bg-primary animate-pulse [animation-delay:200ms]" />
                  <span className="w-1 h-1 rounded-full bg-primary animate-pulse [animation-delay:400ms]" />
                </span>
              )}
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2">
              {opponentConnected
                ? 'Your rival is in the lobby! Ready up your board to start the duel.'
                : 'Share this code with your friend. The live match kicks off instantly when both boards are verified.'}
            </p>
          </div>
        </div>
      </div>

      {/* Board Preparation Segmented Switch */}
      <div className="w-full rounded-xl bg-surface-container/70 backdrop-blur-xl p-space-sm shadow-md border border-outline-variant/30 flex flex-col gap-space-xs">
        <div className="flex items-center justify-between px-space-2xs">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-[16px] text-tertiary-fixed-dim">tune</span>
            <span className="font-label-md text-label-md text-on-surface font-bold">Board Preparation</span>
          </div>
          <span className="font-label-sm text-label-sm text-tertiary-fixed-dim bg-on-tertiary-fixed-variant/40 px-2 py-0.5 rounded-full">
            Recommended
          </span>
        </div>

        <div className="relative grid grid-cols-2 p-1 rounded-xl bg-surface-container-lowest/90 backdrop-blur-md">
          <button
            onClick={() => {
              sounds.playTap();
              setAutoFill(true);
            }}
            className={`flex items-center justify-center gap-space-xs py-space-xs px-space-sm rounded-lg transition-all duration-200 font-bold ${
              autoFill
                ? 'bg-surface-container-high text-primary-container shadow-md border border-primary-container/30'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="text-sm">⚡</span>
            <span className="font-label-md text-label-md">Auto-fill Board</span>
          </button>
          <button
            onClick={() => {
              sounds.playTap();
              setAutoFill(false);
            }}
            className={`flex items-center justify-center gap-space-xs py-space-xs px-space-sm rounded-lg transition-all duration-200 font-bold ${
              !autoFill
                ? 'bg-surface-container-high text-secondary shadow-md border border-secondary/30'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="text-sm">✏️</span>
            <span className="font-label-md text-label-md">Manual Fill</span>
          </button>
        </div>

        <div className="px-space-2xs">
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {autoFill
              ? 'Tiles populate with a balanced randomized 1-25 distribution with one tap.'
              : 'Manually place each number 1-25 into your preferred 5x5 strategic positions.'}
          </p>
        </div>
      </div>

      {/* Primary CTA */}
      <div className="w-full pt-space-xs flex flex-col gap-space-xs">
        <button
          onClick={() => {
            sounds.playTap();
            onProceedToSetup(autoFill);
          }}
          className="relative w-full min-h-[52px] rounded-xl bg-gradient-to-r from-primary-container to-primary-fixed-dim text-on-primary-container font-headline-md text-headline-md font-extrabold flex items-center justify-center gap-space-xs shadow-[0_0_24px_rgba(0,245,212,0.45)] hover:shadow-[0_0_32px_rgba(0,245,212,0.6)] active:scale-[0.98] transition-all cursor-pointer"
        >
          <span className="material-symbols-outlined text-[24px]">play_circle</span>
          <span>Ready &amp; Setup Board</span>
        </button>
      </div>
    </div>
  );
};
