import { describe, it, expect } from 'vitest';
import {
  generateRandomBoard,
  calculateLines,
} from '../gameEngine';
import {
  resolveGameVariant,
  validateBoardForVariant,
  HEADERS_10,
} from '../variantResolver';
import { Game, Player } from '@/types/bingo';

describe('Mega 10x10 Full Match Integration & Rules Lifecycle', () => {
  it('simulates a complete 10x10 match: mode toggle, board validation, turn alternation, and 10-strike victory', () => {
    // 1. Host creates game in 5x5 mode
    let game: Game = {
      id: 'game-mega-test-01',
      room_code: 'MEGA',
      status: 'waiting',
      variant: '5x5',
      board_size: 5,
      target_lines: 5,
      current_turn_player_id: null,
      winner_id: null,
      created_at: new Date().toISOString(),
    };

    let p1: Player = {
      id: 'p1-uuid',
      session_id: 'host-sess-1',
      player_number: 1,
      display_name: 'AlphaHost',
      board: null,
      is_ready: false,
      connected: true,
    };

    // 2. Mode toggling regression: 5x5 -> 10x10 -> 5x5 -> 10x10 on Board Setup
    const toggleSequence = [10, 5, 10, 5, 10] as const;
    for (const targetSize of toggleSequence) {
      const is10 = targetSize === 10;
      game = {
        ...game,
        board_size: targetSize,
        variant: is10 ? '10x10' : '5x5',
        target_lines: is10 ? 10 : 5,
      };
      // Switching mode resets player readiness so boards must be re-locked
      p1 = { ...p1, is_ready: false, board: null };
    }

    const currentConfig = resolveGameVariant(game);
    expect(currentConfig.boardSize).toBe(10);
    expect(currentConfig.totalCells).toBe(100);
    expect(currentConfig.maxNumber).toBe(100);
    expect(currentConfig.targetLines).toBe(10);

    // 3. Guest joins
    let p2: Player = {
      id: 'p2-uuid',
      session_id: 'guest-sess-2',
      player_number: 2,
      display_name: 'BravoRival',
      board: null,
      is_ready: false,
      connected: true,
    };

    // 4. Board Setup & Lock:
    // Verify a 25-number board is rejected with the exact error that was previously thrown
    const bad25Board = Array.from({ length: 25 }, (_, i) => i + 1);
    const bad25Validation = validateBoardForVariant(bad25Board, currentConfig);
    expect(bad25Validation.isValid).toBe(false);
    expect(bad25Validation.error).toContain('Board must contain exactly 100 numbers');

    // Both players generate valid 100-number boards (1..100 unique)
    const p1Board = generateRandomBoard(10);
    const p2Board = generateRandomBoard(10);

    const p1Validation = validateBoardForVariant(p1Board, currentConfig);
    const p2Validation = validateBoardForVariant(p2Board, currentConfig);
    expect(p1Validation.isValid).toBe(true);
    expect(p2Validation.isValid).toBe(true);

    // P1 locks board
    p1 = { ...p1, board: p1Board, is_ready: true };
    // Game still waiting for P2
    expect(p1.is_ready && p2.is_ready).toBe(false);

    // P2 locks board
    p2 = { ...p2, board: p2Board, is_ready: true };
    const allReady = p1.is_ready && p2.is_ready;
    expect(allReady).toBe(true);

    // Match starts: status becomes 'playing' and P1 starts
    game = {
      ...game,
      status: 'playing',
      current_turn_player_id: p1.id,
    };
    expect(game.status).toBe('playing');
    expect(game.current_turn_player_id).toBe(p1.id);

    // 5. Turn Alternation & Server Validation Simulation
    const calledNumbers: number[] = [];
    const callNumber = (callerId: string, num: number) => {
      // Rule 1: Must be caller's turn
      if (game.current_turn_player_id !== callerId) {
        throw new Error('Not your turn');
      }
      // Rule 2: Must be within 1..100
      if (num < 1 || num > 100) {
        throw new Error('Called number must be between 1 and 100');
      }
      // Rule 3: No duplicate calls
      if (calledNumbers.includes(num)) {
        throw new Error(`Number ${num} has already been called`);
      }

      calledNumbers.push(num);

      // Evaluate win condition on both boards
      const p1Lines = calculateLines(p1.board!, calledNumbers, 10);
      const p2Lines = calculateLines(p2.board!, calledNumbers, 10);

      let winner: string | null = null;
      if (p1Lines.lines >= currentConfig.targetLines) {
        winner = p1.id;
      } else if (p2Lines.lines >= currentConfig.targetLines) {
        winner = p2.id;
      }

      if (winner) {
        game = {
          ...game,
          status: 'completed',
          winner_id: winner,
        };
      } else {
        // Alternate turns
        game = {
          ...game,
          current_turn_player_id: callerId === p1.id ? p2.id : p1.id,
        };
      }

      return { p1Lines, p2Lines, winner };
    };

    // Test out-of-turn rejection
    expect(() => callNumber(p2.id, 50)).toThrow('Not your turn');

    // Test out-of-bounds rejection
    expect(() => callNumber(p1.id, 101)).toThrow('Called number must be between 1 and 100');
    expect(() => callNumber(p1.id, 0)).toThrow('Called number must be between 1 and 100');

    // P1 calls first valid number
    callNumber(p1.id, 42);
    expect(calledNumbers).toEqual([42]);
    expect(game.current_turn_player_id).toBe(p2.id);

    // Test duplicate call rejection by P2
    expect(() => callNumber(p2.id, 42)).toThrow('Number 42 has already been called');

    // P2 calls valid number
    callNumber(p2.id, 77);
    expect(calledNumbers).toEqual([42, 77]);
    expect(game.current_turn_player_id).toBe(p1.id);

    // 6. Progressive Strike Completion up to exactly 10 strikes on P1's board
    // P1 board: 1..100 (row 9 has numbers 91..100)
    p1.board = Array.from({ length: 100 }, (_, i) => i + 1);
    // P2 board: 100..1 (row 0 has numbers 100..91)
    p2.board = Array.from({ length: 100 }, (_, i) => 100 - i);
    // Reset called numbers for deterministic strike progression
    calledNumbers.length = 0;

    // Complete rows 0 to 8 (9 rows = 9 strikes)
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 10; c++) {
        const val = r * 10 + c + 1;
        // Alternate turns between P1 and P2
        const currentTurnPlayer = game.current_turn_player_id!;
        callNumber(currentTurnPlayer, val);
      }

      const p1Res = calculateLines(p1.board, calledNumbers, 10);
      expect(p1Res.lines).toBe(r + 1);

      // Check lockstep agreement:
      // Strike counter: "X / 10 Strikes"
      const strikeDisplay = `${p1Res.lines} / ${currentConfig.targetLines} Strikes`;
      expect(strikeDisplay).toBe(`${r + 1} / 10 Strikes`);

      // Header letter strike animation ("BINGODUEL!")
      const struckLetters = HEADERS_10.filter((_, idx) => idx < p1Res.completedLines.length);
      expect(struckLetters.length).toBe(r + 1);

      // Win check
      const hasWon = p1Res.lines >= currentConfig.targetLines;
      expect(hasWon).toBe(false);
      expect(game.status).toBe('playing');
    }

    // Now P1 has 9 strikes. Call cell (9, 1) (value 92) to complete Column 1 as the 10th strike!
    const turnPlayer = game.current_turn_player_id!;
    const finalResult = callNumber(turnPlayer, 92);

    expect(finalResult.p1Lines.lines).toBe(10);
    expect(finalResult.p1Lines.completedLines).toHaveLength(10);

    // Header animation: all 10 letters of "BINGODUEL!" struck
    const finalStruckLetters = HEADERS_10.filter((_, idx) => idx < finalResult.p1Lines.completedLines.length);
    expect(finalStruckLetters.length).toBe(10);
    expect(finalStruckLetters.join('')).toBe('BINGODUEL!');

    // Win condition check: game completed with P1 as winner
    expect(game.status).toBe('completed');
    expect(game.winner_id).toBe(p1.id);
  });
});
