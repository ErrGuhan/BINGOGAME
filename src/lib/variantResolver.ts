import { BoardSize, GameVariant } from '@/types/bingo';

export interface GameVariantConfig {
  boardSize: BoardSize;
  variant: GameVariant;
  targetLines: number;
  totalCells: number;
  maxNumber: number;
  lineCount: number;
  headerLetters: string[];
}

export const HEADERS_5 = ['B', 'I', 'N', 'G', 'O'] as const;
export const HEADERS_10 = ['B', 'I', 'N', 'G', 'O', 'D', 'U', 'E', 'L', '!'] as const;

/**
 * Resolves the authoritative game variant configuration from any available state source.
 * Prioritizes explicit 10x10 signals (board size 10, variant '10x10', target_lines 10, or 100-cell board).
 * Defaults safely to 5x5 Classic.
 */
export function resolveGameVariant(
  game?: {
    variant?: string | null;
    board_size?: number | null;
    target_lines?: number | null;
  } | null,
  board?: (number | null)[] | null,
  fallbackSize?: BoardSize
): GameVariantConfig {
  const is10 = Boolean(
    game?.variant === '10x10' ||
    game?.board_size === 10 ||
    game?.target_lines === 10 ||
    (board && board.length === 100) ||
    fallbackSize === 10
  );

  if (is10) {
    return {
      boardSize: 10,
      variant: '10x10',
      targetLines: 10,
      totalCells: 100,
      maxNumber: 100,
      lineCount: 22,
      headerLetters: [...HEADERS_10],
    };
  }

  return {
    boardSize: 5,
    variant: '5x5',
    targetLines: 5,
    totalCells: 25,
    maxNumber: 25,
    lineCount: 12,
    headerLetters: [...HEADERS_5],
  };
}

/**
 * Validates a board against the resolved variant rules:
 * - Exactly `totalCells` numbers
 * - Every number is an integer between 1 and `maxNumber`
 * - No duplicate numbers
 */
export function validateBoardForVariant(
  board: (number | null)[] | null | undefined,
  variantConfig: GameVariantConfig
): { isValid: boolean; error?: string } {
  if (!board) {
    return { isValid: false, error: 'Board cannot be empty' };
  }

  if (board.length !== variantConfig.totalCells) {
    return {
      isValid: false,
      error: `Board must contain exactly ${variantConfig.totalCells} numbers (received ${board.length})`,
    };
  }

  const seen = new Set<number>();
  for (let i = 0; i < board.length; i++) {
    const val = board[i];
    if (val === null || val === undefined) {
      return {
        isValid: false,
        error: `Cell ${i + 1} is empty. All ${variantConfig.totalCells} cells must be filled.`,
      };
    }
    if (!Number.isInteger(val) || val < 1 || val > variantConfig.maxNumber) {
      return {
        isValid: false,
        error: `Number ${val} is out of bounds (allowed: 1 to ${variantConfig.maxNumber})`,
      };
    }
    if (seen.has(val)) {
      return {
        isValid: false,
        error: `Duplicate number detected: ${val} appears more than once`,
      };
    }
    seen.add(val);
  }

  return { isValid: true };
}
