export type OfflineTransportType = 'p2p-hotspot' | 'webrtc' | 'bot' | 'pass-and-play';

export type OfflineMessageType =
  | 'JOIN_REQUEST'
  | 'JOIN_RESPONSE'
  | 'SET_BOARD'
  | 'CALL_NUMBER'
  | 'SYNC_STATE'
  | 'MODE_CHANGE'
  | 'REMATCH_REQUEST'
  | 'REMATCH_ACCEPTED'
  | 'REMATCH_DECLINED'
  | 'PING'
  | 'PONG';

export interface OfflineMessage {
  type: OfflineMessageType;
  sessionId: string;
  payload?: unknown;
  timestamp: number;
}

export interface IOfflineTransport {
  readonly type: OfflineTransportType;
  readonly isConnected: boolean;
  send(message: OfflineMessage): void;
  onMessage(callback: (message: OfflineMessage) => void): void;
  onConnectionChange(callback: (connected: boolean) => void): void;
  disconnect(): void;
}
