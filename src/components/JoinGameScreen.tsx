'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeftIcon,
  ClipboardDocumentIcon,
  ExclamationCircleIcon,
  ArrowRightEndOnRectangleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { sounds } from './AudioController';

interface JoinGameScreenProps {
  initialCode?: string;
  onJoin: (roomCode: string) => void;
  onBack: () => void;
  loading: boolean;
  errorMessage?: string | null;
}

export const JoinGameScreen: React.FC<JoinGameScreenProps> = ({
  initialCode = '',
  onJoin,
  onBack,
  loading,
  errorMessage,
}) => {
  const [code, setCode] = useState<string>(initialCode.toUpperCase().slice(0, 4));
  const [error, setError] = useState<string | null>(errorMessage || null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode.toUpperCase().slice(0, 4));
    }
  }, [initialCode]);

  useEffect(() => {
    setError(errorMessage || null);
  }, [errorMessage]);

  useEffect(() => {
    // Auto-focus input on mount
    inputRef.current?.focus();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    sounds.playTap();
    setCode(val);
    setError(null);
  };

  const handlePaste = async () => {
    sounds.playTap();
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const clean = text.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
        if (clean) {
          setCode(clean);
          setError(null);
        }
      }
    } catch {}
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length >= 3 && !loading) {
      sounds.playDraft(580);
      onJoin(code);
    }
  };

  return (
    <div className="flex flex-col w-full max-w-md mx-auto gap-4 select-none pt-2">
      {/* Top Header */}
      <div className="flex items-center justify-between w-full">
        <button
          onClick={() => {
            sounds.playTap();
            onBack();
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container text-on-surface hover:bg-surface-container-high transition-all text-xs font-semibold border border-outline-variant"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          <span>Back</span>
        </button>
        <span className="font-label-sm text-[11px] text-primary-container uppercase font-semibold tracking-wider bg-primary-container/10 px-2.5 py-0.5 rounded-full border border-primary-container/20">
          Join Arena
        </span>
      </div>

      {/* Header Info */}
      <div className="flex flex-col items-center text-center gap-1">
        <h1 className="font-headline-xl-mobile text-2xl text-on-surface tracking-tight font-bold">
          Enter Room Code
        </h1>
        <p className="font-body-sm text-xs text-on-surface-variant max-w-[260px]">
          Enter the 4-character code from your friend to join the duel.
        </p>
      </div>

      {/* Error State Banner */}
      {error && (
        <div className="w-full relative overflow-hidden rounded-xl bg-error-container text-on-error-container border border-error/20 p-3 flex items-start gap-2.5 animate-fadeIn">
          <ExclamationCircleIcon className="w-5 h-5 text-error shrink-0 mt-0.5" />
          <div className="flex flex-col flex-1 min-w-0 text-left">
            <span className="font-headline-sm text-xs font-bold text-error leading-tight">
              Notice
            </span>
            <span className="font-body-sm text-xs text-on-surface-variant mt-0.5 leading-snug">
              {error}
            </span>
          </div>
        </div>
      )}

      {/* 4-Letter Pin Code Card */}
      <form onSubmit={handleSubmit} className="w-full rounded-2xl bg-surface-container/80 backdrop-blur-xl p-6 shadow-xs border border-outline-variant flex flex-col items-center gap-4">
        {/* Visual Slots Container with Direct Transparent Input */}
        <div className="relative flex items-center justify-center gap-3 w-full py-1">
          {/* Transparent Native Input Directly Accessible to Mobile Browsers */}
          <input
            ref={inputRef}
            type="text"
            maxLength={4}
            value={code}
            onChange={handleInputChange}
            className="absolute inset-0 w-full h-full opacity-0 z-20 cursor-pointer caret-transparent"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck="false"
            autoComplete="off"
            aria-label="4-letter room code"
          />

          {[0, 1, 2, 3].map(idx => {
            const char = code[idx] || '';
            const isActive = code.length === idx;
            return (
              <div
                key={idx}
                className={`relative w-14 h-16 rounded-xl flex items-center justify-center text-2xl font-bold transition-all ${
                  isActive
                    ? 'bg-surface-container-high border-2 border-primary-container shadow-xs text-primary-container'
                    : char
                    ? 'bg-surface-container-high border border-outline-variant text-on-surface'
                    : 'bg-surface-container-low border border-outline-variant text-on-surface-variant/30'
                }`}
              >
                <span>{char}</span>
                {isActive && (
                  <span className="absolute w-0.5 h-6 bg-primary-container rounded-full animate-pulse" />
                )}
              </div>
            );
          })}
        </div>

        {/* Quick Paste Button */}
        <button
          type="button"
          onClick={handlePaste}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-medium border border-outline-variant active:scale-95 transition-all cursor-pointer"
        >
          <ClipboardDocumentIcon className="w-3.5 h-3.5 text-primary-container" />
          <span>Paste Code</span>
        </button>

        {/* Submit Join Button */}
        <button
          type="submit"
          disabled={code.length < 3 || loading}
          className="w-full h-13 rounded-2xl bg-primary-container text-on-primary-container font-headline-sm text-base font-semibold shadow-xs hover:opacity-95 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:pointer-events-none mt-2"
        >
          {loading ? (
            <>
              <ArrowPathIcon className="w-5 h-5 animate-spin" />
              <span>Joining Arena...</span>
            </>
          ) : (
            <>
              <ArrowRightEndOnRectangleIcon className="w-5 h-5" />
              <span>Join Game</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
