import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveGameVariant } from '@/lib/variantResolver';
import { calculateLines } from '@/lib/gameEngine';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { gameId, sessionId, number } = body as {
      gameId?: string;
      sessionId?: string;
      number?: number;
    };

    if (!gameId || !sessionId || typeof number !== 'number') {
      return NextResponse.json(
        { error: 'Invalid parameters: gameId, sessionId, and number are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase admin client unavailable' }, { status: 500 });
    }

    // 1. Fetch game
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single();

    if (gameError || !game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    if (game.status !== 'playing') {
      return NextResponse.json(
        { error: `Cannot call number: game is ${game.status}` },
        { status: 400 }
      );
    }

    // 2. Fetch caller
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('*')
      .eq('game_id', gameId)
      .eq('session_id', sessionId)
      .single();

    if (playerError || !player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // 3. Strict turn validation
    if (game.current_turn_player_id && game.current_turn_player_id !== player.id) {
      return NextResponse.json({ error: 'It is not your turn' }, { status: 403 });
    }

    // 4. Fetch opponent
    const { data: opponent } = await supabase
      .from('players')
      .select('*')
      .eq('game_id', gameId)
      .neq('id', player.id)
      .single();

    const config = resolveGameVariant(game, player.board);

    // 5. Variant range validation
    if (number < 1 || number > config.maxNumber) {
      return NextResponse.json(
        { error: `Number must be between 1 and ${config.maxNumber}` },
        { status: 400 }
      );
    }

    // 6. Check for duplicate calls
    const { data: existingCalls } = await supabase
      .from('called_numbers')
      .select('number, sequence')
      .eq('game_id', gameId);

    const alreadyCalled = Boolean(existingCalls && existingCalls.some(c => c.number === number));
    if (alreadyCalled) {
      return NextResponse.json(
        { error: `Number ${number} has already been called in this match` },
        { status: 400 }
      );
    }

    const currentCalls = (existingCalls || []).map(c => c.number);
    const allCalls = [...currentCalls, number];
    const nextSeq = (existingCalls && existingCalls.length > 0 ? Math.max(...existingCalls.map(c => c.sequence)) : 0) + 1;

    // 7. Calculate lines & win condition
    const callerBoard = player.board as number[];
    const opponentBoard = opponent?.board as number[] | null;

    const callerResult = calculateLines(callerBoard, allCalls, config.boardSize);
    const oppResult = opponentBoard ? calculateLines(opponentBoard, allCalls, config.boardSize) : { lines: 0, completedLines: [] };

    const callerLines = callerResult.lines;
    const oppLines = oppResult.lines;

    let winnerId: string | null = null;
    let isGameOver = false;

    if (callerLines >= config.targetLines) {
      winnerId = player.id;
      isGameOver = true;
    } else if (oppLines >= config.targetLines) {
      winnerId = opponent?.id || null;
      isGameOver = true;
    }

    const nextTurnId = isGameOver ? null : (opponent?.id || player.id);

    // 8. Try inserting into called_numbers
    try {
      await supabase.from('called_numbers').insert({
        game_id: gameId,
        called_by: player.id,
        number,
        sequence: nextSeq,
      });
    } catch (insertErr) {
      console.warn('[API /api/game/call] called_numbers table insert notice (possible legacy constraint):', insertErr);
    }

    // 9. Update game state
    await supabase
      .from('games')
      .update({
        status: isGameOver ? 'completed' : 'playing',
        current_turn_player_id: nextTurnId,
        winner_id: winnerId,
      })
      .eq('id', gameId);

    return NextResponse.json({
      success: true,
      number,
      sequence: nextSeq,
      called_by: player.id,
      next_turn_player_id: nextTurnId,
      winner_id: winnerId,
      is_game_over: isGameOver,
      p1_lines: player.player_number === 1 ? callerLines : oppLines,
      p2_lines: player.player_number === 2 ? callerLines : oppLines,
      caller_lines: callerLines,
      opponent_lines: oppLines,
      all_called_count: allCalls.length,
      target_lines: config.targetLines,
      board_size: config.boardSize,
    });
  } catch (err: unknown) {
    console.error('[API /api/game/call] Error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to call number' },
      { status: 500 }
    );
  }
}
