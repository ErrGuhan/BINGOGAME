/**
 * Generates winning line coordinate index sets for an N x N grid:
 * - N horizontal rows
 * - N vertical columns
 * - 2 diagonals (top-left to bottom-right, top-right to bottom-left)
 * Total lines = 2N + 2 (12 for 5x5, 22 for 10x10)
 */
export function generateLineIndices(size: number): number[][] {
  const lines: number[][] = [];

  // N Rows
  for (let r = 0; r < size; r++) {
    const row: number[] = [];
    for (let c = 0; c < size; c++) {
      row.push(r * size + c);
    }
    lines.push(row);
  }

  // N Columns
  for (let c = 0; c < size; c++) {
    const col: number[] = [];
    for (let r = 0; r < size; r++) {
      col.push(r * size + c);
    }
    lines.push(col);
  }

  // Diagonal 1 (top-left to bottom-right)
  const d1: number[] = [];
  for (let i = 0; i < size; i++) {
    d1.push(i * size + i);
  }
  lines.push(d1);

  // Diagonal 2 (top-right to bottom-left)
  const d2: number[] = [];
  for (let i = 0; i < size; i++) {
    d2.push(i * size + (size - 1 - i));
  }
  lines.push(d2);

  return lines;
}

// Precomputed line index sets
export const LINE_INDICES_5: number[][] = generateLineIndices(5);
export const LINE_INDICES_10: number[][] = generateLineIndices(10);

// Backwards-compatible export for 5x5
export const LINE_INDICES: number[][] = LINE_INDICES_5;

/**
 * Returns precomputed line indices for a given board dimension
 */
export function getLineIndices(size: number = 5): number[][] {
  if (size === 10) return LINE_INDICES_10;
  return LINE_INDICES_5;
}

/**
 * Calculates completed lines and returns winning line index combinations
 * Automatically detects whether board is 5x5 (25 cells) or 10x10 (100 cells)
 */
export function calculateLines(
  board: number[],
  calledNumbers: number[],
  explicitSize?: number
): {
  lines: number;
  completedLines: number[][];
} {
  if (!board || board.length === 0) {
    return { lines: 0, completedLines: [] };
  }

  const size = explicitSize || (board.length === 100 ? 10 : 5);
  const expectedLength = size * size;
  if (board.length !== expectedLength) {
    return { lines: 0, completedLines: [] };
  }

  const calledSet = new Set(calledNumbers);
  const completedLines: number[][] = [];
  const lineIndices = getLineIndices(size);

  for (const line of lineIndices) {
    const isComplete = line.every(idx => calledSet.has(board[idx]));
    if (isComplete) {
      completedLines.push(line);
    }
  }

  return {
    lines: completedLines.length,
    completedLines,
  };
}

/**
 * Generates a randomly shuffled board containing numbers 1..size^2
 * Supports 5x5 (1..25) and 10x10 (1..100)
 */
export function generateRandomBoard(size: number = 5): number[] {
  const total = size * size;
  const nums = Array.from({ length: total }, (_, i) => i + 1);
  // Fisher-Yates shuffle
  for (let i = nums.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [nums[i], nums[j]] = [nums[j], nums[i]];
  }
  return nums;
}

/**
 * Validates whether a board has exactly size^2 numbers, all 1..size^2, without duplicates
 */
export function validateBoard(board: (number | null)[], size: number = 5): boolean {
  const expectedCount = size * size;
  if (!board || board.length !== expectedCount) return false;
  if (board.some(v => v === null || v === undefined)) return false;

  const set = new Set(board as number[]);
  if (set.size !== expectedCount) return false;

  for (let i = 1; i <= expectedCount; i++) {
    if (!set.has(i)) return false;
  }
  return true;
}

const memoryStore: Record<string, string> = {};

function safeGetItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem(key);
    }
  } catch {}
  return memoryStore[key] || null;
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(key, value);
    }
  } catch {}
  memoryStore[key] = value;
}

function safeRemoveItem(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(key);
    }
  } catch {}
  delete memoryStore[key];
}

/**
 * Retrieves or generates an ephemeral player session ID from localStorage.
 * Used for room membership and reconnection.
 */
export function getSessionId(): string {
  const KEY = 'bingo_duel_session_id';
  let id = safeGetItem(KEY);
  if (!id) {
    id = 'usr_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    safeSetItem(KEY, id);
  }
  return id;
}

/**
 * Retrieves or generates a STABLE player identity UUID from localStorage.
 * Used exclusively for leaderboard win attribution — separate from session_id
 * so leaderboard stats persist across game sessions on the same device/browser.
 *
 * Limitations:
 *   - Resets if localStorage is cleared or the user switches browser/device.
 *
 * TODO: upgrade to Supabase anonymous/named auth so this ID follows the player
 * across devices (swap `localStorage` storage for Supabase `auth.uid()`).
 */
export function getPlayerId(): string {
  const KEY = 'bingo_duel_player_id';
  let id = safeGetItem(KEY);
  if (!id) {
    // Generate a simple UUID-v4-style identifier
    id = 'pid_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
    safeSetItem(KEY, id);
  }
  return id;
}

/**
 * Stored display name helper
 */
export function getPlayerName(): string {
  return safeGetItem('bingo_duel_player_name') || 'Duelist';
}

export function setPlayerName(name: string): void {
  safeSetItem('bingo_duel_player_name', name);
}

const ACTIVE_ROOM_KEY = 'bingo_duel_active_room';

export function getActiveRoomCode(): string | null {
  return safeGetItem(ACTIVE_ROOM_KEY);
}

export function setActiveRoomCode(code: string): void {
  safeSetItem(ACTIVE_ROOM_KEY, code.toUpperCase());
}

export function clearActiveRoomCode(): void {
  safeRemoveItem(ACTIVE_ROOM_KEY);
}
