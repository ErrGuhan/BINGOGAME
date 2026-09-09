'use client';

import React, { useState, useEffect, useRef } from 'react';
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
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-surface-container-high/70 text-on-surface-variant hover:text-primary transition-all text-xs font-bold border border-outline-variant/20"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>Back</span>
        </button>
        <span className="font-label-sm text-[11px] text-secondary-fixed uppercase font-black tracking-wider bg-secondary-container/20 px-2.5 py-0.5 rounded-full border border-secondary/30">
          Join Arena
        </span>
      </div>

      {/* Header Info */}
      <div className="flex flex-col items-center text-center gap-1">
        <h1 className="font-headline-xl-mobile text-2xl text-on-surface tracking-tight font-black">
          Enter Room Code
        </h1>
        <p className="font-body-sm text-xs text-on-surface-variant max-w-[260px]">
          Enter the 4-character code from your friend to join the duel.
        </p>
      </div>

      {/* Error State Banner */}
      {error && (
        <div className="w-full relative overflow-hidden rounded-xl bg-surface-container-high/95 backdrop-blur-xl shadow-lg border border-error/50 p-3 flex items-start gap-2.5 text-error animate-fadeIn">
          <span className="material-symbols-outlined text-[20px] text-error mt-0.5">error</span>
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
      <form onSubmit={handleSubmit} className="w-full rounded-2xl bg-surface-container/80 backdrop-blur-xl p-6 shadow-xl border border-outline-variant/30 flex flex-col items-center gap-4">
        {/* Visual Slots Container */}
        <div
          onClick={() => inputRef.current?.focus()}
          className="flex items-center justify-center gap-3 w-full cursor-pointer py-1"
        >
          {[0, 1, 2, 3].map(idx => {
            const char = code[idx] || '';
            const isActive = code.length === idx;
            return (
              <div
                key={idx}
                className={`relative w-14 h-16 rounded-xl flex items-center justify-center text-2xl font-black transition-all ${
                  isActive
                    ? 'bg-surface-container-highest border-2 border-primary-container shadow-[0_0_16px_rgba(0,245,212,0.4)] text-primary-fixed'
                    : char
                    ? 'bg-surface-container-high border border-outline-variant/30 text-on-surface'
                    : 'bg-surface-container-lowest/60 border border-outline-variant/20 text-on-surface-variant/30'
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

        {/* Hidden Native Input: Captures hardware and virtual keyboards seamlessly */}
        <input
          ref={inputRef}
          type="text"
          maxLength={4}
          value={code}
          onChange={handleInputChange}
          className="opacity-0 absolute -z-10 pointer-events-none"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck="false"
        />

        {/* Quick Paste Button */}
        <button
          type="button"
          onClick={handlePaste}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high hover:bg-surface-bright text-primary-fixed text-xs font-bold border border-outline-variant/20 active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-[15px]">content_paste</span>
          <span>Paste Code</span>
        </button>

        {/* Submit Join Button */}
        <button
          type="submit"
          disabled={code.length < 3 || loading}
          className="w-full h-14 rounded-2xl bg-gradient-to-r from-secondary-fixed to-secondary text-on-secondary font-headline-sm text-base font-black shadow-[0_0_24px_rgba(168,85,247,0.4)] hover:brightness-105 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:pointer-events-none mt-2"
        >
          <span className="material-symbols-outlined text-[22px]">login</span>
          <span>{loading ? 'Joining Arena...' : 'Join Game'}</span>
        </button>
      </form>
    </div>
  );
};
