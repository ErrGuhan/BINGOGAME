'use client';

import React, { useState, useEffect } from 'react';
import { usePWA } from '@/context/PWAContext';
import { RefreshCw, X, Sparkles } from 'lucide-react';

export function UpdateToast() {
  const { swUpdateReady, confirmUpdate } = usePWA();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (swUpdateReady) {
      setDismissed(false);
      // Auto-hide after 15 seconds if not interacted with
      const timer = setTimeout(() => {
        setDismissed(true);
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [swUpdateReady]);

  if (!swUpdateReady || dismissed) {
    return null;
  }

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-label="Application update available"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md animate-in fade-in slide-in-from-top duration-300 pointer-events-auto"
    >
      <div className="flex items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl bg-surface-container/95 backdrop-blur-xl border border-outline-variant shadow-lg">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-surface-container-high border border-outline-variant flex items-center justify-center text-primary-container">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-semibold text-on-surface truncate">
              Update Available
            </p>
            <p className="text-[11px] sm:text-xs text-on-surface-variant truncate">
              A new version of BingoDuel is ready.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={confirmUpdate}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary-container text-on-primary-container font-semibold text-xs transition-transform active:scale-95 shadow-xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss notification"
            className="p-1.5 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
