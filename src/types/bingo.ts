export type GameStatus = 'waiting' | 'ready' | 'playing' | 'completed' | 'abandoned';
export type BoardSize = 5 | 10;

export interface Game {
  id: string;
  room_code: string;
  status: GameStatus;
  current_turn_player_id: string | null;
  winner_id: string | null;
  target_lines: number;
  board_size: BoardSize;
  created_at: string;
}

export interface Player {
  id: string;
  session_id: string;
  display_name: string;
  player_number: 1 | 2;
  board: number[] | null;
  is_ready: boolean;
  connected: boolean;
  lines_completed?: number;
  last_seen_at?: string;
}

export interface CalledNumber {
  id: string;
  number: number;
  called_by: string;
  sequence: number;
  called_at: string;
}

export interface GameStateSnapshot {
  game: Game;
  player: Player | null; // Current client's player record
  p1: Player | null;
  p2: Player | null;
  called_numbers: CalledNumber[];
  p1_lines: number;
  p2_lines: number;
}

export interface CallNumberResult {
  success: boolean;
  number: number;
  sequence: number;
  called_by: string;
  next_turn_player_id: string | null;
  winner_id: string | null;
  is_game_over: boolean;
  p1_lines: number;
  p2_lines: number;
  all_called_count: number;
}

export interface RealtimeNumberCalledPayload {
  number: number;
  sequence: number;
  calledBy: string;
  nextTurnPlayerId: string | null;
  winnerId: string | null;
  isGameOver: boolean;
  p1Lines: number;
  p2Lines: number;
}
