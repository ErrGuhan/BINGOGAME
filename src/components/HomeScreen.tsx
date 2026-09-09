'use client';

import React, { useState, useEffect } from 'react';
import { sounds } from './AudioController';
import { getPlayerName, setPlayerName } from '@/lib/gameEngine';

interface HomeScreenProps {
  onCreateGame: () => void;
  onJoinGame: (code?: string) => void;
  loading: boolean;
  errorMessage?: string | null;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onCreateGame,
  onJoinGame,
  loading,
  errorMessage,
}) => {
  const [quickCode, setQuickCode] = useState<string>('');
  const [playerName, setLocalPlayerName] = useState<string>('Duelist');
  const [isEditingName, setIsEditingName] = useState<boolean>(false);

  useEffect(() => {
    setLocalPlayerName(getPlayerName());
  }, []);

  const handleSaveName = (name: string) => {
    const trimmed = name.trim() || 'Duelist';
    setLocalPlayerName(trimmed);
    setPlayerName(trimmed);
    setIsEditingName(false);
  };

  return (
    <div className="flex flex-col w-full max-w-md mx-auto gap-4 select-none pt-2">
      {/* Error State Banner */}
      {errorMessage && (
        <div className="w-full relative overflow-hidden rounded-xl bg-surface-container-high/95 backdrop-blur-xl shadow-lg border border-error/50 p-3 flex items-start gap-2.5 text-error animate-fadeIn">
          <span className="material-symbols-outlined text-[20px] text-error mt-0.5">error</span>
          <div className="flex flex-col flex-1 min-w-0 text-left">
            <span className="font-headline-sm text-xs font-bold text-error leading-tight">
              Notice
            </span>
            <span className="font-body-sm text-xs text-on-surface-variant mt-0.5 leading-snug">
              {errorMessage}
            </span>
          </div>
        </div>
      )}

      {/* Hero Card: Clean & Futuristic */}
      <div className="relative w-full rounded-2xl bg-surface-container/75 backdrop-blur-2xl p-6 shadow-xl border border-outline-variant/30 overflow-hidden flex flex-col items-center text-center gap-3">
        {/* Subtle Ambient Glow */}
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-40 h-40 bg-primary-container/15 rounded-full blur-3xl pointer-events-none" />

        {/* Central Clean Emblem */}
        <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-container/25 via-surface-container-high to-secondary-container/25 flex items-center justify-center shadow-lg border border-primary-container/30">
          <span className="material-symbols-outlined text-[42px] text-primary-container drop-shadow-[0_0_12px_rgba(0,245,212,0.6)]" style={{ fontVariationSettings: "'FILL' 1" }}>
            grid_4x4
          </span>
        </div>

        <div className="flex flex-col items-center gap-1">
          <h1 className="font-headline-xl-mobile text-2xl text-on-surface tracking-tight font-black">
            BINGO DUEL
          </h1>
          <p className="font-body-sm text-xs text-on-surface-variant max-w-[260px]">
            Real-time 1v1 head-to-head duels on synchronized boards.
          </p>
        </div>

        {/* Player Identity Badge */}
        <div className="pt-1">
          {isEditingName ? (
            <div className="flex items-center gap-1.5 bg-surface-container-high/90 p-1.5 rounded-xl border border-primary-container/40">
              <input
                type="text"
                maxLength={15}
                value={playerName}
                onChange={e => setLocalPlayerName(e.target.value)}
                className="bg-transparent text-primary-fixed font-bold text-sm px-2 py-1 outline-none text-center w-32"
                autoFocus
              />
              <button
                onClick={() => handleSaveName(playerName)}
                className="px-3 py-1 rounded-lg bg-primary-container text-on-primary font-bold text-xs"
              >
                SAVE
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                sounds.playTap();
                setIsEditingName(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high/80 border border-outline-variant/30 text-on-surface-variant hover:text-primary transition-colors text-xs font-semibold"
            >
              <span>Playing as: <strong className="text-primary-fixed">{playerName}</strong></span>
              <span className="material-symbols-outlined text-[13px]">edit</span>
            </button>
          )}
        </div>
      </div>

      {/* Primary Actions: Clean & Focused */}
      <div className="flex flex-col w-full gap-3">
        {/* Host Game Button */}
        <button
          className="relative w-full h-14 rounded-2xl bg-gradient-to-r from-primary-fixed to-primary-container text-on-primary-fixed font-headline-sm text-base font-black shadow-[0_0_24px_rgba(0,245,212,0.4)] active:scale-[0.98] transition-all flex items-center justify-between px-5 disabled:opacity-60 disabled:pointer-events-none hover:brightness-105 cursor-pointer"
          id="btn-create-game"
          type="button"
          disabled={loading}
          onClick={() => {
            sounds.playTap();
            onCreateGame();
          }}
        >
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[24px]">
              {loading ? 'progress_activity' : 'add_circle'}
            </span>
            <span>{loading ? 'Creating Room...' : 'Create Game'}</span>
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider bg-black/20 px-2 py-0.5 rounded-full">
            HOST
          </span>
        </button>

        {/* Join Game Box with Direct 4-Letter Code Input */}
        <div className="w-full rounded-2xl bg-surface-container/70 backdrop-blur-xl p-3.5 border border-outline-variant/30 flex flex-col gap-2 shadow-md">
          <span className="font-label-sm text-[11px] text-on-surface-variant uppercase tracking-wider font-bold text-left px-1">
            Join with Room Code
          </span>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="ENTER 4-LETTER CODE"
              maxLength={6}
              value={quickCode}
              onChange={e => setQuickCode(e.target.value.toUpperCase())}
              className="bg-surface-container-high/90 flex-1 h-11 px-3.5 rounded-xl font-headline-sm text-sm tracking-widest text-primary-fixed uppercase placeholder:text-outline-variant/60 outline-none border border-outline-variant/20 focus:border-primary-container transition-colors"
            />
            <button
              disabled={quickCode.length < 3 || loading}
              onClick={() => {
                if (quickCode.trim()) {
                  sounds.playTap();
                  onJoinGame(quickCode.trim());
                }
              }}
              className="h-11 px-5 rounded-xl bg-surface-container-highest hover:bg-secondary-container hover:text-secondary-fixed text-on-surface font-black text-xs transition-all disabled:opacity-40 disabled:pointer-events-none active:scale-95 border border-outline-variant/20"
            >
              JOIN
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
