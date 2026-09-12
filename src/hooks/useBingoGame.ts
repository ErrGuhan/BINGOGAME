'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Game, Player, CalledNumber, GameStateSnapshot, CallNumberResult, BoardSize } from '@/types/bingo';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { getSessionId, getPlayerName, setPlayerName, setActiveRoomCode, clearActiveRoomCode, calculateLines, getPlayerId } from '@/lib/gameEngine';
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
  const [channelStatus, setChannelStatus] = useState<'DISCONNECTED' | 'CONNECTING' | 'SUBSCRIBED' | 'ERROR' | 'CLOSED'>('DISCONNECTED');

  // External callbacks for rematch events — set by pages to avoid state-watching race conditions
  const onRematchDeclinedRef = useRef<(() => void) | null>(null);
  const onRematchAcceptedRef = useRef<((newRoomCode?: string) => void) | null>(null);

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

  // Strict Turn Invariant:
  // When game is 'playing', determine activeTurnPlayerId strictly.
  // Falls back to p1Id initially if current_turn_player_id is not yet set.
  // Exactly ONE player will ever have isMyTurn === true.
  const p1Id = p1?.id || (player?.player_number === 1 ? player.id : null);
  const activeTurnPlayerId = game?.status === 'playing'
    ? (game.current_turn_player_id || p1Id || null)
    : null;
  const isMyTurn = Boolean(game?.status === 'playing' && player?.id && activeTurnPlayerId === player.id);

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

      // Ensure current_turn_player_id is never wiped to null during 'playing' state
      const resolvedTurnId = snapshot.game.status === 'playing'
        ? (snapshot.game.current_turn_player_id || prev?.current_turn_player_id || snapshot.p1?.id || null)
        : snapshot.game.current_turn_player_id;

      return {
        ...snapshot.game,
        status: (matchEpochRef.current > 1 && snapshot.game.status === 'completed' && prev?.status) ? prev.status : snapshot.game.status,
        board_size: resolvedBoardSize,
        target_lines: resolvedTarget,
        current_turn_player_id: resolvedTurnId,
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
      // During rematch epoch, trust DB is_ready directly (don't preserve stale true from previous game)
      const isReadyVal = matchEpochRef.current > 1
        ? Boolean(snapP1.is_ready)
        : Boolean(snapP1.is_ready || prev?.is_ready);
      return {
        ...snapP1,
        board: hasFull100 && !snapHasFull100 ? prev!.board : (snapP1.board || prev?.board || null),
        is_ready: isReadyVal,
      };
    });

    setP2(prev => {
      if (!snapshot.p2) return null;
      const snapP2 = snapshot.p2;
      const hasFull100 = Boolean(prev?.board && prev.board.length === 100);
      const snapHasFull100 = Boolean(snapP2.board && snapP2.board.length === 100);
      // During rematch epoch, trust DB is_ready directly (don't preserve stale true from previous game)
      const isReadyVal = matchEpochRef.current > 1
        ? Boolean(snapP2.is_ready)
        : Boolean(snapP2.is_ready || prev?.is_ready);
      return {
        ...snapP2,
        board: hasFull100 && !snapHasFull100 ? prev!.board : (snapP2.board || prev?.board || null),
        is_ready: isReadyVal,
      };
    });

    // Authoritative called numbers merge:
    // If in rematch epoch and server confirms 0 calls, clear calls.
    if (matchEpochRef.current > 1 && snapshot.called_numbers?.length === 0) {
      setCalledNumbers([]);
    } else if (snapshot.called_numbers) {
      // Merge server called numbers with locally confirmed calls using Map deduplication
      setCalledNumbers(prev => {
        const callMap = new Map<number, CalledNumber>();
        for (const c of prev) {
          callMap.set(c.number, c);
        }
        for (const c of snapshot.called_numbers) {
          callMap.set(c.number, c);
        }
        return Array.from(callMap.values()).sort((a, b) => a.sequence - b.sequence);
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

      const newCall: CalledNumber = {
        id: 'call_' + call.sequence,
        number: call.number,
        called_by: call.called_by,
        sequence: call.sequence,
        called_at: new Date().toISOString(),
      };

      // Immediately fold into authoritative called numbers
      setCalledNumbers(prev => {
        if (prev.some(c => c.number === newCall.number)) return prev;
        return [...prev, newCall];
      });

      // Clear optimistic call now that authoritative state has folded it
      setOptimisticCalled(null);

      setP1(prev => prev ? { ...prev, lines_completed: call.p1_lines } : null);
      setP2(prev => prev ? { ...prev, lines_completed: call.p2_lines } : null);

      // Strict turn alternation: determine next turn ID
      const p1IdVal = p1Ref.current?.id;
      const p2IdVal = p2Ref.current?.id;
      const oppositePlayerId = call.called_by === p1IdVal ? p2IdVal : p1IdVal;
      const nextTurnId = call.is_game_over
        ? null
        : (call.next_turn_player_id || oppositePlayerId || null);

      setGame(prev => {
        if (!prev) return null;
        return {
          ...prev,
          status: call.is_game_over ? 'completed' : prev.status,
          current_turn_player_id: nextTurnId,
          winner_id: call.winner_id,
        };
      });

      console.log(`[BingoDuel:Turn] NUMBER_CALLED event: called=#${call.number} by ${call.called_by}. Next turn: ${nextTurnId}`);

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
      console.log('[BingoDuel:Sync] Received PLAYER_READY event:', d);
      if (d.playerId) {
        setP1(prev => prev && prev.id === d.playerId ? { ...prev, is_ready: true } : prev);
        setP2(prev => prev && prev.id === d.playerId ? { ...prev, is_ready: true } : prev);
      }

      // Only transition to 'playing' when the server has confirmed both players are ready.
      // Trust d.allReady (which is set from rpcData.all_ready on the sender's side).
      if (d.allReady && d.currentTurnPlayerId) {
        console.log('[BingoDuel:Sync] Both players confirmed ready. Advancing to playing!');
        setGame(prev => prev ? {
          ...prev,
          status: 'playing',
          current_turn_player_id: d.currentTurnPlayerId!,
        } : null);
        sounds.playLineComplete();
      }
      // Always sync from server to get authoritative game state (handles both clients)
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
      const d = data as { newGameId?: string; newRoomCode?: string; boardSize?: BoardSize; matchEpoch?: number };
      console.log('[BingoDuel:Sync] Received REMATCH_ACCEPTED event:', d);
      sounds.playDraft(520);
      matchEpochRef.current += 1;
      const nextBoardSize: BoardSize = (d?.boardSize === 10 || d?.boardSize === 5)
        ? d.boardSize
        : (gameRef.current?.board_size === 10 ? 10 : 5);
      const nextTarget = nextBoardSize === 10 ? 10 : 5;

      setRematchStatus('accepted');
      setCalledNumbers([]);
      setOptimisticCalled(null);
      setPlayer(prev => prev ? { ...prev, board: null, is_ready: false, lines_completed: 0 } : null);
      setP1(null);
      setP2(null);
      setGame(prev => prev ? {
        ...prev,
        status: 'ready',
        winner_id: null,
        current_turn_player_id: null,
        board_size: nextBoardSize,
        target_lines: nextTarget,
      } : null);

      if (d.newRoomCode && d.newRoomCode !== gameRef.current?.room_code) {
        console.log('[BingoDuel:Sync] Auto-joining new rematch room:', d.newRoomCode);
        setActiveRoomCode(d.newRoomCode);
        joinGame(d.newRoomCode, undefined, true).catch(err => {
          console.error('[BingoDuel:Sync] Failed to auto-join rematch room:', err);
        });
      }

      // Fire callback so pages can navigate to board setup screen immediately
      onRematchAcceptedRef.current?.(d.newRoomCode);
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
  // Keyed explicitly by BOTH game.id and game.room_code to ensure clean teardown on rematch/new game
  useEffect(() => {
    if (!game?.id || !game?.room_code) {
      setChannelStatus('DISCONNECTED');
      return;
    }
    const roomCode = game.room_code.toUpperCase();
    const gameId = game.id;
    const supabase = getSupabase();

    if (!supabase || !isSupabaseConfigured()) {
      setChannelStatus('DISCONNECTED');
      return;
    }

    let activeChannel: RealtimeChannel | null = null;
    let isDisposed = false;

    setChannelStatus('CONNECTING');
    console.log(`[BingoDuel:Sync] Subscribing to channel room:${roomCode} for game ${gameId}...`);

    const setupChannel = () => {
      if (isDisposed) return;
      if (activeChannel) {
        console.log(`[BingoDuel:Sync] Tearing down previous active channel...`);
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
          console.log(`[BingoDuel:Sync] Realtime channel status: ${status}`);
          if (status === 'SUBSCRIBED') {
            setChannelStatus('SUBSCRIBED');
            reconnectAttemptRef.current = 0;
            // Immediate state sync upon connecting/reconnecting
            if (gameRef.current?.id) {
              syncGameStateRef.current(gameRef.current.id);
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setChannelStatus('ERROR');
            console.warn(`[BingoDuel:Sync] Realtime channel status: ${status}. Scheduling recovery...`, err);
            if (!isDisposed) {
              const backoffDelay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 6000);
              reconnectAttemptRef.current += 1;
              if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
              reconnectTimerRef.current = setTimeout(() => {
                if (!isDisposed) setupChannel();
              }, backoffDelay);
            }
          } else if (status === 'CLOSED') {
            setChannelStatus('CLOSED');
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
      setChannelStatus('DISCONNECTED');
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (activeChannel) {
        console.log(`[BingoDuel:Sync] Unsubscribing channel room:${roomCode} for game ${gameId}`);
        supabase.removeChannel(activeChannel);
      }
      channelRef.current = null;
    };
  }, [game?.id, game?.room_code]);

  // Active Board Setup readiness recovery fallback:
  // If this player has locked their board but the game hasn't started yet,
  // poll get_game_state every 2 seconds to check if the opponent has locked.
  // This guarantees starting even if a Realtime WebSocket broadcast packet was dropped.
  useEffect(() => {
    if (!game?.id || game.status === 'playing' || game.status === 'completed') return;
    if (!player?.is_ready) return;

    const interval = setInterval(() => {
      if (gameRef.current?.id && playerRef.current?.is_ready) {
        syncGameStateRef.current(gameRef.current.id);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [game?.id, game?.status, player?.is_ready]);

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
        const isBoardCountMismatch =
          res.error.message?.toLowerCase().includes('exactly') ||
          res.error.message?.toLowerCase().includes('numbers') ||
          res.error.code === '22023' || // invalid_parameter_value (postgres)
          res.error.code === 'P0001';   // raise_exception (plpgsql)

        if (isBoardCountMismatch && board.length === 100) {
          // Dual-layer resilience: if DB has legacy 25-number validation, send a 25-number slice
          // to confirm is_ready = TRUE and status = 'playing' on Postgres, while strictly
          // preserving the full 100-number board locally and in Realtime.
          console.warn('[BingoDuel:Sync] Unmigrated database (expects 25 numbers). Using dual-layer readiness fallback.');
          const slice25 = Array.from({ length: 25 }, (_, i) => i + 1);
          const fallbackRes = await supabase.rpc('set_player_board', {
            p_game_id: game.id,
            p_session_id: sessionId,
            p_board: slice25,
          });
          if (fallbackRes.error) {
            throw fallbackRes.error;
          }
          rpcData = fallbackRes.data;
          rpcSuccess = true;
        } else {
          // For any other server error, re-throw so the user sees it
          throw res.error;
        }
      } else {
        rpcData = res.data;
        rpcSuccess = true;
      }

      // Trust server truth exclusively for allReady — never use stale refs (p1Ref/p2Ref) here.
      // The set_player_board RPC atomically sets status='playing' when both boards are submitted.
      // rpcData.all_ready is the authoritative answer from Postgres.
      const isAllReady = Boolean(rpcData?.all_ready);
      const turnId = rpcData?.current_turn_player_id || null;

      // If server confirmed both are ready, optimistically update own state immediately
      // (the other player will receive PLAYER_READY broadcast and also update).
      if (isAllReady && turnId) {
        setGame(prev => prev ? {
          ...prev,
          status: 'playing',
          current_turn_player_id: turnId,
        } : null);
        sounds.playLineComplete();
      }

      // Broadcast to opponent so they can transition immediately too.
      // allReady comes from server truth; currentTurnPlayerId is server-assigned.
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
      }).catch((broadcastErr) => {
        console.warn('[setBoard] PLAYER_READY broadcast failed:', broadcastErr);
      });

      // Clear rematch flag
      setRematchStatus(prev => prev === 'accepted' ? 'idle' : prev);

      // Always sync from server after board is set — this drives the transition via postgres_changes
      // for both clients regardless of broadcast delivery.
      syncGameState(game.id).catch((syncErr) => {
        console.warn('[setBoard] syncGameState failed:', syncErr);
      });
    } catch (err: unknown) {
      // Surface errors to the UI — a silent console.warn means players never know
      // why "Lock Board & Play" appears to do nothing.
      const msg = (err as Error).message || 'Failed to lock board';
      console.error('[setBoard] RPC error:', msg, err);
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

  // ACTION: Call Number (Strict Alternating Turns & Authoritative State Folding)
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

      console.log(`[BingoDuel:Turn] Calling number #${number} in game ${game.id}...`);

      let rpcData: any = null;

      // 1. Attempt modern 5-parameter call_number (with player_id for leaderboard tracking)
      const primaryRes = await supabase.rpc('call_number', {
        p_game_id: game.id,
        p_session_id: sessionId,
        p_number: number,
        // Pass our stable player_id for server-side leaderboard attribution.
        // The opponent's player_id is unknown to us (it lives in their localStorage),
        // so p_opponent_player_id is null here. The DB skips the null row gracefully.
        // The caller always writes their OWN win; both players write their own
        // matches_played through whichever RPC they themselves trigger.
        p_player_id: getPlayerId(),
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
          console.warn('[BingoDuel:Turn] Unmigrated Supabase database detected (missing 5-param call_number). Retrying with legacy 3-param signature...');
          const legacyRes = await supabase.rpc('call_number', {
            p_game_id: game.id,
            p_session_id: sessionId,
            p_number: number,
          });

          if (legacyRes.error) {
            console.error('[BingoDuel:Turn] Legacy call_number failed:', legacyRes.error);
            throw new Error(legacyRes.error.message || 'Call was rejected by the server');
          }
          rpcData = legacyRes.data;
        } else {
          console.error('[BingoDuel:Turn] Server rejected call_number:', primaryRes.error);
          throw new Error(primaryRes.error.message || 'Call was rejected by the server');
        }
      } else {
        rpcData = primaryRes.data;
      }

      const result = rpcData as CallNumberResult;

      // 2. Immediately fold confirmed call into authoritative calledNumbers state
      const confirmedCall: CalledNumber = {
        id: 'call_' + result.sequence,
        number: result.number,
        called_by: result.called_by,
        sequence: result.sequence,
        called_at: new Date().toISOString(),
      };

      setCalledNumbers(prev => {
        if (prev.some(c => c.number === confirmedCall.number)) return prev;
        return [...prev, confirmedCall];
      });

      // 3. Clear optimistic call now that authoritative state has folded it in
      setOptimisticCalled(null);

      // 4. Strict turn alternation: determine next turn ID
      const p1IdVal = p1?.id;
      const p2IdVal = p2?.id;
      const oppositePlayerId = result.called_by === p1IdVal ? p2IdVal : p1IdVal;
      const nextTurnId = result.is_game_over
        ? null
        : (result.next_turn_player_id || oppositePlayerId || null);

      setP1(prev => prev ? { ...prev, lines_completed: result.p1_lines } : null);
      setP2(prev => prev ? { ...prev, lines_completed: result.p2_lines } : null);

      setGame(prev => {
        if (!prev) return null;
        return {
          ...prev,
          status: result.is_game_over ? 'completed' : prev.status,
          current_turn_player_id: nextTurnId,
          winner_id: result.winner_id,
        };
      });

      console.log(`[BingoDuel:Turn] Call confirmed: #${result.number} by ${result.called_by}. Next turn: ${nextTurnId}`);

      if (result.is_game_over) {
        sounds.playVictory();
      }

      // 5. Broadcast to opponent instantly via Supabase Realtime
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'NUMBER_CALLED',
          payload: {
            ...result,
            next_turn_player_id: nextTurnId,
          },
        }).catch(() => {});
      }

      // 6. Fast sync in background
      syncGameState(game.id).catch(() => {});
    } catch (err: unknown) {
      setOptimisticCalled(null);
      const msg = (err as Error).message || 'Call rejected';
      setError(msg);
      sounds.playAlert();
      throw err; // Re-throw so caller UI (handleExecuteCall) knows the call failed
    }
  }, [calledNumbers, game?.id, getSession, isMyTurn, p1?.id, p2?.id, syncGameState]);

  // ACTION: Claim Timeout Win
  const claimTimeoutWin = useCallback(async () => {
    if (!game?.id) return;
    try {
      const supabase = getSupabase();
      if (!supabase || !isSupabaseConfigured()) return;

      let rpcData: any = null;

      // 1. Attempt modern 4-parameter claim_timeout_win (with player_id for leaderboard tracking)
      const primaryRes = await supabase.rpc('claim_timeout_win', {
        p_game_id: game.id,
        p_session_id: getSession(),
        p_player_id: getPlayerId(),
        p_opponent_player_id: null,
      });

      if (primaryRes.error) {
        const isSignatureMismatch =
          primaryRes.error.code === 'PGRST202' ||
          primaryRes.error.code === '42883' ||
          primaryRes.error.message?.toLowerCase().includes('schema cache') ||
          primaryRes.error.message?.toLowerCase().includes('could not find the function') ||
          primaryRes.error.message?.toLowerCase().includes('claim_timeout_win');

        if (isSignatureMismatch) {
          console.warn('[BingoDuel:Turn] Retrying claim_timeout_win with legacy 2-param signature...');
          const legacyRes = await supabase.rpc('claim_timeout_win', {
            p_game_id: game.id,
            p_session_id: getSession(),
          });

          if (legacyRes.error) throw legacyRes.error;
          rpcData = legacyRes.data;
        } else {
          throw primaryRes.error;
        }
      } else {
        rpcData = primaryRes.data;
      }

      handleRealtimeEvent('TIMEOUT_WIN_CLAIMED', rpcData);
    } catch (err: unknown) {
      console.error('Failed to claim timeout:', err);
    }
  }, [game?.id, getSession, handleRealtimeEvent]);

  // ACTION: Accept Rematch (Creates a fresh game row on server and notifies room via Realtime)
  const acceptRematch = useCallback(async () => {
    if (!game?.id) return;
    setLoading(true);
    setError(null);
    const sessionId = getSession();

    matchEpochRef.current += 1;

    const currentBoardSize = game.board_size || 5;
    const currentTarget = currentBoardSize === 10 ? 10 : 5;
    const myName = player?.display_name || getPlayerName();

    console.log('[BingoDuel:Sync] Creating fresh game row for rematch...');

    try {
      const supabase = getSupabase();
      if (!supabase || !isSupabaseConfigured()) {
        throw new Error('Supabase is not configured.');
      }

      // Generate a new game row in Supabase via create_game
      let newGameData: any = null;
      const res3 = await supabase.rpc('create_game', {
        p_session_id: sessionId,
        p_display_name: myName,
        p_board_size: currentBoardSize,
      });

      if (res3.error) {
        const res2 = await supabase.rpc('create_game', {
          p_session_id: sessionId,
          p_display_name: myName,
        });
        if (res2.error) throw res2.error;
        newGameData = res2.data;
      } else {
        newGameData = res3.data;
      }

      console.log('[BingoDuel:Sync] Fresh rematch game created:', newGameData);

      // Broadcast acceptance with the new room code to the CURRENT channel before teardown
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'REMATCH_ACCEPTED',
          payload: {
            newGameId: newGameData.game_id,
            newRoomCode: newGameData.room_code,
            acceptedBy: player?.id,
            matchEpoch: matchEpochRef.current,
            boardSize: currentBoardSize,
            targetLines: currentTarget,
          },
        }).catch((err) => {
          console.warn('[BingoDuel:Sync] Failed to broadcast REMATCH_ACCEPTED:', err);
        });
      }

      // Populate local state for the new game as Player 1
      const newHost: Player = {
        id: newGameData.player_id,
        session_id: sessionId,
        display_name: myName,
        player_number: 1,
        board: null,
        is_ready: false,
        connected: true,
        lines_completed: 0,
        last_seen_at: new Date().toISOString(),
      };

      const newGame: Game = {
        id: newGameData.game_id,
        room_code: newGameData.room_code,
        status: 'waiting',
        target_lines: currentTarget,
        board_size: currentBoardSize,
        current_turn_player_id: null,
        winner_id: null,
        created_at: new Date().toISOString(),
      };

      setActiveRoomCode(newGameData.room_code);
      setGame(newGame);
      setPlayer(newHost);
      setP1(newHost);
      setP2(null);
      setCalledNumbers([]);
      setOptimisticCalled(null);
      setRematchStatus('accepted');

      // Fire callback so pages can update route and navigate to board setup
      onRematchAcceptedRef.current?.(newGameData.room_code);
    } catch (err: unknown) {
      console.error('[BingoDuel:Sync] Failed to initialize rematch:', err);
      setError('Failed to initialize rematch. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [game?.board_size, game?.id, getSession, player?.display_name, player?.id]);

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
    channelStatus,
    activeGameId: game?.id || null,
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
    setOnRematchAccepted: (cb: ((newRoomCode?: string) => void) | null) => { onRematchAcceptedRef.current = cb; },
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
