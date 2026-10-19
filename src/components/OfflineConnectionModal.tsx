'use client';

import React, { useState } from 'react';
import {
  XMarkIcon,
  WifiIcon,
  QrCodeIcon,
  DevicePhoneMobileIcon,
  CpuChipIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  ArrowRightIcon,
  SignalIcon,
} from '@heroicons/react/24/outline';
import { sounds } from './AudioController';
import { BoardSize } from '@/types/bingo';
import { isWebBluetoothSupported } from '@/lib/offlineTransports/bluetoothTransport';

export type OfflineConnectMode = 'webrtc' | 'wifi-ip' | 'bluetooth' | 'pass-and-play' | 'bot';

interface OfflineConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartOfflineDuel: (mode: OfflineConnectMode, options?: any) => void;
}

export const OfflineConnectionModal: React.FC<OfflineConnectionModalProps> = ({
  isOpen,
  onClose,
  onStartOfflineDuel,
}) => {
  const [activeTab, setActiveTab] = useState<OfflineConnectMode>('webrtc');
  const [subRole, setSubRole] = useState<'host' | 'join'>('host');
  const [boardSize, setBoardSize] = useState<BoardSize>(5);
  const [wifiIpInput, setWifiIpInput] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [joinSignalInput, setJoinSignalInput] = useState<string>('');
  const [bluetoothStatus, setBluetoothStatus] = useState<string>('');

  if (!isOpen) return null;

  const handleCopy = (text: string) => {
    sounds.playTap();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleStartPassAndPlay = () => {
    sounds.playTap();
    onStartOfflineDuel('pass-and-play', { boardSize });
    onClose();
  };

  const handleStartBotMatch = () => {
    sounds.playTap();
    onStartOfflineDuel('bot', { boardSize });
    onClose();
  };

  const handleStartWiFiHost = () => {
    sounds.playTap();
    onStartOfflineDuel('wifi-ip', { role: 'host', boardSize });
    onClose();
  };

  const handleStartWiFiJoin = () => {
    sounds.playTap();
    onStartOfflineDuel('wifi-ip', { role: 'join', targetIp: wifiIpInput.trim() });
    onClose();
  };

  const handleStartWebRTCHost = () => {
    sounds.playTap();
    onStartOfflineDuel('webrtc', { role: 'host', boardSize });
    onClose();
  };

  const handleStartWebRTCJoin = () => {
    sounds.playTap();
    onStartOfflineDuel('webrtc', { role: 'join', signal: joinSignalInput.trim() });
    onClose();
  };

  const handleBluetoothScan = async () => {
    sounds.playTap();
    if (!isWebBluetoothSupported()) {
      setBluetoothStatus('Web Bluetooth is not supported on this browser. Use Wi-Fi / Hotspot mode instead!');
      return;
    }
    setBluetoothStatus('Searching for nearby Bluetooth duelists...');
    onStartOfflineDuel('bluetooth', { boardSize });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-background/85 backdrop-blur-xl animate-fadeIn select-none">
      <div className="relative w-full max-w-md bg-surface-container/95 border border-primary-container/30 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col gap-4 overflow-hidden">
        {/* Ambient Glow */}
        <div className="absolute -top-12 -left-12 w-44 h-44 bg-primary-container/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -right-12 w-44 h-44 bg-secondary-container/20 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary-container/20 border border-primary-container/40 flex items-center justify-center text-primary-container">
              <SignalIcon className="w-5 h-5 animate-pulse" />
            </div>
            <div className="flex flex-col text-left">
              <h2 className="text-lg font-black text-on-surface leading-tight">Offline Duel Arena</h2>
              <span className="text-[11px] text-on-surface-variant">Play without internet connectivity</span>
            </div>
          </div>
          <button
            onClick={() => {
              sounds.playTap();
              onClose();
            }}
            className="p-1.5 rounded-full bg-surface-container-high border border-outline-variant text-on-surface-variant hover:text-on-surface cursor-pointer"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Top Tabs */}
        <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-surface-container-low border border-outline-variant">
          <button
            type="button"
            onClick={() => {
              sounds.playTap();
              setActiveTab('webrtc');
            }}
            className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer ${
              activeTab === 'webrtc'
                ? 'bg-primary-container text-on-primary-container shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <QrCodeIcon className="w-4 h-4" />
            <span className="text-[10px] truncate">Hotspot P2P</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sounds.playTap();
              setActiveTab('wifi-ip');
            }}
            className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer ${
              activeTab === 'wifi-ip'
                ? 'bg-primary-container text-on-primary-container shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <WifiIcon className="w-4 h-4" />
            <span className="text-[10px] truncate">Wi-Fi IP</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sounds.playTap();
              setActiveTab('pass-and-play');
            }}
            className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer ${
              activeTab === 'pass-and-play'
                ? 'bg-primary-container text-on-primary-container shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <DevicePhoneMobileIcon className="w-4 h-4" />
            <span className="text-[10px] truncate">1 Device</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sounds.playTap();
              setActiveTab('bot');
            }}
            className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer ${
              activeTab === 'bot'
                ? 'bg-primary-container text-on-primary-container shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <CpuChipIcon className="w-4 h-4" />
            <span className="text-[10px] truncate">AI Bot</span>
          </button>
        </div>

        {/* Board Size Toggle for Host/Solo modes */}
        {(activeTab === 'bot' || activeTab === 'pass-and-play' || subRole === 'host') && (
          <div className="flex items-center justify-between p-2.5 rounded-2xl bg-surface-container-high/60 border border-outline-variant">
            <span className="text-xs font-semibold text-on-surface-variant">Grid Matrix:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  sounds.playTap();
                  setBoardSize(5);
                }}
                className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                  boardSize === 5
                    ? 'bg-primary-container text-on-primary-container'
                    : 'bg-surface-container text-on-surface-variant'
                }`}
              >
                Classic 5x5
              </button>
              <button
                type="button"
                onClick={() => {
                  sounds.playTap();
                  setBoardSize(10);
                }}
                className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                  boardSize === 10
                    ? 'bg-primary-container text-on-primary-container'
                    : 'bg-surface-container text-on-surface-variant'
                }`}
              >
                Mega 10x10
              </button>
            </div>
          </div>
        )}

        {/* Tab 1: WebRTC Hotspot P2P */}
        {activeTab === 'webrtc' && (
          <div className="flex flex-col gap-3">
            <div className="flex rounded-xl bg-surface-container-low p-1 border border-outline-variant">
              <button
                type="button"
                onClick={() => setSubRole('host')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  subRole === 'host' ? 'bg-surface text-primary-container' : 'text-on-surface-variant'
                }`}
              >
                Create Room (Host)
              </button>
              <button
                type="button"
                onClick={() => setSubRole('join')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  subRole === 'join' ? 'bg-surface text-primary-container' : 'text-on-surface-variant'
                }`}
              >
                Join Room
              </button>
            </div>

            {subRole === 'host' ? (
              <div className="flex flex-col gap-2.5 text-center">
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Turn on your phone's <strong>Personal Hotspot</strong> or connect to the same Wi-Fi.
                  Your rival connects directly with sub-5ms latency!
                </p>
                <button
                  type="button"
                  onClick={handleStartWebRTCHost}
                  className="w-full h-11 rounded-xl bg-primary-container text-on-primary-container font-bold text-xs shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Launch Hotspot Duel Room</span>
                  <ArrowRightIcon className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                <p className="text-xs text-on-surface-variant">
                  Paste the Host's connection code below:
                </p>
                <textarea
                  rows={2}
                  placeholder="Paste host code or signal..."
                  value={joinSignalInput}
                  onChange={e => setJoinSignalInput(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-surface-container-low border border-outline-variant text-xs text-on-surface font-mono outline-none focus:border-primary-container"
                />
                <button
                  type="button"
                  disabled={!joinSignalInput.trim()}
                  onClick={handleStartWebRTCJoin}
                  className="w-full h-11 rounded-xl bg-primary-container text-on-primary-container font-bold text-xs disabled:opacity-40 disabled:pointer-events-none active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Connect to Host</span>
                  <ArrowRightIcon className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Wi-Fi IP */}
        {activeTab === 'wifi-ip' && (
          <div className="flex flex-col gap-3">
            <div className="flex rounded-xl bg-surface-container-low p-1 border border-outline-variant">
              <button
                type="button"
                onClick={() => setSubRole('host')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  subRole === 'host' ? 'bg-surface text-primary-container' : 'text-on-surface-variant'
                }`}
              >
                Host on Local IP
              </button>
              <button
                type="button"
                onClick={() => setSubRole('join')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  subRole === 'join' ? 'bg-surface text-primary-container' : 'text-on-surface-variant'
                }`}
              >
                Enter Host IP
              </button>
            </div>

            {subRole === 'host' ? (
              <div className="flex flex-col gap-2.5 text-center">
                <p className="text-xs text-on-surface-variant">
                  Both devices must be on the same local Wi-Fi or hotspot. Tell your friend to enter your IP or tap Join!
                </p>
                <button
                  type="button"
                  onClick={handleStartWiFiHost}
                  className="w-full h-11 rounded-xl bg-primary-container text-on-primary-container font-bold text-xs shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Start Local Wi-Fi Match</span>
                  <ArrowRightIcon className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                <span className="text-xs text-on-surface-variant">Enter Host IP or Port (e.g. 192.168.1.15):</span>
                <input
                  type="text"
                  placeholder="e.g. 192.168.1.45:3000"
                  value={wifiIpInput}
                  onChange={e => setWifiIpInput(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-outline-variant text-sm text-on-surface font-mono outline-none focus:border-primary-container"
                />
                <button
                  type="button"
                  onClick={handleStartWiFiJoin}
                  className="w-full h-11 rounded-xl bg-primary-container text-on-primary-container font-bold text-xs shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Connect to Wi-Fi IP</span>
                  <ArrowRightIcon className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Pass & Play */}
        {activeTab === 'pass-and-play' && (
          <div className="flex flex-col gap-3 text-center">
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Two duelists on <strong>one device</strong>. Take turns calling numbers on your respective grids. Perfect for road trips, flights, or quick challenges!
            </p>
            <button
              type="button"
              onClick={handleStartPassAndPlay}
              className="w-full h-12 rounded-xl bg-primary-container text-on-primary-container font-bold text-xs shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <DevicePhoneMobileIcon className="w-4 h-4" />
              <span>Start Pass & Play Duel</span>
            </button>
          </div>
        )}

        {/* Tab 4: AI Bot */}
        {activeTab === 'bot' && (
          <div className="flex flex-col gap-3 text-center">
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Challenge <strong>CyberDuelist [AI]</strong> in single-player offline mode. Practice your line-striking strategies anytime, anywhere!
            </p>
            <button
              type="button"
              onClick={handleStartBotMatch}
              className="w-full h-12 rounded-xl bg-primary-container text-on-primary-container font-bold text-xs shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <CpuChipIcon className="w-4 h-4" />
              <span>Duel CyberDuelist [AI]</span>
            </button>
          </div>
        )}

        {/* Bluetooth Helper & Info */}
        <div className="pt-2 border-t border-outline-variant/60 flex items-center justify-between text-[11px] text-on-surface-variant">
          <span>🔵 Bluetooth Pairing:</span>
          <button
            type="button"
            onClick={handleBluetoothScan}
            className="text-primary-container font-bold hover:underline cursor-pointer"
          >
            Scan for BLE Device
          </button>
        </div>
        {bluetoothStatus && (
          <span className="text-[10px] text-primary-container italic text-center">
            {bluetoothStatus}
          </span>
        )}
      </div>
    </div>
  );
};
