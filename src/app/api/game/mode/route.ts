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

    // Verify game status is pre-match (waiting or ready)
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('id, status, target_lines')
      .eq('id', gameId)
      .single();

    if (gameError || !game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    if (game.status === 'playing' || game.status === 'completed') {
      return NextResponse.json(
        { error: 'Cannot change game mode after match has started' },
        { status: 400 }
      );
    }

    // Verify player belongs to this game
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id, player_number')
      .eq('game_id', gameId)
      .eq('session_id', sessionId)
      .single();

    if (playerError || !player) {
      return NextResponse.json(
        { error: 'Player not found in this game' },
        { status: 403 }
      );
    }

    const config = resolveGameVariant(null, null, boardSize);

    // Update game record: target_lines is the canonical column in Postgres games table
    const { error: updateErr } = await supabase
      .from('games')
      .update({
        target_lines: config.targetLines,
      })
      .eq('id', gameId);

    if (updateErr) {
      console.error('[API /api/game/mode] Failed to update target_lines:', updateErr);
      return NextResponse.json(
        { error: `Database update failed: ${updateErr.message}` },
        { status: 500 }
      );
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
