import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateRandomBoard,
  validateBoard,
  calculateLines,
  LINE_INDICES,
  getActiveRoomCode,
  setActiveRoomCode,
  clearActiveRoomCode,
  getSessionId,
  getPlayerName,
  setPlayerName,
} from '../gameEngine';

describe('Game Engine - Board Generation & Validation', () => {
  it('generates a valid 5x5 board with numbers 1 to 25 without duplicates', () => {
    const board = generateRandomBoard();
    expect(board).toHaveLength(25);
    expect(validateBoard(board)).toBe(true);

    const uniqueSet = new Set(board);
    expect(uniqueSet.size).toBe(25);
    for (let i = 1; i <= 25; i++) {
      expect(uniqueSet.has(i)).toBe(true);
    }
  });

  it('rejects invalid boards', () => {
    // Too short
    expect(validateBoard([1, 2, 3])).toBe(false);

    // Duplicate numbers
    const duplicates = Array(25).fill(1);
    expect(validateBoard(duplicates)).toBe(false);

    // Contains out of range numbers
    const outOfRange = Array.from({ length: 25 }, (_, i) => i + 2); // 2..26
    expect(validateBoard(outOfRange)).toBe(false);

    // Contains nulls
    const withNull = Array.from({ length: 25 }, (_, i) => i + 1);
    // @ts-expect-error testing invalid type
    withNull[0] = null;
    expect(validateBoard(withNull)).toBe(false);
  });
});

describe('Game Engine - Line Calculation Algorithm', () => {
  // Ordered standard 1..25 board
  // 1  2  3  4  5
  // 6  7  8  9  10
  // 11 12 13 14 15
  // 16 17 18 19 20
  // 21 22 23 24 25
  const standardBoard = Array.from({ length: 25 }, (_, i) => i + 1);

  it('returns 0 lines when no numbers are called', () => {
    const result = calculateLines(standardBoard, []);
    expect(result.lines).toBe(0);
    expect(result.completedLines).toEqual([]);
  });

  it('detects a completed horizontal row', () => {
    // First row: 1, 2, 3, 4, 5
    const called = [1, 2, 3, 4, 5];
    const result = calculateLines(standardBoard, called);
    expect(result.lines).toBe(1);
    expect(result.completedLines).toEqual([[0, 1, 2, 3, 4]]);
  });

  it('detects a completed vertical column', () => {
    // First column: 1, 6, 11, 16, 21
    const called = [1, 6, 11, 16, 21];
    const result = calculateLines(standardBoard, called);
    expect(result.lines).toBe(1);
    expect(result.completedLines).toEqual([[0, 5, 10, 15, 20]]);
  });

  it('detects main diagonal (top-left to bottom-right)', () => {
    // Indices: 0, 6, 12, 18, 24 -> values: 1, 7, 13, 19, 25
    const called = [1, 7, 13, 19, 25];
    const result = calculateLines(standardBoard, called);
    expect(result.lines).toBe(1);
    expect(result.completedLines).toEqual([[0, 6, 12, 18, 24]]);
  });

  it('detects anti-diagonal (top-right to bottom-left)', () => {
    // Indices: 4, 8, 12, 16, 20 -> values: 5, 9, 13, 17, 21
    const called = [5, 9, 13, 17, 21];
    const result = calculateLines(standardBoard, called);
    expect(result.lines).toBe(1);
    expect(result.completedLines).toEqual([[4, 8, 12, 16, 20]]);
  });

  it('detects multiple intersecting lines simultaneously', () => {
    // Row 3 (11..15) + Column 3 (3, 8, 13, 18, 23)
    const called = [11, 12, 13, 14, 15, 3, 8, 18, 23];
    const result = calculateLines(standardBoard, called);
    expect(result.lines).toBe(2);
  });

  it('detects exactly 12 total lines for a completely full board', () => {
    const fullCalled = Array.from({ length: 25 }, (_, i) => i + 1);
    const result = calculateLines(standardBoard, fullCalled);
    expect(result.lines).toBe(12);
    expect(result.completedLines).toHaveLength(12);
    expect(result.completedLines).toEqual(LINE_INDICES);
  });

  it('does not register incomplete lines with 4 out of 5 cells', () => {
    const almostRow = [1, 2, 3, 4]; // missing 5
    const result = calculateLines(standardBoard, almostRow);
    expect(result.lines).toBe(0);
  });
});

describe('Game Engine - Session & Room Storage', () => {
  beforeEach(() => {
    clearActiveRoomCode();
  });

  it('persists and clears active room code in uppercase', () => {
    setActiveRoomCode('a1b2');
    expect(getActiveRoomCode()).toBe('A1B2');

    clearActiveRoomCode();
    expect(getActiveRoomCode()).toBeNull();
  });

  it('persists and retrieves player name', () => {
    setPlayerName('CyberDuelist');
    expect(getPlayerName()).toBe('CyberDuelist');
  });

  it('generates consistent session id for the user', () => {
    const id1 = getSessionId();
    const id2 = getSessionId();
    expect(id1).toBeTruthy();
    expect(id1).toBe(id2);
  });
});
