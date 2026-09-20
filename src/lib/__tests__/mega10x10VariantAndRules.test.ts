import { describe, it, expect } from 'vitest';
import {
  resolveGameVariant,
  validateBoardForVariant,
  HEADERS_5,
  HEADERS_10,
} from '../variantResolver';
import {
  calculateLines,
  generateLineIndices,
  generateRandomBoard,
} from '../gameEngine';
import { BoardSize } from '@/types/bingo';

describe('Mega 10x10 Variant Resolver & Board Setup Regression Tests', () => {
  it('resolves 5x5 Classic by default when game object is empty or null', () => {
    const config = resolveGameVariant(null, null);
    expect(config.boardSize).toBe(5);
    expect(config.variant).toBe('5x5');
    expect(config.targetLines).toBe(5);
    expect(config.totalCells).toBe(25);
    expect(config.maxNumber).toBe(25);
    expect(config.lineCount).toBe(12);
    expect(config.headerLetters).toEqual(['B', 'I', 'N', 'G', 'O']);
  });

  it('resolves 10x10 Mega when variant is "10x10"', () => {
    const config = resolveGameVariant({ variant: '10x10' });
    expect(config.boardSize).toBe(10);
    expect(config.variant).toBe('10x10');
    expect(config.targetLines).toBe(10);
    expect(config.totalCells).toBe(100);
    expect(config.maxNumber).toBe(100);
    expect(config.lineCount).toBe(22);
    expect(config.headerLetters).toEqual(['B', 'I', 'N', 'G', 'O', 'D', 'U', 'E', 'L', '!']);
  });

  it('resolves 10x10 Mega when board_size is 10 even if variant string is missing', () => {
    const config = resolveGameVariant({ board_size: 10 });
    expect(config.boardSize).toBe(10);
    expect(config.variant).toBe('10x10');
    expect(config.targetLines).toBe(10);
  });

  it('resolves 10x10 Mega when target_lines is 10 (unmigrated DB schema signal)', () => {
    const config = resolveGameVariant({ target_lines: 10 });
    expect(config.boardSize).toBe(10);
    expect(config.variant).toBe('10x10');
    expect(config.targetLines).toBe(10);
  });

  it('resolves 10x10 Mega when board array has 100 items', () => {
    const board100 = Array.from({ length: 100 }, (_, i) => i + 1);
    const config = resolveGameVariant(null, board100);
    expect(config.boardSize).toBe(10);
    expect(config.variant).toBe('10x10');
    expect(config.totalCells).toBe(100);
  });

  it('REGRESSION: switching Duel Mode back and forth (5x5 -> 10x10 -> 5x5 -> 10x10) stays consistent with whichever was selected LAST', () => {
    let currentMode: BoardSize = 5;

    // 1. Initial 5x5
    let config = resolveGameVariant(null, null, currentMode);
    expect(config.boardSize).toBe(5);
    expect(config.totalCells).toBe(25);

    // 2. Switch to 10x10
    currentMode = 10;
    config = resolveGameVariant(null, null, currentMode);
    expect(config.boardSize).toBe(10);
    expect(config.totalCells).toBe(100);
    expect(config.maxNumber).toBe(100);

    // 3. Switch back to 5x5
    currentMode = 5;
    config = resolveGameVariant(null, null, currentMode);
    expect(config.boardSize).toBe(5);
    expect(config.totalCells).toBe(25);

    // 4. Switch back to 10x10
    currentMode = 10;
    config = resolveGameVariant(null, null, currentMode);
    expect(config.boardSize).toBe(10);
    expect(config.totalCells).toBe(100);
    expect(config.targetLines).toBe(10);

    // Validate that a full 100-number board passes validation when 10x10 was selected last
    const full100Board = generateRandomBoard(10);
    const validation100 = validateBoardForVariant(full100Board, config);
    expect(validation100.isValid).toBe(true);
    expect(validation100.error).toBeUndefined();

    // Confirm a 25-number board is rejected when 10x10 was selected last
    const board25 = generateRandomBoard(5);
    const validation25 = validateBoardForVariant(board25, config);
    expect(validation25.isValid).toBe(false);
    expect(validation25.error).toContain('Board must contain exactly 100 numbers');
  });

  it('rejects duplicate numbers and numbers out of bounds', () => {
    const config10 = resolveGameVariant(null, null, 10);

    // Duplicate number
    const dupBoard = Array.from({ length: 100 }, (_, i) => i + 1);
    dupBoard[99] = 1; // duplicate 1
    const dupResult = validateBoardForVariant(dupBoard, config10);
    expect(dupResult.isValid).toBe(false);
    expect(dupResult.error).toContain('Duplicate number detected');

    // Number > 100
    const outOfBoundsBoard = Array.from({ length: 100 }, (_, i) => i + 1);
    outOfBoundsBoard[99] = 101;
    const outResult = validateBoardForVariant(outOfBoundsBoard, config10);
    expect(outResult.isValid).toBe(false);
    expect(outResult.error).toContain('out of bounds');

    // Null / empty cell
    const incompleteBoard: (number | null)[] = Array.from({ length: 100 }, (_, i) => i + 1);
    incompleteBoard[50] = null;
    const incompleteResult = validateBoardForVariant(incompleteBoard, config10);
    expect(incompleteResult.isValid).toBe(false);
    expect(incompleteResult.error).toContain('is empty');
  });
});

describe('Full 10x10 Mega Rules Implementation', () => {
  it('generates exactly 22 line patterns (10 rows, 10 columns, 2 diagonals)', () => {
    const lines = generateLineIndices(10);
    expect(lines).toHaveLength(22);

    // Verify 10 rows
    for (let r = 0; r < 10; r++) {
      const row = lines[r];
      expect(row).toHaveLength(10);
      expect(row[0]).toBe(r * 10);
      expect(row[9]).toBe(r * 10 + 9);
    }

    // Verify 10 columns
    for (let c = 0; c < 10; c++) {
      const col = lines[10 + c];
      expect(col).toHaveLength(10);
      expect(col[0]).toBe(c);
      expect(col[9]).toBe(90 + c);
    }

    // Verify Diagonal 1 (top-left to bottom-right)
    const d1 = lines[20];
    expect(d1).toEqual([0, 11, 22, 33, 44, 55, 66, 77, 88, 99]);

    // Verify Diagonal 2 (top-right to bottom-left)
    const d2 = lines[21];
    expect(d2).toEqual([9, 18, 27, 36, 45, 54, 63, 72, 81, 90]);
  });

  it('correctly detects a single completed strike on a 10x10 board', () => {
    // Standard ordered board 1..100
    const board = Array.from({ length: 100 }, (_, i) => i + 1);

    // Call first row numbers (1..10)
    const calledRow1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const res = calculateLines(board, calledRow1, 10);
    expect(res.lines).toBe(1);
    expect(res.completedLines).toHaveLength(1);
    expect(res.completedLines[0]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('correctly handles simultaneous multi-strike completion (e.g. crossing row and column)', () => {
    // Standard ordered board 1..100
    const board = Array.from({ length: 100 }, (_, i) => i + 1);

    // Row 5 has indices 40..49 (values 41..50)
    // Col 5 has indices 4, 14, 24, 34, 44, 54, 64, 74, 84, 94 (values 5, 15, 25, 35, 45, 55, 65, 75, 85, 95)
    // The intersection is cell 44 (value 45)

    // Call all of Row 5 and Col 5 except the intersection 45
    const callsBeforeIntersection = [
      41, 42, 43, 44, 46, 47, 48, 49, 50,
      5, 15, 25, 35, 55, 65, 75, 85, 95,
    ];

    const resBefore = calculateLines(board, callsBeforeIntersection, 10);
    expect(resBefore.lines).toBe(0);

    // Now call the intersection 45!
    const callsAfterIntersection = [...callsBeforeIntersection, 45];
    const resAfter = calculateLines(board, callsAfterIntersection, 10);

    // Both lines complete simultaneously!
    expect(resAfter.lines).toBe(2);
    expect(resAfter.completedLines).toHaveLength(2);
  });

  it('single source of truth: strike count, header letter strikes, and win trigger all agree in lockstep', () => {
    const board = Array.from({ length: 100 }, (_, i) => i + 1);
    const targetLines = 10;
    const headerLetters = [...HEADERS_10];

    // Progressively complete lines up to 10
    const calledSet: number[] = [];

    for (let r = 0; r < 9; r++) {
      // Complete row r (indices r*10 .. r*10+9, values r*10+1 .. r*10+10)
      for (let c = 0; c < 10; c++) {
        calledSet.push(r * 10 + c + 1);
      }

      const { lines, completedLines } = calculateLines(board, calledSet, 10);
      const strikeCount = lines;

      // Header letter strike animation: strikes letters idx < completedLines.length
      const struckLetterCount = headerLetters.filter((_, idx) => idx < completedLines.length).length;

      // Win trigger condition
      const isWinner = completedLines.length >= targetLines;

      // 100% agreement test
      expect(strikeCount).toBe(r + 1);
      expect(completedLines.length).toBe(r + 1);
      expect(struckLetterCount).toBe(r + 1);
      expect(isWinner).toBe(false);
    }

    // Now call cell at row 9, col 1 (number 92), which completes Column 1 as the 10th strike!
    // (Without filling rows 9, cols 2-9, so only Column 1 completes)
    calledSet.push(9 * 10 + 1 + 1); // 92
    const { lines: strikes10, completedLines: lines10 } = calculateLines(board, calledSet, 10);
    const struckLetters10 = headerLetters.filter((_, idx) => idx < lines10.length).length;
    const isWinner10 = lines10.length >= targetLines;

    expect(strikes10).toBe(10);
    expect(lines10.length).toBe(10);
    expect(struckLetters10).toBe(10);
    expect(isWinner10).toBe(true);
  });

  it('victory does not trigger at 9 strikes and triggers strictly at >= 10 strikes', () => {
    const board = Array.from({ length: 100 }, (_, i) => i + 1);
    // Complete 9 rows
    const called9Rows: number[] = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 10; c++) {
        called9Rows.push(r * 10 + c + 1);
      }
    }

    const res9 = calculateLines(board, called9Rows, 10);
    expect(res9.lines).toBe(9);
    expect(res9.lines >= 10).toBe(false);

    // Call cell at row 9, col 1 (number 92) to complete Column 1 as 10th strike
    const called10Lines = [...called9Rows, 9 * 10 + 1 + 1];
    const res10 = calculateLines(board, called10Lines, 10);
    expect(res10.lines).toBe(10);
    expect(res10.lines >= 10).toBe(true);

    // Also verify if a board fills completely (all 100 numbers), all 22 lines are detected and triggers victory
    const calledAll = Array.from({ length: 100 }, (_, i) => i + 1);
    const resAll = calculateLines(board, calledAll, 10);
    expect(resAll.lines).toBe(22);
    expect(resAll.lines >= 10).toBe(true);
  });
});
