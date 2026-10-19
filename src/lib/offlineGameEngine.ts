import { Game, Player, CalledNumber, GameStateSnapshot, CallNumberResult, BoardSize, GameVariant } from '@/types/bingo';
import { calculateLines, validateBoard } from './gameEngine';

export interface OfflineRoomState {
  game: Game;
  p1: Player;
  p2: Player | null;
  called_numbers: CalledNumber[];
  rematch_status?: 'idle' | 'requesting' | 'received' | 'accepted' | 'declined';
  rematch_requester_id?: string | null;
}

export type OfflineGameEventMap = {
  stateChange: GameStateSnapshot;
  numberCalled: CallNumberResult;
  turnChanged: { currentTurnPlayerId: string | null };
  gameCompleted: { winnerId: string; p1Lines: number; p2Lines: number };
  rematchStatusChanged: { status: 'idle' | 'requesting' | 'received' | 'accepted' | 'declined'; requesterId: string | null };
  error: Error;
};

export type OfflineGameEventType = keyof OfflineGameEventMap;
export type OfflineGameEventListener<K extends OfflineGameEventType> = (data: OfflineGameEventMap[K]) => void;

/**
 * Generates a random 4-letter alphanumeric room code
 */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // excluding confusing chars I, O, 0, 1
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Custom Error class for typed Offline Game Engine errors.
 */
export class OfflineGameEngineError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'OfflineGameEngineError';
  }
}

/**
 * Pure state reducer transitions for deterministic offline game logic.
 */
export type OfflineGameAction =
  | { type: 'SET_MODE'; boardSize: BoardSize }
  | { type: 'JOIN'; guestSessionId: string; guestDisplayName?: string }
  | { type: 'SET_BOARD'; sessionId: string; board: number[] }
  | { type: 'CALL_NUMBER'; sessionId: string; number: number }
  | { type: 'REQUEST_REMATCH'; sessionId: string }
  | { type: 'ACCEPT_REMATCH'; sessionId: string }
  | { type: 'DECLINE_REMATCH'; sessionId: string }
  | { type: 'RESET_REMATCH' };

export interface ReducerResult {
  state: OfflineRoomState;
  events: Array<{
    type: OfflineGameEventType;
    data: OfflineGameEventMap[OfflineGameEventType];
  }>;
  callResult?: CallNumberResult;
  boardResult?: { allReady: boolean; turnId: string | null };
}

export function offlineGameReducer(state: OfflineRoomState, action: OfflineGameAction): ReducerResult {
  const events: ReducerResult['events'] = [];
  const next: OfflineRoomState = {
    ...state,
    game: { ...state.game },
    p1: { ...state.p1 },
    p2: state.p2 ? { ...state.p2 } : null,
    called_numbers: [...state.called_numbers],
  };

  switch (action.type) {
    case 'SET_MODE': {
      if (next.game.status !== 'waiting' && next.game.status !== 'ready') {
        return { state: next, events };
      }
      next.game.board_size = action.boardSize;
      next.game.target_lines = action.boardSize === 10 ? 10 : 5;
      next.game.variant = action.boardSize === 10 ? '10x10' : '5x5';
      return { state: next, events };
    }

    case 'JOIN': {
      if (next.p2 && next.p2.session_id !== action.guestSessionId) {
        throw new OfflineGameEngineError('Room is full (already has 2 duelists)', 'ROOM_FULL');
      }

      if (next.p1.session_id === action.guestSessionId) {
        next.p1.connected = true;
        next.p1.last_seen_at = new Date().toISOString();
        return { state: next, events };
      }

      if (!next.p2) {
        const guestPlayerId = `offline-player-2-${Math.random().toString(36).substring(2, 7)}`;
        next.p2 = {
          id: guestPlayerId,
          session_id: action.guestSessionId,
          display_name: action.guestDisplayName || 'Challenger',
          player_number: 2,
          board: null,
          is_ready: false,
          connected: true,
          lines_completed: 0,
          last_seen_at: new Date().toISOString(),
        };
        next.game.status = 'ready';
      } else {
        next.p2.connected = true;
        next.p2.last_seen_at = new Date().toISOString();
      }
      return { state: next, events };
    }

    case 'SET_BOARD': {
      const isP1 = next.p1.session_id === action.sessionId;
      const isP2 = next.p2?.session_id === action.sessionId;

      if (!isP1 && !isP2) {
        throw new OfflineGameEngineError('Player not in this game', 'PLAYER_NOT_IN_GAME');
      }

      const expectedSize = next.game.board_size;
      if (!validateBoard(action.board, expectedSize)) {
        throw new OfflineGameEngineError(
          `Invalid board layout for ${expectedSize}x${expectedSize} Bingo`,
          'INVALID_BOARD'
        );
      }

      if (isP1) {
        next.p1.board = [...action.board];
        next.p1.is_ready = true;
      } else if (next.p2) {
        next.p2.board = [...action.board];
        next.p2.is_ready = true;
      }

      const allReady = Boolean(next.p1.is_ready && next.p2?.is_ready);

      if (allReady && next.game.status !== 'playing') {
        next.game.status = 'playing';
        next.game.current_turn_player_id = next.p1.id;
        events.push({
          type: 'turnChanged',
          data: { currentTurnPlayerId: next.p1.id },
        });
      }

      return {
        state: next,
        events,
        boardResult: {
          allReady,
          turnId: next.game.current_turn_player_id,
        },
      };
    }

    case 'CALL_NUMBER': {
      if (next.game.status !== 'playing') {
        throw new OfflineGameEngineError('Game is not currently active', 'GAME_NOT_ACTIVE');
      }

      const isP1 = next.p1.session_id === action.sessionId;
      const isP2 = next.p2?.session_id === action.sessionId;

      if (!isP1 && !isP2) {
        throw new OfflineGameEngineError('Player not recognized in this game', 'PLAYER_NOT_RECOGNIZED');
      }

      const callingPlayer = isP1 ? next.p1 : next.p2!;
      const opponentPlayer = isP1 ? next.p2! : next.p1;

      // Strict Turn Enforcement
      if (next.game.current_turn_player_id !== callingPlayer.id) {
        throw new OfflineGameEngineError('Not your turn to call a number', 'NOT_YOUR_TURN');
      }

      // Number Range Validation
      const maxNumber = next.game.board_size * next.game.board_size;
      if (action.number < 1 || action.number > maxNumber || !Number.isInteger(action.number)) {
        throw new OfflineGameEngineError(
          `Number ${action.number} out of valid range (1..${maxNumber})`,
          'NUMBER_OUT_OF_RANGE'
        );
      }

      // Duplicate Prevention
      const alreadyCalled = next.called_numbers.some(c => c.number === action.number);
      if (alreadyCalled) {
        throw new OfflineGameEngineError(
          `Number ${action.number} has already been called`,
          'NUMBER_ALREADY_CALLED'
        );
      }

      const sequence = next.called_numbers.length + 1;
      const callRecord: CalledNumber = {
        id: `call-${Date.now()}-${sequence}`,
        number: action.number,
        called_by: callingPlayer.id,
        sequence,
        called_at: new Date().toISOString(),
      };

      next.called_numbers.push(callRecord);

      const allCalledNumbers = next.called_numbers.map(c => c.number);
      const size = next.game.board_size;
      const target = next.game.target_lines;

      // Recalculate completed lines for both duelists
      const p1Lines = next.p1.board ? calculateLines(next.p1.board, allCalledNumbers, size).lines : 0;
      const p2Lines = next.p2?.board ? calculateLines(next.p2.board, allCalledNumbers, size).lines : 0;

      next.p1.lines_completed = p1Lines;
      if (next.p2) {
        next.p2.lines_completed = p2Lines;
      }

      // Win condition check: caller priority matching Postgres RPC
      let winnerId: string | null = null;
      let isGameOver = false;

      const callerLines = isP1 ? p1Lines : p2Lines;
      const opponentLines = isP1 ? p2Lines : p1Lines;

      if (callerLines >= target) {
        winnerId = callingPlayer.id;
        isGameOver = true;
      } else if (opponentLines >= target) {
        winnerId = opponentPlayer.id;
        isGameOver = true;
      }

      if (isGameOver) {
        next.game.status = 'completed';
        next.game.winner_id = winnerId;
        next.game.current_turn_player_id = null;
        events.push({
          type: 'gameCompleted',
          data: { winnerId: winnerId!, p1Lines, p2Lines },
        });
      } else {
        // Toggle turn to the opponent
        next.game.current_turn_player_id = opponentPlayer.id;
        events.push({
          type: 'turnChanged',
          data: { currentTurnPlayerId: opponentPlayer.id },
        });
      }

      const callResult: CallNumberResult = {
        success: true,
        number: action.number,
        sequence,
        called_by: callingPlayer.id,
        next_turn_player_id: next.game.current_turn_player_id,
        winner_id: next.game.winner_id,
        is_game_over: isGameOver,
        p1_lines: p1Lines,
        p2_lines: p2Lines,
        all_called_count: sequence,
      };

      events.push({
        type: 'numberCalled',
        data: callResult,
      });

      return {
        state: next,
        events,
        callResult,
      };
    }

    case 'REQUEST_REMATCH': {
      const isP1 = next.p1.session_id === action.sessionId;
      const isP2 = next.p2?.session_id === action.sessionId;
      if (!isP1 && !isP2) {
        throw new OfflineGameEngineError('Player not recognized in this game', 'PLAYER_NOT_RECOGNIZED');
      }

      const requester = isP1 ? next.p1 : next.p2!;
      next.rematch_status = 'requesting';
      next.rematch_requester_id = requester.id;

      events.push({
        type: 'rematchStatusChanged',
        data: { status: 'requesting', requesterId: requester.id },
      });

      return { state: next, events };
    }

    case 'ACCEPT_REMATCH': {
      next.rematch_status = 'accepted';
      events.push({
        type: 'rematchStatusChanged',
        data: { status: 'accepted', requesterId: next.rematch_requester_id || null },
      });
      return { state: next, events };
    }

    case 'DECLINE_REMATCH': {
      next.rematch_status = 'declined';
      events.push({
        type: 'rematchStatusChanged',
        data: { status: 'declined', requesterId: next.rematch_requester_id || null },
      });
      return { state: next, events };
    }

    case 'RESET_REMATCH': {
      next.called_numbers = [];
      next.game.status = 'ready';
      next.game.winner_id = null;
      next.game.current_turn_player_id = null;
      next.rematch_status = 'idle';
      next.rematch_requester_id = null;

      next.p1.board = null;
      next.p1.is_ready = false;
      next.p1.lines_completed = 0;

      if (next.p2) {
        next.p2.board = null;
        next.p2.is_ready = false;
        next.p2.lines_completed = 0;
      }

      events.push({
        type: 'rematchStatusChanged',
        data: { status: 'idle', requesterId: null },
      });

      return { state: next, events };
    }

    default:
      return { state: next, events };
  }
}

/**
 * Authoritative, zero-dependency Offline Game Engine that replicates
 * the Postgres RPC rules client-side with an event-driven pub/sub architecture.
 */
export class OfflineGameEngine {
  private state: OfflineRoomState;
  private listeners: Map<OfflineGameEventType, Set<OfflineGameEventListener<any>>> = new Map();

  constructor(
    hostSessionId: string,
    hostDisplayName: string = 'Host',
    boardSize: BoardSize = 5,
    customRoomCode?: string
  ) {
    const roomCode = customRoomCode || generateRoomCode();
    const gameId = `offline-game-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const hostPlayerId = `offline-player-1-${Math.random().toString(36).substring(2, 7)}`;

    const targetLines = boardSize === 10 ? 10 : 5;
    const variant: GameVariant = boardSize === 10 ? '10x10' : '5x5';

    this.state = {
      game: {
        id: gameId,
        room_code: roomCode,
        status: 'waiting',
        current_turn_player_id: null,
        winner_id: null,
        target_lines: targetLines,
        board_size: boardSize,
        variant,
        created_at: new Date().toISOString(),
      },
      p1: {
        id: hostPlayerId,
        session_id: hostSessionId,
        display_name: hostDisplayName,
        player_number: 1,
        board: null,
        is_ready: false,
        connected: true,
        lines_completed: 0,
        last_seen_at: new Date().toISOString(),
      },
      p2: null,
      called_numbers: [],
      rematch_status: 'idle',
      rematch_requester_id: null,
    };
  }

  // ─── Event Emitter Methods ──────────────────────────────────────────────

  public on<K extends OfflineGameEventType>(event: K, listener: OfflineGameEventListener<K>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    return () => {
      this.off(event, listener);
    };
  }

  public off<K extends OfflineGameEventType>(event: K, listener: OfflineGameEventListener<K>): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener);
    }
  }

  public subscribe(listener: (snapshot: GameStateSnapshot) => void): () => void {
    const hostSession = this.state.p1.session_id;
    return this.on('stateChange', () => {
      listener(this.getSnapshotForSession(hostSession));
    });
  }

  private emit<K extends OfflineGameEventType>(event: K, data: OfflineGameEventMap[K]): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of set) {
        try {
          listener(data);
        } catch (err) {
          console.error(`[OfflineGameEngine] Error in listener for event ${event}:`, err);
        }
      }
    }
  }

  private dispatchInternal(action: OfflineGameAction): ReducerResult {
    const res = offlineGameReducer(this.state, action);
    this.state = res.state;

    // Emit all domain events generated by reducer
    for (const evt of res.events) {
      this.emit(evt.type, evt.data as any);
    }

    // Always emit stateChange with snapshot for host
    this.emit('stateChange', this.getSnapshotForSession(this.state.p1.session_id));

    return res;
  }

  public dispatch(action: OfflineGameAction): ReducerResult {
    return this.dispatchInternal(action);
  }

  // ─── Public Methods (100% Backward Compatible) ──────────────────────────

  public getRawState(): OfflineRoomState {
    return this.state;
  }

  public setMode(boardSize: BoardSize): void {
    this.dispatchInternal({ type: 'SET_MODE', boardSize });
  }

  public join(guestSessionId: string, guestDisplayName: string = 'Challenger'): Player {
    this.dispatchInternal({ type: 'JOIN', guestSessionId, guestDisplayName });
    return this.state.p2 || this.state.p1;
  }

  public setBoard(sessionId: string, board: number[]): { allReady: boolean; turnId: string | null } {
    const res = this.dispatchInternal({ type: 'SET_BOARD', sessionId, board });
    return res.boardResult!;
  }

  public callNumber(sessionId: string, number: number): CallNumberResult {
    const res = this.dispatchInternal({ type: 'CALL_NUMBER', sessionId, number });
    return res.callResult!;
  }

  public requestRematch(sessionId: string): void {
    this.dispatchInternal({ type: 'REQUEST_REMATCH', sessionId });
  }

  public acceptRematch(sessionId: string): void {
    this.dispatchInternal({ type: 'ACCEPT_REMATCH', sessionId });
  }

  public declineRematch(sessionId: string): void {
    this.dispatchInternal({ type: 'DECLINE_REMATCH', sessionId });
  }

  public resetForRematch(): void {
    this.dispatchInternal({ type: 'RESET_REMATCH' });
  }

  public getSnapshotForSession(sessionId: string): GameStateSnapshot {
    const isP1 = this.state.p1.session_id === sessionId;
    const isP2 = this.state.p2?.session_id === sessionId;
    const currentPlayer = isP1 ? this.state.p1 : isP2 ? this.state.p2 : null;

    const size = this.state.game.board_size;
    const calls = this.state.called_numbers.map(c => c.number);
    const p1Lines = this.state.p1.board ? calculateLines(this.state.p1.board, calls, size).lines : 0;
    const p2Lines = this.state.p2?.board ? calculateLines(this.state.p2.board, calls, size).lines : 0;

    return {
      game: { ...this.state.game },
      player: currentPlayer ? { ...currentPlayer } : null,
      p1: { ...this.state.p1 },
      p2: this.state.p2 ? { ...this.state.p2 } : null,
      called_numbers: [...this.state.called_numbers],
      p1_lines: p1Lines,
      p2_lines: p2Lines,
    };
  }

  // ─── Serialization & Rehydration ────────────────────────────────────────

  public serialize(): string {
    return JSON.stringify(this.state);
  }

  public static deserialize(json: string): OfflineGameEngine {
    const state: OfflineRoomState = JSON.parse(json);
    return OfflineGameEngine.fromState(state);
  }

  public static fromState(state: OfflineRoomState): OfflineGameEngine {
    const engine = new OfflineGameEngine(
      state.p1.session_id,
      state.p1.display_name,
      state.game.board_size,
      state.game.room_code
    );
    engine.state = {
      game: { ...state.game },
      p1: { ...state.p1 },
      p2: state.p2 ? { ...state.p2 } : null,
      called_numbers: [...state.called_numbers],
      rematch_status: state.rematch_status || 'idle',
      rematch_requester_id: state.rematch_requester_id || null,
    };
    return engine;
  }
}
