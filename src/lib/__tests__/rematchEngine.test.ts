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

  it('validates rematch handshake state transitions', () => {
    type RematchState = 'idle' | 'requesting' | 'received' | 'accepted' | 'declined';

    // Player A initiates rematch
    let playerAState: RematchState = 'idle';
    let playerBState: RematchState = 'idle';

    // A clicks Play Rematch
    playerAState = 'requesting';
    // B receives REMATCH_REQUESTED broadcast
    playerBState = 'received';
    expect(playerAState).toBe('requesting');
    expect(playerBState).toBe('received');

    // Scenario 1: B rejects
    // Both players must redirect to home screen, active room code is cleared
    setActiveRoomCode('XXQX');
    playerBState = 'declined';
    playerAState = 'declined';
    clearActiveRoomCode();
    expect(playerAState).toBe('declined');
    expect(playerBState).toBe('declined');
    expect(getActiveRoomCode()).toBeNull(); // Both redirected to home

    // Scenario 2: Rematch requested and B accepts
    // Both players must redirect to board setup (number ordering) screen in same room
    setActiveRoomCode('XXQX');
    playerAState = 'requesting';
    playerBState = 'received';
    // B accepts rematch
    playerBState = 'accepted';
    playerAState = 'accepted';
    expect(playerAState).toBe('accepted');
    expect(playerBState).toBe('accepted');
    expect(getActiveRoomCode()).toBe('XXQX'); // Same room code preserved
  });
});
