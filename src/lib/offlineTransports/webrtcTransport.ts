import { IOfflineTransport, OfflineMessage } from './types';

export function compressSignal(data: unknown): string {
  try {
    const json = JSON.stringify(data);
    if (typeof window !== 'undefined' && window.btoa) {
      return window.btoa(unescape(encodeURIComponent(json)));
    }
    return Buffer.from(json).toString('base64');
  } catch {
    return JSON.stringify(data);
  }
}

export function decompressSignal(str: string): RTCSessionDescriptionInit {
  try {
    let json: string;
    if (typeof window !== 'undefined' && window.atob) {
      json = decodeURIComponent(escape(window.atob(str)));
    } else {
      json = Buffer.from(str, 'base64').toString('utf8');
    }
    return JSON.parse(json) as RTCSessionDescriptionInit;
  } catch {
    return JSON.parse(str) as RTCSessionDescriptionInit;
  }
}

export class WebRTCOfflineTransport implements IOfflineTransport {
  public readonly type = 'p2p-hotspot';
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private messageHandlers: Array<(msg: OfflineMessage) => void> = [];
  private connectionHandlers: Array<(connected: boolean) => void> = [];
  private _isConnected = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeartbeatAt = Date.now();

  public get isConnected(): boolean {
    return this._isConnected;
  }

  constructor(private isHost: boolean) {
    if (typeof window !== 'undefined' && window.RTCPeerConnection) {
      // Local offline LAN/Hotspot configuration — zero public STUN server requirement
      this.pc = new RTCPeerConnection({
        iceServers: [],
      });

      this.setupPcListeners();

      if (this.isHost) {
        // Host creates reliable ordered data channel
        const channel = this.pc.createDataChannel('bingo-duel-sync', {
          ordered: true,
        });
        this.setupDataChannel(channel);
      } else {
        // Challenger receives data channel
        this.pc.ondatachannel = event => {
          this.setupDataChannel(event.channel);
        };
      }
    }
  }

  private setupPcListeners() {
    if (!this.pc) return;

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState;
      const connected = state === 'connected';
      this.updateConnectedState(connected);
    };

    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc?.iceConnectionState;
      const connected = state === 'connected' || state === 'completed';
      this.updateConnectedState(connected);
    };
  }

  private setupDataChannel(channel: RTCDataChannel) {
    this.dc = channel;

    this.dc.onopen = () => {
      this.lastHeartbeatAt = Date.now();
      this.updateConnectedState(true);
      this.startHeartbeat();
    };

    this.dc.onclose = () => {
      this.stopHeartbeat();
      this.updateConnectedState(false);
    };

    this.dc.onerror = err => {
      console.warn('[WebRTCOfflineTransport] Data channel error:', err);
      this.stopHeartbeat();
      this.updateConnectedState(false);
    };

    this.dc.onmessage = event => {
      try {
        const parsed: OfflineMessage = JSON.parse(event.data);
        this.lastHeartbeatAt = Date.now();

        // Handle internal heartbeat messages without propagating to game logic
        if (parsed.type === 'PING') {
          this.send({ type: 'PONG', sessionId: 'system', timestamp: Date.now() });
          return;
        }
        if (parsed.type === 'PONG') {
          return;
        }

        for (const handler of this.messageHandlers) {
          handler(parsed);
        }
      } catch (err) {
        console.error('[WebRTCOfflineTransport] Failed to parse message:', err);
      }
    };
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (!this._isConnected || !this.dc || this.dc.readyState !== 'open') {
        return;
      }

      // Check if peer timed out (no heartbeat for 12 seconds)
      if (Date.now() - this.lastHeartbeatAt > 12000) {
        console.warn('[WebRTCOfflineTransport] Peer heartbeat timeout. Disconnecting...');
        this.updateConnectedState(false);
        return;
      }

      this.send({ type: 'PING', sessionId: 'system', timestamp: Date.now() });
    }, 4000);
  }

  private stopHeartbeat() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private updateConnectedState(connected: boolean) {
    if (this._isConnected !== connected) {
      this._isConnected = connected;
      for (const handler of this.connectionHandlers) {
        handler(connected);
      }
    }
  }

  /**
   * Host step: creates SDP Offer with ICE candidates included
   */
  public async createOffer(): Promise<string> {
    if (!this.pc) throw new Error('WebRTC not supported in this browser');

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    // Wait for ICE gathering to complete on local hotspot/network
    await this.waitForIceGathering();

    return compressSignal(this.pc.localDescription);
  }

  /**
   * Challenger step: receives Offer, creates Answer
   */
  public async handleOfferAndCreateAnswer(offerSignal: string): Promise<string> {
    if (!this.pc) throw new Error('WebRTC not supported in this browser');

    const offerDesc = decompressSignal(offerSignal);
    await this.pc.setRemoteDescription(new RTCSessionDescription(offerDesc));

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    await this.waitForIceGathering();

    return compressSignal(this.pc.localDescription);
  }

  /**
   * Host step: accepts Answer from Challenger
   */
  public async handleAnswer(answerSignal: string): Promise<void> {
    if (!this.pc) throw new Error('WebRTC not supported in this browser');

    const answerDesc = decompressSignal(answerSignal);
    await this.pc.setRemoteDescription(new RTCSessionDescription(answerDesc));
  }

  private waitForIceGathering(): Promise<void> {
    return new Promise(resolve => {
      if (!this.pc || this.pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      const checkState = () => {
        if (this.pc?.iceGatheringState === 'complete') {
          this.pc.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }
      };

      this.pc.addEventListener('icegatheringstatechange', checkState);

      // Timeout safety: if local network takes more than 1.5s, resolve with available candidates
      setTimeout(() => {
        if (this.pc) {
          this.pc.removeEventListener('icegatheringstatechange', checkState);
        }
        resolve();
      }, 1500);
    });
  }

  public send(message: OfflineMessage): void {
    if (!this.dc || this.dc.readyState !== 'open') {
      console.warn('[WebRTCOfflineTransport] Cannot send: data channel not open');
      return;
    }
    try {
      this.dc.send(JSON.stringify(message));
    } catch (err) {
      console.error('[WebRTCOfflineTransport] Send error:', err);
    }
  }

  public onMessage(callback: (message: OfflineMessage) => void): void {
    this.messageHandlers.push(callback);
  }

  public onConnectionChange(callback: (connected: boolean) => void): void {
    this.connectionHandlers.push(callback);
  }

  public disconnect(): void {
    this.stopHeartbeat();
    try {
      this.dc?.close();
      this.pc?.close();
    } catch {}
    this.updateConnectedState(false);
  }
}
