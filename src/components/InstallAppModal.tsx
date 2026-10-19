'use client';

import React from 'react';
import {
  ArrowDownTrayIcon,
  XMarkIcon,
  DevicePhoneMobileIcon,
  ShareIcon,
  CheckBadgeIcon,
} from '@heroicons/react/24/outline';
import { usePWA } from '@/context/PWAContext';
import { sounds } from './AudioController';

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstallAppModal: React.FC<InstallAppModalProps> = ({ isOpen, onClose }) => {
  const { isInstalled, isIOS, showInstallPrompt, installPromptEvent } = usePWA();

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    sounds.playTap();
    if (installPromptEvent) {
      await showInstallPrompt();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xl animate-fadeIn select-none">
      <div className="relative w-full max-w-sm bg-surface-container/95 border border-primary-container/30 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center gap-4 overflow-hidden">
        {/* Glow ambient background effect */}
        <div className="absolute -top-10 -right-10 w-36 h-36 bg-primary-container/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-secondary-container/20 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={() => {
            sounds.playTap();
            onClose();
          }}
          className="absolute top-4 right-4 p-1.5 rounded-full bg-surface-container-high border border-outline-variant text-on-surface-variant hover:text-on-surface cursor-pointer"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>

        {/* App Icon */}
        <div className="w-16 h-16 rounded-2xl bg-surface-container-high border border-primary-container/40 flex items-center justify-center shadow-md">
          <ArrowDownTrayIcon className="w-8 h-8 text-primary-container animate-bounce" />
        </div>

        {/* Title */}
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-black text-on-surface tracking-tight">
            Download BingoDuel
          </h2>
          <p className="text-xs text-on-surface-variant max-w-[260px] leading-relaxed">
            Install the game to your home screen for full offline play without internet!
          </p>
        </div>

        {/* Feature Highlights */}
        <div className="w-full flex flex-col gap-2 bg-surface-container-low/70 border border-outline-variant rounded-2xl p-3 text-left">
          <div className="flex items-center gap-2 text-xs text-on-surface">
            <CheckBadgeIcon className="w-4 h-4 text-primary-container shrink-0" />
            <span>100% Offline gameplay (No Wi-Fi needed)</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-on-surface">
            <CheckBadgeIcon className="w-4 h-4 text-primary-container shrink-0" />
            <span>Local Wi-Fi & Hotspot Peer-to-Peer duels</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-on-surface">
            <CheckBadgeIcon className="w-4 h-4 text-primary-container shrink-0" />
            <span>Ultra-fast startup and zero loading lag</span>
          </div>
        </div>

        {isInstalled ? (
          <div className="w-full py-3 rounded-xl bg-primary-container/20 border border-primary-container text-primary-container font-semibold text-sm">
            ✓ BingoDuel is already installed!
          </div>
        ) : isIOS ? (
          <div className="flex flex-col items-center gap-2 w-full p-3 rounded-2xl bg-surface-container-high border border-outline-variant text-xs text-on-surface-variant">
            <span className="font-bold text-on-surface">To install on iPhone / iPad:</span>
            <div className="flex items-center gap-2">
              <span>1. Tap the Share button in Safari</span>
              <ShareIcon className="w-4 h-4 text-primary-container inline" />
            </div>
            <div className="flex items-center gap-2">
              <span>2. Select <strong>Add to Home Screen</strong></span>
              <DevicePhoneMobileIcon className="w-4 h-4 text-primary-container inline" />
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleInstallClick}
            className="w-full h-12 rounded-xl bg-primary-container text-on-primary-container font-bold text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <ArrowDownTrayIcon className="w-5 h-5" />
            <span>Install Offline App</span>
          </button>
        )}
      </div>
    </div>
  );
};
