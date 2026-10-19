import { IOfflineTransport, OfflineMessage } from './types';

export const BINGO_BLE_SERVICE_UUID = '0000fee0-0000-1000-8000-00805f9b34fb';
export const BINGO_BLE_CHARACTERISTIC_UUID = '0000fee1-0000-1000-8000-00805f9b34fb';

interface BluetoothGattCharacteristic {
  writeValue(value: BufferSource): Promise<void>;
}

interface BluetoothGattServer {
  connect(): Promise<BluetoothGattServer>;
  disconnect(): void;
  connected: boolean;
}

interface BluetoothDevice {
  gatt?: BluetoothGattServer;
  addEventListener(event: string, listener: () => void): void;
}

interface NavigatorWithBluetooth {
  bluetooth: {
    requestDevice(options: unknown): Promise<BluetoothDevice>;
  };
}

export function isWebBluetoothSupported(): boolean {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export class BluetoothOfflineTransport implements IOfflineTransport {
  public readonly type = 'bluetooth';
  private messageHandlers: Array<(msg: OfflineMessage) => void> = [];
  private connectionHandlers: Array<(connected: boolean) => void> = [];
  private device: BluetoothDevice | null = null;
  private server: BluetoothGattServer | null = null;
  private characteristic: BluetoothGattCharacteristic | null = null;
  private _isConnected = false;

  public get isConnected(): boolean {
    return this._isConnected;
  }

  public async scanAndConnect(): Promise<{ success: boolean; error?: string }> {
    if (!isWebBluetoothSupported()) {
      return {
        success: false,
        error: 'Web Bluetooth is not supported in this browser. Please use Local Hotspot / Wi-Fi mode.',
      };
    }

    try {
      const nav = navigator as unknown as NavigatorWithBluetooth;
      this.device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [BINGO_BLE_SERVICE_UUID],
      });

      if (!this.device) {
        return { success: false, error: 'No device selected' };
      }

      this.device.addEventListener('gattserverdisconnected', () => {
        this._isConnected = false;
        for (const handler of this.connectionHandlers) {
          handler(false);
        }
      });

      if (this.device.gatt) {
        this.server = await this.device.gatt.connect();
        this._isConnected = true;
        for (const handler of this.connectionHandlers) {
          handler(true);
        }
        return { success: true };
      }

      return { success: false, error: 'Could not connect to GATT Server' };
    } catch (err: unknown) {
      console.warn('[BluetoothOfflineTransport] Connect error:', err);
      const errMsg = err instanceof Error ? err.message : 'Bluetooth connection was cancelled or unavailable.';
      return {
        success: false,
        error: errMsg,
      };
    }
  }

  public send(message: OfflineMessage): void {
    if (!this._isConnected) {
      console.warn('[BluetoothOfflineTransport] Cannot send: device not connected');
      return;
    }
    try {
      const data = new TextEncoder().encode(JSON.stringify(message));
      if (this.characteristic) {
        this.characteristic.writeValue(data);
      }
    } catch (err) {
      console.error('[BluetoothOfflineTransport] Send error:', err);
    }
  }

  public onMessage(callback: (message: OfflineMessage) => void): void {
    this.messageHandlers.push(callback);
  }

  public onConnectionChange(callback: (connected: boolean) => void): void {
    this.connectionHandlers.push(callback);
  }

  public disconnect(): void {
    try {
      if (this.server?.connected) {
        this.server.disconnect();
      }
    } catch {}
    this._isConnected = false;
    for (const handler of this.connectionHandlers) {
      handler(false);
    }
  }
}
