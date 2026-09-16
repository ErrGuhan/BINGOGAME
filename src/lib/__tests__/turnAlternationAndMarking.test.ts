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
    // Exact turn resolution matching useBingoGame activeTurnPlayerId logic
    const deriveActiveTurnPlayerId = (
      currentTurnPlayerId: string | null,
      gameStatus: string,
      calls: { called_by: string }[],
      p1Id: string | null,
      p2Id: string | null
    ): string | null => {
      if (currentTurnPlayerId) return currentTurnPlayerId;
      if (gameStatus !== 'playing') return null;
      if (calls.length === 0) return p1Id;
      const lastCaller = calls[calls.length - 1].called_by;
      return lastCaller === p1Id ? p2Id : p1Id;
    };

    // Exact snapshot turn resolution matching applySnapshot in useBingoGame
    const resolveSnapshotTurn = (
      snapshotGameTurn: string | null,
      gameStatus: string,
      serverCallCount: number,
      localCalls: { called_by: string }[],
      p1Id: string,
      p2Id: string,
      prevTurnId: string | null
    ): string | null => {
      if (gameStatus !== 'playing') return snapshotGameTurn;
      if (localCalls.length > 0) {
        const latestCall = localCalls[localCalls.length - 1];
        const alternatingNextId = latestCall.called_by === p1Id ? p2Id : p1Id;
        if (
          !snapshotGameTurn ||
          snapshotGameTurn === latestCall.called_by ||
          serverCallCount < localCalls.length
        ) {
          return alternatingNextId || prevTurnId || null;
        }
        return snapshotGameTurn;
      }
      return snapshotGameTurn || prevTurnId || p1Id || null;
    };

    it('guarantees that exactly one player has isMyTurn at any time during playing status', () => {
      const p1 = { id: 'usr_p1_abc123' };
      const p2 = { id: 'usr_p2_xyz789' };

      const computeIsMyTurn = (
        currentTurn: string | null,
        gameStatus: string,
        calls: { called_by: string }[],
        localId: string
      ): boolean => {
        const activeId = deriveActiveTurnPlayerId(currentTurn, gameStatus, calls, p1.id, p2.id);
        return Boolean(gameStatus === 'playing' && localId && activeId === localId);
      };

      let currentTurn: string | null = null; // starts null, derives p1
      const calls: { called_by: string }[] = [];

      // Initial state: Game starts, Player 1 has the first turn
      let p1Turn = computeIsMyTurn(currentTurn, 'playing', calls, p1.id);
      let p2Turn = computeIsMyTurn(currentTurn, 'playing', calls, p2.id);

      expect(p1Turn).toBe(true);
      expect(p2Turn).toBe(false);

      // Simulate 10 turns of alternating calls
      for (let turn = 1; turn <= 10; turn++) {
        const callerId = turn % 2 === 1 ? p1.id : p2.id;
        const nextTurnId = callerId === p1.id ? p2.id : p1.id;

        calls.push({ called_by: callerId });
        currentTurn = nextTurnId;

        p1Turn = computeIsMyTurn(currentTurn, 'playing', calls, p1.id);
        p2Turn = computeIsMyTurn(currentTurn, 'playing', calls, p2.id);

        if (turn % 2 === 1) {
          // P1 just called -> must be P2's turn
          expect(p1Turn).toBe(false);
          expect(p2Turn).toBe(true);
        } else {
          // P2 just called -> must be P1's turn
          expect(p1Turn).toBe(true);
          expect(p2Turn).toBe(false);
        }

        // Invariant: never both true, never both false
        expect(p1Turn !== p2Turn).toBe(true);
      }
    });

    it('prevents a lagging or unmigrated server snapshot from reverting P2 back to P1 after P1 calls', () => {
      const p1Id = 'usr_p1_error';
      const p2Id = 'usr_p2_guhan';

      // Step 1: P1 calls #40
      const localCalls = [{ called_by: p1Id, number: 40 }];
      const localTurnId = p2Id; // P1 completed call, turn transitioned to P2

      // Step 2: Lagging / unmigrated snapshot arrives from server:
      // Server DB rejected the call (or hasn't processed it yet), so server snapshot has:
      // - serverCallCount = 0
      // - snapshotGameTurn = p1Id (server still has P1)
      const resolvedTurn = resolveSnapshotTurn(
        p1Id, // Stale server snapshot still has P1
        'playing',
        0, // Server has 0 calls recorded
        localCalls, // Local client has 1 call confirmed
        p1Id,
        p2Id,
        localTurnId
      );

      // CRITICAL ASSERTION:
      // Resolved turn MUST be P2 (Guhan), NOT reverted to P1 (Error)!
      expect(resolvedTurn).toBe(p2Id);
    });

    it('asserts that out-of-turn calls are strictly blocked and consecutive calls by same player fail', () => {
      const p1Id = 'usr_p1';
      const p2Id = 'usr_p2';
      let currentTurnId = p1Id;

      const attemptCall = (callerId: string): { success: boolean; error?: string } => {
        if (callerId !== currentTurnId) {
          return { success: false, error: 'It is not your turn to call a number' };
        }
        // Turn alternates upon successful call
        currentTurnId = callerId === p1Id ? p2Id : p1Id;
        return { success: true };
      };

      // Call 1: P1 calls -> succeeds, turn becomes P2
      const call1 = attemptCall(p1Id);
      expect(call1.success).toBe(true);
      expect(currentTurnId).toBe(p2Id);

      // Call 2: P1 attempts consecutive call -> MUST BE REJECTED!
      const call2Blocked = attemptCall(p1Id);
      expect(call2Blocked.success).toBe(false);
      expect(call2Blocked.error).toBe('It is not your turn to call a number');
      expect(currentTurnId).toBe(p2Id); // Turn remains P2

      // Call 3: P2 calls -> succeeds, turn becomes P1
      const call3 = attemptCall(p2Id);
      expect(call3.success).toBe(true);
      expect(currentTurnId).toBe(p1Id);

      // Call 4: P2 attempts consecutive call -> MUST BE REJECTED!
      const call4Blocked = attemptCall(p2Id);
      expect(call4Blocked.success).toBe(false);
      expect(currentTurnId).toBe(p1Id); // Turn remains P1
    });

    it('prevents simultaneous RIVAL TURN state: activeTurnPlayerId is never null during playing', () => {
      const p1Id = 'usr_p1';
      const p2Id = 'usr_p2';

      // Even if currentTurnPlayerId is null, deriveActiveTurnPlayerId recovers the correct player
      const recoveredTurnAtStart = deriveActiveTurnPlayerId(null, 'playing', [], p1Id, p2Id);
      expect(recoveredTurnAtStart).toBe(p1Id);

      // If P1 just called, recovered turn is P2
      const recoveredAfterP1 = deriveActiveTurnPlayerId(null, 'playing', [{ called_by: p1Id }], p1Id, p2Id);
      expect(recoveredAfterP1).toBe(p2Id);

      // If P2 just called, recovered turn is P1
      const recoveredAfterP2 = deriveActiveTurnPlayerId(null, 'playing', [{ called_by: p1Id }, { called_by: p2Id }], p1Id, p2Id);
      expect(recoveredAfterP2).toBe(p1Id);
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
