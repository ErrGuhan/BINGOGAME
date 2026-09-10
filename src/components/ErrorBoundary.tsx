'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { getActiveRoomCode, clearActiveRoomCode } from '@/lib/gameEngine';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  savedRoom: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      savedRoom: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Never intercept Next.js navigation redirects
    if (
      error?.message === 'NEXT_REDIRECT' ||
      (error as unknown as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')
    ) {
      throw error;
    }
    const savedRoom = getActiveRoomCode();
    return { hasError: true, error, savedRoom };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (
      error?.message === 'NEXT_REDIRECT' ||
      (error as unknown as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')
    ) {
      return;
    }
    console.error('Unhandled Bingo UI Glitch caught by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleRecover = () => {
    // Reloads window to cleanly re-mount React while preserving room session in localStorage
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  handleReset = () => {
    clearActiveRoomCode();
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  render() {
    if (this.state.hasError) {
      const { error, savedRoom } = this.state;

      return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-space-md bg-surface-container-lowest/95 backdrop-blur-3xl text-on-surface">
          <div className="w-full max-w-md rounded-[28px] bg-surface-container-high/90 border border-error/30 p-space-lg flex flex-col items-center text-center shadow-[0_24px_64px_rgba(0,0,0,0.8)] relative overflow-hidden">
            {/* Top Glowing Ambient Light */}
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-error/20 rounded-full blur-3xl pointer-events-none" />

            {/* Warning Shield Beacon */}
            <div className="relative w-16 h-16 rounded-2xl bg-error-container/20 border border-error/40 flex items-center justify-center mb-space-md shadow-[0_0_24px_rgba(255,84,73,0.3)] animate-pulse">
              <span className="material-symbols-outlined text-[36px] text-error">
                shield_with_heart
              </span>
            </div>

            {/* Title & Badge */}
            <div className="inline-flex items-center space-x-space-2xs px-space-sm py-space-3xs rounded-full bg-surface-container-lowest border border-error/30 mb-space-xs">
              <span className="w-2 h-2 rounded-full bg-error animate-ping" />
              <span className="font-label-sm text-label-sm text-error font-bold uppercase tracking-wider">
                Glitch Intercepted
              </span>
            </div>

            <h2 className="font-headline-md text-headline-md font-extrabold tracking-tight text-on-surface mb-space-xs">
              Match Session Protected
            </h2>

            <p className="font-body-md text-body-md text-on-surface-variant mb-space-md max-w-[320px]">
              An unexpected interface anomaly was isolated. Your game state and room session remain safe in memory.
            </p>

            {/* Room Recovery Box if in a match */}
            {savedRoom && (
              <div className="w-full rounded-xl bg-surface-container-lowest border border-primary/30 p-space-sm mb-space-md flex items-center justify-between">
                <div className="flex items-center space-x-space-2xs">
                  <span className="material-symbols-outlined text-primary text-[20px]">
                    meeting_room
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">Active Duel Room:</span>
                </div>
                <span className="font-headline-sm text-headline-sm text-primary font-black tracking-wider">
                  #{savedRoom}
                </span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col w-full space-y-space-xs">
              <button
                onClick={this.handleRecover}
                className="w-full py-space-sm px-space-md rounded-xl bg-primary-container text-on-primary font-headline-sm text-headline-sm font-extrabold flex items-center justify-center space-x-space-2xs shadow-[0_0_24px_rgba(0,245,212,0.5)] active:scale-[0.98] transition-transform hover:brightness-110 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">refresh</span>
                <span>{savedRoom ? 'Quick Recover & Rejoin Duel' : 'Quick Recover & Reload'}</span>
              </button>

              <button
                onClick={this.handleReset}
                className="w-full py-space-sm px-space-md rounded-xl bg-surface-container-highest text-on-surface-variant font-label-lg text-label-lg flex items-center justify-center space-x-space-2xs active:scale-[0.98] transition-colors border border-outline-variant/20 hover:text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">home</span>
                <span>Exit to Safe Lobby</span>
              </button>
            </div>

            {/* Diagnostic Details Accordion */}
            {error && (
              <details className="w-full mt-space-md text-left text-xs text-on-surface-variant/70 bg-surface-container-lowest/60 rounded-lg p-space-xs border border-outline-variant/10">
                <summary className="cursor-pointer font-label-sm text-label-sm text-outline hover:text-on-surface">
                  Diagnostic Information
                </summary>
                <div className="mt-space-2xs p-space-2xs bg-black/40 rounded font-mono text-[10px] overflow-x-auto text-error/90 whitespace-pre-wrap max-h-32">
                  {error.stack || error.toString()}
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
