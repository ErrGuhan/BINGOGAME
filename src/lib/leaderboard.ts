import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import type { LeaderboardEntry, LeaderboardVariant, PlayerRank } from '@/types/bingo';

/**
 * Fetches the top-50 leaderboard for the given variant.
 * Sorted server-side: wins DESC → matches_played ASC → last_win_at ASC.
 *
 * Returns an empty array if the RPC is unavailable (migration not yet run)
 * or if no players have any wins yet.
 */
export async function fetchLeaderboard(variant: LeaderboardVariant): Promise<LeaderboardEntry[]> {
  const supabase = getSupabase();
  if (!supabase || !isSupabaseConfigured()) return [];

  try {
    const { data, error } = await supabase.rpc('get_leaderboard', {
      p_variant: variant,
      p_limit: 50,
    });

    if (error) {
      // Leaderboard migration hasn't been run yet — fail gracefully
      console.warn('[Leaderboard] get_leaderboard RPC unavailable:', error.message);
      return [];
    }

    if (!Array.isArray(data)) return [];
    return data as LeaderboardEntry[];
  } catch (err) {
    console.warn('[Leaderboard] fetchLeaderboard failed:', err);
    return [];
  }
}

/**
 * Fetches a single player's rank and win count for the sticky "Your Rank" strip.
 * Returns null if the player has no wins yet in this variant, or if the RPC fails.
 */
export async function fetchPlayerRank(
  playerId: string,
  variant: LeaderboardVariant
): Promise<PlayerRank | null> {
  if (!playerId) return null;

  const supabase = getSupabase();
  if (!supabase || !isSupabaseConfigured()) return null;

  try {
    const { data, error } = await supabase.rpc('get_player_rank', {
      p_player_id: playerId,
      p_variant: variant,
    });

    if (error) {
      console.warn('[Leaderboard] get_player_rank RPC unavailable:', error.message);
      return null;
    }

    if (!data) return null;
    return data as PlayerRank;
  } catch (err) {
    console.warn('[Leaderboard] fetchPlayerRank failed:', err);
    return null;
  }
}
