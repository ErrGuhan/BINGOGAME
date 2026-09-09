import { Game, Player, CalledNumber, GameStateSnapshot, CallNumberResult } from '@/types/bingo';
import { calculateLines } from './gameEngine';

interface MockGameStore {
  game: Game;
  p1: Player;
  p2: Player | null;
  called_numbers: CalledNumber[];
}

const STORAGE_PREFIX = 'bingo_mock_game_';
const CHANNEL_NAME = 'bingo_duel_realtime_bus';

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return null;
  return new BroadcastChannel(CHANNEL_NAME);
}

function broadcastEvent(event: string, payload: unknown) {
  const ch = getChannel();
  if (ch) {
    ch.postMessage({ event, payload });
  }
}

export function subscribeToMockEvents(handler: (event: string, payload: unknown) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  
  const onMessage = (msg: MessageEvent) => {
    if (msg.data && msg.data.event) {
      handler(msg.data.event, msg.data.payload);
    }
  };
  ch.addEventListener('message', onMessage);
  return () => {
    ch.removeEventListener('message', onMessage);
    ch.close();
  };
}

function saveStore(store: MockGameStore) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_PREFIX + store.game.room_code.toUpperCase(), JSON.stringify(store));
  localStorage.setItem(STORAGE_PREFIX + 'id_' + store.game.id, store.game.room_code.toUpperCase());
}

function getStoreByCode(code: string): MockGameStore | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_PREFIX + code.toUpperCase());
  return raw ? JSON.parse(raw) : null;
}

function getStoreById(gameId: string): MockGameStore | null {
  if (typeof window === 'undefined') return null;
  const code = localStorage.getItem(STORAGE_PREFIX + 'id_' + gameId);
  if (!code) return null;
  return getStoreByCode(code);
}

function generateMockRoomCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let res = '';
  for (let i = 0; i < 4; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

export function mockCreateGame(sessionId: string, displayName: string) {
  const roomCode = generateMockRoomCode();
  const gameId = 'game_' + Math.random().toString(36).substring(2, 9);
  const playerId = 'p1_' + Math.random().toString(36).substring(2, 9);

  const p1: Player = {
    id: playerId,
    session_id: sessionId,
    display_name: displayName || 'Host',
    player_number: 1,
    board: null,
    is_ready: false,
    connected: true,
    lines_completed: 0,
    last_seen_at: new Date().toISOString(),
  };

  const game: Game = {
    id: gameId,
    room_code: roomCode,
    status: 'waiting',
    current_turn_player_id: null,
    winner_id: null,
    target_lines: 5,
    created_at: new Date().toISOString(),
  };

  const store: MockGameStore = {
    game,
    p1,
    p2: null,
    called_numbers: [],
  };

  saveStore(store);
  broadcastEvent('ROOM_CREATED', { roomCode, gameId });

  return {
    game_id: gameId,
    room_code: roomCode,
    player_id: playerId,
    player_number: 1,
    status: 'waiting',
  };
}

export function mockJoinGame(roomCode: string, sessionId: string, displayName: string) {
  const store = getStoreByCode(roomCode);
  if (!store) {
    throw new Error(`Room ${roomCode} not found`);
  }

  // If re-joining as P1
  if (store.p1.session_id === sessionId) {
    store.p1.connected = true;
    store.p1.last_seen_at = new Date().toISOString();
    saveStore(store);
    return {
      game_id: store.game.id,
      room_code: store.game.room_code,
      player_id: store.p1.id,
      player_number: 1,
      status: store.game.status,
      is_reconnect: true,
    };
  }

  // If re-joining as P2
  if (store.p2 && store.p2.session_id === sessionId) {
    store.p2.connected = true;
    store.p2.last_seen_at = new Date().toISOString();
    saveStore(store);
    return {
      game_id: store.game.id,
      room_code: store.game.room_code,
      player_id: store.p2.id,
      player_number: 2,
      status: store.game.status,
      is_reconnect: true,
    };
  }

  if (store.p2) {
    throw new Error(`Room ${roomCode} is already full (2 players maximum)`);
  }

  const p2Id = 'p2_' + Math.random().toString(36).substring(2, 9);
  const p2: Player = {
    id: p2Id,
    session_id: sessionId,
    display_name: displayName || 'Challenger',
    player_number: 2,
    board: null,
    is_ready: false,
    connected: true,
    lines_completed: 0,
    last_seen_at: new Date().toISOString(),
  };

  store.p2 = p2;
  store.game.status = 'ready';
  saveStore(store);

  broadcastEvent('PLAYER_JOINED', {
    gameId: store.game.id,
    roomCode: store.game.room_code,
    player: p2,
  });

  return {
    game_id: store.game.id,
    room_code: store.game.room_code,
    player_id: p2Id,
    player_number: 2,
    status: 'ready',
    is_reconnect: false,
  };
}

export function mockSetPlayerBoard(gameId: string, sessionId: string, board: number[]) {
  const store = getStoreById(gameId);
  if (!store) throw new Error('Game not found');

  let player: Player | null = null;
  if (store.p1.session_id === sessionId) player = store.p1;
  else if (store.p2 && store.p2.session_id === sessionId) player = store.p2;

  if (!player) throw new Error('Player not in this game');

  player.board = board;
  player.is_ready = true;
  player.last_seen_at = new Date().toISOString();

  let allReady = false;
  if (store.p1.is_ready && store.p2?.is_ready) {
    allReady = true;
    store.game.status = 'playing';
    store.game.current_turn_player_id = store.p1.id; // P1 starts
  }

  saveStore(store);

  broadcastEvent('PLAYER_READY', {
    gameId,
    roomCode: store.game.room_code,
    playerId: player.id,
    allReady,
    status: store.game.status,
    currentTurnPlayerId: store.game.current_turn_player_id,
  });

  return {
    success: true,
    is_ready: true,
    all_ready: allReady,
    game_status: store.game.status,
  };
}

export function mockCallNumber(gameId: string, sessionId: string, number: number): CallNumberResult {
  const store = getStoreById(gameId);
  if (!store) throw new Error('Game not found');
  if (store.game.status !== 'playing') throw new Error('Game is not playing');

  let caller: Player | null = null;
  let opponent: Player | null = null;

  if (store.p1.session_id === sessionId) {
    caller = store.p1;
    opponent = store.p2;
  } else if (store.p2 && store.p2.session_id === sessionId) {
    caller = store.p2;
    opponent = store.p1;
  }

  if (!caller || !opponent || !store.p2) throw new Error('Player not found');
  if (store.game.current_turn_player_id !== caller.id) {
    throw new Error('It is not your turn to call');
  }

  if (store.called_numbers.some(c => c.number === number)) {
    throw new Error(`Number ${number} has already been called`);
  }

  const nextSeq = store.called_numbers.length + 1;
  const newCall: CalledNumber = {
    id: 'call_' + nextSeq,
    number,
    called_by: caller.id,
    sequence: nextSeq,
    called_at: new Date().toISOString(),
  };
  store.called_numbers.push(newCall);

  const allNums = store.called_numbers.map(c => c.number);

  const p1LinesRes = calculateLines(store.p1.board || [], allNums);
  const p2LinesRes = calculateLines(store.p2.board || [], allNums);

  const p1Lines = p1LinesRes.lines;
  const p2Lines = p2LinesRes.lines;

  store.p1.lines_completed = p1Lines;
  store.p2.lines_completed = p2Lines;

  const callerLines = caller.player_number === 1 ? p1Lines : p2Lines;
  const opponentLines = opponent.player_number === 1 ? p1Lines : p2Lines;

  let winnerId: string | null = null;
  let isGameOver = false;

  if (callerLines >= store.game.target_lines) {
    winnerId = caller.id;
    isGameOver = true;
  } else if (opponentLines >= store.game.target_lines) {
    winnerId = opponent.id;
    isGameOver = true;
  }

  let nextTurnId: string | null = null;
  if (isGameOver) {
    store.game.status = 'completed';
    store.game.winner_id = winnerId;
    store.game.current_turn_player_id = null;
  } else {
    nextTurnId = opponent.id;
    store.game.current_turn_player_id = nextTurnId;
  }

  saveStore(store);

  const result: CallNumberResult = {
    success: true,
    number,
    sequence: nextSeq,
    called_by: caller.id,
    next_turn_player_id: nextTurnId,
    winner_id: winnerId,
    is_game_over: isGameOver,
    p1_lines: p1Lines,
    p2_lines: p2Lines,
    all_called_count: allNums.length,
  };

  broadcastEvent('NUMBER_CALLED', {
    gameId,
    roomCode: store.game.room_code,
    ...result,
  });

  return result;
}

export function mockGetGameState(gameId: string, sessionId: string): GameStateSnapshot | null {
  const store = getStoreById(gameId);
  if (!store) return null;

  let caller: Player | null = null;
  if (store.p1.session_id === sessionId) caller = store.p1;
  else if (store.p2 && store.p2.session_id === sessionId) caller = store.p2;

  const allNums = store.called_numbers.map(c => c.number);
  const p1Lines = calculateLines(store.p1.board || [], allNums).lines;
  const p2Lines = store.p2 ? calculateLines(store.p2.board || [], allNums).lines : 0;

  return {
    game: store.game,
    player: caller,
    p1: {
      ...store.p1,
      lines_completed: p1Lines,
      board: caller?.player_number === 1 || store.game.status === 'completed' ? store.p1.board : null,
    },
    p2: store.p2
      ? {
          ...store.p2,
          lines_completed: p2Lines,
          board: caller?.player_number === 2 || store.game.status === 'completed' ? store.p2.board : null,
        }
      : null,
    called_numbers: store.called_numbers,
    p1_lines: p1Lines,
    p2_lines: p2Lines,
  };
}

export function mockClaimTimeoutWin(gameId: string, sessionId: string) {
  const store = getStoreById(gameId);
  if (!store || store.game.status !== 'playing') throw new Error('Game not active');

  let caller: Player | null = null;
  if (store.p1.session_id === sessionId) caller = store.p1;
  else if (store.p2 && store.p2.session_id === sessionId) caller = store.p2;

  if (!caller) throw new Error('Player not found');

  store.game.status = 'completed';
  store.game.winner_id = caller.id;
  store.game.current_turn_player_id = null;
  saveStore(store);

  broadcastEvent('TIMEOUT_WIN_CLAIMED', {
    gameId,
    roomCode: store.game.room_code,
    winnerId: caller.id,
  });

  return { success: true, winner_id: caller.id };
}

export function mockHeartbeat(gameId: string, sessionId: string) {
  const store = getStoreById(gameId);
  if (!store) return;
  if (store.p1.session_id === sessionId) {
    store.p1.last_seen_at = new Date().toISOString();
    store.p1.connected = true;
  } else if (store.p2 && store.p2.session_id === sessionId) {
    store.p2.last_seen_at = new Date().toISOString();
    store.p2.connected = true;
  }
  saveStore(store);
}
