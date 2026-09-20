import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveGameVariant, validateBoardForVariant } from '@/lib/variantResolver';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { gameId, sessionId, board } = body as {
      gameId?: string;
      sessionId?: string;
      board?: number[];
    };

    if (!gameId || !sessionId || !Array.isArray(board)) {
      return NextResponse.json(
        { error: 'Invalid parameters: gameId, sessionId, and board array are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase admin client unavailable' }, { status: 500 });
    }

    // Fetch game
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single();

    if (gameError || !game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // Fetch player
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('*')
      .eq('game_id', gameId)
      .eq('session_id', sessionId)
      .single();

    if (playerError || !player) {
      return NextResponse.json({ error: 'Player not found in this game' }, { status: 404 });
    }

    // Resolve variant from game + submitted board
    const config = resolveGameVariant(game, board);

    // Validate board strictly against resolved variant
    const validation = validateBoardForVariant(board, config);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Update player's board and ready status
    const { error: updatePlayerErr } = await supabase
      .from('players')
      .update({
        board,
        is_ready: true,
        last_seen_at: new Date().toISOString(),
      })
      .eq('id', player.id);

    if (updatePlayerErr) {
      return NextResponse.json({ error: updatePlayerErr.message }, { status: 500 });
    }

    // Check if other player is ready
    const { data: otherPlayers, error: otherError } = await supabase
      .from('players')
      .select('id, is_ready, player_number')
      .eq('game_id', gameId)
      .neq('id', player.id);

    const isOtherReady = Boolean(otherPlayers && otherPlayers.length > 0 && otherPlayers.every(p => p.is_ready));

    let allReady = false;
    let turnId: string | null = null;

    if (isOtherReady) {
      allReady = true;
      // Get Player 1's ID to start turn
      const { data: p1 } = await supabase
        .from('players')
        .select('id')
        .eq('game_id', gameId)
        .eq('player_number', 1)
        .single();

      turnId = p1?.id || player.id;

      // Update game status to playing with target_lines and turn
      await supabase
        .from('games')
        .update({
          status: 'playing',
          current_turn_player_id: turnId,
          target_lines: config.targetLines,
        })
        .eq('id', gameId);
    } else {
      // First player to lock: persist target_lines immediately so opponent's sync is in lockstep
      await supabase
        .from('games')
        .update({
          target_lines: config.targetLines,
        })
        .eq('id', gameId);
    }

    return NextResponse.json({
      success: true,
      all_ready: allReady,
      current_turn_player_id: turnId,
      player_id: player.id,
      board_size: config.boardSize,
      variant: config.variant,
      target_lines: config.targetLines,
    });
  } catch (err: unknown) {
    console.error('[API /api/game/board] Error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to submit player board' },
      { status: 500 }
    );
  }
}
