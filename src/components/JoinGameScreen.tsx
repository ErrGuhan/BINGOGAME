'use client';

import React, { useState, useEffect } from 'react';
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
  const [code, setCode] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(errorMessage || null);

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode.toUpperCase().slice(0, 4).split(''));
    }
  }, [initialCode]);

  useEffect(() => {
    setError(errorMessage || null);
  }, [errorMessage]);

  const maxChars = 4;

  const handleKeyPress = (char: string) => {
    sounds.playTap();
    setError(null);
    if (code.length < maxChars) {
      const next = [...code, char.toUpperCase()];
      setCode(next);
      if (next.length === maxChars) {
        sounds.playDraft(580);
      }
    }
  };

  const handleBackspace = () => {
    sounds.playTap();
    setError(null);
    if (code.length > 0) {
      setCode(code.slice(0, -1));
    }
  };

  // Support hardware keyboard typing
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Enter') {
        if (code.length === maxChars) {
          onJoin(code.join(''));
        }
      } else if (/^[a-zA-Z0-9]$/.test(e.key)) {
        handleKeyPress(e.key);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [code]);

  const handlePaste = async () => {
    sounds.playTap();
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const clean = text.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, maxChars);
        if (clean.length > 0) {
          setCode(clean.split(''));
          sounds.playDraft(580);
        }
      }
    } catch {
      // Clipboard access denied or unsupported
    }
  };

  const keysNumbers = ['2', '3', '4', '5', '6', '7', '8', '9'];
  const keysRowA = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const keysRowB = ['J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R'];
  const keysRowC = ['S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

  return (
    <div className="flex flex-col w-full max-w-md mx-auto px-space-xs py-space-sm space-y-space-md select-none">
      {/* Breadcrumb & Top Bar */}
      <div className="flex items-center justify-between w-full">
        <button
          onClick={() => {
            sounds.playTap();
            onBack();
          }}
          className="flex items-center gap-space-xs text-on-surface-variant hover:text-primary transition-all duration-200 py-1.5 px-3 rounded-full bg-surface-container-high/60 backdrop-blur-md active:scale-95 shadow-sm"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          <span className="font-label-md text-label-md font-bold">Arena</span>
        </button>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high/40 backdrop-blur-md border border-primary-fixed-dim/30">
          <span className="w-2 h-2 rounded-full bg-primary-fixed-dim animate-pulse" />
          <span className="font-label-sm text-label-sm tracking-wider text-primary-fixed-dim uppercase font-bold">
            Duel Lobby
          </span>
        </div>
      </div>

      {/* Header Text */}
      <div className="flex flex-col items-center text-center space-y-1">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface tracking-tight font-extrabold flex items-center justify-center gap-2">
          Join Room
          <span className="material-symbols-outlined text-primary-container text-[24px]">swords</span>
        </h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant max-w-[280px]">
          Enter the 4-character room code from your opponent to step into the duel
        </p>
      </div>

      {/* Error State Banner */}
      {error && (
        <div className="w-full relative overflow-hidden rounded-xl bg-surface-container-high/90 backdrop-blur-xl shadow-lg border border-error/40 transition-all duration-300">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-error to-transparent" />
          <div className="p-space-sm flex items-start gap-space-sm text-error">
            <div className="w-8 h-8 rounded-full bg-error/15 flex items-center justify-center shrink-0 mt-0.5">
              <span className="material-symbols-outlined text-[20px] text-error">warning</span>
            </div>
            <div className="flex flex-col flex-1 min-w-0 pr-1">
              <span className="font-headline-sm text-headline-sm text-error leading-tight font-bold">
                Room Notice
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant mt-0.5 leading-snug">
                {error}
              </span>
            </div>
            <button
              aria-label="Dismiss message"
              onClick={() => setError(null)}
              className="w-7 h-7 rounded-full bg-surface-container-highest/60 flex items-center justify-center text-on-surface-variant hover:text-on-surface active:scale-90 transition-all shrink-0"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        </div>
      )}

      {/* Code Display Matrix / Character Slots */}
      <div className="flex flex-col items-center justify-center py-space-xs">
        <div className="flex items-center justify-center gap-space-sm w-full">
          {[0, 1, 2, 3].map(idx => {
            const char = code[idx] || '';
            const isActive = code.length === idx;
            return (
              <div
                key={idx}
                className={`slot-box relative w-16 h-20 rounded-xl flex items-center justify-center shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition-all duration-200 border ${
                  isActive
                    ? 'bg-surface-container-highest/90 backdrop-blur-2xl border-primary-container shadow-[0_0_24px_rgba(0,245,212,0.35)]'
                    : 'bg-surface-container-high/80 backdrop-blur-xl border-outline-variant/30'
                }`}
              >
                <span className="slot-char font-headline-xl-mobile text-headline-xl-mobile text-on-surface font-extrabold">
                  {char}
                </span>
                {isActive && (
                  <span className="caret absolute w-0.5 h-8 bg-primary-container rounded-full block animate-pulse shadow-[0_0_12px_rgba(0,245,212,0.9)]" />
                )}
              </div>
            );
          })}
        </div>
        
        {/* Fast Action Paste Link */}
        <div className="flex items-center gap-2 mt-2">
          <span className="font-label-sm text-label-sm text-on-surface-variant/70 uppercase tracking-widest text-[10px]">
            Tap Keypad or
          </span>
          <button
            type="button"
            onClick={handlePaste}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container-high/90 hover:bg-primary-container/20 text-primary-fixed text-[11px] font-bold border border-primary-fixed/25 active:scale-95 transition-all shadow-sm"
          >
            <span className="material-symbols-outlined text-[13px]">content_paste</span>
            <span>Paste Code</span>
          </button>
        </div>
      </div>

      {/* Custom Mobile Frosted Glass Keypad (Complete 32 Character Matrix) */}
      <div className="w-full rounded-2xl bg-surface-container-lowest/60 backdrop-blur-2xl p-2.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06),0_12px_36px_rgba(0,0,0,0.4)] border border-outline-variant/20 flex flex-col gap-1.5">
        {/* Row 1: Numbers 2-9 */}
        <div className="grid grid-cols-8 gap-1">
          {keysNumbers.map(k => (
            <button
              key={k}
              type="button"
              onClick={() => handleKeyPress(k)}
              className="key-btn h-10 rounded-lg bg-surface-container-high/90 text-primary-fixed font-headline-sm text-headline-sm text-xs flex items-center justify-center active:scale-95 active:bg-primary-container active:text-on-primary transition-all shadow-sm border border-outline-variant/20 font-extrabold"
            >
              {k}
            </button>
          ))}
        </div>

        {/* Row 2: Letters A-H */}
        <div className="grid grid-cols-8 gap-1">
          {keysRowA.map(k => (
            <button
              key={k}
              type="button"
              onClick={() => handleKeyPress(k)}
              className="key-btn h-10 rounded-lg bg-surface-container/80 text-on-surface font-label-lg text-xs flex items-center justify-center active:scale-95 active:bg-secondary-container active:text-on-secondary transition-all border border-outline-variant/15 font-bold"
            >
              {k}
            </button>
          ))}
        </div>

        {/* Row 3: Letters J-R */}
        <div className="grid grid-cols-8 gap-1">
          {keysRowB.map(k => (
            <button
              key={k}
              type="button"
              onClick={() => handleKeyPress(k)}
              className="key-btn h-10 rounded-lg bg-surface-container/80 text-on-surface font-label-lg text-xs flex items-center justify-center active:scale-95 active:bg-secondary-container active:text-on-secondary transition-all border border-outline-variant/15 font-bold"
            >
              {k}
            </button>
          ))}
        </div>

        {/* Row 4: Letters S-Z */}
        <div className="grid grid-cols-8 gap-1">
          {keysRowC.map(k => (
            <button
              key={k}
              type="button"
              onClick={() => handleKeyPress(k)}
              className="key-btn h-10 rounded-lg bg-surface-container/80 text-on-surface font-label-lg text-xs flex items-center justify-center active:scale-95 active:bg-secondary-container active:text-on-secondary transition-all border border-outline-variant/15 font-bold"
            >
              {k}
            </button>
          ))}
        </div>

        {/* Row 5: Action Deck (Paste + Delete) */}
        <div className="grid grid-cols-8 gap-1 pt-0.5">
          <button
            type="button"
            onClick={handlePaste}
            className="col-span-4 h-10 rounded-lg bg-surface-container-high/80 text-on-surface hover:text-primary-fixed flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-sm border border-outline-variant/20 font-bold text-xs"
          >
            <span className="material-symbols-outlined text-[16px] text-primary-container">content_paste</span>
            <span>Paste Clipboard</span>
          </button>
          <button
            aria-label="Delete character"
            type="button"
            onClick={handleBackspace}
            className="col-span-4 h-10 rounded-lg bg-surface-container-high/90 text-error flex items-center justify-center gap-1.5 active:scale-95 active:bg-error active:text-on-error transition-all shadow-sm border border-error/30 font-bold text-xs"
          >
            <span className="material-symbols-outlined text-[18px]">backspace</span>
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Sticky Action CTA */}
      <div className="w-full pt-space-xs pb-1">
        <button
          disabled={code.length !== maxChars || loading}
          onClick={() => {
            sounds.playTap();
            onJoin(code.join(''));
          }}
          className={`w-full h-14 rounded-xl font-headline-sm text-headline-sm uppercase tracking-wide flex items-center justify-center gap-2 transition-all duration-300 ${
            code.length === maxChars && !loading
              ? 'bg-gradient-to-r from-primary-container to-primary-fixed-dim text-on-primary-container shadow-[0_0_24px_rgba(0,245,212,0.5)] active:scale-[0.98] font-black cursor-pointer'
              : 'bg-surface-container-high text-on-surface-variant/40 cursor-not-allowed border border-outline-variant/20'
          }`}
        >
          <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            bolt
          </span>
          <span>{loading ? 'Entering Arena...' : 'Join Duel'}</span>
        </button>
      </div>

      {/* Peer Opponent Peek Mini Card */}
      <div className="w-full rounded-xl bg-surface-container-low/50 backdrop-blur-md p-space-sm border border-outline-variant/20 flex items-center justify-between">
        <div className="flex items-center gap-space-sm">
          <div className="relative w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center text-on-secondary shadow-md">
            <span className="material-symbols-outlined text-[22px]">person_celebrate</span>
            <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-primary-fixed border-2 border-surface-container-lowest" />
          </div>
          <div className="flex flex-col text-left">
            <span className="font-label-md text-label-md text-on-surface font-bold">Spectator &amp; Rival Stream</span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">Matches automatically sync in real-time</span>
          </div>
        </div>
        <span className="material-symbols-outlined text-on-surface-variant text-[20px]">lock_open</span>
      </div>
    </div>
  );
};
