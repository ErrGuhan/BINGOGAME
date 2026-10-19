import { describe, it, expect, beforeEach } from 'vitest';
import { OfflineGameEngine } from '../offlineGameEngine';
import { generateRandomBoard } from '../gameEngine';
import { chooseBotNumber, createBotDuelist } from '../offlineBot';

describe('OfflineGameEngine & Offline Rules Parity', () => {
  let engine: OfflineGameEngine;
  const hostSession = 'session-host-123';
  const guestSession = 'session-guest-456';

  beforeEach(() => {
    engine = new OfflineGameEngine(hostSession, 'Alice', 5, 'TEST');
  });

  it('initializes waiting game room with correct 5x5 defaults', () => {
    const raw = engine.getRawState();
    expect(raw.game.room_code).toBe('TEST');
    expect(raw.game.status).toBe('waiting');
    expect(raw.game.board_size).toBe(5);
    expect(raw.game.target_lines).toBe(5);
    expect(raw.p1.display_name).toBe('Alice');
    expect(raw.p2).toBeNull();
    expect(raw.called_numbers).toHaveLength(0);
  });

  it('allows joining guest player and transitions status to ready', () => {
    const guest = engine.join(guestSession, 'Bob');
    expect(guest.display_name).toBe('Bob');
    expect(guest.player_number).toBe(2);

    const raw = engine.getRawState();
    expect(raw.game.status).toBe('ready');
  });

  it('transitions game to playing only when BOTH players have set their boards', () => {
    engine.join(guestSession, 'Bob');

    const board1 = generateRandomBoard(5);
    const board2 = generateRandomBoard(5);

    // Host submits board
    const hostResult = engine.setBoard(hostSession, board1);
    expect(hostResult.allReady).toBe(false);
    expect(engine.getRawState().game.status).toBe('ready');

    // Guest submits board
    const guestResult = engine.setBoard(guestSession, board2);
    expect(guestResult.allReady).toBe(true);
    expect(engine.getRawState().game.status).toBe('playing');
    expect(engine.getRawState().game.current_turn_player_id).toBe(engine.getRawState().p1.id);
  });

  it('strictly enforces alternating turns and rejects duplicate calls', () => {
    engine.join(guestSession, 'Bob');
    const board1 = generateRandomBoard(5);
    const board2 = generateRandomBoard(5);
    engine.setBoard(hostSession, board1);
    engine.setBoard(guestSession, board2);

    // Turn is P1 (Host)
    const p1TurnId = engine.getRawState().p1.id;
    expect(engine.getRawState().game.current_turn_player_id).toBe(p1TurnId);

    // Guest attempts to call -> should throw error
    expect(() => engine.callNumber(guestSession, 12)).toThrow('Not your turn');

    // Host calls valid number
    const call1 = engine.callNumber(hostSession, 12);
    expect(call1.success).toBe(true);
    expect(call1.number).toBe(12);

    // Turn toggles to P2
    expect(engine.getRawState().game.current_turn_player_id).toBe(engine.getRawState().p2!.id);

    // Guest attempts duplicate call (12 again) -> should throw error
    expect(() => engine.callNumber(guestSession, 12)).toThrow('already been called');

    // Guest calls fresh number -> succeeds and toggles back
    const call2 = engine.callNumber(guestSession, 7);
    expect(call2.success).toBe(true);
    expect(engine.getRawState().game.current_turn_player_id).toBe(p1TurnId);
  });

  it('detects 5-line win and marks game as completed', () => {
    engine.join(guestSession, 'Bob');

    // Deterministic board for P1: 1..25 in order
    const fixedBoard1 = Array.from({ length: 25 }, (_, i) => i + 1);
    const fixedBoard2 = Array.from({ length: 25 }, (_, i) => 25 - i); // reversed

    engine.setBoard(hostSession, fixedBoard1);
    engine.setBoard(guestSession, fixedBoard2);

    // In fixedBoard1, rows are:
    // Row 0: 1, 2, 3, 4, 5
    // Row 1: 6, 7, 8, 9, 10
    // Row 2: 11, 12, 13, 14, 15
    // Row 3: 16, 17, 18, 19, 20
    // Row 4: 21, 22, 23, 24, 25
    // Calling rows 0, 1, 2, 3, 4 will give 5 horizontal lines -> Win!

    // We take turns calling:
    // Turn 1 (P1): 1
    // Turn 2 (P2): 25
    // etc.
    const p1Nums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
    let p1Idx = 0;
    let otherNum = 25;

    while (engine.getRawState().game.status === 'playing') {
      const currentTurn = engine.getRawState().game.current_turn_player_id;
      if (currentTurn === engine.getRawState().p1.id) {
        const numToCall = p1Nums[p1Idx++];
        engine.callNumber(hostSession, numToCall);
      } else {
        engine.callNumber(guestSession, otherNum--);
      }
    }

    const state = engine.getRawState();
    expect(state.game.status).toBe('completed');
    expect(state.game.winner_id).toBe(state.p1.id);
    expect(state.p1.lines_completed).toBeGreaterThanOrEqual(5);
  });

  it('supports 10x10 mode and requires 10 lines to win', () => {
    const engine10 = new OfflineGameEngine(hostSession, 'Alice', 10, 'MEGA');
    expect(engine10.getRawState().game.board_size).toBe(10);
    expect(engine10.getRawState().game.target_lines).toBe(10);
  });

  it('cleanly resets match telemetry on rematch', () => {
    engine.join(guestSession, 'Bob');
    engine.setBoard(hostSession, generateRandomBoard(5));
    engine.setBoard(guestSession, generateRandomBoard(5));
    engine.callNumber(hostSession, 5);

    expect(engine.getRawState().called_numbers).toHaveLength(1);

    engine.resetForRematch();

    const state = engine.getRawState();
    expect(state.game.status).toBe('ready');
    expect(state.called_numbers).toHaveLength(0);
    expect(state.p1.board).toBeNull();
    expect(state.p1.is_ready).toBe(false);
    expect(state.p2?.board).toBeNull();
    expect(state.p2?.is_ready).toBe(false);
  });

  it('emits typed events for stateChange, turnChanged, numberCalled, and gameCompleted', () => {
    const events: string[] = [];
    engine.on('stateChange', () => events.push('stateChange'));
    engine.on('turnChanged', (e) => events.push(`turnChanged:${e.currentTurnPlayerId}`));
    engine.on('numberCalled', (e) => events.push(`numberCalled:${e.number}`));
    engine.on('gameCompleted', (e) => events.push(`gameCompleted:${e.winnerId}`));

    engine.join(guestSession, 'Bob');
    const board1 = Array.from({ length: 25 }, (_, i) => i + 1);
    const board2 = Array.from({ length: 25 }, (_, i) => i + 1);

    engine.setBoard(hostSession, board1);
    engine.setBoard(guestSession, board2);

    expect(events).toContain('stateChange');
    expect(events.some(e => e.startsWith('turnChanged:'))).toBe(true);

    engine.callNumber(hostSession, 1);
    expect(events).toContain('numberCalled:1');
  });

  it('guarantees caller priority win resolution if both duelists complete lines on the same call', () => {
    engine.join(guestSession, 'Bob');

    // Deterministic boards designed so:
    // Calling numbers [1, 2, 3, 4] gives 0 lines
    // Calling [6, 7, 8, 9, 10] gives Line 1 for both
    // Calling [11, 12, 13, 14, 15] gives Line 2 for both
    // Calling [16, 17, 18, 19, 20] gives Line 3 for both
    // Calling [21, 22, 23, 24] gives 0 lines (needs 25 for row 4)
    // Here: Col 0: 1, 6, 11, 16, 21 -> 5 numbers! (Line 4)
    // To keep it strictly at 4 lines before the final call:
    // Let's use board1 and board2:
    // Board 1: 1..25 in order
    // Board 2: 1..25 in order
    // We want lines completed to be 4 for both, and the 5th line completed by a single shared number.
    const b1 = [
      1,  2,  3,  4,  5,
      6,  7,  8,  9,  10,
      11, 12, 13, 14, 15,
      16, 17, 18, 19, 20,
      21, 22, 23, 24, 25,
    ];
    // By calling:
    // Rows 1, 2, 3 complete:
    // [6, 7, 8, 9, 10], [11, 12, 13, 14, 15], [16, 17, 18, 19, 20] = 3 rows
    // Main diagonal: [1, 7, 13, 19, 25] -> if 1 and 25 are called, that's Line 4!
    // Row 0 has [1, 2, 3, 4] called (missing 5)
    // Calling 5 will complete Row 0 (Line 5) for BOTH players!
    // Let's verify columns with calls:
    // Rows 1, 2, 3 = 15 numbers (6..20)
    // Plus 1, 25 -> Diagonal 1, 7, 13, 19, 25 is complete (Line 4)
    // Plus 2, 3, 4 -> Row 0 now has 1, 2, 3, 4. Missing only 5!
    // Check columns:
    // Col 0: 1, 6, 11, 16, 21 (21 is uncalled -> Col 0 not complete)
    // Col 1: 2, 7, 12, 17, 22 (22 is uncalled -> Col 1 not complete)
    // Col 2: 3, 8, 13, 18, 23 (23 is uncalled -> Col 2 not complete)
    // Col 3: 4, 9, 14, 19, 24 (24 is uncalled -> Col 3 not complete)
    // Col 4: 5, 10, 15, 20, 25 (5 is uncalled -> Col 4 not complete)
    // Anti-diagonal: 5, 9, 13, 17, 21 (5 and 21 are uncalled -> not complete)
    // Total lines complete right now: EXACTLY 4 (Rows 1, 2, 3 and Main Diagonal)!
    // Calling 5 completes Row 0 AND Col 4 AND Anti-diagonal! Total lines jumps to 7!
    
    engine.setBoard(hostSession, b1);
    engine.setBoard(guestSession, b1);

    const callsBeforeWin = [
      6, 7, 8, 9, 10,
      11, 12, 13, 14, 15,
      16, 17, 18, 19, 20,
      1, 25, 2, 3, 4
    ];

    for (const num of callsBeforeWin) {
      const turn = engine.getRawState().game.current_turn_player_id;
      const s = turn === engine.getRawState().p1.id ? hostSession : guestSession;
      engine.callNumber(s, num);
    }

    // Both players have exactly 4 lines right now:
    const p1Lines = engine.getSnapshotForSession(hostSession).p1_lines;
    const p2Lines = engine.getSnapshotForSession(hostSession).p2_lines;
    expect(p1Lines).toBe(4);
    expect(p2Lines).toBe(4);
    expect(engine.getRawState().game.status).toBe('playing');

    // Turn is currently whoever's turn it is:
    const callerTurnId = engine.getRawState().game.current_turn_player_id;
    const callerSession = callerTurnId === engine.getRawState().p1.id ? hostSession : guestSession;

    // Caller calls 5 -> completes 5+ lines for BOTH players simultaneously!
    const finalCall = engine.callNumber(callerSession, 5);
    expect(finalCall.is_game_over).toBe(true);
    // Crucial rule parity: Winner MUST be the caller who initiated the winning call!
    expect(finalCall.winner_id).toBe(callerTurnId);
    expect(engine.getRawState().game.winner_id).toBe(callerTurnId);
  });

  it('handles complete rematch lifecycle transitions', () => {
    engine.join(guestSession, 'Bob');
    let rematchEvents: string[] = [];
    engine.on('rematchStatusChanged', (e) => rematchEvents.push(`${e.status}:${e.requesterId}`));

    // Guest requests rematch
    engine.requestRematch(guestSession);
    expect(engine.getRawState().rematch_status).toBe('requesting');
    expect(engine.getRawState().rematch_requester_id).toBe(engine.getRawState().p2!.id);

    // Host accepts rematch
    engine.acceptRematch(hostSession);
    expect(engine.getRawState().rematch_status).toBe('accepted');

    // Engine resets
    engine.resetForRematch();
    expect(engine.getRawState().rematch_status).toBe('idle');
    expect(engine.getRawState().game.status).toBe('ready');

    expect(rematchEvents).toContain(`requesting:${engine.getRawState().p2!.id}`);
    expect(rematchEvents).toContain(`accepted:${engine.getRawState().p2!.id}`);
    expect(rematchEvents).toContain('idle:null');
  });

  it('serializes and restores engine state perfectly', () => {
    engine.join(guestSession, 'Bob');
    engine.setBoard(hostSession, Array.from({ length: 25 }, (_, i) => i + 1));
    engine.setBoard(guestSession, Array.from({ length: 25 }, (_, i) => 25 - i));
    engine.callNumber(hostSession, 17);

    const json = engine.serialize();
    const restored = OfflineGameEngine.deserialize(json);

    expect(restored.getRawState().game.room_code).toBe(engine.getRawState().game.room_code);
    expect(restored.getRawState().called_numbers).toHaveLength(1);
    expect(restored.getRawState().called_numbers[0].number).toBe(17);
    expect(restored.getRawState().p1.display_name).toBe('Alice');
    expect(restored.getRawState().p2?.display_name).toBe('Bob');
    expect(restored.getRawState().game.current_turn_player_id).toBe(engine.getRawState().game.current_turn_player_id);
  });
});

describe('OfflineBot AI Engine', () => {
  it('creates valid bot duelist with valid board', () => {
    const bot = createBotDuelist(5);
    expect(bot.board).toHaveLength(25);
    expect(bot.displayName).toContain('CyberDuelist');
  });

  it('picks uncalled numbers and prioritizes winning lines', () => {
    const board = Array.from({ length: 25 }, (_, i) => i + 1);
    // Almost complete row 1: 1, 2, 3, 4 are called, 5 is uncalled
    const called = [1, 2, 3, 4];
    const picked = chooseBotNumber(board, called, 5);
    // Should prioritize 5 to complete row 1!
    expect(picked).toBe(5);
  });
});
