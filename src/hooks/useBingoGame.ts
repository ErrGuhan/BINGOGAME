'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Game, Player, CalledNumber, GameStateSnapshot, CallNumberResult } from '@/types/bingo';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { getSessionId, getPlayerName, setPlayerName, setActiveRoomCode, clearActiveRoomCode } from '@/lib/gameEngine';
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
  const [rematchStatus, setRematchStatus] = useState<'idle' | 'requesting' | 'received' | 'accepted' | 'declined'>('idle');
  const [rematchRequesterName, setRematchRequesterName] = useState<string | null>(null);

  // External callbacks for rematch events — set by pages to avoid state-watching race conditions
  const onRematchDeclinedRef = useRef<(() => void) | null>(null);
  const onRematchAcceptedRef = useRef<(() => void) | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const sessionIdRef = useRef<string>('');
  const lastHeartbeatRef = useRef<number>(Date.now());
  const opponentLastSeenRef = useRef<number>(Date.now());
  const gameRef = useRef<Game | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Reliable session getter
  const getSession = useCallback(() => {
    if (!sessionIdRef.current) {
      sessionIdRef.current = getSessionId();
    }
    return sessionIdRef.current;
  }, []);

  // Initialize session ID on mount
  useEffect(() => {
    sessionIdRef.current = getSessionId();
  }, []);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  const playerRef = useRef<Player | null>(null);
  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  const rematchStatusRef = useRef(rematchStatus);
  useEffect(() => {
    rematchStatusRef.current = rematchStatus;
  }, [rematchStatus]);

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

    // Guard: Do not let stale "completed" snapshots pull players back after rematch acceptance
    if (rematchStatusRef.current === 'accepted' && snapshot.game?.status === 'completed') {
      return;
    }

    setGame(snapshot.game);
    if (snapshot.player) {
      const p = snapshot.player;
      const isRematchOrReady = rematchStatusRef.current === 'accepted' || snapshot.game?.status === 'ready';
      setPlayer(prev => ({
        ...p,
        board: isRematchOrReady ? (p.board || null) : (p.board || prev?.board || null),
        is_ready: isRematchOrReady ? Boolean(p.is_ready) : (p.is_ready ?? prev?.is_ready ?? false),
      }));
    }
    setP1(snapshot.p1);
    setP2(snapshot.p2);
    setCalledNumbers(snapshot.called_numbers || []);
    setOptimisticCalled(null);

    // Keep active room in local storage if game is ongoing
    if (snapshot.game?.room_code && snapshot.game.status !== 'completed') {
      setActiveRoomCode(snapshot.game.room_code);
    }

    // Refresh opponent presence timestamp if opponent is active
    const opp = snapshot.player?.player_number === 1 ? snapshot.p2 : snapshot.p1;
    if (opp?.connected) {
      opponentLastSeenRef.current = Date.now();
      setIsOpponentDisconnected(false);
    }
  }, []);

  // Fetch full game state from source of truth in Supabase
  const syncGameState = useCallback(async (gameId: string) => {
    if (!gameId) return;
    const sessionId = getSession();
    const supabase = getSupabase();

    if (!supabase || !isSupabaseConfigured()) {
      console.warn('Supabase not configured for state sync.');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_game_state', {
        p_game_id: gameId,
        p_session_id: sessionId,
      });
      if (error) throw error;
      if (data) {
        applySnapshot(data as GameStateSnapshot);
      }
    } catch (err: unknown) {
      console.error('Failed to sync game state:', err);
    }
  }, [applySnapshot, getSession]);

  // Handle Realtime incoming events
  const handleRealtimeEvent = useCallback((event: string, payload: unknown) => {
    opponentLastSeenRef.current = Date.now();
    setIsOpponentDisconnected(false);

    const data = payload as Record<string, unknown>;

    if (event === 'NUMBER_CALLED') {
      const call = data as unknown as CallNumberResult;
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
          current_turn_player_id: d.currentTurnPlayerId || prev.current_turn_player_id || p1?.id || null,
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
    } else if (event === 'REMATCH_REQUESTED') {
      const d = data as { requesterId: string; requesterName?: string };
      if (d.requesterId !== playerRef.current?.id) {
        setRematchStatus('received');
        setRematchRequesterName(d.requesterName || 'Opponent');
        sounds.playDraft(580);
      }
    } else if (event === 'REMATCH_ACCEPTED' || event === 'REMATCH_STARTED') {
      sounds.playDraft(520);
      setRematchStatus('accepted');
      setCalledNumbers([]);
      setOptimisticCalled(null);
      setPlayer(prev => prev ? { ...prev, board: null, is_ready: false, lines_completed: 0 } : null);
      setP1(prev => prev ? { ...prev, board: null, is_ready: false, lines_completed: 0 } : null);
      setP2(prev => prev ? { ...prev, board: null, is_ready: false, lines_completed: 0 } : null);
      setGame(prev => prev ? {
        ...prev,
        status: 'ready',
        winner_id: null,
        current_turn_player_id: null,
      } : null);
      // Fire callback so pages can navigate to board setup screen immediately
      onRematchAcceptedRef.current?.();
    } else if (event === 'REMATCH_DECLINED') {
      const d = data as { declinerName?: string };
      // Only update state for the requester (the decliner already set to 'idle' in declineRematch)
      setRematchStatus(prev => prev === 'requesting' ? 'declined' : prev);
      setRematchRequesterName(d.declinerName || 'Opponent');
      sounds.playAlert();
      // Fire callback immediately so pages can redirect without depending on state transitions
      onRematchDeclinedRef.current?.();
    } else if (event === 'REMATCH_CANCELLED') {
      setRematchStatus(prev => prev === 'received' ? 'idle' : prev);
      setRematchRequesterName(null);
    } else if (event === 'HEARTBEAT') {
      lastHeartbeatRef.current = Date.now();
      opponentLastSeenRef.current = Date.now();
      setIsOpponentDisconnected(false);
    }
  }, [p1?.id, syncGameState]);

  // Stable refs for callbacks to prevent teardown of Realtime channels
  const handleRealtimeEventRef = useRef(handleRealtimeEvent);
  handleRealtimeEventRef.current = handleRealtimeEvent;

  const syncGameStateRef = useRef(syncGameState);
  syncGameStateRef.current = syncGameState;

  // Setup Realtime Channels & Subscriptions with Active Auto-Recovery
  useEffect(() => {
    if (!game?.room_code) return;
    const roomCode = game.room_code.toUpperCase();
    const supabase = getSupabase();

    if (!supabase || !isSupabaseConfigured()) return;

    let activeChannel: RealtimeChannel | null = null;
    let isDisposed = false;

    const setupChannel = () => {
      if (isDisposed) return;
      if (activeChannel) {
        supabase.removeChannel(activeChannel);
      }

      const channel = supabase.channel(`room:${roomCode}`, {
        config: { broadcast: { self: false } },
      });

      channel
        .on('broadcast', { event: 'NUMBER_CALLED' }, ({ payload }) => handleRealtimeEventRef.current('NUMBER_CALLED', payload))
        .on('broadcast', { event: 'PLAYER_JOINED' }, ({ payload }) => handleRealtimeEventRef.current('PLAYER_JOINED', payload))
        .on('broadcast', { event: 'PLAYER_READY' }, ({ payload }) => handleRealtimeEventRef.current('PLAYER_READY', payload))
        .on('broadcast', { event: 'REMATCH_REQUESTED' }, ({ payload }) => handleRealtimeEventRef.current('REMATCH_REQUESTED', payload))
        .on('broadcast', { event: 'REMATCH_ACCEPTED' }, ({ payload }) => handleRealtimeEventRef.current('REMATCH_ACCEPTED', payload))
        .on('broadcast', { event: 'REMATCH_DECLINED' }, ({ payload }) => handleRealtimeEventRef.current('REMATCH_DECLINED', payload))
        .on('broadcast', { event: 'REMATCH_CANCELLED' }, ({ payload }) => handleRealtimeEventRef.current('REMATCH_CANCELLED', payload))
        .on('broadcast', { event: 'REMATCH_STARTED' }, ({ payload }) => handleRealtimeEventRef.current('REMATCH_STARTED', payload))
        .on('broadcast', { event: 'TIMEOUT_WIN_CLAIMED' }, ({ payload }) => handleRealtimeEventRef.current('TIMEOUT_WIN_CLAIMED', payload))
        .on('broadcast', { event: 'HEARTBEAT' }, ({ payload }) => handleRealtimeEventRef.current('HEARTBEAT', payload))
        // Direct Database Postgres Changes: Fires in ~50ms whenever a number is called in Supabase
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'called_numbers' }, (payload) => {
          if (gameRef.current?.id && (payload.new as { game_id?: string })?.game_id === gameRef.current.id) {
            syncGameStateRef.current(gameRef.current.id);
          }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games' }, (payload) => {
          if (gameRef.current?.id && (payload.new as { id?: string })?.id === gameRef.current.id) {
            syncGameStateRef.current(gameRef.current.id);
          }
        })
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            reconnectAttemptRef.current = 0;
            // Immediate state sync upon connecting/reconnecting
            if (gameRef.current?.id) {
              syncGameStateRef.current(gameRef.current.id);
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn(`Realtime channel status: ${status}. Scheduling recovery...`, err);
            if (!isDisposed) {
              const backoffDelay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 6000);
              reconnectAttemptRef.current += 1;
              if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
              reconnectTimerRef.current = setTimeout(() => {
                if (!isDisposed) setupChannel();
              }, backoffDelay);
            }
          }
        });

      activeChannel = channel;
      channelRef.current = channel;
    };

    setupChannel();

    // Mobile / Tab Wake and Online detection
    const handleOnline = () => {
      reconnectAttemptRef.current = 0;
      setupChannel();
      if (gameRef.current?.id) syncGameStateRef.current(gameRef.current.id);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (gameRef.current?.id) {
          syncGameStateRef.current(gameRef.current.id);
        }
      }
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isDisposed = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (activeChannel) {
        supabase.removeChannel(activeChannel);
      }
      channelRef.current = null;
    };
  }, [game?.room_code]);

  // Active game polling fallback (Fast 1.2s during playing, 2.5s in lobby)
  useEffect(() => {
    if (!game?.id || game.status === 'completed') return;

    const pollRate = game.status === 'playing' ? 1200 : 2500;
    const pollInterval = setInterval(() => {
      if (gameRef.current?.id) {
        syncGameStateRef.current(gameRef.current.id);
      }
    }, pollRate);

    return () => clearInterval(pollInterval);
  }, [game?.id, game?.status]);

  // Presence Heartbeat Loop (every 10s)
  useEffect(() => {
    if (!game?.id || game.status !== 'playing') return;

    const interval = setInterval(async () => {
      const supabase = getSupabase();
      if (!supabase || !isSupabaseConfigured() || !game?.id) return;

      try {
        await supabase.rpc('heartbeat', {
          p_game_id: game.id,
          p_session_id: sessionIdRef.current,
        });
        channelRef.current?.send({
          type: 'broadcast',
          event: 'HEARTBEAT',
          payload: { playerId: player?.id, ts: Date.now() },
        });
      } catch (err: unknown) {
        console.error('Heartbeat failed:', err);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [game?.id, game?.status, player?.id]);

  // Monitor Opponent Inactivity / Socket Disconnect (>45s silence during playing)
  useEffect(() => {
    if (!game?.id || game.status !== 'playing') {
      setIsOpponentDisconnected(false);
      return;
    }

    const checkInterval = setInterval(() => {
      const timeSinceLastSignal = Date.now() - opponentLastSeenRef.current;
      // If no signal/event/heartbeat received from opponent for >45s, flag as disconnected
      if (timeSinceLastSignal > 45000) {
        setIsOpponentDisconnected(true);
      } else {
        setIsOpponentDisconnected(false);
      }
    }, 5000);

    return () => clearInterval(checkInterval);
  }, [game?.id, game?.status]);

  // Reconnect check / timeout countdown
  useEffect(() => {
    if (!isOpponentDisconnected || game?.status !== 'playing') {
      setReconnectCountdown(60);
      return;
    }

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

  // ACTION: Create Game (Supabase Server-Side RPC)
  const createGame = useCallback(async (displayName?: string) => {
    setLoading(true);
    setError(null);
    const name = displayName || getPlayerName();
    setPlayerName(name);
    const sessionId = getSession();

    try {
      const supabase = getSupabase();
      if (!supabase || !isSupabaseConfigured()) {
        throw new Error('Supabase is not configured. Please check your environment variables in .env.local.');
      }

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

      // Synchronously populate host game state
      const initialHost: Player = {
        id: data.player_id,
        session_id: sessionId,
        display_name: name,
        player_number: 1,
        board: null,
        is_ready: false,
        connected: true,
        lines_completed: 0,
        last_seen_at: new Date().toISOString(),
      };

      const initialGame: Game = {
        id: data.game_id,
        room_code: data.room_code,
        status: data.status || 'waiting',
        target_lines: 5,
        current_turn_player_id: null,
        winner_id: null,
        created_at: new Date().toISOString(),
      };

      setGame(initialGame);
      setPlayer(initialHost);
      setP1(initialHost);
      setP2(null);
      setCalledNumbers([]);
      setActiveRoomCode(data.room_code);

      // Background state sync
      syncGameState(data.game_id).catch(() => {});
      return data.room_code;
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Failed to create game room';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getSession, syncGameState]);

  // ACTION: Join Game (Supabase Server-Side RPC)
  const joinGame = useCallback(async (roomCode: string, displayName?: string) => {
    setLoading(true);
    setError(null);
    const name = displayName || getPlayerName();
    setPlayerName(name);
    const sessionId = getSession();

    try {
      const cleanCode = roomCode.trim().toUpperCase();
      const supabase = getSupabase();
      if (!supabase || !isSupabaseConfigured()) {
        throw new Error('Supabase is not configured. Please check your environment variables in .env.local.');
      }

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

      setActiveRoomCode(cleanCode);

      // Broadcast to Room that Player 2 joined so Host receives immediate notification
      if (!data.is_reconnect && data.player_number === 2) {
        const joinPayload = {
          player: {
            id: data.player_id,
            session_id: sessionId,
            display_name: name,
            player_number: 2 as const,
            board: null,
            is_ready: false,
            connected: true,
            lines_completed: 0,
            last_seen_at: new Date().toISOString(),
          },
        };

        if (channelRef.current) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'PLAYER_JOINED',
            payload: joinPayload,
          }).catch(err => console.warn('Channel send error:', err));
        } else {
          const tempJoinChannel = supabase.channel(`notifier:${cleanCode}:${Date.now()}`);
          tempJoinChannel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              tempJoinChannel.send({
                type: 'broadcast',
                event: 'PLAYER_JOINED',
                payload: joinPayload,
              }).then(() => {
                setTimeout(() => {
                  supabase.removeChannel(tempJoinChannel);
                }, 1000);
              }).catch(() => {
                supabase.removeChannel(tempJoinChannel);
              });
            }
          });
        }
      }

      await syncGameState(data.game_id);
      return data;
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Failed to join game room';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getSession, syncGameState]);

  // ACTION: Confirm / Set Board (Supabase Server-Side RPC)
  const setBoard = useCallback(async (board: number[]) => {
    if (!game?.id) return;
    setLoading(true);
    setError(null);
    const sessionId = getSession();

    // 1. Immediately store board in local state to eliminate race condition on game start
    setPlayer(prev => prev ? { ...prev, board, is_ready: true } : null);
    if (player?.player_number === 1) {
      setP1(prev => prev ? { ...prev, board, is_ready: true } : null);
    } else if (player?.player_number === 2) {
      setP2(prev => prev ? { ...prev, board, is_ready: true } : null);
    }

    try {
      const supabase = getSupabase();
      if (!supabase || !isSupabaseConfigured()) {
        throw new Error('Supabase is not configured. Please check your environment variables in .env.local.');
      }

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

      if (data?.all_ready) {
        setGame(prev => prev ? {
          ...prev,
          status: 'playing',
          current_turn_player_id: data.current_turn_player_id,
        } : null);
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
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Failed to confirm board';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [game?.id, getSession, player?.id, player?.player_number, syncGameState]);

  // ACTION: Call Number (Supabase Server-Side Strict Alternating Turns & Win Detection)
  const callNumber = useCallback(async (number: number) => {
    if (!game?.id || !isMyTurn) return;
    if (calledNumbers.some(c => c.number === number)) return;

    // 1. Instant Optimistic UI Update & Audio Chime
    setOptimisticCalled(number);
    sounds.playCall();

    const sessionId = getSession();

    try {
      const supabase = getSupabase();
      if (!supabase || !isSupabaseConfigured()) {
        throw new Error('Supabase is not configured. Please check your environment variables in .env.local.');
      }

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

      // 1. Immediately apply local state
      handleRealtimeEvent('NUMBER_CALLED', result);

      // 2. Broadcast to opponent instantly via Supabase Realtime
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'NUMBER_CALLED',
          payload: result,
        }).catch(err => console.warn('Realtime broadcast warning:', err));
      }

      // 3. Fast sync in background to guarantee full state integrity
      syncGameState(game.id).catch(() => {});
    } catch (err: unknown) {
      // Rollback on rejection (e.g., turn desync)
      setOptimisticCalled(null);
      const msg = (err as Error).message || 'Call rejected';
      setError(msg);
      sounds.playAlert();
    }
  }, [calledNumbers, game?.id, getSession, handleRealtimeEvent, isMyTurn, syncGameState]);

  // ACTION: Claim Timeout Win
  const claimTimeoutWin = useCallback(async () => {
    if (!game?.id) return;
    try {
      const supabase = getSupabase();
      if (!supabase || !isSupabaseConfigured()) return;

      const { data, error } = await supabase.rpc('claim_timeout_win', {
        p_game_id: game.id,
        p_session_id: getSession(),
      });
      if (error) throw error;
      handleRealtimeEvent('TIMEOUT_WIN_CLAIMED', data);
    } catch (err: unknown) {
      console.error('Failed to claim timeout:', err);
    }
  }, [game?.id, getSession, handleRealtimeEvent]);

  // ACTION: Accept Rematch (Resets match state on server and notifies room via Realtime)
  const acceptRematch = useCallback(async () => {
    if (!game?.id) return;
    setLoading(true);
    setError(null);
    const sessionId = getSession();

    // 1. Locally reset match state immediately while preserving room code and player session
    setRematchStatus('accepted');
    setCalledNumbers([]);
    setOptimisticCalled(null);
    setPlayer(prev => prev ? { ...prev, board: null, is_ready: false, lines_completed: 0 } : null);
    setP1(prev => prev ? { ...prev, board: null, is_ready: false, lines_completed: 0 } : null);
    setP2(prev => prev ? { ...prev, board: null, is_ready: false, lines_completed: 0 } : null);
    setGame(prev => prev ? {
      ...prev,
      status: 'ready',
      winner_id: null,
      current_turn_player_id: null,
    } : null);

    // 2. Execute server-side rematch RPC (with fallback direct table updates)
    try {
      const supabase = getSupabase();
      if (supabase && isSupabaseConfigured()) {
        const { error: rpcErr } = await supabase.rpc('rematch_game', {
          p_game_id: game.id,
          p_session_id: sessionId,
        });
        if (rpcErr) {
          console.warn('Server rematch RPC note (applying direct fallback):', rpcErr);
          await supabase.from('called_numbers').delete().eq('game_id', game.id);
          await supabase.from('games').update({
            status: 'ready',
            winner_id: null,
            current_turn_player_id: null,
            updated_at: new Date().toISOString(),
          }).eq('id', game.id);
          await supabase.from('players').update({
            is_ready: false,
            board: null,
            last_seen_at: new Date().toISOString(),
          }).eq('game_id', game.id);
        }
      }
    } catch (err) {
      console.warn('Rematch server sync note:', err);
    }

    // 3. Broadcast acceptance to opponent via Realtime channel
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'REMATCH_ACCEPTED',
        payload: {
          gameId: game.id,
          roomCode: game.room_code,
          acceptedBy: player?.id,
        },
      }).catch(err => console.warn('Realtime rematch accept broadcast warning:', err));
    }

    setLoading(false);
  }, [game?.id, game?.room_code, getSession, player?.id]);

  // ACTION: Request Rematch (Sends challenge notification to opponent)
  const requestRematch = useCallback(async () => {
    if (!game?.id) return;
    // If we already received a request from opponent, clicking rematch accepts it!
    if (rematchStatus === 'received') {
      return acceptRematch();
    }
    setRematchStatus('requesting');
    setLoading(true);
    try {
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'REMATCH_REQUESTED',
          payload: {
            gameId: game.id,
            roomCode: game.room_code,
            requesterId: player?.id,
            requesterName: player?.display_name || 'Opponent',
          },
        }).catch(err => console.warn('Realtime rematch request broadcast warning:', err));
      }
    } finally {
      setLoading(false);
    }
  }, [acceptRematch, game?.id, game?.room_code, player?.display_name, player?.id, rematchStatus]);

  // ACTION: Decline Rematch (Declines challenge and notifies opponent)
  const declineRematch = useCallback(() => {
    setRematchStatus('idle');
    setRematchRequesterName(null);
    sounds.playTap();
    if (channelRef.current && game?.id) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'REMATCH_DECLINED',
        payload: {
          gameId: game.id,
          declinedBy: player?.id,
          declinerName: player?.display_name || 'Opponent',
        },
      }).catch(err => console.warn('Realtime rematch decline broadcast warning:', err));
    }
  }, [game?.id, player?.display_name, player?.id]);

  // ACTION: Cancel Rematch Request
  const cancelRematchRequest = useCallback(() => {
    setRematchStatus('idle');
    sounds.playTap();
    if (channelRef.current && game?.id) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'REMATCH_CANCELLED',
        payload: {
          gameId: game.id,
          cancelledBy: player?.id,
        },
      }).catch(err => console.warn('Realtime rematch cancel broadcast warning:', err));
    }
  }, [game?.id, player?.id]);

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
    requestRematch,
    acceptRematch,
    declineRematch,
    cancelRematchRequest,
    rematchStatus,
    rematchRequesterName,
    /** Register a callback that fires the moment a REMATCH_DECLINED broadcast is received */
    setOnRematchDeclined: (cb: (() => void) | null) => { onRematchDeclinedRef.current = cb; },
    /** Register a callback that fires the moment a REMATCH_ACCEPTED broadcast is received */
    setOnRematchAccepted: (cb: (() => void) | null) => { onRematchAcceptedRef.current = cb; },
    refreshState: () => game?.id && syncGameState(game.id),
    resetGame: () => {
      clearActiveRoomCode();
      setGame(null);
      setPlayer(null);
      setP1(null);
      setP2(null);
      setCalledNumbers([]);
      setError(null);
      setIsOpponentDisconnected(false);
      setRematchStatus('idle');
      setRematchRequesterName(null);
    },
  };
}
