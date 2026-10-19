import { Game, Player, CalledNumber, GameStateSnapshot, CallNumberResult, BoardSize, GameVariant } from '@/types/bingo';
import { calculateLines, validateBoard } from './gameEngine';

export interface OfflineRoomState {
  game: Game;
  p1: Player;
  p2: Player | null;
  called_numbers: CalledNumber[];
}

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
 * Authoritative, zero-dependency Offline Game Engine that replicates
 * the Postgres RPC rules client-side.
 */
export class OfflineGameEngine {
  private state: OfflineRoomState;

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
    };
  }

  public getRawState(): OfflineRoomState {
    return this.state;
  }

  public setMode(boardSize: BoardSize): void {
    if (this.state.game.status !== 'waiting' && this.state.game.status !== 'ready') return;
    this.state.game.board_size = boardSize;
    this.state.game.target_lines = boardSize === 10 ? 10 : 5;
    this.state.game.variant = boardSize === 10 ? '10x10' : '5x5';
  }

  public join(guestSessionId: string, guestDisplayName: string = 'Challenger'): Player {
    if (this.state.p2 && this.state.p2.session_id !== guestSessionId) {
      throw new Error('Room is full (already has 2 duelists)');
    }

    if (this.state.p1.session_id === guestSessionId) {
      // Re-joining as host
      this.state.p1.connected = true;
      this.state.p1.last_seen_at = new Date().toISOString();
      return this.state.p1;
    }

    if (!this.state.p2) {
      const guestPlayerId = `offline-player-2-${Math.random().toString(36).substring(2, 7)}`;
      this.state.p2 = {
        id: guestPlayerId,
        session_id: guestSessionId,
        display_name: guestDisplayName,
        player_number: 2,
        board: null,
        is_ready: false,
        connected: true,
        lines_completed: 0,
        last_seen_at: new Date().toISOString(),
      };
      this.state.game.status = 'ready';
    } else {
      this.state.p2.connected = true;
      this.state.p2.last_seen_at = new Date().toISOString();
    }

    return this.state.p2;
  }

  public setBoard(sessionId: string, board: number[]): { allReady: boolean; turnId: string | null } {
    const isP1 = this.state.p1.session_id === sessionId;
    const isP2 = this.state.p2?.session_id === sessionId;

    if (!isP1 && !isP2) {
      throw new Error('Player not in this game');
    }

    const expectedSize = this.state.game.board_size;
    if (!validateBoard(board, expectedSize)) {
      throw new Error(`Invalid board layout for ${expectedSize}x${expectedSize} Bingo`);
    }

    if (isP1) {
      this.state.p1.board = [...board];
      this.state.p1.is_ready = true;
    } else if (this.state.p2) {
      this.state.p2.board = [...board];
      this.state.p2.is_ready = true;
    }

    const allReady = Boolean(this.state.p1.is_ready && this.state.p2?.is_ready);

    if (allReady && this.state.game.status !== 'playing') {
      this.state.game.status = 'playing';
      // Host (P1) always starts the duel first
      this.state.game.current_turn_player_id = this.state.p1.id;
    }

    return {
      allReady,
      turnId: this.state.game.current_turn_player_id,
    };
  }

  public callNumber(sessionId: string, number: number): CallNumberResult {
    if (this.state.game.status !== 'playing') {
      throw new Error('Game is not currently active');
    }

    const isP1 = this.state.p1.session_id === sessionId;
    const isP2 = this.state.p2?.session_id === sessionId;

    if (!isP1 && !isP2) {
      throw new Error('Player not recognized in this game');
    }

    const callingPlayer = isP1 ? this.state.p1 : this.state.p2!;
    const opponentPlayer = isP1 ? this.state.p2! : this.state.p1;

    // Strict Turn Enforcement
    if (this.state.game.current_turn_player_id !== callingPlayer.id) {
      throw new Error('Not your turn to call a number');
    }

    // Number Range Validation
    const maxNumber = this.state.game.board_size * this.state.game.board_size;
    if (number < 1 || number > maxNumber || !Number.isInteger(number)) {
      throw new Error(`Number ${number} out of valid range (1..${maxNumber})`);
    }

    // Duplicate Prevention
    const alreadyCalled = this.state.called_numbers.some(c => c.number === number);
    if (alreadyCalled) {
      throw new Error(`Number ${number} has already been called`);
    }

    const sequence = this.state.called_numbers.length + 1;
    const callRecord: CalledNumber = {
      id: `call-${Date.now()}-${sequence}`,
      number,
      called_by: callingPlayer.id,
      sequence,
      called_at: new Date().toISOString(),
    };

    this.state.called_numbers.push(callRecord);

    const allCalledNumbers = this.state.called_numbers.map(c => c.number);
    const size = this.state.game.board_size;
    const target = this.state.game.target_lines;

    // Recalculate completed lines for both duelists
    const p1Lines = this.state.p1.board ? calculateLines(this.state.p1.board, allCalledNumbers, size).lines : 0;
    const p2Lines = this.state.p2?.board ? calculateLines(this.state.p2.board, allCalledNumbers, size).lines : 0;

    this.state.p1.lines_completed = p1Lines;
    if (this.state.p2) {
      this.state.p2.lines_completed = p2Lines;
    }

    // Win condition check: caller line completion check takes priority
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
      this.state.game.status = 'completed';
      this.state.game.winner_id = winnerId;
      this.state.game.current_turn_player_id = null;
    } else {
      // Toggle turn to the other player
      this.state.game.current_turn_player_id = opponentPlayer.id;
    }

    return {
      success: true,
      number,
      sequence,
      called_by: callingPlayer.id,
      next_turn_player_id: this.state.game.current_turn_player_id,
      winner_id: this.state.game.winner_id,
      is_game_over: isGameOver,
      p1_lines: p1Lines,
      p2_lines: p2Lines,
      all_called_count: sequence,
    };
  }

  public resetForRematch(): void {
    this.state.called_numbers = [];
    this.state.game.status = 'ready';
    this.state.game.winner_id = null;
    this.state.game.current_turn_player_id = null;

    this.state.p1.board = null;
    this.state.p1.is_ready = false;
    this.state.p1.lines_completed = 0;

    if (this.state.p2) {
      this.state.p2.board = null;
      this.state.p2.is_ready = false;
      this.state.p2.lines_completed = 0;
    }
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
}
