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
