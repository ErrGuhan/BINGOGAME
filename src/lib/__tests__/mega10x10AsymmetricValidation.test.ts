import { describe, it, expect } from 'vitest';
import { resolveGameVariant, validateBoardForVariant } from '../variantResolver';
import { generateRandomBoard, calculateLines, getLineIndices } from '../gameEngine';

describe('Mega 10x10 Asymmetric Selection & Board Lock Resilience', () => {
  it('Scenario 1: Host selects 10x10 in lobby, Joiner arrives via Board Setup toggle — both 100/100 boards pass validation', () => {
    // 1. Host selects 10x10 in lobby (CreateGameScreen)
    const hostLobbyVariant = resolveGameVariant(null, null, 10);
    expect(hostLobbyVariant.boardSize).toBe(10);
    expect(hostLobbyVariant.totalCells).toBe(100);

    // Host fills 100-number board
    const hostBoard = generateRandomBoard(10);
    expect(hostBoard).toHaveLength(100);

    // Host validates & locks board
    const hostConfig = resolveGameVariant({ target_lines: 10 }, hostBoard, 10);
    const hostValidation = validateBoardForVariant(hostBoard, hostConfig);
    expect(hostValidation.isValid).toBe(true);
    expect(hostValidation.error).toBeUndefined();

    // 2. Joiner reached Board Setup with initial state (e.g. before sync or after mode switch)
    // Joiner uses Board Setup Duel Mode toggle to switch to 10x10
    const joinerSetupVariant = resolveGameVariant(null, null, 10);
    expect(joinerSetupVariant.boardSize).toBe(10);

    // Joiner fills 100-number board
    const joinerBoard = generateRandomBoard(10);
    expect(joinerBoard).toHaveLength(100);

    // Joiner validates & locks board via inline derivation
    const isJoiner10 = joinerBoard.length === 100 || joinerSetupVariant.boardSize === 10;
    const joinerConfig = resolveGameVariant(null, joinerBoard, isJoiner10 ? 10 : 5);
    const joinerValidation = validateBoardForVariant(joinerBoard, joinerConfig);
    expect(joinerValidation.isValid).toBe(true);
    expect(joinerValidation.error).toBeUndefined();
  });

  it('Scenario 2 (Roles Reversed): Host starts 5x5 in lobby and switches via toggle on Board Setup; Joiner connects with 10x10 — both pass validation', () => {
    // 1. Game was created as 5x5
    const initialGame = { target_lines: 5, board_size: 5 };

    // Host switches via Board Setup toggle
    const hostSwitchedConfig = resolveGameVariant(null, null, 10);
    expect(hostSwitchedConfig.boardSize).toBe(10);

    const hostBoard = generateRandomBoard(10);
    const hostValidation = validateBoardForVariant(
      hostBoard,
      resolveGameVariant(initialGame, hostBoard, 10)
    );
    expect(hostValidation.isValid).toBe(true);

    // Joiner receives live state / sync with 100-number board
    const joinerBoard = generateRandomBoard(10);
    const is10 = joinerBoard.length === 100;
    const joinerValidation = validateBoardForVariant(
      joinerBoard,
      resolveGameVariant(initialGame, joinerBoard, is10 ? 10 : 5)
    );
    expect(joinerValidation.isValid).toBe(true);
  });

  it('verifies that inline variant computation never falls back to 25 when board has 100 numbers', () => {
    const full100Board = generateRandomBoard(10);

    // Even if game record has stale target_lines: 5 or null, 100-number board MUST resolve to 10x10
    const staleGame = { target_lines: 5, board_size: 5, variant: '5x5' };
    const inlineConfig = resolveGameVariant(staleGame, full100Board);
    expect(inlineConfig.boardSize).toBe(10);
    expect(inlineConfig.totalCells).toBe(100);
    expect(inlineConfig.maxNumber).toBe(100);

    const validation = validateBoardForVariant(full100Board, inlineConfig);
    expect(validation.isValid).toBe(true);
  });

  it('strictly validates full 10x10 rules: 22 lines total, 10 strikes to win, and header letters', () => {
    // 1. 22 possible lines (10 rows + 10 cols + 2 diagonals)
    const lines10 = getLineIndices(10);
    expect(lines10).toHaveLength(22);

    for (const line of lines10) {
      expect(line).toHaveLength(10);
    }

    // 2. Ordered 1..100 board
    const board = Array.from({ length: 100 }, (_, i) => i + 1);

    // Mark 9 rows (9 strikes): should not be game over yet
    const calls9Rows = board.slice(0, 90);
    const result9 = calculateLines(board, calls9Rows, 10);
    expect(result9.lines).toBe(9);
    expect(result9.lines >= 10).toBe(false);

    // Mark 10th row (10 strikes): win condition reached!
    const calls10Rows = board.slice(0, 100);
    const result10 = calculateLines(board, calls10Rows, 10);
    expect(result10.lines).toBeGreaterThanOrEqual(10);
    expect(result10.lines >= 10).toBe(true);

    // 3. Header letters 'BINGODUEL!' has exactly 10 characters
    const HEADERS_10 = ['B', 'I', 'N', 'G', 'O', 'D', 'U', 'E', 'L', '!'];
    expect(HEADERS_10).toHaveLength(10);

    // Strike count maps 1-to-1 with header letters
    const struckLetters = HEADERS_10.map((letter, idx) => ({
      letter,
      isStruck: idx < Math.min(result9.lines, 10),
    }));
    expect(struckLetters.filter(l => l.isStruck)).toHaveLength(9);
    expect(struckLetters[9].isStruck).toBe(false); // '!' not struck yet
  });
});
