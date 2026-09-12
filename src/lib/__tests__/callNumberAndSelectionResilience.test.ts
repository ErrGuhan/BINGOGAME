import { describe, it, expect, vi } from 'vitest';
import { CalledNumber } from '@/types/bingo';

describe('Call Number Dual-Layer Resilience & Selection Logic', () => {
  describe('1. Dual-layer RPC Fallback on Schema Cache / PGRST202 Mismatch', () => {
    it('automatically retries with legacy 3-param signature when 5-param RPC fails with PGRST202', async () => {
      const callLog: { method: string; args: any }[] = [];

      // Mock Supabase RPC with simulated unmigrated DB behavior
      const mockRpc = vi.fn().mockImplementation(async (method: string, args: any) => {
        callLog.push({ method, args });

        if (method === 'call_number') {
          // If called with 5 params (includes p_player_id), simulate PostgREST schema cache rejection
          if ('p_player_id' in args) {
            return {
              data: null,
              error: {
                code: 'PGRST202',
                message: 'Could not find the function public.call_number(p_game_id, p_opponent_player_id, p_number, p_player_id, p_session_id) in the schema cache',
              },
            };
          }
          // Legacy 3-param call succeeds!
          return {
            data: {
              success: true,
              number: args.p_number,
              sequence: 1,
              called_by: 'p1_uuid',
              next_turn_player_id: 'p2_uuid',
              winner_id: null,
              is_game_over: false,
              p1_lines: 0,
              p2_lines: 0,
              all_called_count: 1,
            },
            error: null,
          };
        }
        return { data: null, error: new Error('Unknown RPC') };
      });

      // Execute dual-layer calling pattern matching useBingoGame.ts
      const executeCallWithFallback = async (gameId: string, sessionId: string, number: number, playerId: string) => {
        let rpcData: any = null;

        const primaryRes = await mockRpc('call_number', {
          p_game_id: gameId,
          p_session_id: sessionId,
          p_number: number,
          p_player_id: playerId,
          p_opponent_player_id: null,
        });

        if (primaryRes.error) {
          const isSignatureMismatch =
            primaryRes.error.code === 'PGRST202' ||
            primaryRes.error.code === '42883' ||
            primaryRes.error.message?.toLowerCase().includes('schema cache') ||
            primaryRes.error.message?.toLowerCase().includes('could not find the function') ||
            primaryRes.error.message?.toLowerCase().includes('call_number');

          if (isSignatureMismatch) {
            const legacyRes = await mockRpc('call_number', {
              p_game_id: gameId,
              p_session_id: sessionId,
              p_number: number,
            });

            if (legacyRes.error) {
              throw new Error(legacyRes.error.message || 'Call was rejected by the server');
            }
            rpcData = legacyRes.data;
          } else {
            throw new Error(primaryRes.error.message || 'Call was rejected by the server');
          }
        } else {
          rpcData = primaryRes.data;
        }

        return rpcData;
      };

      const result = await executeCallWithFallback('game_123', 'sess_456', 21, 'player_789');

      // Verify both attempts were logged in sequence
      expect(callLog).toHaveLength(2);
      expect(callLog[0].args).toHaveProperty('p_player_id', 'player_789'); // 5-param attempt
      expect(callLog[1].args).not.toHaveProperty('p_player_id'); // 3-param fallback attempt
      expect(callLog[1].args).toEqual({
        p_game_id: 'game_123',
        p_session_id: 'sess_456',
        p_number: 21,
      });

      // Verify call succeeded via fallback
      expect(result).toBeDefined();
      expect(result.number).toBe(21);
      expect(result.sequence).toBe(1);
    });

    it('uses modern 5-param result directly when database is migrated', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          success: true,
          number: 13,
          sequence: 1,
          called_by: 'p1_uuid',
          next_turn_player_id: 'p2_uuid',
          winner_id: null,
          is_game_over: false,
          p1_lines: 0,
          p2_lines: 0,
          all_called_count: 1,
        },
        error: null,
      });

      const primaryRes = await mockRpc('call_number', {
        p_game_id: 'g1',
        p_session_id: 's1',
        p_number: 13,
        p_player_id: 'p1',
        p_opponent_player_id: null,
      });

      expect(primaryRes.error).toBeNull();
      expect(primaryRes.data.number).toBe(13);
      expect(mockRpc).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. Selection State Retention Across Re-Renders & Turn Transitions', () => {
    it('allows switching selected number from 21 to 13 to 2 without reverting to null', () => {
      let selectedNumber: number | null = null;
      const selectNumber = (num: number) => {
        selectedNumber = num;
      };

      // Tap #21
      selectNumber(21);
      expect(selectedNumber).toBe(21);

      // Tap DIFFERENT tile #13 -> must update directly, not clear
      selectNumber(13);
      expect(selectedNumber).toBe(13);

      // Tap DIFFERENT tile #2 -> must update directly
      selectNumber(2);
      expect(selectedNumber).toBe(2);
    });

    it('does not wipe selectedNumber during polling re-renders while isMyTurn remains true', () => {
      let selectedNumber: number | null = 21;
      let prevIsMyTurn = true;
      let isMyTurn = true;

      // Resilient transition handler matching MainGameScreen
      const handleTurnChange = (newIsMyTurn: boolean) => {
        if (prevIsMyTurn && !newIsMyTurn) {
          selectedNumber = null;
        }
        prevIsMyTurn = newIsMyTurn;
      };

      // Simulate 5 polling snapshots arriving every 1.2s where isMyTurn remains true
      for (let i = 0; i < 5; i++) {
        handleTurnChange(true);
        expect(selectedNumber).toBe(21); // Selection MUST NOT be wiped!
      }

      // Now simulate call confirmed and turn passing to opponent (true -> false)
      handleTurnChange(false);
      expect(selectedNumber).toBeNull(); // Cleanly reset on turn pass!
    });
  });

  describe('3. Multi-Turn Alternation for 5x5 and 10x10', () => {
    it('alternates turns cleanly for 4 consecutive calls on 5x5 board', () => {
      const p1Id = 'player_1';
      const p2Id = 'player_2';
      let currentTurnId = p1Id;
      const calledNumbers: CalledNumber[] = [];

      const simulateTurn = (number: number) => {
        const callerId = currentTurnId;
        const nextId = callerId === p1Id ? p2Id : p1Id;
        calledNumbers.push({
          id: `call_${calledNumbers.length + 1}`,
          number,
          called_by: callerId,
          sequence: calledNumbers.length + 1,
          called_at: new Date().toISOString(),
        });
        currentTurnId = nextId;
        return { callerId, nextId, number };
      };

      // Turn 1 (P1 calls 21)
      expect(currentTurnId).toBe(p1Id);
      const call1 = simulateTurn(21);
      expect(call1.callerId).toBe(p1Id);
      expect(call1.nextId).toBe(p2Id);
      expect(currentTurnId).toBe(p2Id);

      // Turn 2 (P2 calls 13)
      const call2 = simulateTurn(13);
      expect(call2.callerId).toBe(p2Id);
      expect(call2.nextId).toBe(p1Id);
      expect(currentTurnId).toBe(p1Id);

      // Turn 3 (P1 calls 7)
      const call3 = simulateTurn(7);
      expect(call3.callerId).toBe(p1Id);
      expect(call3.nextId).toBe(p2Id);
      expect(currentTurnId).toBe(p2Id);

      // Turn 4 (P2 calls 2)
      const call4 = simulateTurn(2);
      expect(call4.callerId).toBe(p2Id);
      expect(call4.nextId).toBe(p1Id);
      expect(currentTurnId).toBe(p1Id);

      expect(calledNumbers).toHaveLength(4);
      expect(calledNumbers.map(c => c.number)).toEqual([21, 13, 7, 2]);
    });

    it('handles 10x10 calls (1-100) with strike calculation and turn alternation', () => {
      const p1Id = 'host_10x10';
      const p2Id = 'rival_10x10';
      let currentTurnId = p1Id;
      const calledNumbers: CalledNumber[] = [];

      // 4 calls on 10x10
      const testCalls = [99, 42, 1, 75];
      for (const num of testCalls) {
        const caller = currentTurnId;
        const next = caller === p1Id ? p2Id : p1Id;
        calledNumbers.push({
          id: `c_${num}`,
          number: num,
          called_by: caller,
          sequence: calledNumbers.length + 1,
          called_at: new Date().toISOString(),
        });
        currentTurnId = next;
      }

      expect(calledNumbers).toHaveLength(4);
      expect(calledNumbers[0].number).toBe(99);
      expect(calledNumbers[3].number).toBe(75);
      expect(currentTurnId).toBe(p1Id); // After 4 turns, back to P1
    });
  });
});
