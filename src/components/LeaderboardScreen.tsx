'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  TrophyIcon,
  StarIcon,
  SparklesIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { fetchLeaderboard, fetchPlayerRank } from '@/lib/leaderboard';
import { getPlayerId } from '@/lib/gameEngine';
import type { LeaderboardEntry, LeaderboardVariant, PlayerRank } from '@/types/bingo';
import { sounds } from './AudioController';

interface LeaderboardScreenProps {
  onBack: () => void;
}

// ─── Medal colours ─────────────────────────────────────────────────────────────
const MEDAL_CONFIG = {
  1: {
    label: '1st',
    border: 'border-[#FFD60A]/30',
    bg: 'bg-[#FFD60A]/10',
    text: 'text-[#D98200] dark:text-[#FFD60A]',
    scale: 'scale-105',
    size: 'py-5',
    nameSize: 'text-base',
    winSize: 'text-2xl',
  },
  2: {
    label: '2nd',
    border: 'border-[#8E8E93]/30',
    bg: 'bg-[#8E8E93]/10',
    text: 'text-[#636366] dark:text-[#AEAEB2]',
    scale: 'scale-100',
    size: 'py-4',
    nameSize: 'text-sm',
    winSize: 'text-xl',
  },
  3: {
    label: '3rd',
    border: 'border-[#A25B1E]/30',
    bg: 'bg-[#A25B1E]/10',
    text: 'text-[#A25B1E] dark:text-[#D48944]',
    scale: 'scale-95',
    size: 'py-3',
    nameSize: 'text-sm',
    winSize: 'text-lg',
  },
} as const;

// ─── Podium Card ───────────────────────────────────────────────────────────────
function PodiumCard({
  entry,
  rank,
  isCurrentPlayer,
}: {
  entry: LeaderboardEntry;
  rank: 1 | 2 | 3;
  isCurrentPlayer: boolean;
}) {
  const cfg = MEDAL_CONFIG[rank];
  return (
    <div
      className={`relative flex flex-col items-center gap-2 rounded-2xl backdrop-blur-xl border px-4 ${cfg.size} ${cfg.bg} ${cfg.border} ${cfg.scale} transition-transform duration-300 shadow-xs ${
        isCurrentPlayer ? 'ring-1 ring-primary-container ring-offset-1 ring-offset-transparent' : ''
      }`}
    >
      {/* Rank label */}
      <span className={`font-bold text-[10px] uppercase tracking-widest ${cfg.text}`}>
        {cfg.label}
      </span>

      {/* Icon */}
      {rank === 1 ? (
        <TrophyIcon className={`w-8 h-8 ${cfg.text}`} />
      ) : rank === 2 ? (
        <StarIcon className={`w-7 h-7 ${cfg.text}`} />
      ) : (
        <SparklesIcon className={`w-6 h-6 ${cfg.text}`} />
      )}

      {/* Name */}
      <p className={`font-bold text-on-surface text-center leading-tight max-w-[90px] truncate ${cfg.nameSize}`}>
        {entry.display_name}
        {isCurrentPlayer && (
          <span className="ml-1 text-primary-container text-[10px]">★</span>
        )}
      </p>

      {/* Win count */}
      <div className="flex flex-col items-center gap-0.5">
        <span className={`font-bold ${cfg.text} ${cfg.winSize}`}>{entry.wins}</span>
        <span className="text-on-surface-variant text-[10px] font-medium uppercase tracking-wide">
          {entry.wins === 1 ? 'win' : 'wins'}
        </span>
      </div>
    </div>
  );
}

// ─── List Row ─────────────────────────────────────────────────────────────────
function ListRow({
  entry,
  isCurrentPlayer,
  isEven,
}: {
  entry: LeaderboardEntry;
  isCurrentPlayer: boolean;
  isEven: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all border border-outline-variant/40 ${
        isCurrentPlayer
          ? 'bg-primary-container/10 border-primary-container/40'
          : isEven
          ? 'bg-surface-container'
          : 'bg-surface-container-high'
      }`}
    >
      {/* Rank badge */}
      <span className="w-8 text-center font-bold text-xs text-on-surface-variant shrink-0">
        #{entry.rank}
      </span>

      {/* Name */}
      <span className={`flex-1 font-semibold text-sm truncate ${isCurrentPlayer ? 'text-primary-container' : 'text-on-surface'}`}>
        {entry.display_name}
        {isCurrentPlayer && <span className="ml-1.5 text-[10px] font-bold text-primary-container bg-primary-container/10 px-1.5 py-0.5 rounded">YOU</span>}
      </span>

      {/* Win count */}
      <div className="flex items-center gap-1 shrink-0">
        <TrophyIcon className="w-4 h-4 text-primary-container" />
        <span className="font-bold text-sm text-on-surface">{entry.wins}</span>
      </div>
    </div>
  );
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────────
function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={`rounded-xl bg-surface-container-high/60 animate-pulse ${className}`} />
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Podium skeleton */}
      <div className="flex items-end justify-center gap-3 pt-2">
        <SkeletonBlock className="h-36 w-[30%]" />
        <SkeletonBlock className="h-44 w-[34%]" />
        <SkeletonBlock className="h-32 w-[28%]" />
      </div>
      {/* List skeleton */}
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────
function EmptyState({ variant }: { variant: LeaderboardVariant }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-14 text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-surface-container border border-outline-variant flex items-center justify-center shadow-xs">
        <TrophyIcon className="w-8 h-8 text-primary-container" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-bold text-on-surface text-base leading-tight">
          No champions yet!
        </p>
        <p className="text-on-surface-variant text-xs">
          Win a {variant} match to be the first on the leaderboard.
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export const LeaderboardScreen: React.FC<LeaderboardScreenProps> = ({ onBack }) => {
  const [variant, setVariant] = useState<LeaderboardVariant>('5x5');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [playerRank, setPlayerRank] = useState<PlayerRank | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const myPlayerId = getPlayerId();

  const load = useCallback(async (v: LeaderboardVariant) => {
    setLoading(true);
    try {
      const [board, rank] = await Promise.all([
        fetchLeaderboard(v),
        fetchPlayerRank(myPlayerId, v),
      ]);
      setEntries(board);
      setPlayerRank(rank);
      setLastRefreshed(new Date());
    } finally {
      setLoading(false);
    }
  }, [myPlayerId]);

  useEffect(() => {
    load(variant);
  }, [variant, load]);

  const handleTabSwitch = (v: LeaderboardVariant) => {
    if (v === variant) return;
    sounds.playTap();
    setVariant(v);
  };

  const handleRefresh = () => {
    sounds.playTap();
    load(variant);
  };

  const podiumEntries = entries.slice(0, 3);
  const listEntries = entries.slice(3);
  const currentPlayerInTop50 = entries.some(e => e.player_id === myPlayerId);
  const hasAnyWinners = entries.length > 0;

  const podiumSlots = [1, 2, 3].map(rank => ({
    rank: rank as 1 | 2 | 3,
    entry: podiumEntries[rank - 1] ?? null,
  }));

  return (
    <div className="flex flex-col w-full max-w-md mx-auto gap-4 select-none pt-2 pb-16">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              sounds.playTap();
              onBack();
            }}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container text-on-surface hover:bg-surface-container-high transition-all active:scale-95 border border-outline-variant cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeftIcon className="w-3.5 h-3.5" />
          </button>
          <h2 className="font-bold text-on-surface text-lg tracking-tight">Leaderboard</h2>
        </div>

        <div className="flex items-center gap-2">
          {lastRefreshed && (
            <span className="text-on-surface-variant text-[10px] font-medium">
              {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            aria-label="Refresh leaderboard"
            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container border border-outline-variant text-on-surface-variant hover:text-primary-container transition-all active:scale-90 disabled:opacity-40 cursor-pointer"
          >
            <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Variant Toggle ─────────────────────────────────────────────────── */}
      <div className="flex items-center w-full rounded-2xl bg-surface-container/60 backdrop-blur-xl border border-outline-variant p-1 gap-1 shadow-xs">
        {(['5x5', '10x10'] as LeaderboardVariant[]).map(v => (
          <button
            key={v}
            type="button"
            onClick={() => handleTabSwitch(v)}
            className={`flex-1 h-9 rounded-xl font-semibold text-xs uppercase tracking-wider transition-all duration-200 cursor-pointer ${
              variant === v
                ? 'bg-primary-container text-on-primary-container shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {v === '5x5' ? 'Classic 5×5' : 'Mega 10×10'}
          </button>
        ))}
      </div>

      {/* ── Content Area ───────────────────────────────────────────────────── */}
      {loading ? (
        <LeaderboardSkeleton />
      ) : !hasAnyWinners ? (
        <EmptyState variant={variant} />
      ) : (
        <>
          {/* ── Podium ──────────────────────────────────────────────────────── */}
          <div className="relative w-full">
            <div className="flex items-end justify-center gap-2.5 relative z-10">
              {/* 2nd place */}
              <div className="flex-1 flex justify-end">
                {podiumSlots[1].entry ? (
                  <PodiumCard
                    entry={podiumSlots[1].entry}
                    rank={2}
                    isCurrentPlayer={podiumSlots[1].entry.player_id === myPlayerId}
                  />
                ) : (
                  <div className="w-full max-w-[110px] h-32 rounded-2xl border border-dashed border-outline-variant flex items-center justify-center opacity-40">
                    <span className="text-on-surface-variant text-xs font-semibold">2nd</span>
                  </div>
                )}
              </div>

              {/* 1st place — centre, tallest */}
              <div className="flex-1 flex justify-center">
                {podiumSlots[0].entry ? (
                  <PodiumCard
                    entry={podiumSlots[0].entry}
                    rank={1}
                    isCurrentPlayer={podiumSlots[0].entry.player_id === myPlayerId}
                  />
                ) : (
                  <div className="w-full max-w-[120px] h-40 rounded-2xl border border-dashed border-outline-variant flex items-center justify-center opacity-40">
                    <span className="text-on-surface-variant text-xs font-semibold">1st</span>
                  </div>
                )}
              </div>

              {/* 3rd place */}
              <div className="flex-1 flex justify-start">
                {podiumSlots[2].entry ? (
                  <PodiumCard
                    entry={podiumSlots[2].entry}
                    rank={3}
                    isCurrentPlayer={podiumSlots[2].entry.player_id === myPlayerId}
                  />
                ) : (
                  <div className="w-full max-w-[100px] h-28 rounded-2xl border border-dashed border-outline-variant flex items-center justify-center opacity-40">
                    <span className="text-on-surface-variant text-xs font-semibold">3rd</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Ranks 4–50 list ─────────────────────────────────────────────── */}
          {listEntries.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-2xl bg-surface-container/60 backdrop-blur-xl border border-outline-variant p-3 shadow-xs">
              <p className="text-on-surface-variant text-[11px] font-semibold uppercase tracking-widest px-1 pb-1">
                Full Rankings
              </p>
              {listEntries.map((entry, idx) => (
                <ListRow
                  key={entry.player_id}
                  entry={entry}
                  isCurrentPlayer={entry.player_id === myPlayerId}
                  isEven={idx % 2 === 0}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Sticky "Your Rank" strip for players outside top 50 ────────────── */}
      {!loading && !currentPlayerInTop50 && playerRank && (
        <div className="sticky bottom-0 w-full rounded-2xl bg-surface-container-highest/95 backdrop-blur-xl border border-primary-container/40 shadow-md p-3 flex items-center gap-3">
          <UserIcon className="w-5 h-5 text-primary-container" />
          <div className="flex-1 min-w-0">
            <p className="text-on-surface-variant text-[11px] font-medium uppercase tracking-wider">Your Rank</p>
            <p className="text-on-surface font-bold text-sm">
              #{playerRank.rank}
              <span className="text-on-surface-variant font-normal text-xs ml-2">
                {playerRank.wins} {playerRank.wins === 1 ? 'win' : 'wins'}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-1">
            <TrophyIcon className="w-4 h-4 text-primary-container" />
            <span className="font-bold text-primary-container text-base">{playerRank.wins}</span>
          </div>
        </div>
      )}
    </div>
  );
};
