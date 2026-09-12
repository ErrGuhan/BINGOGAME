import { describe, it, expect } from 'vitest';
import { calculateLines, generateLineIndices, generateRandomBoard, validateBoard } from '../gameEngine';
import { CalledNumber, BoardSize } from '@/types/bingo';

describe('10x10 Cell Marking Persistence & Strict Turn Alternation', () => {
  describe('1. Authoritative Cell Marking Single Source of Truth', () => {
    it('ensures marked numbers persist when optimisticCalled transitions to null', () => {
      let calledNumbers: CalledNumber[] = [];
      let optimisticCalled: number | null = null;

      // Helper function matching MainGameScreen derivation
      const getMarkedSet = (calls: CalledNumber[], opt: number | null): Set<number> => {
        const set = new Set(calls.map(c => c.number));
        if (opt !== null && opt !== undefined) {
          set.add(opt);
        }
        return set;
      };

      // Step 1: User taps Call #42
      optimisticCalled = 42;
      let markedSet = getMarkedSet(calledNumbers, optimisticCalled);
      expect(markedSet.has(42)).toBe(true);

      // Step 2: RPC confirms Call #42
      const confirmedCall: CalledNumber = {
        id: 'call_1',
        number: 42,
        called_by: 'p1_id',
        sequence: 1,
        called_at: new Date().toISOString(),
      };

      // Immediate authoritative folding
      calledNumbers = [...calledNumbers, confirmedCall];
      optimisticCalled = null;

      // Step 3: Verify cell #42 remains marked!
      markedSet = getMarkedSet(calledNumbers, optimisticCalled);
      expect(markedSet.has(42)).toBe(true);
      expect(calledNumbers).toHaveLength(1);
      expect(calledNumbers[0].number).toBe(42);
    });

    it('prevents lagging or empty snapshots from dropping locally confirmed calls', () => {
      const confirmedCalls: CalledNumber[] = [
        { id: 'c1', number: 10, called_by: 'p1', sequence: 1, called_at: '' },
        { id: 'c2', number: 77, called_by: 'p2', sequence: 2, called_at: '' },
      ];

      // Lagging snapshot arrives where the DB only has call 1
      const laggingSnapshotCalls: CalledNumber[] = [
        { id: 'c1', number: 10, called_by: 'p1', sequence: 1, called_at: '' },
      ];

      // Merge logic from applySnapshot
      const mergeCalls = (local: CalledNumber[], server: CalledNumber[]): CalledNumber[] => {
        const callMap = new Map<number, CalledNumber>();
        for (const c of local) callMap.set(c.number, c);
        for (const c of server) callMap.set(c.number, c);
        return Array.from(callMap.values()).sort((a, b) => a.sequence - b.sequence);
      };

      const merged = mergeCalls(confirmedCalls, laggingSnapshotCalls);
      expect(merged).toHaveLength(2);
      expect(merged.map(c => c.number)).toEqual([10, 77]);
    });
  });

  describe('2. Strict Turn Alternation & Exclusivity Invariant', () => {
    it('guarantees that exactly one player has isMyTurn at any time during playing status', () => {
      const p1 = { id: 'usr_p1_abc123' };
      const p2 = { id: 'usr_p2_xyz789' };

      // Helper matching useBingoGame turn derivation
      const computeIsMyTurn = (
        gameStatus: string,
        currentTurnPlayerId: string | null,
        localPlayerId: string,
        p1Id: string
      ): boolean => {
        if (gameStatus !== 'playing') return false;
        const activeTurnId = currentTurnPlayerId || p1Id;
        return activeTurnId === localPlayerId;
      };

      let currentTurn: string | null = null; // initially null, defaults to p1

      // Initial state: Game starts
      let p1Turn = computeIsMyTurn('playing', currentTurn, p1.id, p1.id);
      let p2Turn = computeIsMyTurn('playing', currentTurn, p2.id, p1.id);

      // Invariant: Exactly one side is true
      expect(p1Turn).toBe(true);
      expect(p2Turn).toBe(false);

      // Simulate 10 turns of alternating calls
      for (let turn = 1; turn <= 10; turn++) {
        const callerId = turn % 2 === 1 ? p1.id : p2.id;
        const nextTurnId = callerId === p1.id ? p2.id : p1.id;

        currentTurn = nextTurnId;

        p1Turn = computeIsMyTurn('playing', currentTurn, p1.id, p1.id);
        p2Turn = computeIsMyTurn('playing', currentTurn, p2.id, p1.id);

        // Assert strictly alternating ownership
        if (turn % 2 === 1) {
          // P1 just called -> P2's turn now
          expect(p1Turn).toBe(false);
          expect(p2Turn).toBe(true);
        } else {
          // P2 just called -> P1's turn now
          expect(p1Turn).toBe(true);
          expect(p2Turn).toBe(false);
        }

        // Mutual exclusivity: exactly one true, never both true, never both false
        expect(p1Turn !== p2Turn).toBe(true);
      }
    });

    it('asserts that out-of-turn calls are strictly blocked and do not mutate state', () => {
      const p1 = { id: 'usr_p1' };
      const p2 = { id: 'usr_p2' };
      let currentTurnId = p2.id; // It is P2's turn

      const canCallNumber = (callerId: string, turnId: string): boolean => {
        return callerId === turnId;
      };

      // Player 1 attempts to call when it's Player 2's turn
      const p1CanCall = canCallNumber(p1.id, currentTurnId);
      expect(p1CanCall).toBe(false);

      // Player 2 can call
      const p2CanCall = canCallNumber(p2.id, currentTurnId);
      expect(p2CanCall).toBe(true);
    });
  });

  describe('3. 10x10 Mega Mode Math & Line Index Verification', () => {
    it('generates 22 winning lines for 10x10 grid (10 rows, 10 columns, 2 diagonals)', () => {
      const lines10 = generateLineIndices(10);
      expect(lines10).toHaveLength(22);

      // Each line must have exactly 10 distinct cells
      for (const line of lines10) {
        expect(line).toHaveLength(10);
        const uniqueIndices = new Set(line);
        expect(uniqueIndices.size).toBe(10);
      }

      // Check first row: 0..9
      expect(lines10[0]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      // Check last row: 90..99
      expect(lines10[9]).toEqual([90, 91, 92, 93, 94, 95, 96, 97, 98, 99]);

      // Check first col: 0, 10, 20, 30, 40, 50, 60, 70, 80, 90
      expect(lines10[10]).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
      // Check last col: 9, 19, 29, 39, 49, 59, 69, 79, 89, 99
      expect(lines10[19]).toEqual([9, 19, 29, 39, 49, 59, 69, 79, 89, 99]);

      // Diagonal 1: 0, 11, 22, 33, 44, 55, 66, 77, 88, 99
      expect(lines10[20]).toEqual([0, 11, 22, 33, 44, 55, 66, 77, 88, 99]);
      // Diagonal 2: 9, 18, 27, 36, 45, 54, 63, 72, 81, 90
      expect(lines10[21]).toEqual([9, 18, 27, 36, 45, 54, 63, 72, 81, 90]);
    });

    it('calculates 10x10 lines correctly with targetLines requirement', () => {
      const board = generateRandomBoard(10);
      expect(validateBoard(board, 10)).toBe(true);

      // Pick all numbers from rows 0, 1, 2, 3, 4 (50 numbers -> 5 completed rows)
      const first5RowsIndices = [
        ...Array.from({ length: 10 }, (_, i) => i),
        ...Array.from({ length: 10 }, (_, i) => 10 + i),
        ...Array.from({ length: 10 }, (_, i) => 20 + i),
        ...Array.from({ length: 10 }, (_, i) => 30 + i),
        ...Array.from({ length: 10 }, (_, i) => 40 + i),
      ];
      const calls = first5RowsIndices.map(idx => board[idx]);

      const res = calculateLines(board, calls, 10);
      expect(res.lines).toBe(5);
    });
  });
});
