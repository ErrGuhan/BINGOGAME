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

describe('Game Engine - 10x10 Mega Mode', () => {
  const megaBoard = Array.from({ length: 100 }, (_, i) => i + 1);

  it('generates a valid 10x10 board with numbers 1 to 100 without duplicates', () => {
    const board = generateRandomBoard(10);
    expect(board).toHaveLength(100);
    expect(validateBoard(board, 10)).toBe(true);

    const uniqueSet = new Set(board);
    expect(uniqueSet.size).toBe(100);
    for (let i = 1; i <= 100; i++) {
      expect(uniqueSet.has(i)).toBe(true);
    }
  });

  it('detects a completed horizontal row on 10x10 board', () => {
    // Row 1: 1..10
    const called = Array.from({ length: 10 }, (_, i) => i + 1);
    const result = calculateLines(megaBoard, called);
    expect(result.lines).toBe(1);
    expect(result.completedLines).toEqual([[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]]);
  });

  it('detects completed diagonals on 10x10 board', () => {
    // D1 indices: 0, 11, 22, 33, 44, 55, 66, 77, 88, 99
    // Since board is 1..100, values are index + 1
    const d1Indices = [0, 11, 22, 33, 44, 55, 66, 77, 88, 99];
    const called = d1Indices.map(idx => idx + 1);
    const result = calculateLines(megaBoard, called);
    expect(result.lines).toBe(1);
    expect(result.completedLines).toEqual([d1Indices]);
  });

  it('detects exactly 22 total lines on a completely filled 10x10 board', () => {
    const allCalled = Array.from({ length: 100 }, (_, i) => i + 1);
    const result = calculateLines(megaBoard, allCalled);
    expect(result.lines).toBe(22); // 10 rows + 10 cols + 2 diagonals
    expect(result.completedLines).toHaveLength(22);
  });

  it('counts each completed line as exactly one strike (no double-counting)', () => {
    // Complete row 1 (1-10): exactly 1 strike
    const row1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(calculateLines(megaBoard, row1).lines).toBe(1);

    // Complete col 1 (1, 11, 21, 31, 41, 51, 61, 71, 81, 91): +1 strike = 2 total
    const row1PlusCol1 = [...row1, 11, 21, 31, 41, 51, 61, 71, 81, 91];
    expect(calculateLines(megaBoard, row1PlusCol1).lines).toBe(2);

    // Main diagonal (1, 12, 23, 34, 45, 56, 67, 78, 89, 100): col 1 + row 1 already have
    // overlapping cells at index 0 (value 1) — should still count as separate strikes
    const withDiag = [...row1PlusCol1, 12, 23, 34, 45, 56, 67, 78, 89, 100];
    expect(calculateLines(megaBoard, withDiag).lines).toBe(3);
  });

  it('win triggers at >= 10 strikes (verified at 9 → no-win, 10+ → win)', () => {
    const WIN_THRESHOLD = 10;

    // Calling rows 1..9 on the identity megaBoard (1..100) = exactly 9 row-strikes.
    // No column can complete with only 90 of 100 numbers called.
    const nineRowsCalled: number[] = [];
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 10; col++) {
        nineRowsCalled.push(row * 10 + col + 1);
      }
    }
    const nineResult = calculateLines(megaBoard, nineRowsCalled);
    expect(nineResult.lines).toBe(9);
    // Win condition >= 10 is FALSE at 9 strikes → no win
    expect(nineResult.lines >= WIN_THRESHOLD).toBe(false);

    // Complete all 10 rows (calling 91..100 as well = all 100 numbers).
    // On the identity board this also finishes all columns + diagonals = 22 lines total.
    // The engine uses >= WIN_THRESHOLD for win detection, so 22 >= 10 = win.
    const allCalled = Array.from({ length: 100 }, (_, i) => i + 1);
    const winResult = calculateLines(megaBoard, allCalled);
    expect(winResult.lines).toBeGreaterThanOrEqual(WIN_THRESHOLD); // win fires
    expect(winResult.lines >= WIN_THRESHOLD).toBe(true);
  });

  it('does not fire win at 9 strikes on a shuffled 10x10 board', () => {
    const WIN_THRESHOLD = 10;
    // Use a shuffled board, mark 9 full rows — should never fire win
    const shuffled = generateRandomBoard(10);
    const firstNineRows = shuffled.slice(0, 90);
    const result = calculateLines(shuffled, firstNineRows);
    // Must have at least 9 lines (rows 1-9 all complete, columns won't be complete)
    // The exact count depends on shuffle, but guarantee < 10 strikes from row 9
    expect(result.lines).toBeLessThan(WIN_THRESHOLD);
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
