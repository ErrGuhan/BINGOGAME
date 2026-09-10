'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Game, Player, CalledNumber, GameStateSnapshot, CallNumberResult, BoardSize } from '@/types/bingo';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { getSessionId, getPlayerName, setPlayerName, setActiveRoomCode, clearActiveRoomCode, calculateLines } from '@/lib/gameEngine';
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
  const opponentLastSeenRef = useRef<number>(Date.now());
  const gameRef = useRef<Game | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const matchEpochRef = useRef<number>(1);
  const p1Ref = useRef<Player | null>(null);
  const p2Ref = useRef<Player | null>(null);

  // Reliable session getter
  const getSession = useCallback(() => {
    if (!sessionIdRef.current) {
      sessionIdRef.current = getSessionId();
    }
    return sessionIdRef.current;
  }, []);


  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  const playerRef = useRef<Player | null>(null);
  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(() => {
    p1Ref.current = p1;
  }, [p1]);

  useEffect(() => {
    p2Ref.current = p2;
  }, [p2]);

  const rematchStatusRef = useRef(rematchStatus);
  useEffect(() => {
    rematchStatusRef.current = rematchStatus;
  }, [rematchStatus]);

  const isHost = player?.player_number === 1;
  const opponent = isHost ? p2 : p1;
  const isMyTurn = game?.status === 'playing' && game.current_turn_player_id === player?.id;
  const winner = game?.winner_id ? (game.winner_id === player?.id ? player : opponent) : null;
  const isWinner = Boolean(player && game?.winner_id && player.id === game.winner_id);

  const myLines = isHost ? (p1?.lines_completed || 0) : (p2?.lines_completed || 0);
  const opponentLines = isHost ? (p2?.lines_completed || 0) : (p1?.lines_completed || 0);

  const boardSize: BoardSize = (game?.board_size === 10 ? 10 : 5);
  // Always prefer the authoritative DB value; fall back to board-size derivation
  // only when the game object hasn't loaded yet.
  const targetLines: number = game?.target_lines || (boardSize === 10 ? 10 : 5);

  // Sync state from snapshot
  const applySnapshot = useCallback((snapshot: GameStateSnapshot | null) => {
    if (!snapshot) return;

    // Guard: Do not let stale "completed" snapshots pull players back after rematch acceptance or in higher epochs
    if ((matchEpochRef.current > 1 || rematchStatusRef.current === 'accepted') && snapshot.game?.status === 'completed') {
      return;
    }

    setGame(prev => {
      if (!snapshot.game) return null;
      // Guard: do not let an unmigrated DB completed status override a ready/playing match in rematch
      if (matchEpochRef.current > 1 && snapshot.game.status === 'completed' && prev?.status && prev.status !== 'completed') {
        return prev;
      }

      const dbBoardSize = snapshot.game.board_size;
      const resolvedBoardSize: BoardSize = (dbBoardSize === 10 || dbBoardSize === 5)
        ? dbBoardSize
        : (prev?.board_size === 10 ? 10 : 5);
      const resolvedTarget = resolvedBoardSize === 10 ? 10 : 5;

      return {
        ...snapshot.game,
        status: (matchEpochRef.current > 1 && snapshot.game.status === 'completed' && prev?.status) ? prev.status : snapshot.game.status,
        board_size: resolvedBoardSize,
        target_lines: resolvedTarget,
      };
    });

    if (snapshot.player) {
      const p = snapshot.player;
      if (rematchStatusRef.current === 'accepted') {
        setPlayer(prev => ({
          ...p,
          board: null,
          is_ready: false,
          lines_completed: 0,
        }));
      } else {
        const isReadyStatus = snapshot.game?.status === 'ready';
        setPlayer(prev => {
          // If we locally hold a 100-number board, never let snapshot overwrite it with null or 25-number board
          const hasFull100 = Boolean(prev?.board && prev.board.length === 100);
          const snapHasFull100 = Boolean(p.board && p.board.length === 100);
          const preservedBoard = hasFull100 && !snapHasFull100 ? prev!.board : (p.board || prev?.board || null);

          // Preserve local readiness once board locked
          const preservedReady = prev?.is_ready ? true : Boolean(p.is_ready);

          return {
            ...p,
            board: isReadyStatus ? (snapHasFull100 ? p.board : (prev?.board || null)) : preservedBoard,
            is_ready: isReadyStatus ? Boolean(p.is_ready || prev?.is_ready) : preservedReady,
          };
        });
      }
    }

    setP1(prev => {
      if (!snapshot.p1) return null;
      const snapP1 = snapshot.p1;
      const hasFull100 = Boolean(prev?.board && prev.board.length === 100);
      const snapHasFull100 = Boolean(snapP1.board && snapP1.board.length === 100);
      return {
        ...snapP1,
        board: hasFull100 && !snapHasFull100 ? prev!.board : (snapP1.board || prev?.board || null),
        is_ready: Boolean(snapP1.is_ready || prev?.is_ready),
      };
    });

    setP2(prev => {
      if (!snapshot.p2) return null;
      const snapP2 = snapshot.p2;
      const hasFull100 = Boolean(prev?.board && prev.board.length === 100);
      const snapHasFull100 = Boolean(snapP2.board && snapP2.board.length === 100);
      return {
        ...snapP2,
        board: hasFull100 && !snapHasFull100 ? prev!.board : (snapP2.board || prev?.board || null),
        is_ready: Boolean(snapP2.is_ready || prev?.is_ready),
      };
    });

    // Stale call guard: during fresh rematch setup, ignore old called numbers from previous game
    if (matchEpochRef.current > 1 && gameRef.current?.status === 'ready') {
      setCalledNumbers([]);
    } else if (snapshot.called_numbers && snapshot.called_numbers.length > 0) {
      // Preserve any client-side calls that legacy DB might not support (>25)
      setCalledNumbers(prev => {
        const merged = [...snapshot.called_numbers];
        for (const c of prev) {
          if (!merged.some(m => m.number === c.number)) {
            merged.push(c);
          }
        }
        return merged.sort((a, b) => a.sequence - b.sequence);
      });
    }

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

  // Leading-edge debounce timer: coalesces duplicate syncGameState calls
  // that fire simultaneously from the postgres_changes listener AND the
  // polling interval (both trigger on every NUMBER_CALLED event).
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch full game state from source of truth in Supabase.
  // Uses leading-edge debounce (150 ms window): the FIRST call in a burst
  // fires immediately; any subsequent calls within 150 ms are dropped.
  // This prevents the race condition where two parallel get_game_state RPCs
  // race each other and the slower one overwrites the result with stale data.
  const syncGameState = useCallback(async (gameId: string) => {
    if (!gameId) return;

    // Leading-edge debounce: fire now, ignore duplicates for 150 ms
    if (syncDebounceRef.current) return;   // already in debounce window
    syncDebounceRef.current = setTimeout(() => {
      syncDebounceRef.current = null;       // reopen the window after 150 ms
    }, 150);

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
      // If host, broadcast current game mode so joined player syncs to 10x10 if selected
      if (playerRef.current?.player_number === 1 && channelRef.current) {
        const currentSize = gameRef.current?.board_size || 5;
        const currentTarget = gameRef.current?.target_lines || (currentSize === 10 ? 10 : 5);
        channelRef.current.send({
          type: 'broadcast',
          event: 'GAME_MODE_CHANGED',
          payload: { boardSize: currentSize, targetLines: currentTarget },
        }).catch(() => {});
      }
      if (gameRef.current?.id) {
        syncGameState(gameRef.current.id);
      }
    } else if (event === 'PLAYER_READY') {
      const d = data as { allReady?: boolean; status?: string; currentTurnPlayerId?: string; playerId?: string; boardSize?: BoardSize };
      if (d.playerId) {
        setP1(prev => prev && prev.id === d.playerId ? { ...prev, is_ready: true } : prev);
        setP2(prev => prev && prev.id === d.playerId ? { ...prev, is_ready: true } : prev);
      }

      // Check if both players are ready
      const isCurrentPlayerReady = Boolean(playerRef.current?.is_ready);
      const isOpponentNowReady = Boolean(d.playerId && d.playerId !== playerRef.current?.id);
      const isOpponentAlreadyReady = Boolean(
        playerRef.current?.player_number === 1 ? p2Ref.current?.is_ready : p1Ref.current?.is_ready
      );
      const bothReady = Boolean(d.allReady || (isCurrentPlayerReady && (isOpponentNowReady || isOpponentAlreadyReady)));

      if (bothReady) {
        const firstTurnId = d.currentTurnPlayerId || p1Ref.current?.id || playerRef.current?.id || null;
        setGame(prev => prev ? {
          ...prev,
          status: 'playing',
          current_turn_player_id: firstTurnId,
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
      matchEpochRef.current += 1;
      const d = data as { boardSize?: BoardSize; matchEpoch?: number };
      const nextBoardSize: BoardSize = (d?.boardSize === 10 || d?.boardSize === 5)
        ? d.boardSize
        : (gameRef.current?.board_size === 10 ? 10 : 5);
      const nextTarget = nextBoardSize === 10 ? 10 : 5;

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
        board_size: nextBoardSize,
        target_lines: nextTarget,
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
    } else if (event === 'GAME_MODE_CHANGED') {
      const d = data as { boardSize: BoardSize; targetLines: number };
      if (d.boardSize) {
        setGame(prev => prev ? {
          ...prev,
          board_size: d.boardSize,
          target_lines: d.targetLines,
        } : null);
        setPlayer(prev => prev ? {
          ...prev,
          board: null,
          is_ready: false,
          lines_completed: 0,
        } : null);
        setP1(prev => prev ? { ...prev, board: null, is_ready: false, lines_completed: 0 } : null);
        setP2(prev => prev ? { ...prev, board: null, is_ready: false, lines_completed: 0 } : null);
        sounds.playTap();
      }
    } else if (event === 'HEARTBEAT') {
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
        .on('broadcast', { event: 'GAME_MODE_CHANGED' }, ({ payload }) => handleRealtimeEventRef.current('GAME_MODE_CHANGED', payload))
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

  // ACTION: Create Game (Supabase Server-Side RPC with backward-compatible fallback)
  const createGame = useCallback(async (displayName?: string, initialBoardSize: BoardSize = 5) => {
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

      // Try 3-arg RPC first (for upgraded databases with board_size parameter)
      let data: any = null;
      let rpcError: any = null;

      const res3 = await supabase.rpc('create_game', {
        p_session_id: sessionId,
        p_display_name: name,
        p_board_size: initialBoardSize,
      });

      if (res3.error) {
        // Fallback to legacy 2-arg signature if 3-arg is missing from schema cache
        if (res3.error.code === 'PGRST202' || res3.error.code === 'PGRST205') {
          const res2 = await supabase.rpc('create_game', {
            p_session_id: sessionId,
            p_display_name: name,
          });
          if (res2.error) {
            rpcError = res2.error;
          } else {
            data = res2.data;
          }
        } else {
          rpcError = res3.error;
        }
      } else {
        data = res3.data;
      }

      if (rpcError) {
        if (rpcError.code === 'PGRST202' || rpcError.code === 'PGRST205') {
          throw new Error('Supabase functions not yet installed. Please run supabase/migration_10x10.sql in your Supabase SQL Editor!');
        }
        throw rpcError;
      }

      const chosenBoardSize = (data?.board_size as BoardSize) || initialBoardSize;
      const targetWinLines = data?.target_lines || (chosenBoardSize === 10 ? 10 : 5);

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
        target_lines: targetWinLines,
        board_size: chosenBoardSize,
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

  // ACTION: Set Game Mode (Host switches 5x5 or 10x10)
  const setGameMode = useCallback(async (newBoardSize: BoardSize) => {
    if (!game?.id || player?.player_number !== 1) return;
    setLoading(true);
    setError(null);

    const sessionId = getSession();
    const newTarget = newBoardSize === 10 ? 10 : 5;

    // Optimistically update host state
    setGame(prev => prev ? {
      ...prev,
      board_size: newBoardSize,
      target_lines: newTarget,
    } : null);
    setPlayer(prev => prev ? { ...prev, board: null, is_ready: false, lines_completed: 0 } : null);
    setP1(prev => prev ? { ...prev, board: null, is_ready: false, lines_completed: 0 } : null);
    setP2(prev => prev ? { ...prev, board: null, is_ready: false, lines_completed: 0 } : null);

    // Broadcast change to opponent
    channelRef.current?.send({
      type: 'broadcast',
      event: 'GAME_MODE_CHANGED',
      payload: { boardSize: newBoardSize, targetLines: newTarget },
    }).catch(() => {});

    try {
      const supabase = getSupabase();
      if (supabase && isSupabaseConfigured()) {
        await supabase.rpc('set_game_mode', {
          p_game_id: game.id,
          p_session_id: sessionId,
          p_board_size: newBoardSize,
        });
      }
    } catch (err: unknown) {
      console.warn('Failed to persist game mode change to server:', err);
    } finally {
      setLoading(false);
    }
  }, [game?.id, player?.player_number, getSession]);

  // ACTION: Join Game (Supabase Server-Side RPC)
  const joinGame = useCallback(async (roomCode: string, displayName?: string, silent: boolean = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
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
          throw new Error('Supabase functions not yet installed. Please run supabase/migration_10x10.sql in your Supabase SQL Editor!');
        }
        throw error;
      }

      setActiveRoomCode(cleanCode);

      if (data?.board_size) {
        const joinedBoardSize = data.board_size as BoardSize;
        setGame(prev => prev ? {
          ...prev,
          board_size: joinedBoardSize,
          target_lines: data.target_lines || (joinedBoardSize === 10 ? 10 : 5),
        } : null);
      }

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
          }).catch(() => {});
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
      if (!silent) {
        setError(msg);
      }
      throw err;
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [getSession, syncGameState]);

  // ACTION: Confirm / Set Board (Supabase Server-Side RPC with Dual-Layer Resilience)
  const setBoard = useCallback(async (board: number[]) => {
    if (!game?.id) return;
    setLoading(true);
    setError(null);
    const sessionId = getSession();

    // Capture board size from game at call-time to avoid stale closure bugs
    // (game.board_size is the authoritative value; boardSize in outer scope may lag)
    const currentGameBoardSize: BoardSize = game.board_size === 10 ? 10 : 5;
    const expectedCellCount = currentGameBoardSize * currentGameBoardSize;

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

      // Guard: ensure the board we're submitting matches what the game expects.
      // This catches client/server mode-mismatch before hitting the network.
      if (board.length !== expectedCellCount) {
        throw new Error(
          `Board has ${board.length} numbers but the game expects ${expectedCellCount} ` +
          `(${currentGameBoardSize}x${currentGameBoardSize} mode). ` +
          `Please clear and re-fill your board.`
        );
      }

      let rpcData: any = null;
      let rpcSuccess = false;

      // Attempt server RPC with full board
      const res = await supabase.rpc('set_player_board', {
        p_game_id: game.id,
        p_session_id: sessionId,
        p_board: board,
      });

      if (res.error) {
        // If the server rejected the board because it expected a different count, it almost
        // always means the Supabase migration_10x10.sql has not been applied yet.
        // We must NOT silently send a fake fallback board — that would corrupt game state.
        // Instead, surface a clear, actionable error to the player.
        const isBoardCountMismatch =
          res.error.message?.toLowerCase().includes('exactly') ||
          res.error.message?.toLowerCase().includes('numbers') ||
          res.error.code === '22023' || // invalid_parameter_value (postgres)
          res.error.code === 'P0001';   // raise_exception (plpgsql)

        if (isBoardCountMismatch && board.length === 100) {
          throw new Error(
            '10x10 mode requires a database upgrade. ' +
            'Please run supabase/migration_10x10.sql in your Supabase SQL Editor, then refresh and try again.'
          );
        }

        // For any other server error, re-throw so the user sees it
        throw res.error;
      } else {
        rpcData = res.data;
        rpcSuccess = true;
      }

      // Check if opponent is already ready
      const opponentIsReady = Boolean(
        player?.player_number === 1 ? p2Ref.current?.is_ready : p1Ref.current?.is_ready
      );
      const isAllReady = Boolean(rpcData?.all_ready || opponentIsReady);
      const turnId = rpcData?.current_turn_player_id || p1Ref.current?.id || (player?.player_number === 1 ? player.id : opponent?.id);

      if (isAllReady) {
        setGame(prev => prev ? {
          ...prev,
          status: 'playing',
          current_turn_player_id: turnId,
        } : null);
      }

      channelRef.current?.send({
        type: 'broadcast',
        event: 'PLAYER_READY',
        payload: {
          playerId: player?.id,
          allReady: isAllReady,
          status: isAllReady ? 'playing' : 'ready',
          currentTurnPlayerId: turnId,
          boardSize: currentGameBoardSize,
        },
      }).catch(() => {});

      // Clear rematch flag
      setRematchStatus(prev => prev === 'accepted' ? 'idle' : prev);

      if (rpcSuccess) {
        syncGameState(game.id).catch(() => {});
      }
    } catch (err: unknown) {
      // Surface errors to the UI — a silent console.warn means players never know
      // why "Lock Board & Play" appears to do nothing.
      const msg = (err as Error).message || 'Failed to lock board';
      console.error('[setBoard] error:', msg, err);
      setError(msg);
      // Roll back the optimistic ready state so the player can retry
      setPlayer(prev => prev ? { ...prev, is_ready: false } : null);
      if (player?.player_number === 1) {
        setP1(prev => prev ? { ...prev, is_ready: false } : null);
      } else if (player?.player_number === 2) {
        setP2(prev => prev ? { ...prev, is_ready: false } : null);
      }
    } finally {
      setLoading(false);
    }
  }, [game?.id, game?.board_size, getSession, opponent?.id, player?.id, player?.player_number, syncGameState]);

  // ACTION: Call Number (Supabase Server-Side Strict Alternating Turns & Client Fallback)
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

      let result: CallNumberResult;

      if (error) {
        // Fallback: If DB rejected call (e.g. number > 25 on unmigrated DB), compute line validation locally
        const nextAllCalled = [...calledNumbers.map(c => c.number), number];
        const nextSeq = (calledNumbers.length > 0 ? Math.max(...calledNumbers.map(c => c.sequence)) : 0) + 1;

        const myBoard = player?.board || [];
        const oppBoard = opponent?.board || [];

        const myLinesRes = calculateLines(myBoard, nextAllCalled, boardSize);
        const oppLinesRes = calculateLines(oppBoard, nextAllCalled, boardSize);

        const myWin = myLinesRes.completedLines.length >= targetLines;
        const oppWin = oppLinesRes.completedLines.length >= targetLines;
        const isGameOver = myWin || oppWin;
        const winnerId = myWin ? player?.id || null : (oppWin ? opponent?.id || null : null);
        const nextTurnId = isGameOver ? null : (opponent?.id || null);

        const p1LinesCount = isHost ? myLinesRes.completedLines.length : oppLinesRes.completedLines.length;
        const p2LinesCount = isHost ? oppLinesRes.completedLines.length : myLinesRes.completedLines.length;

        result = {
          success: true,
          number,
          sequence: nextSeq,
          called_by: player?.id || sessionId,
          next_turn_player_id: nextTurnId,
          winner_id: winnerId,
          is_game_over: isGameOver,
          p1_lines: p1LinesCount,
          p2_lines: p2LinesCount,
          all_called_count: nextAllCalled.length,
        };
      } else {
        result = data as CallNumberResult;
      }

      // 1. Immediately apply local state
      handleRealtimeEvent('NUMBER_CALLED', result);

      // 2. Broadcast to opponent instantly via Supabase Realtime
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'NUMBER_CALLED',
          payload: result,
        }).catch(() => {});
      }

      // 3. Fast sync in background if server call succeeded
      if (!error) {
        syncGameState(game.id).catch(() => {});
      }
    } catch (err: unknown) {
      setOptimisticCalled(null);
      const msg = (err as Error).message || 'Call rejected';
      setError(msg);
      sounds.playAlert();
    }
  }, [boardSize, calledNumbers, game?.id, getSession, handleRealtimeEvent, isHost, isMyTurn, opponent?.board, opponent?.id, player?.board, player?.id, syncGameState, targetLines]);

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

    matchEpochRef.current += 1;

    // 1. Locally reset match state immediately while preserving room code and game mode
    const currentBoardSize = game.board_size || 5;
    const currentTarget = currentBoardSize === 10 ? 10 : 5;

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
      board_size: currentBoardSize,
      target_lines: currentTarget,
    } : null);

    // 2. Execute server-side rematch RPC (non-blocking)
    try {
      const supabase = getSupabase();
      if (supabase && isSupabaseConfigured()) {
        await supabase.rpc('rematch_game', {
          p_game_id: game.id,
          p_session_id: sessionId,
        });
        await supabase.from('called_numbers').delete().eq('game_id', game.id);
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
          matchEpoch: matchEpochRef.current,
          boardSize: currentBoardSize,
        },
      }).catch(() => {});
    }

    // 4. Fire callback immediately so page navigates to board setup
    onRematchAcceptedRef.current?.();

    setLoading(false);
  }, [game?.board_size, game?.id, game?.room_code, getSession, player?.id]);

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
        }).catch(() => {});
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
      }).catch(() => {});
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
      }).catch(() => {});
    }
  }, [game?.id, player?.id]);

  // Auto-connect if initialRoomCode provided
  useEffect(() => {
    if (initialRoomCode && !game) {
      joinGame(initialRoomCode, undefined, true).catch(() => {});
    }
  }, [initialRoomCode, joinGame]);

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
    winner,
    isWinner,
    boardSize,
    targetLines,
    isHost,
    loading,
    error,
    optimisticCalled,
    isOpponentDisconnected,
    reconnectCountdown,
    createGame,
    setGameMode,
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
    resetGame: () => {
      clearActiveRoomCode();
      matchEpochRef.current = 1;
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
