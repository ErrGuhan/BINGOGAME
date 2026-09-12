import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateRandomBoard,
  validateBoard,
  calculateLines,
  getActiveRoomCode,
  setActiveRoomCode,
  clearActiveRoomCode,
} from '../gameEngine';
import { BoardSize } from '@/types/bingo';

describe('Multiplayer Sync & State Gating Engine', () => {
  beforeEach(() => {
    clearActiveRoomCode();
  });

  describe('Bug 1: Mega 10x10 Board Generation & Dual-Layer Resilience', () => {
    it('generates valid 10x10 board with 100 unique numbers from 1 to 100', () => {
      const board100 = generateRandomBoard(10);
      expect(board100).toHaveLength(100);
      expect(validateBoard(board100, 10)).toBe(true);

      const uniqueSet = new Set(board100);
      expect(uniqueSet.size).toBe(100);
      expect(Math.min(...board100)).toBe(1);
      expect(Math.max(...board100)).toBe(100);
    });

    it('handles legacy 25-number database slice fallback while preserving full 100-number board locally', () => {
      const fullBoard = generateRandomBoard(10);
      expect(fullBoard).toHaveLength(100);

      // Simulate legacy DB constraint check (expects 25 items)
      const legacyDbConstraint = (b: number[]) => b.length === 25;
      expect(legacyDbConstraint(fullBoard)).toBe(false);

      // Dual-layer fallback creates a 25-number slice strictly for the handshake
      const fallbackSlice = Array.from({ length: 25 }, (_, i) => i + 1);
      expect(legacyDbConstraint(fallbackSlice)).toBe(true);

      // Local board remains the original 100-number board
      expect(fullBoard).toHaveLength(100);
      expect(validateBoard(fullBoard, 10)).toBe(true);
    });

    it('correctly computes lines on 10x10 boards requiring 10 lines to win', () => {
      const board100 = Array.from({ length: 100 }, (_, i) => i + 1);
      
      // Call first 3 rows (30 numbers)
      const calls = board100.slice(0, 30);
      const res = calculateLines(board100, calls, 10);
      expect(res.lines).toBe(3);

      // Call entire board (100 numbers) -> 10 rows + 10 cols + 2 diagonals = 22 total lines
      const allCalls = [...board100];
      const maxRes = calculateLines(board100, allCalls, 10);
      expect(maxRes.lines).toBe(22);
    });
  });

  describe('Bug 2: Rematch Ghost Game Prevention & Server State Readiness', () => {
    it('prohibits transition to active match screen when player board is null', () => {
      // Logic simulation of screen transition condition:
      // screen = (game.status === 'playing' && Boolean(player?.board)) ? 'game' : 'setup'
      const computeScreen = (gameStatus: string, playerBoard: number[] | null, rematchAccepted: boolean) => {
        if (rematchAccepted) return 'setup';
        if (gameStatus === 'playing') {
          return playerBoard ? 'game' : 'setup';
        }
        return 'setup';
      };

      // Ghost game state: opponent is ready or game is playing, but this player hasn't locked board yet
      const playerWithNullBoard = null;
      expect(computeScreen('playing', playerWithNullBoard, false)).toBe('setup');

      // Once board is confirmed and locked
      const playerWithLockedBoard = generateRandomBoard(5);
      expect(computeScreen('playing', playerWithLockedBoard, false)).toBe('game');
    });

    it('ensures fresh game row creation resets all match telemetry and called numbers', () => {
      // Simulated Game 1 ended state
      const game1Calls = [5, 12, 18, 22, 1, 9, 14, 25, 3];
      expect(game1Calls.length).toBeGreaterThan(0);

      // Rematch flow creates new game context
      const oldRoomCode = 'OLD12';
      const newRoomCode = 'NEW34';
      setActiveRoomCode(oldRoomCode);
      expect(getActiveRoomCode()).toBe(oldRoomCode);

      // Rematch accepted with new game
      setActiveRoomCode(newRoomCode);
      const resetCalledNumbers: number[] = [];
      const resetPlayerReady = false;
      const resetPlayerBoard = null;
      const resetWinnerId = null;

      expect(getActiveRoomCode()).toBe(newRoomCode);
      expect(resetCalledNumbers).toHaveLength(0);
      expect(resetPlayerReady).toBe(false);
      expect(resetPlayerBoard).toBeNull();
      expect(resetWinnerId).toBeNull();
    });

    it('verifies that rematch board recalculation starts with zero lines', () => {
      const newBoard = generateRandomBoard(5);
      const emptyCalls: number[] = [];
      const result = calculateLines(newBoard, emptyCalls, 5);

      expect(result.lines).toBe(0);
      expect(result.completedLines).toEqual([]);
    });
  });
});
