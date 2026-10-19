import { OfflineGameEngine } from './offlineGameEngine';
import { IOfflineTransport, OfflineMessage } from './offlineTransports/types';
import { GameStateSnapshot, BoardSize } from '@/types/bingo';
import { createBotDuelist, chooseBotNumber, BotDuelist } from './offlineBot';
import { sounds } from '@/components/AudioController';

export type OfflineBridgeMode = 'p2p-host' | 'p2p-join' | 'bot' | 'pass-and-play';

export interface OfflineBridgeCallbacks {
  onSnapshot: (snapshot: GameStateSnapshot) => void;
  onConnectionChange?: (connected: boolean) => void;
  onError?: (err: Error) => void;
}

export class OfflineBridge {
  private engine: OfflineGameEngine | null = null;
  private transport: IOfflineTransport | null = null;
  private botDuelist: BotDuelist | null = null;
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeEngine: (() => void) | null = null;
  private currentMode: OfflineBridgeMode | null = null;
  private hostSessionId: string = '';
  private passAndPlayCurrentPlayer: 1 | 2 = 1;

  constructor(private callbacks: OfflineBridgeCallbacks) {}

  public getEngine(): OfflineGameEngine | null {
    return this.engine;
  }

  public getTransport(): IOfflineTransport | null {
    return this.transport;
  }

  public getMode(): OfflineBridgeMode | null {
    return this.currentMode;
  }

  public getPassAndPlayPlayer(): 1 | 2 {
    return this.passAndPlayCurrentPlayer;
  }

  // ─── Mode Initializers ──────────────────────────────────────────────────

  public startBotMatch(sessionId: string, displayName: string, boardSize: BoardSize): string {
    this.destroy();
    this.currentMode = 'bot';
    this.hostSessionId = sessionId;

    const engine = new OfflineGameEngine(sessionId, displayName, boardSize);
    this.engine = engine;

    const bot = createBotDuelist(boardSize);
    this.botDuelist = bot;

    engine.join(bot.sessionId, bot.displayName);
    engine.setBoard(bot.sessionId, bot.board);

    this.wireEngineEvents(engine, sessionId);

    // Initial snapshot
    const initialSnap = engine.getSnapshotForSession(sessionId);
    this.callbacks.onSnapshot(initialSnap);

    return initialSnap.game.room_code;
  }

  public startPassAndPlay(sessionId: string, displayName: string, boardSize: BoardSize): string {
    this.destroy();
    this.currentMode = 'pass-and-play';
    this.hostSessionId = sessionId;
    this.passAndPlayCurrentPlayer = 1;

    const engine = new OfflineGameEngine(sessionId, `${displayName} (P1)`, boardSize);
    this.engine = engine;

    engine.join('pass-p2-session', 'Player 2');

    this.wireEngineEvents(engine, sessionId);

    const initialSnap = engine.getSnapshotForSession(sessionId);
    this.callbacks.onSnapshot(initialSnap);

    return initialSnap.game.room_code;
  }

  public startP2PHost(
    sessionId: string,
    displayName: string,
    boardSize: BoardSize,
    transport: IOfflineTransport,
    customRoomCode?: string
  ): string {
    this.destroy();
    this.currentMode = 'p2p-host';
    this.hostSessionId = sessionId;
    this.transport = transport;

    const engine = new OfflineGameEngine(sessionId, displayName, boardSize, customRoomCode);
    this.engine = engine;

    this.wireEngineEvents(engine, sessionId);
    this.wireTransportHost(engine, transport, sessionId);

    const initialSnap = engine.getSnapshotForSession(sessionId);
    this.callbacks.onSnapshot(initialSnap);

    if (transport.isConnected) {
      transport.send({
        type: 'SYNC_STATE',
        sessionId,
        payload: initialSnap,
        timestamp: Date.now(),
      });
    }

    return initialSnap.game.room_code;
  }

  public startP2PJoin(sessionId: string, displayName: string, transport: IOfflineTransport): void {
    this.destroy();
    this.currentMode = 'p2p-join';
    this.hostSessionId = sessionId;
    this.transport = transport;

    transport.onMessage((msg: OfflineMessage) => {
      if (msg.type === 'SYNC_STATE' && msg.payload) {
        this.callbacks.onSnapshot(msg.payload as GameStateSnapshot);
      }
    });

    transport.onConnectionChange((connected: boolean) => {
      this.callbacks.onConnectionChange?.(connected);
      if (connected) {
        transport.send({
          type: 'JOIN_REQUEST',
          sessionId,
          payload: { name: displayName },
          timestamp: Date.now(),
        });
      }
    });
  }

  // ─── Action Dispatchers ─────────────────────────────────────────────────

  public setBoard(sessionId: string, board: number[]): void {
    if (this.currentMode === 'p2p-join') {
      this.transport?.send({
        type: 'SET_BOARD',
        sessionId,
        payload: { board },
        timestamp: Date.now(),
      });
      return;
    }

    if (!this.engine) return;

    let targetSession = sessionId;
    if (this.currentMode === 'pass-and-play') {
      targetSession = this.passAndPlayCurrentPlayer === 2 ? 'pass-p2-session' : sessionId;
    }

    this.engine.setBoard(targetSession, board);
  }

  public callNumber(sessionId: string, number: number): void {
    if (this.currentMode === 'p2p-join') {
      this.transport?.send({
        type: 'CALL_NUMBER',
        sessionId,
        payload: { number },
        timestamp: Date.now(),
      });
      return;
    }

    if (!this.engine) return;

    let targetSession = sessionId;
    if (this.currentMode === 'pass-and-play') {
      targetSession = this.passAndPlayCurrentPlayer === 2 ? 'pass-p2-session' : sessionId;
    }

    this.engine.callNumber(targetSession, number);

    if (this.currentMode === 'pass-and-play') {
      this.passAndPlayCurrentPlayer = this.passAndPlayCurrentPlayer === 1 ? 2 : 1;
    }
  }

  public requestRematch(sessionId: string): void {
    if (this.currentMode === 'bot' || this.currentMode === 'pass-and-play') {
      // In single-device modes, rematch immediately resets and restarts
      this.resetForRematch();
      return;
    }

    if (this.currentMode === 'p2p-join') {
      this.transport?.send({
        type: 'REMATCH_REQUEST',
        sessionId,
        timestamp: Date.now(),
      });
      return;
    }

    if (this.engine) {
      this.engine.requestRematch(sessionId);
    }
  }

  public acceptRematch(sessionId: string): void {
    if (this.currentMode === 'p2p-join') {
      this.transport?.send({
        type: 'REMATCH_ACCEPTED',
        sessionId,
        timestamp: Date.now(),
      });
      return;
    }

    if (this.engine) {
      this.engine.acceptRematch(sessionId);
      this.resetForRematch();
    }
  }

  public declineRematch(sessionId: string): void {
    if (this.currentMode === 'p2p-join') {
      this.transport?.send({
        type: 'REMATCH_DECLINED',
        sessionId,
        timestamp: Date.now(),
      });
      return;
    }

    if (this.engine) {
      this.engine.declineRematch(sessionId);
    }
  }

  public resetForRematch(): void {
    if (!this.engine) return;

    this.engine.resetForRematch();

    if (this.currentMode === 'bot') {
      const boardSize = this.engine.getRawState().game.board_size;
      const bot = createBotDuelist(boardSize);
      this.botDuelist = bot;
      this.engine.setBoard(bot.sessionId, bot.board);
    }

    if (this.currentMode === 'pass-and-play') {
      this.passAndPlayCurrentPlayer = 1;
    }
  }

  // ─── Internal Event Wiring ──────────────────────────────────────────────

  private wireEngineEvents(engine: OfflineGameEngine, hostSession: string) {
    this.unsubscribeEngine = engine.on('stateChange', (snap: GameStateSnapshot) => {
      this.callbacks.onSnapshot(snap);

      // Broadcast state to peer if transport is connected
      if (this.transport?.isConnected) {
        this.transport.send({
          type: 'SYNC_STATE',
          sessionId: hostSession,
          payload: snap,
          timestamp: Date.now(),
        });
      }

      // Check if bot needs to take a turn
      this.checkBotTurn(snap);
    });
  }

  private wireTransportHost(
    engine: OfflineGameEngine,
    transport: IOfflineTransport,
    hostSession: string
  ) {
    transport.onMessage((msg: OfflineMessage) => {
      const payload = msg.payload as Record<string, any> | undefined;

      try {
        if (msg.type === 'JOIN_REQUEST') {
          engine.join(msg.sessionId, payload?.name || 'Challenger');
        } else if (msg.type === 'SET_BOARD' && payload?.board) {
          engine.setBoard(msg.sessionId, payload.board);
        } else if (msg.type === 'CALL_NUMBER' && payload?.number !== undefined) {
          engine.callNumber(msg.sessionId, payload.number);
        } else if (msg.type === 'REMATCH_REQUEST') {
          engine.requestRematch(msg.sessionId);
        } else if (msg.type === 'REMATCH_ACCEPTED') {
          engine.acceptRematch(msg.sessionId);
          this.resetForRematch();
        } else if (msg.type === 'REMATCH_DECLINED') {
          engine.declineRematch(msg.sessionId);
        }
      } catch (err) {
        console.error('[OfflineBridge:Host] Error processing peer message:', err);
        this.callbacks.onError?.(err as Error);
      }
    });

    transport.onConnectionChange((connected: boolean) => {
      this.callbacks.onConnectionChange?.(connected);
      if (connected) {
        // Send fresh state snapshot immediately upon connection
        const snap = engine.getSnapshotForSession(hostSession);
        transport.send({
          type: 'SYNC_STATE',
          sessionId: hostSession,
          payload: snap,
          timestamp: Date.now(),
        });
      }
    });
  }

  private checkBotTurn(snap: GameStateSnapshot) {
    if (this.currentMode !== 'bot' || !this.botDuelist || !this.engine) return;

    const game = snap.game;
    const p2 = snap.p2;

    if (
      game.status === 'playing' &&
      game.current_turn_player_id &&
      p2 &&
      game.current_turn_player_id === p2.id
    ) {
      if (this.botTimer) clearTimeout(this.botTimer);

      this.botTimer = setTimeout(() => {
        try {
          if (!this.engine || !this.botDuelist) return;
          const called = this.engine.getRawState().called_numbers.map(c => c.number);
          const num = chooseBotNumber(this.botDuelist.board, called, game.board_size);
          this.engine.callNumber(this.botDuelist.sessionId, num);
          sounds.playCall();
        } catch (err) {
          console.error('[OfflineBridge:Bot] Bot turn error:', err);
        }
      }, 1200);
    }
  }

  // ─── Teardown ───────────────────────────────────────────────────────────

  public destroy(): void {
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
    if (this.unsubscribeEngine) {
      this.unsubscribeEngine();
      this.unsubscribeEngine = null;
    }
    if (this.transport) {
      this.transport.disconnect();
      this.transport = null;
    }
    this.engine = null;
    this.botDuelist = null;
    this.currentMode = null;
    this.passAndPlayCurrentPlayer = 1;
  }
}
