'use client';

import React, { useState, useEffect } from 'react';
import { sounds } from './AudioController';
import { getPlayerName, setPlayerName } from '@/lib/gameEngine';

interface HomeScreenProps {
  onCreateGame: () => void;
  onJoinGame: (code?: string) => void;
  loading: boolean;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onCreateGame,
  onJoinGame,
  loading,
}) => {
  const [heroNumber, setHeroNumber] = useState<number>(21);
  const [quickCode, setQuickCode] = useState<string>('');
  const [playerName, setLocalPlayerName] = useState<string>('Duelist');
  const [isEditingName, setIsEditingName] = useState<boolean>(false);

  useEffect(() => {
    setLocalPlayerName(getPlayerName());
    const interval = setInterval(() => {
      setHeroNumber(Math.floor(Math.random() * 25) + 1);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveName = (name: string) => {
    const trimmed = name.trim() || 'Duelist';
    setLocalPlayerName(trimmed);
    setPlayerName(trimmed);
    setIsEditingName(false);
  };

  return (
    <div className="flex flex-col w-full max-w-md mx-auto gap-space-md select-none pt-2">
      {/* Live Telemetry Status Pill */}
      <div className="flex justify-center w-full">
        <div className="flex items-center gap-space-xs px-space-sm py-1.5 rounded-full bg-surface-container-high/70 backdrop-blur-md shadow-sm border border-outline-variant/30">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-container opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-container" />
          </span>
          <span className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider">
            1,420 Players Online <span className="text-on-surface-variant px-1">•</span> Instant Match
          </span>
        </div>
      </div>

      {/* Player Identity Pill */}
      <div className="flex justify-center w-full">
        {isEditingName ? (
          <div className="flex items-center gap-2 bg-surface-container-high/90 p-1.5 rounded-xl border border-primary-container/40">
            <input
              type="text"
              maxLength={15}
              value={playerName}
              onChange={e => setLocalPlayerName(e.target.value)}
              className="bg-transparent text-primary font-headline-sm px-2 py-1 outline-none text-center w-36"
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
            className="flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container/80 border border-outline-variant/40 text-on-surface-variant hover:text-primary transition-colors text-xs"
          >
            <span>Playing as <strong className="text-primary-fixed">{playerName}</strong></span>
            <span className="material-symbols-outlined text-[14px]">edit</span>
          </button>
        )}
      </div>

      {/* Hero Central Glass Card */}
      <div className="relative w-full rounded-2xl bg-surface-container/70 backdrop-blur-2xl p-space-lg shadow-xl border border-outline-variant/30 overflow-hidden flex flex-col items-center text-center">
        {/* Top Specular Flare Glow */}
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-48 bg-primary-container/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 right-0 w-36 h-36 bg-secondary-container/30 rounded-full blur-2xl pointer-events-none" />

        {/* Animated Kinetic Bingo Sphere Showcase */}
        <div className="relative w-28 h-28 my-space-xs flex items-center justify-center">
          {/* Rotating Outer Neon Track SVG */}
          <svg
            className="absolute inset-0 w-full h-full animate-spin text-primary-container/40"
            style={{ animationDuration: '16s' }}
            viewBox="0 0 100 100"
          >
            <circle cx="50" cy="50" fill="none" r="46" stroke="currentColor" strokeDasharray="6 8" strokeWidth="2" />
          </svg>
          <svg
            className="absolute inset-1.5 w-[100px] h-[100px] animate-spin text-secondary/30"
            style={{ animationDuration: '10s', animationDirection: 'reverse' }}
            viewBox="0 0 100 100"
          >
            <circle cx="50" cy="50" fill="none" r="44" stroke="currentColor" strokeDasharray="14 10" strokeWidth="1.5" />
          </svg>

          {/* Core Glass Orb with Inset Specular Sheen */}
          <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-primary-container via-surface-container-high to-secondary-container flex items-center justify-center shadow-lg p-[2px]">
            <div className="w-full h-full rounded-full bg-surface-container-lowest/90 backdrop-blur-md flex flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute top-1 left-2 w-8 h-4 bg-white/25 rounded-full blur-[1px] rotate-[-28deg]" />
              <span className="font-label-sm text-label-sm text-primary-fixed-dim leading-none tracking-widest font-extrabold uppercase text-[10px]">
                BALL
              </span>
              <span className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface font-extrabold leading-none mt-0.5">
                {heroNumber}
              </span>
            </div>
          </div>

          {/* Opponent Micro Target Icon Orbiting */}
          <div className="absolute top-0 right-1 w-7 h-7 rounded-full bg-secondary-container text-secondary flex items-center justify-center shadow-md">
            <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              swords
            </span>
          </div>
        </div>

        {/* Headline and Descriptor */}
        <div className="relative z-10 flex flex-col items-center mt-space-xs gap-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary-container/15 text-primary-container font-label-sm text-label-sm border border-primary-container/20">
            <span className="material-symbols-outlined text-[14px]">bolt</span>
            HIGH-STAKES DUEL
          </div>
          <h1 className="font-headline-xl-mobile text-headline-xl-mobile text-on-surface tracking-tight mt-1 font-extrabold">
            REAL-TIME 1v1 BINGO
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-[280px] mt-0.5">
            Race head-to-head on live synchronized matrices. Call fast, chain lines, claim victory.
          </p>
        </div>

        {/* Micro Match Ticker Ribbon */}
        <div className="relative z-10 w-full mt-space-md pt-space-xs flex items-center justify-between px-space-xs text-on-surface-variant font-label-sm text-label-sm border-t border-outline-variant/20">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-primary-container text-[16px]">timer</span>
            <span>Avg Match: <strong className="text-on-surface">90s</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-tertiary-fixed-dim text-[16px]">military_tech</span>
            <span>Ranked Duels</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-secondary text-[16px]">public</span>
            <span>Global P2P</span>
          </div>
        </div>
      </div>

      {/* Primary Interactive Thumb-Zone Action Cards */}
      <div className="flex flex-col w-full gap-space-sm">
        {/* Action 1: Create Game / Host */}
        <button
          className="group relative w-full text-left rounded-2xl p-[2px] bg-gradient-to-r from-primary-container via-surface-bright to-primary-fixed-dim shadow-xl active:scale-[0.98] transition-all cursor-pointer"
          id="btn-create-game"
          type="button"
          disabled={loading}
          onClick={() => {
            sounds.playTap();
            onCreateGame();
          }}
        >
          <div className="w-full h-full rounded-[14px] bg-surface-container/90 backdrop-blur-xl p-space-md flex items-center justify-between relative overflow-hidden">
            <div className="absolute -right-8 -top-8 w-24 h-24 bg-primary-container/15 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-center gap-space-md min-w-0">
              <div className="w-12 h-12 rounded-xl bg-primary-container/20 flex items-center justify-center shrink-0 text-primary-container shadow-inner border border-primary-container/30">
                <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  bolt
                </span>
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">
                    Create Game
                  </span>
                  <span className="font-label-sm text-label-sm bg-primary-container/20 text-primary-container px-1.5 py-0.5 rounded uppercase font-bold">
                    HOST
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                  Host a room &amp; invite a friend instantly
                </p>
              </div>
            </div>
            <div className="w-9 h-9 rounded-full bg-surface-container-high/80 flex items-center justify-center text-primary-container shrink-0 group-hover:translate-x-1 transition-transform shadow-md">
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </div>
          </div>
        </button>

        {/* Action 2: Join Game / Room Code */}
        <button
          className="group relative w-full text-left rounded-2xl p-[2px] bg-gradient-to-r from-secondary-container via-surface-bright to-secondary shadow-xl active:scale-[0.98] transition-all cursor-pointer"
          id="btn-join-game"
          type="button"
          disabled={loading}
          onClick={() => {
            sounds.playTap();
            onJoinGame();
          }}
        >
          <div className="w-full h-full rounded-[14px] bg-surface-container/90 backdrop-blur-xl p-space-md flex items-center justify-between relative overflow-hidden">
            <div className="absolute -right-8 -top-8 w-24 h-24 bg-secondary-container/15 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-center gap-space-md min-w-0">
              <div className="w-12 h-12 rounded-xl bg-secondary-container/20 flex items-center justify-center shrink-0 text-secondary shadow-inner border border-secondary-container/30">
                <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  tag
                </span>
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">
                    Join Game
                  </span>
                  <span className="font-label-sm text-label-sm bg-secondary-container/30 text-secondary-fixed px-1.5 py-0.5 rounded uppercase font-bold">
                    CODE
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                  Enter 4-letter room code to play
                </p>
              </div>
            </div>
            <div className="w-9 h-9 rounded-full bg-surface-container-high/80 flex items-center justify-center text-secondary shrink-0 group-hover:translate-x-1 transition-transform shadow-md">
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </div>
          </div>
        </button>
      </div>

      {/* Quick Direct Code Input */}
      <div className="w-full rounded-xl bg-surface-container-low/70 backdrop-blur-md p-space-sm border border-outline-variant/30 flex items-center gap-2">
        <span className="material-symbols-outlined text-outline text-[20px] pl-1">keyboard</span>
        <input
          type="text"
          placeholder="ENTER 4-LETTER CODE..."
          maxLength={6}
          value={quickCode}
          onChange={e => setQuickCode(e.target.value.toUpperCase())}
          className="bg-transparent flex-1 font-headline-sm text-sm tracking-widest text-primary uppercase placeholder:text-outline-variant/60 outline-none"
        />
        <button
          disabled={quickCode.length < 3 || loading}
          onClick={() => {
            if (quickCode.trim()) {
              sounds.playTap();
              onJoinGame(quickCode.trim());
            }
          }}
          className="px-4 py-2 rounded-lg bg-surface-container-high hover:bg-primary-container hover:text-on-primary font-bold text-xs transition-all disabled:opacity-40 disabled:pointer-events-none"
        >
          JOIN
        </button>
      </div>
    </div>
  );
};
