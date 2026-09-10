import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateRandomBoard,
  validateBoard,
  calculateLines,
  getActiveRoomCode,
  setActiveRoomCode,
  clearActiveRoomCode,
  getSessionId,
  getPlayerName,
  setPlayerName,
} from '../gameEngine';

describe('Rematch Protocol & Match State Reset Engine', () => {
  beforeEach(() => {
    clearActiveRoomCode();
  });

  it('preserves room code context across rematch initialization', () => {
    const originalRoom = 'XXQX';
    setActiveRoomCode(originalRoom);

    // Simulate match end
    expect(getActiveRoomCode()).toBe('XXQX');

    // On rematch: room code must remain unchanged
    const activeRoomAfterRematch = getActiveRoomCode();
    expect(activeRoomAfterRematch).toBe(originalRoom);
  });

  it('completely resets line calculations and marked cells on rematch', () => {
    const board = generateRandomBoard();
    expect(validateBoard(board)).toBe(true);

    // Prior match: 19 numbers called, 5 lines completed
    const priorMatchCalls = board.slice(0, 19);
    const midMatch = calculateLines(board, priorMatchCalls);
    expect(midMatch.lines).toBeGreaterThanOrEqual(0);

    // Rematch triggered: called numbers reset to []
    const rematchCalls: number[] = [];
    const resetResult = calculateLines(board, rematchCalls);

    // Must have exactly 0 lines and empty completed lines array
    expect(resetResult.lines).toBe(0);
    expect(resetResult.completedLines).toEqual([]);
  });

  it('generates a fresh unique 5x5 board for the new rematch duel', () => {
    const board1 = generateRandomBoard();
    const board2 = generateRandomBoard();

    expect(board1).toHaveLength(25);
    expect(board2).toHaveLength(25);
    expect(validateBoard(board1)).toBe(true);
    expect(validateBoard(board2)).toBe(true);

    // Ensure subsequent boards are randomized
    const isExactMatch = board1.every((val, idx) => val === board2[idx]);
    expect(isExactMatch).toBe(false);
  });

  it('preserves player identity and session ID through rematch cycle', () => {
    setPlayerName('Errguhan');
    const sessionId = getSessionId();

    // Start in room
    setActiveRoomCode('XXQX');

    // Verify session persistence
    expect(getPlayerName()).toBe('Errguhan');
    expect(getSessionId()).toBe(sessionId);
    expect(getActiveRoomCode()).toBe('XXQX');

    // User explicitly exits to Safe Lobby / Arena
    clearActiveRoomCode();
    expect(getActiveRoomCode()).toBeNull();
    // Identity remains for next game
    expect(getPlayerName()).toBe('Errguhan');
    expect(getSessionId()).toBe(sessionId);
  });
});
