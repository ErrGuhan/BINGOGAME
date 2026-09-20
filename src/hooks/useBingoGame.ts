'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Game, Player, CalledNumber, GameStateSnapshot, CallNumberResult, BoardSize, GameVariant } from '@/types/bingo';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { getSessionId, getPlayerName, setPlayerName, setActiveRoomCode, clearActiveRoomCode, calculateLines, getPlayerId } from '@/lib/gameEngine';
import { resolveGameVariant, validateBoardForVariant } from '@/lib/variantResolver';
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
  // Incremented on rematch acceptance to force channel teardown+re-subscribe
  // even when game.id/room_code haven't changed (same-row rematch).
  const [channelEpoch, setChannelEpoch] = useState<number>(0);

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
  const playerRef = useRef<Player | null>(null);
  const rematchStatusRef = useRef(rematchStatus);
  const calledNumbersRef = useRef<CalledNumber[]>([]);

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

  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(() => {
    p1Ref.current = p1;
  }, [p1]);

  useEffect(() => {
    p2Ref.current = p2;
  }, [p2]);

  useEffect(() => {
    rematchStatusRef.current = rematchStatus;
  }, [rematchStatus]);

  useEffect(() => {
    calledNumbersRef.current = calledNumbers;
  }, [calledNumbers]);

  // Derived state
  const isHost = Boolean(player?.player_number === 1);
  const opponent = isHost ? p2 : p1;

  // Bug C fix: activeTurnPlayerId is derived EXCLUSIVELY from game.current_turn_player_id.
  // The previous fallback that re-derived from calledNumbers caused transient "dual my-turn"
  // states when both clients polled simultaneously and current_turn_player_id was briefly null.
  const activeTurnPlayerId = game?.current_turn_player_id ?? null;
  if (process.env.NODE_ENV === 'development' && game?.status === 'playing' && !activeTurnPlayerId) {
    console.warn('[BingoDuel:Turn] current_turn_player_id is null during playing status — check server state.');
  }
  const isMyTurn = Boolean(game?.status === 'playing' && player?.id && activeTurnPlayerId === player.id);

  const winner = game?.winner_id ? (game.winner_id === player?.id ? player : opponent) : null;
  const isWinner = Boolean(player && game?.winner_id && player.id === game.winner_id);

  const variantConfig = useMemo(() => {
    return resolveGameVariant(game, player?.board);
  }, [game, player?.board]);

  const boardSize: BoardSize = variantConfig.boardSize;
  const targetLines: number = variantConfig.targetLines;

  // Synchronous client line calculation for immediate strike & header animation lockstep
  const myCalculatedLines = useMemo(() => {
    if (!player?.board || player.board.length === 0) return 0;
    return calculateLines(player.board, calledNumbers.map(c => c.number), boardSize).lines;
  }, [player?.board, calledNumbers, boardSize]);

  const opponentCalculatedLines = useMemo(() => {
    if (!opponent?.board || opponent.board.length === 0) return 0;
    return calculateLines(opponent.board, calledNumbers.map(c => c.number), boardSize).lines;
  }, [opponent?.board, calledNumbers, boardSize]);

  const myLines = myCalculatedLines;
  const opponentLines = opponentCalculatedLines;

  // Sync state from snapshot
  const applySnapshot = useCallback((snapshot: GameStateSnapshot | null) => {
    if (!snapshot) return;

    // Bug B fix: Removed the sweeping early-return that blocked ALL state updates during rematch.
    // Instead we apply targeted clearing below when status transitions back to 'ready'.

    setGame(prev => {
      if (!snapshot.game) return null;

      const resolvedConfig = resolveGameVariant(
        snapshot.game,
        snapshot.player?.board || player?.board,
        prev?.board_size
      );
      const resolvedBoardSize: BoardSize = resolvedConfig.boardSize;
      const resolvedVariant: GameVariant = resolvedConfig.variant;
      const resolvedTarget: number = resolvedConfig.targetLines;

      // Bug C fix: Use game.current_turn_player_id exclusively as the single source of truth
      // for turn tracking. Do not re-derive from calledNumbers — that path creates transient
      // "dual my-turn" states when both clients snapshot simultaneously.
      // If the server value is null during 'playing' and we have a local value, preserve it
      // only to handle the brief window between RPC confirmation and DB replication.
      let resolvedTurnId = snapshot.game.current_turn_player_id;
      if (snapshot.game.status === 'playing' && !resolvedTurnId && prev?.current_turn_player_id) {
        // Preserve the local turn only if the snapshot call count is lagging behind local
        const serverCallCount = snapshot.called_numbers?.length ?? 0;
        const localCallCount = calledNumbersRef.current.length;
        if (serverCallCount < localCallCount) {
          resolvedTurnId = prev.current_turn_player_id;
          console.warn('[BingoDuel:Turn] Snapshot lagging behind local calls; preserving local turn ID.');
        }
      }

      return {
        ...snapshot.game,
        board_size: resolvedBoardSize,
        variant: resolvedVariant,
        target_lines: resolvedTarget,
        current_turn_player_id: resolvedTurnId,
      };
    });

    if (snapshot.player) {
      const p = snapshot.player;
      setPlayer(prev => {
        // Bug A fix: During 'playing' status, if we have a local board (from setBoard optimistic
        // update), never let a snapshot overwrite it with null — the snapshot may arrive before
        // the DB write is visible, leaving player.board=null and the screen transition gated.
        const isPlaying = snapshot.game?.status === 'playing';
        const hasLocalBoard = Boolean(prev?.board && prev.board.length > 0);
        const snapBoard = p.board;

        let resolvedBoard: number[] | null;
        if (isPlaying && hasLocalBoard && !snapBoard) {
          // Preserve the locally-confirmed board during play; snapshot lagging
          resolvedBoard = prev!.board;
        } else {
          resolvedBoard = snapBoard || prev?.board || null;
        }

        // Bug B fix: During rematch epoch, if status is now 'ready', trust DB is_ready directly
        // (reset to false) so we don't carry over stale 'true' from the previous game.
        const isRematchReady = matchEpochRef.current > 1 && snapshot.game?.status === 'ready';
        const resolvedReady = isRematchReady ? Boolean(p.is_ready) : Boolean(p.is_ready || prev?.is_ready);

        return {
          ...p,
          board: isRematchReady ? null : resolvedBoard,
          is_ready: resolvedReady,
          lines_completed: isRematchReady ? 0 : (p.lines_completed ?? prev?.lines_completed ?? 0),
        };
      });
    }

    setP1(prev => {
      if (!snapshot.p1) return null;
      const snapP1 = snapshot.p1;
      // Bug B fix: In rematch epoch with status='ready', fully reset — don't carry stale state
      const isRematchReady = matchEpochRef.current > 1 && snapshot.game?.status === 'ready';
      return {
        ...snapP1,
        board: isRematchReady ? null : (snapP1.board || prev?.board || null),
        is_ready: isRematchReady ? Boolean(snapP1.is_ready) : Boolean(snapP1.is_ready || prev?.is_ready),
        lines_completed: isRematchReady ? 0 : (snapP1.lines_completed ?? prev?.lines_completed ?? 0),
      };
    });

    setP2(prev => {
      if (!snapshot.p2) return null;
      const snapP2 = snapshot.p2;
      const isRematchReady = matchEpochRef.current > 1 && snapshot.game?.status === 'ready';
      return {
        ...snapP2,
        board: isRematchReady ? null : (snapP2.board || prev?.board || null),
        is_ready: isRematchReady ? Boolean(snapP2.is_ready) : Boolean(snapP2.is_ready || prev?.is_ready),
        lines_completed: isRematchReady ? 0 : (snapP2.lines_completed ?? prev?.lines_completed ?? 0),
      };
    });

    // Bug B fix: In rematch epoch when server confirms status='ready' (fresh match),
    // unconditionally wipe the local called-number set regardless of what's in the snapshot.
    const isRematchReadySnapshot = matchEpochRef.current > 1 && snapshot.game?.status === 'ready';
    if (isRematchReadySnapshot) {
      setCalledNumbers([]);
      calledNumbersRef.current = [];
    } else if (snapshot.called_numbers) {
      // Bug C fix: Never let a snapshot with FEWER entries than our locally-confirmed set
      // shrink calledNumbers. This prevents the read-after-write lag race where get_game_state
      // returns a snapshot before the DB write from call_number is replicated.
      setCalledNumbers(prev => {
        const localLen = prev.length;
        const snapLen = snapshot.called_numbers.length;

        if (localLen > 0 && snapLen < localLen) {
          // Snapshot is stale — our local confirmed set is authoritative
          console.warn(
            `[BingoDuel:Sync] Snapshot has ${snapLen} calls but local has ${localLen}; keeping local (read-after-write lag).`
          );
          return prev;
        }

        // Merge: snapshot entries win for deduplication (they have authoritative server IDs)
        const callMap = new Map<number, CalledNumber>();
        for (const c of prev) {
          callMap.set(c.number, c);
        }
        for (const c of snapshot.called_numbers) {
          callMap.set(c.number, c);
        }
        const merged = Array.from(callMap.values()).sort((a, b) => a.sequence - b.sequence);
        calledNumbersRef.current = merged;
        return merged;
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
        const updated = [...prev, newCall];
        calledNumbersRef.current = updated;
        return updated;
      });

      // Clear optimistic call now that authoritative state has folded it
      setOptimisticCalled(null);

      setP1(prev => prev ? { ...prev, lines_completed: call.p1_lines } : null);
      setP2(prev => prev ? { ...prev, lines_completed: call.p2_lines } : null);

      // Strict turn alternation: determine next turn ID
      const p1IdVal = p1Ref.current?.id || p1?.id;
      const p2IdVal = p2Ref.current?.id || p2?.id;
      let oppositePlayerId: string | null = null;
      if (p1IdVal && p2IdVal) {
        oppositePlayerId = call.called_by === p1IdVal ? p2IdVal : p1IdVal;
      } else if (playerRef.current?.id) {
        oppositePlayerId = call.called_by === playerRef.current.id
          ? (opponent?.id || p2IdVal || p1IdVal || null)
          : playerRef.current.id;
      }
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
      // Bug B fix: Immediately clear all stale match state before the new game's syncGameState arrives.
      setCalledNumbers([]);
      calledNumbersRef.current = [];
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
      // Bug B fix: Increment channelEpoch to force channel teardown+re-subscribe.
      // This is necessary even when the same game_id row is reused (same-row rematch),
      // since game?.id and game?.room_code won't change, so the channel effect won't re-fire.
      setChannelEpoch(prev => prev + 1);

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
      const d = data as { boardSize: BoardSize; variant?: GameVariant; targetLines: number };
      if (d.boardSize) {
        setGame(prev => prev ? {
          ...prev,
          board_size: d.boardSize,
          variant: d.variant || (d.boardSize === 10 ? '10x10' : '5x5'),
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
  // Keyed on game.id, game.room_code, AND channelEpoch.
  // channelEpoch is incremented on rematch acceptance so the channel tears down and
  // re-subscribes even when the same game_id/room_code row is reused (same-row rematch).
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
        // Direct Database Postgres Changes: Fires in ~50ms whenever game/player/calls update in Supabase
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
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players' }, (payload) => {
          if (gameRef.current?.id && (payload.new as { game_id?: string })?.game_id === gameRef.current.id) {
            syncGameStateRef.current(gameRef.current.id);
          }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players' }, (payload) => {
          if (gameRef.current?.id && (payload.new as { game_id?: string })?.game_id === gameRef.current.id) {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id, game?.room_code, channelEpoch]);

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
        variant: chosenBoardSize === 10 ? '10x10' : '5x5',
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
    const config = resolveGameVariant(null, null, newBoardSize);

    // Optimistically update host state
    setGame(prev => prev ? {
      ...prev,
      board_size: config.boardSize,
      variant: config.variant,
      target_lines: config.targetLines,
    } : null);
    setPlayer(prev => prev ? { ...prev, board: null, is_ready: false, lines_completed: 0 } : null);
    setP1(prev => prev ? { ...prev, board: null, is_ready: false, lines_completed: 0 } : null);
    setP2(prev => prev ? { ...prev, board: null, is_ready: false, lines_completed: 0 } : null);

    // Broadcast change to opponent
    channelRef.current?.send({
      type: 'broadcast',
      event: 'GAME_MODE_CHANGED',
      payload: { boardSize: config.boardSize, variant: config.variant, targetLines: config.targetLines },
    }).catch(() => {});

    try {
      // 1. Call server API route with admin privileges to update database
      await fetch('/api/game/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: game.id,
          sessionId,
          boardSize: config.boardSize,
        }),
      }).catch((fetchErr) => {
        console.warn('[setGameMode] Server API update notice:', fetchErr);
      });

      // 2. Also attempt direct RPC if present
      const supabase = getSupabase();
      if (supabase && isSupabaseConfigured()) {
        await supabase.rpc('set_game_mode', {
          p_game_id: game.id,
          p_session_id: sessionId,
          p_board_size: config.boardSize,
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

      const resolvedConfig = resolveGameVariant(data);
      setGame(prev => prev ? {
        ...prev,
        board_size: resolvedConfig.boardSize,
        variant: resolvedConfig.variant,
        target_lines: resolvedConfig.targetLines,
      } : null);

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

        const roomTopic = `room:${cleanCode}`;
        if (channelRef.current) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'PLAYER_JOINED',
            payload: joinPayload,
          }).catch(() => {});
        } else {
          // Connect directly to the host's room channel (sub-100ms notification)
          const joinChannel = supabase.channel(roomTopic, {
            config: { broadcast: { self: false } },
          });
          joinChannel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              joinChannel.send({
                type: 'broadcast',
                event: 'PLAYER_JOINED',
                payload: joinPayload,
              }).catch(() => {});
            }
          });
          channelRef.current = joinChannel;
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

    // Authoritative variant config from single source of truth
    const config = resolveGameVariant(game, board);
    const validation = validateBoardForVariant(board, config);
    if (!validation.isValid) {
      setLoading(false);
      const errMsg = validation.error || 'Invalid board';
      setError(errMsg);
      throw new Error(errMsg);
    }

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

      let rpcData: any = null;
      let rpcSuccess = false;

      // Attempt server RPC with full board
      const res = await supabase.rpc('set_player_board', {
        p_game_id: game.id,
        p_session_id: sessionId,
        p_board: board,
      });

      if (res.error) {
        const errMsg = (res.error.message || '').toLowerCase();
        const isLegacyOrConstraint =
          errMsg.includes('25') ||
          errMsg.includes('could not find the function') ||
          errMsg.includes('schema cache');

        if (isLegacyOrConstraint) {
          console.warn('[BingoDuel:Setup] Unmigrated DB stored procedure constraint. Falling back to server API route /api/game/board...');
          const apiRes = await fetch('/api/game/board', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              gameId: game.id,
              sessionId,
              board,
            }),
          });
          const apiJson = await apiRes.json();
          if (!apiRes.ok || apiJson.error) {
            throw new Error(apiJson.error || 'Failed to submit board via server');
          }
          rpcData = apiJson;
          rpcSuccess = true;
        } else {
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
          boardSize: config.boardSize,
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
    if (!game?.id || !isMyTurn) {
      console.warn(`[BingoDuel:Turn] Blocked call attempt: not this player's turn (player: ${player?.id}, activeTurn: ${activeTurnPlayerId})`);
      return;
    }
    if (calledNumbers.some(c => c.number === number)) return;

    // Determine variant & max allowed number from authoritative game record
    const is10x10 = game.variant === '10x10' || game.board_size === 10;
    const maxAllowedNumber = is10x10 ? 100 : 25;

    // Variant-aware range validation (immediate client-side protection)
    if (number < 1 || number > maxAllowedNumber) {
      const msg = `Called number must be between 1 and ${maxAllowedNumber}`;
      setError(msg);
      sounds.playAlert();
      throw new Error(msg);
    }

    // 1. Instant Optimistic UI Update & Audio Chime
    setOptimisticCalled(number);
    sounds.playCall();

    const sessionId = getSession();

    try {
      const supabase = getSupabase();
      if (!supabase || !isSupabaseConfigured()) {
        throw new Error('Supabase is not configured. Please check your environment variables in .env.local.');
      }

      console.log(`[BingoDuel:Turn] Calling number #${number} in game ${game.id} (${is10x10 ? '10x10' : '5x5'})...`);

      let rpcData: any = null;

      // 1. Attempt modern 5-parameter call_number (with player_id for leaderboard tracking)
      const primaryRes = await supabase.rpc('call_number', {
        p_game_id: game.id,
        p_session_id: sessionId,
        p_number: number,
        // Pass our stable player_id for server-side leaderboard attribution.
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
            const legacyErrMsg = (legacyRes.error.message || '').toLowerCase();
            const isLegacyConstraintError =
              legacyErrMsg.includes('between 1 and 25') ||
              legacyErrMsg.includes('called_numbers_number_check') ||
              legacyErrMsg.includes('check constraint');

            if (is10x10 && isLegacyConstraintError) {
              console.warn('[BingoDuel:Turn] Unmigrated database (rejects 10x10 numbers > 25). Using dual-layer turn resilience fallback.');
              const nextSeq = (calledNumbers.length > 0 ? Math.max(...calledNumbers.map(c => c.sequence)) : 0) + 1;
              const allCalls = [...calledNumbers.map(c => c.number), number];
              const p1Lines = p1?.board ? calculateLines(p1.board, allCalls, 10).lines : 0;
              const p2Lines = p2?.board ? calculateLines(p2.board, allCalls, 10).lines : 0;
              const callerIsP1 = player?.player_number === 1;
              const callerLines = callerIsP1 ? p1Lines : p2Lines;
              const oppLines = callerIsP1 ? p2Lines : p1Lines;
              const target = game.target_lines || 10;

              let winnerId: string | null = null;
              let isGameOver = false;
              if (callerLines >= target) {
                winnerId = player?.id || null;
                isGameOver = true;
              } else if (oppLines >= target) {
                winnerId = (callerIsP1 ? p2?.id : p1?.id) || null;
                isGameOver = true;
              }

              const nextTurnId = isGameOver
                ? null
                : (callerIsP1 ? (p2?.id || p2Ref.current?.id || opponent?.id) : (p1?.id || p1Ref.current?.id || opponent?.id)) || null;

              // Sync call state server-side
              fetch('/api/game/call', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  gameId: game.id,
                  sessionId,
                  number,
                }),
              }).catch(() => {});

              rpcData = {
                success: true,
                number,
                sequence: nextSeq,
                called_by: player?.id,
                next_turn_player_id: nextTurnId,
                winner_id: winnerId,
                is_game_over: isGameOver,
                p1_lines: p1Lines,
                p2_lines: p2Lines,
                all_called_count: allCalls.length,
              };
            } else {
              console.error('[BingoDuel:Turn] Legacy call_number failed:', legacyRes.error);
              throw new Error(legacyRes.error.message || 'Call was rejected by the server');
            }
          } else {
            rpcData = legacyRes.data;
          }
        } else {
          const primaryErrMsg = (primaryRes.error.message || '').toLowerCase();
          const isLegacyConstraintError =
            primaryErrMsg.includes('between 1 and 25') ||
            primaryErrMsg.includes('called_numbers_number_check') ||
            primaryErrMsg.includes('check constraint');

          if (is10x10 && isLegacyConstraintError) {
            console.warn('[BingoDuel:Turn] Unmigrated database (rejects 10x10 numbers > 25). Using dual-layer turn resilience fallback.');
            const nextSeq = (calledNumbers.length > 0 ? Math.max(...calledNumbers.map(c => c.sequence)) : 0) + 1;
            const allCalls = [...calledNumbers.map(c => c.number), number];
            const p1Lines = p1?.board ? calculateLines(p1.board, allCalls, 10).lines : 0;
            const p2Lines = p2?.board ? calculateLines(p2.board, allCalls, 10).lines : 0;
            const callerIsP1 = player?.player_number === 1;
            const callerLines = callerIsP1 ? p1Lines : p2Lines;
            const oppLines = callerIsP1 ? p2Lines : p1Lines;
            const target = game.target_lines || 10;

            let winnerId: string | null = null;
            let isGameOver = false;
            if (callerLines >= target) {
              winnerId = player?.id || null;
              isGameOver = true;
            } else if (oppLines >= target) {
              winnerId = (callerIsP1 ? p2?.id : p1?.id) || null;
              isGameOver = true;
            }

            const nextTurnId = isGameOver
              ? null
              : (callerIsP1 ? (p2?.id || p2Ref.current?.id || opponent?.id) : (p1?.id || p1Ref.current?.id || opponent?.id)) || null;

              // Sync call state server-side
              fetch('/api/game/call', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  gameId: game.id,
                  sessionId,
                  number,
                }),
              }).catch(() => {});

            rpcData = {
              success: true,
              number,
              sequence: nextSeq,
              called_by: player?.id,
              next_turn_player_id: nextTurnId,
              winner_id: winnerId,
              is_game_over: isGameOver,
              p1_lines: p1Lines,
              p2_lines: p2Lines,
              all_called_count: allCalls.length,
            };
          } else {
            console.error('[BingoDuel:Turn] Server rejected call_number:', primaryRes.error);
            throw new Error(primaryRes.error.message || 'Call was rejected by the server');
          }
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
        const updated = [...prev, confirmedCall];
        calledNumbersRef.current = updated;
        return updated;
      });

      // 3. Clear optimistic call now that authoritative state has folded it in
      setOptimisticCalled(null);

      // 4. Strict turn alternation: determine next turn ID
      const p1IdVal = p1?.id || p1Ref.current?.id;
      const p2IdVal = p2?.id || p2Ref.current?.id;
      let oppositePlayerId: string | null = null;
      if (p1IdVal && p2IdVal) {
        oppositePlayerId = result.called_by === p1IdVal ? p2IdVal : p1IdVal;
      } else if (player?.id) {
        oppositePlayerId = result.called_by === player.id
          ? (opponent?.id || p2IdVal || p1IdVal || null)
          : player.id;
      }
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
  }, [activeTurnPlayerId, calledNumbers, game?.id, game?.variant, game?.board_size, game?.target_lines, getSession, isMyTurn, opponent?.id, p1?.id, p1?.board, p2?.id, p2?.board, player?.id, player?.player_number, syncGameState]);

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
      calledNumbersRef.current = [];
      setOptimisticCalled(null);
      setRematchStatus('accepted');
      // Bug B fix: Force channel to re-subscribe for the new game_id/room_code.
      setChannelEpoch(prev => prev + 1);

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
