import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveGameVariant } from '@/lib/variantResolver';
import { BoardSize } from '@/types/bingo';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { gameId, sessionId, boardSize } = body as {
      gameId?: string;
      sessionId?: string;
      boardSize?: BoardSize;
    };

    if (!gameId || !sessionId || !boardSize || (boardSize !== 5 && boardSize !== 10)) {
      return NextResponse.json(
        { error: 'Invalid parameters: gameId, sessionId, and boardSize (5 or 10) are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase admin client unavailable' }, { status: 500 });
    }

    // Verify player is Player 1 (Host)
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id, player_number')
      .eq('game_id', gameId)
      .eq('session_id', sessionId)
      .single();

    if (playerError || !player || player.player_number !== 1) {
      return NextResponse.json(
        { error: 'Only the host (Player 1) can change game mode' },
        { status: 403 }
      );
    }

    const config = resolveGameVariant(null, null, boardSize);

    // Update game record: target_lines is always present
    const updatePayload: Record<string, unknown> = {
      target_lines: config.targetLines,
    };

    // Attempt to also set board_size and variant if columns exist in DB
    try {
      await supabase
        .from('games')
        .update({
          target_lines: config.targetLines,
          board_size: config.boardSize,
          variant: config.variant,
        })
        .eq('id', gameId);
    } catch {
      // Fallback if schema doesn't have board_size/variant columns
      await supabase
        .from('games')
        .update(updatePayload)
        .eq('id', gameId);
    }

    // Reset players readiness and board for fresh placement
    await supabase
      .from('players')
      .update({ board: null, is_ready: false, lines_completed: 0 })
      .eq('game_id', gameId);

    return NextResponse.json({
      success: true,
      boardSize: config.boardSize,
      variant: config.variant,
      targetLines: config.targetLines,
    });
  } catch (err: unknown) {
    console.error('[API /api/game/mode] Error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to update game mode' },
      { status: 500 }
    );
  }
}
