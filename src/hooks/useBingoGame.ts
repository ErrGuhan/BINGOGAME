'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Game, Player, CalledNumber, GameStateSnapshot, CallNumberResult } from '@/types/bingo';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  mockCreateGame,
  mockJoinGame,
  mockSetPlayerBoard,
  mockCallNumber,
  mockGetGameState,
  mockClaimTimeoutWin,
  mockHeartbeat,
  subscribeToMockEvents,
} from '@/lib/mockEngine';
import { getSessionId, getPlayerName, setPlayerName } from '@/lib/gameEngine';
import { sounds } from '@/components/AudioController';
import type { RealtimeChannel } from '@supabase/supabase-js';

export function useBingoGame(initialRoomCode?: string) {
  const [game, setGame] = useState<Game | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [p1, setP1] = useState<Player | null>(null);
  const [p2, setP2] = useState<Player | null>(null);
  const [calledNumbers, setCalledNumbers] = useState<CalledNumber[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [optimisticCalled, setOptimisticCalled] = useState<number | null>(null);
  const [isOpponentDisconnected, setIsOpponentDisconnected] = useState<boolean>(false);
  const [reconnectCountdown, setReconnectCountdown] = useState<number>(60);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const sessionIdRef = useRef<string>('');
  const lastHeartbeatRef = useRef<number>(Date.now());
  const gameRef = useRef<Game | null>(null);

  // Initialize session ID
  useEffect(() => {
    sessionIdRef.current = getSessionId();
  }, []);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  const isHost = player?.player_number === 1;
  const opponent = isHost ? p2 : p1;
  const isMyTurn = game?.status === 'playing' && game.current_turn_player_id === player?.id;
  const isGameOver = game?.status === 'completed';
  const winner = game?.winner_id ? (game.winner_id === player?.id ? player : opponent) : null;
  const isWinner = Boolean(player && game?.winner_id && player.id === game.winner_id);

  const myLines = isHost ? (p1?.lines_completed || 0) : (p2?.lines_completed || 0);
  const opponentLines = isHost ? (p2?.lines_completed || 0) : (p1?.lines_completed || 0);

  // Sync state from snapshot
  const applySnapshot = useCallback((snapshot: GameStateSnapshot | null) => {
    if (!snapshot) return;
    setGame(snapshot.game);
    setPlayer(snapshot.player);
    setP1(snapshot.p1);
    setP2(snapshot.p2);
    setCalledNumbers(snapshot.called_numbers || []);
    setOptimisticCalled(null);
  }, []);

  // Fetch full game state from source of truth
  const syncGameState = useCallback(async (gameId: string) => {
    if (!gameId) return;
    const sessionId = sessionIdRef.current;
    const supabase = getSupabase();

    try {
      if (supabase && isSupabaseConfigured()) {
        const { data, error } = await supabase.rpc('get_game_state', {
          p_game_id: gameId,
          p_session_id: sessionId,
        });
        if (error) throw error;
        if (data) {
          applySnapshot(data as GameStateSnapshot);
        }
      } else {
        const snapshot = mockGetGameState(gameId, sessionId);
        applySnapshot(snapshot);
      }
    } catch (err: unknown) {
      console.error('Failed to sync game state:', err);
    }
  }, [applySnapshot]);

  // Handle Realtime incoming events
  const handleRealtimeEvent = useCallback((event: string, payload: unknown) => {
    const data = payload as Record<string, unknown>;

    if (event === 'NUMBER_CALLED') {
      const call = data as unknown as CallNumberResult;
      // Audio chime
      sounds.playMatch();
      setOptimisticCalled(null);

      setCalledNumbers(prev => {
        if (prev.some(c => c.number === call.number)) return prev;
        return [
          ...prev,
          {
            id: 'call_' + call.sequence,
            number: call.number,
            called_by: call.called_by,
            sequence: call.sequence,
            called_at: new Date().toISOString(),
          },
        ];
      });

      setP1(prev => prev ? { ...prev, lines_completed: call.p1_lines } : null);
      setP2(prev => prev ? { ...prev, lines_completed: call.p2_lines } : null);

      setGame(prev => {
        if (!prev) return null;
        return {
          ...prev,
          status: call.is_game_over ? 'completed' : prev.status,
          current_turn_player_id: call.next_turn_player_id,
          winner_id: call.winner_id,
        };
      });

      if (call.is_game_over) {
        sounds.playVictory();
      }
    } else if (event === 'PLAYER_JOINED') {
      const p = (data as { player: Player }).player;
      setP2(p);
      setGame(prev => prev ? { ...prev, status: 'ready' } : null);
      sounds.playDraft(640);
      if (gameRef.current?.id) {
        syncGameState(gameRef.current.id);
      }
    } else if (event === 'PLAYER_READY') {
      const d = data as { allReady?: boolean; status?: string; currentTurnPlayerId?: string; playerId?: string };
      if (d.playerId) {
        setP1(prev => prev && prev.id === d.playerId ? { ...prev, is_ready: true } : prev);
        setP2(prev => prev && prev.id === d.playerId ? { ...prev, is_ready: true } : prev);
      }
      if (d.allReady) {
        setGame(prev => prev ? {
          ...prev,
          status: 'playing',
          current_turn_player_id: d.currentTurnPlayerId || prev.current_turn_player_id,
        } : null);
        sounds.playLineComplete();
      }
      if (gameRef.current?.id) {
        syncGameState(gameRef.current.id);
      }
    } else if (event === 'TIMEOUT_WIN_CLAIMED') {
      const d = data as { winnerId: string };
      setGame(prev => prev ? {
        ...prev,
        status: 'completed',
        winner_id: d.winnerId,
        current_turn_player_id: null,
      } : null);
      sounds.playVictory();
    } else if (event === 'HEARTBEAT') {
      lastHeartbeatRef.current = Date.now();
      setIsOpponentDisconnected(false);
    }
  }, [syncGameState]);

  // Setup Realtime Channels & Subscriptions
  useEffect(() => {
    if (!game?.room_code) return;
    const roomCode = game.room_code.toUpperCase();
    const supabase = getSupabase();

    if (supabase && isSupabaseConfigured()) {
      const channel = supabase.channel(`room:${roomCode}`, {
        config: { broadcast: { self: false } },
      });

      channel
        .on('broadcast', { event: 'NUMBER_CALLED' }, ({ payload }) => handleRealtimeEvent('NUMBER_CALLED', payload))
        .on('broadcast', { event: 'PLAYER_JOINED' }, ({ payload }) => handleRealtimeEvent('PLAYER_JOINED', payload))
        .on('broadcast', { event: 'PLAYER_READY' }, ({ payload }) => handleRealtimeEvent('PLAYER_READY', payload))
        .on('broadcast', { event: 'TIMEOUT_WIN_CLAIMED' }, ({ payload }) => handleRealtimeEvent('TIMEOUT_WIN_CLAIMED', payload))
        .on('broadcast', { event: 'HEARTBEAT' }, ({ payload }) => handleRealtimeEvent('HEARTBEAT', payload))
        .subscribe();

      channelRef.current = channel;

      return () => {
        supabase.removeChannel(channel);
        channelRef.current = null;
      };
    } else {
      // Mock Realtime broadcast subscription across browser tabs
      const unsub = subscribeToMockEvents((ev, pl) => {
        handleRealtimeEvent(ev, pl);
      });
      return () => unsub();
    }
  }, [game?.room_code, handleRealtimeEvent]);

  // Lobby polling fallback (every 2.5s) while in waiting or ready state
  useEffect(() => {
    if (!game?.id || (game.status !== 'waiting' && game.status !== 'ready')) return;

    const pollInterval = setInterval(() => {
      syncGameState(game.id);
    }, 2500);

    return () => clearInterval(pollInterval);
  }, [game?.id, game?.status, syncGameState]);

  // Presence Heartbeat Loop (every 10s)
  useEffect(() => {
    if (!game?.id || game.status !== 'playing') return;

    const interval = setInterval(() => {
      const supabase = getSupabase();
      if (supabase && isSupabaseConfigured()) {
        supabase.rpc('heartbeat', {
          p_game_id: game.id,
          p_session_id: sessionIdRef.current,
        }).then(() => {
          channelRef.current?.send({
            type: 'broadcast',
            event: 'HEARTBEAT',
            payload: { playerId: player?.id, ts: Date.now() },
          });
        });
      } else {
        mockHeartbeat(game.id, sessionIdRef.current);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [game?.id, game?.status, player?.id]);

  // Reconnect check / timeout countdown
  useEffect(() => {
    if (!isOpponentDisconnected || game?.status !== 'playing') return;

    const timer = setInterval(() => {
      setReconnectCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpponentDisconnected, game?.status]);

  // ACTION: Create Game
  const createGame = async (displayName?: string) => {
    setLoading(true);
    setError(null);
    const name = displayName || getPlayerName();
    setPlayerName(name);
    const sessionId = sessionIdRef.current || getSessionId();

    try {
      const supabase = getSupabase();
      if (supabase && isSupabaseConfigured()) {
        const { data, error } = await supabase.rpc('create_game', {
          p_session_id: sessionId,
          p_display_name: name,
        });
        if (error) {
          if (error.code === 'PGRST202' || error.code === 'PGRST205') {
            throw new Error('Supabase functions not yet installed. Please run supabase/schema.sql in your Supabase SQL Editor!');
          }
          throw error;
        }
        await syncGameState(data.game_id);
        return data.room_code;
      } else {
        const res = mockCreateGame(sessionId, name);
        await syncGameState(res.game_id);
        return res.room_code;
      }
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Failed to create game room';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // ACTION: Join Game
  const joinGame = async (roomCode: string, displayName?: string) => {
    setLoading(true);
    setError(null);
    const name = displayName || getPlayerName();
    setPlayerName(name);
    const sessionId = sessionIdRef.current || getSessionId();

    try {
      const cleanCode = roomCode.trim().toUpperCase();
      const supabase = getSupabase();
      if (supabase && isSupabaseConfigured()) {
        const { data, error } = await supabase.rpc('join_game', {
          p_room_code: cleanCode,
          p_session_id: sessionId,
          p_display_name: name,
        });
        if (error) {
          if (error.code === 'PGRST202' || error.code === 'PGRST205') {
            throw new Error('Supabase functions not yet installed. Please run supabase/schema.sql in your Supabase SQL Editor!');
          }
          throw error;
        }

        // Broadcast to Room that Player 2 joined so Host receives immediate notification
        const joinChannel = supabase.channel(`room:${cleanCode}`);
        joinChannel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            joinChannel.send({
              type: 'broadcast',
              event: 'PLAYER_JOINED',
              payload: {
                player: {
                  id: data.player_id,
                  session_id: sessionId,
                  display_name: name,
                  player_number: 2,
                  board: null,
                  is_ready: false,
                  connected: true,
                  lines_completed: 0,
                  last_seen_at: new Date().toISOString(),
                },
              },
            });
          }
        });

        await syncGameState(data.game_id);
        return data;
      } else {
        const res = mockJoinGame(cleanCode, sessionId, name);
        await syncGameState(res.game_id);
        return res;
      }
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Failed to join game room';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // ACTION: Confirm / Set Board
  const setBoard = async (board: number[]) => {
    if (!game?.id) return;
    setLoading(true);
    setError(null);
    const sessionId = sessionIdRef.current;

    try {
      const supabase = getSupabase();
      if (supabase && isSupabaseConfigured()) {
        const { data, error } = await supabase.rpc('set_player_board', {
          p_game_id: game.id,
          p_session_id: sessionId,
          p_board: board,
        });
        if (error) {
          if (error.code === 'PGRST202' || error.code === 'PGRST205') {
            throw new Error('Supabase functions not yet installed. Please run supabase/schema.sql in your Supabase SQL Editor!');
          }
          throw error;
        }

        channelRef.current?.send({
          type: 'broadcast',
          event: 'PLAYER_READY',
          payload: {
            playerId: player?.id,
            allReady: data?.all_ready,
            status: data?.game_status,
            currentTurnPlayerId: data?.current_turn_player_id,
          },
        });

        await syncGameState(game.id);
      } else {
        mockSetPlayerBoard(game.id, sessionId, board);
        await syncGameState(game.id);
      }
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Failed to confirm board';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // ACTION: Call Number (Sub-300ms Perceived Latency with Optimistic UI)
  const callNumber = async (number: number) => {
    if (!game?.id || !isMyTurn) return;
    if (calledNumbers.some(c => c.number === number)) return;

    // 1. Instant Optimistic UI Update & Audio Chime
    setOptimisticCalled(number);
    sounds.playCall();

    const sessionId = sessionIdRef.current;

    try {
      const supabase = getSupabase();
      if (supabase && isSupabaseConfigured()) {
        const { data, error } = await supabase.rpc('call_number', {
          p_game_id: game.id,
          p_session_id: sessionId,
          p_number: number,
        });

        if (error) {
          if (error.code === 'PGRST202' || error.code === 'PGRST205') {
            throw new Error('Supabase functions not yet installed. Please run supabase/schema.sql in your Supabase SQL Editor!');
          }
          throw error;
        }

        const result = data as CallNumberResult;

        // Broadcast to opponent instantly via Supabase Realtime
        channelRef.current?.send({
          type: 'broadcast',
          event: 'NUMBER_CALLED',
          payload: result,
        });

        // Apply local state
        handleRealtimeEvent('NUMBER_CALLED', result);
      } else {
        const result = mockCallNumber(game.id, sessionId, number);
        handleRealtimeEvent('NUMBER_CALLED', result);
      }
    } catch (err: unknown) {
      // Rollback on rejection (e.g., turn desync)
      setOptimisticCalled(null);
      const msg = (err as Error).message || 'Call rejected';
      setError(msg);
      sounds.playAlert();
    }
  };

  // ACTION: Claim Timeout Win
  const claimTimeoutWin = async () => {
    if (!game?.id) return;
    try {
      const supabase = getSupabase();
      if (supabase && isSupabaseConfigured()) {
        const { data, error } = await supabase.rpc('claim_timeout_win', {
          p_game_id: game.id,
          p_session_id: sessionIdRef.current,
        });
        if (error) throw error;
        handleRealtimeEvent('TIMEOUT_WIN_CLAIMED', data);
      } else {
        const data = mockClaimTimeoutWin(game.id, sessionIdRef.current);
        handleRealtimeEvent('TIMEOUT_WIN_CLAIMED', data);
      }
    } catch (err: unknown) {
      console.error('Failed to claim timeout:', err);
    }
  };

  // Auto-connect if initialRoomCode provided
  useEffect(() => {
    if (initialRoomCode && !game) {
      joinGame(initialRoomCode).catch(() => {});
    }
  }, [initialRoomCode]);

  return {
    game,
    player,
    p1,
    p2,
    opponent,
    calledNumbers,
    myLines,
    opponentLines,
    isMyTurn,
    isGameOver,
    winner,
    isWinner,
    isHost,
    loading,
    error,
    optimisticCalled,
    isOpponentDisconnected,
    reconnectCountdown,
    createGame,
    joinGame,
    setBoard,
    callNumber,
    claimTimeoutWin,
    refreshState: () => game?.id && syncGameState(game.id),
    resetGame: () => {
      setGame(null);
      setPlayer(null);
      setP1(null);
      setP2(null);
      setCalledNumbers([]);
      setError(null);
    },
  };
}
