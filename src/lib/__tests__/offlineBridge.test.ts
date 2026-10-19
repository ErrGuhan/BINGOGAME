import { describe, it, expect } from 'vitest';
import { OfflineBridge } from '../offlineBridge';
import { GameStateSnapshot } from '@/types/bingo';
import { IOfflineTransport, OfflineMessage } from '../offlineTransports/types';

class MockTransport implements IOfflineTransport {
  public readonly type = 'p2p-hotspot';
  public isConnected = true;
  public sentMessages: OfflineMessage[] = [];
  private messageHandlers: Array<(msg: OfflineMessage) => void> = [];
  private connHandlers: Array<(c: boolean) => void> = [];

  public send(message: OfflineMessage): void {
    this.sentMessages.push(message);
  }

  public onMessage(callback: (message: OfflineMessage) => void): void {
    this.messageHandlers.push(callback);
  }

  public onConnectionChange(callback: (connected: boolean) => void): void {
    this.connHandlers.push(callback);
  }

  public disconnect(): void {
    this.isConnected = false;
    for (const h of this.connHandlers) h(false);
  }

  public simulateReceive(msg: OfflineMessage): void {
    for (const h of this.messageHandlers) h(msg);
  }
}

describe('OfflineBridge', () => {
  it('initializes Bot match and emits initial snapshot', () => {
    let latestSnap: GameStateSnapshot | null = null;
    const bridge = new OfflineBridge({
      onSnapshot: (snap) => {
        latestSnap = snap;
      },
    });

    const roomCode = bridge.startBotMatch('session-1', 'Alice', 5);
    expect(roomCode).toBeDefined();
    expect(latestSnap).not.toBeNull();
    const snap = latestSnap as unknown as GameStateSnapshot;
    expect(snap.game.status).toBe('ready');
    expect(snap.p1?.display_name).toBe('Alice');
    expect(snap.p2?.display_name).toContain('CyberDuelist');

    bridge.destroy();
  });

  it('manages Pass & Play turn toggling', () => {
    let latestSnap: GameStateSnapshot | null = null;
    const bridge = new OfflineBridge({
      onSnapshot: (snap) => {
        latestSnap = snap;
      },
    });

    bridge.startPassAndPlay('session-1', 'Alice', 5);
    expect(bridge.getPassAndPlayPlayer()).toBe(1);

    const b1 = Array.from({ length: 25 }, (_, i) => i + 1);
    const b2 = Array.from({ length: 25 }, (_, i) => i + 1);

    // Player 1 sets board
    bridge.setBoard('session-1', b1);

    // Switch to Player 2
    bridge.setBoard('pass-p2-session', b2);

    const snapPlaying = latestSnap as unknown as GameStateSnapshot;
    expect(snapPlaying.game.status).toBe('playing');
    expect(snapPlaying.game.current_turn_player_id).toBe(snapPlaying.p1?.id);

    // Player 1 calls number
    bridge.callNumber('session-1', 1);
    const snapCalled = latestSnap as unknown as GameStateSnapshot;
    expect(snapCalled.called_numbers).toHaveLength(1);
    expect(bridge.getPassAndPlayPlayer()).toBe(2);

    bridge.destroy();
  });

  it('bridges P2P host state and sends SYNC_STATE to transport on actions', () => {
    let latestSnap: GameStateSnapshot | null = null;
    const mockTransport = new MockTransport();

    const bridge = new OfflineBridge({
      onSnapshot: (snap) => {
        latestSnap = snap;
      },
    });

    bridge.startP2PHost('host-session', 'Alice', 5, mockTransport, 'P2P1');

    // Transport should have sent initial sync
    expect(mockTransport.sentMessages.length).toBeGreaterThan(0);
    expect(mockTransport.sentMessages[0].type).toBe('SYNC_STATE');

    // Simulate peer joining
    mockTransport.simulateReceive({
      type: 'JOIN_REQUEST',
      sessionId: 'guest-session',
      payload: { name: 'Bob' },
      timestamp: Date.now(),
    });

    const snapJoined = latestSnap as unknown as GameStateSnapshot;
    expect(snapJoined.p2?.display_name).toBe('Bob');
    expect(snapJoined.game.status).toBe('ready');

    bridge.destroy();
  });
});
