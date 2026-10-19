import { IOfflineTransport, OfflineMessage } from './types';

export class WiFiIpOfflineTransport implements IOfflineTransport {
  public readonly type = 'wifi-ip';
  private channel: BroadcastChannel | null = null;
  private messageHandlers: Array<(msg: OfflineMessage) => void> = [];
  private connectionHandlers: Array<(connected: boolean) => void> = [];
  private _isConnected = true;

  public get isConnected(): boolean {
    return this._isConnected;
  }

  constructor(private roomCode: string) {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(`bingo-wifi-${roomCode.toUpperCase()}`);
      this.channel.onmessage = event => {
        try {
          const msg: OfflineMessage = event.data;
          for (const handler of this.messageHandlers) {
            handler(msg);
          }
        } catch (err) {
          console.error('[WiFiIpOfflineTransport] Parse error:', err);
        }
      };
    }
  }

  public send(message: OfflineMessage): void {
    if (this.channel) {
      this.channel.postMessage(message);
    }
  }

  public onMessage(callback: (message: OfflineMessage) => void): void {
    this.messageHandlers.push(callback);
  }

  public onConnectionChange(callback: (connected: boolean) => void): void {
    this.connectionHandlers.push(callback);
    callback(this._isConnected);
  }

  public disconnect(): void {
    try {
      this.channel?.close();
    } catch {}
    this._isConnected = false;
    for (const handler of this.connectionHandlers) {
      handler(false);
    }
  }
}
