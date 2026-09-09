// Precomputed line coordinate index sets for 5x5 grid (0..24)
export const LINE_INDICES: number[][] = [
  // 5 Rows
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  // 5 Columns
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  // 2 Diagonals
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];

/**
 * Calculates completed lines and returns winning line index combinations
 */
export function calculateLines(board: number[], calledNumbers: number[]): {
  lines: number;
  completedLines: number[][];
} {
  if (!board || board.length !== 25) {
    return { lines: 0, completedLines: [] };
  }

  const calledSet = new Set(calledNumbers);
  const completedLines: number[][] = [];

  for (const line of LINE_INDICES) {
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
 * Generates a randomly shuffled 5x5 board containing numbers 1..25
 */
export function generateRandomBoard(): number[] {
  const nums = Array.from({ length: 25 }, (_, i) => i + 1);
  // Fisher-Yates shuffle
  for (let i = nums.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [nums[i], nums[j]] = [nums[j], nums[i]];
  }
  return nums;
}

/**
 * Validates whether a board has exactly 25 numbers, all 1-25, without duplicates
 */
export function validateBoard(board: (number | null)[]): boolean {
  if (!board || board.length !== 25) return false;
  if (board.some(v => v === null || v === undefined)) return false;
  
  const set = new Set(board as number[]);
  if (set.size !== 25) return false;

  for (let i = 1; i <= 25; i++) {
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
 * Retrieves or generates an ephemeral player session ID from localStorage
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
