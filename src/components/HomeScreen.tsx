'use client';

import React, { useState, useEffect } from 'react';
import {
  Squares2X2Icon,
  PlusCircleIcon,
  PencilIcon,
  ChartBarIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
  SignalIcon,
  ArrowDownTrayIcon,
  WifiIcon,
  DevicePhoneMobileIcon,
} from '@heroicons/react/24/outline';
import { sounds } from './AudioController';
import { getPlayerName, setPlayerName } from '@/lib/gameEngine';
import { usePWA } from '@/context/PWAContext';

interface HomeScreenProps {
  onCreateGame: () => void;
  onJoinGame: (code?: string) => void;
  onLeaderboard: () => void;
  onOpenOfflineModal: () => void;
  onOpenInstallModal: () => void;
  loading: boolean;
  errorMessage?: string | null;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onCreateGame,
  onJoinGame,
  onLeaderboard,
  onOpenOfflineModal,
  onOpenInstallModal,
  loading,
  errorMessage,
}) => {
  const [quickCode, setQuickCode] = useState<string>('');
  const [playerName, setLocalPlayerName] = useState<string>('Duelist');
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const { isInstalled, isOnline } = usePWA();

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
    <div className="flex flex-col w-full max-w-md mx-auto gap-3.5 select-none pt-1">
      {/* Network Status Badge */}
      <div className="flex items-center justify-between w-full px-1">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-high border border-outline-variant text-[11px] font-semibold text-on-surface-variant">
          <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-primary-container animate-pulse' : 'bg-amber-400'}`} />
          <span>{isOnline ? 'Online Matchmaking Ready' : 'Offline / Local Mode Active'}</span>
        </div>

        {!isInstalled && (
          <button
            type="button"
            onClick={() => {
              sounds.playTap();
              onOpenInstallModal();
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary-container/15 hover:bg-primary-container/25 border border-primary-container/30 text-primary-container text-[11px] font-bold cursor-pointer transition-colors active:scale-95"
          >
            <ArrowDownTrayIcon className="w-3.5 h-3.5" />
            <span>Install App</span>
          </button>
        )}
      </div>

      {/* Error State Banner */}
      {errorMessage && (
        <div className="w-full relative overflow-hidden rounded-xl bg-error-container text-on-error-container border border-error/20 p-3 flex items-start gap-2.5 animate-fadeIn">
          <ExclamationCircleIcon className="w-5 h-5 text-error shrink-0 mt-0.5" />
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

      {/* Hero Card */}
      <div className="relative w-full rounded-2xl bg-surface-container/80 backdrop-blur-xl p-5 shadow-xs border border-outline-variant overflow-hidden flex flex-col items-center text-center gap-2.5">
        {/* Central Emblem */}
        <div className="relative w-14 h-14 rounded-2xl bg-surface-container-high flex items-center justify-center shadow-xs border border-outline-variant">
          <Squares2X2Icon className="w-7 h-7 text-primary-container" />
        </div>

        <div className="flex flex-col items-center gap-0.5">
          <h1 className="font-headline-xl-mobile text-2xl text-on-surface tracking-tight font-black">
            BINGO DUEL
          </h1>
          <p className="font-body-sm text-xs text-on-surface-variant max-w-[260px]">
            Real-time 1v1 head-to-head duels on synchronized boards.
          </p>
        </div>

        {/* Player Identity Badge */}
        <div className="pt-0.5">
          {isEditingName ? (
            <div className="flex items-center gap-1.5 bg-surface-container-high p-1.5 rounded-xl border border-primary-container">
              <input
                type="text"
                maxLength={15}
                value={playerName}
                onChange={e => setLocalPlayerName(e.target.value)}
                className="bg-transparent text-primary-container font-semibold text-sm px-2 py-1 outline-none text-center w-32"
                autoFocus
              />
              <button
                onClick={() => handleSaveName(playerName)}
                className="px-3 py-1 rounded-lg bg-primary-container text-on-primary-container font-medium text-xs active:scale-95 transition-transform"
              >
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                sounds.playTap();
                setIsEditingName(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high border border-outline-variant text-on-surface-variant hover:text-on-surface transition-colors text-xs font-medium cursor-pointer"
            >
              <span>Playing as: <strong className="text-on-surface">{playerName}</strong></span>
              <PencilIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Offline Play Banner */}
      <div className="w-full rounded-2xl bg-gradient-to-r from-primary-container/15 via-surface-container-high to-secondary-container/15 border border-primary-container/30 p-3.5 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary-container/20 border border-primary-container/40 flex items-center justify-center text-primary-container shrink-0">
            <SignalIcon className="w-5 h-5 animate-pulse" />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-xs font-bold text-on-surface">Offline & Local Duel Arena</span>
            <span className="text-[11px] text-on-surface-variant">Wi-Fi IP · Hotspot · Bluetooth · Pass & Play</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            sounds.playTap();
            onOpenOfflineModal();
          }}
          className="px-3 py-1.5 rounded-xl bg-primary-container text-on-primary-container font-black text-xs shadow-xs active:scale-95 transition-all cursor-pointer whitespace-nowrap"
        >
          PLAY OFFLINE
        </button>
      </div>

      {/* Primary Actions (Online Duel) */}
      <div className="flex flex-col w-full gap-2.5">
        {/* Host Game Button */}
        <button
          className="relative w-full h-12 rounded-2xl bg-primary-container text-on-primary-container font-headline-sm text-sm font-bold shadow-xs active:scale-[0.98] transition-all flex items-center justify-between px-5 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          id="btn-create-game"
          type="button"
          disabled={loading}
          onClick={() => {
            sounds.playTap();
            onCreateGame();
          }}
        >
          <div className="flex items-center gap-2.5">
            {loading ? (
              <ArrowPathIcon className="w-5 h-5 animate-spin" />
            ) : (
              <PlusCircleIcon className="w-5 h-5" />
            )}
            <span>{loading ? 'Creating Room...' : 'Create Game Room'}</span>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 text-white px-2 py-0.5 rounded-full">
            HOST
          </span>
        </button>

        {/* Join Game Box with Direct 4-Letter Code Input */}
        <form
          onSubmit={e => {
            e.preventDefault();
            if (quickCode.trim() && quickCode.length >= 3 && !loading) {
              sounds.playTap();
              onJoinGame(quickCode.trim());
            }
          }}
          className="w-full rounded-2xl bg-surface-container/60 backdrop-blur-xl p-3 border border-outline-variant flex flex-col gap-1.5 shadow-xs"
        >
          <span className="font-label-sm text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold text-left px-1">
            Join with Room Code
          </span>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="ENTER 4-LETTER CODE"
              maxLength={6}
              value={quickCode}
              onChange={e => setQuickCode(e.target.value.toUpperCase())}
              className="bg-surface-container-low flex-1 h-10 px-3.5 rounded-xl font-headline-sm text-xs tracking-widest text-on-surface uppercase placeholder:text-on-surface-variant/40 outline-none border border-outline-variant focus:border-primary-container transition-colors"
            />
            <button
              type="submit"
              disabled={quickCode.length < 3 || loading}
              className="h-10 px-4 rounded-xl bg-surface-container-high hover:bg-primary-container hover:text-white text-on-surface font-semibold text-xs transition-all disabled:opacity-40 disabled:pointer-events-none active:scale-95 border border-outline-variant cursor-pointer"
            >
              JOIN
            </button>
          </div>
        </form>

        {/* Leaderboard Button */}
        <button
          type="button"
          onClick={() => {
            sounds.playTap();
            onLeaderboard();
          }}
          className="w-full h-10 rounded-2xl bg-surface-container/60 backdrop-blur-xl border border-outline-variant flex items-center justify-center gap-2 text-on-surface hover:text-primary-container hover:border-primary-container/40 transition-all active:scale-[0.98] shadow-xs cursor-pointer"
          id="btn-leaderboard"
        >
          <ChartBarIcon className="w-4 h-4 text-primary-container" />
          <span className="font-semibold text-xs">Leaderboard & Stats</span>
        </button>
      </div>
    </div>
  );
};
