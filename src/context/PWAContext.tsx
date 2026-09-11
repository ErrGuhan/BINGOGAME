'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

interface PWAContextValue {
  /** True when a new service worker has been installed and is waiting */
  swUpdateReady: boolean;
  /** Call this to activate the waiting SW and reload the page */
  confirmUpdate: () => void;
  /** The native browser install prompt event (Android/Chrome only) */
  installPromptEvent: BeforeInstallPromptEvent | null;
  /** True when the app is running in standalone (installed PWA) mode */
  isInstalled: boolean;
  /** True on iOS (Safari doesn't support beforeinstallprompt) */
  isIOS: boolean;
  /** True if the user has dismissed the iOS install banner */
  iosBannerDismissed: boolean;
  /** Triggers the native install prompt (Android) */
  showInstallPrompt: () => Promise<void>;
  /** Dismisses the iOS install banner and saves to localStorage */
  dismissIOSBanner: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const PWAContext = createContext<PWAContextValue>({
  swUpdateReady: false,
  confirmUpdate: () => {},
  installPromptEvent: null,
  isInstalled: false,
  isIOS: false,
  iosBannerDismissed: false,
  showInstallPrompt: async () => {},
  dismissIOSBanner: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

const IOS_BANNER_KEY = 'bingoduel_ios_banner_dismissed';

export function PWAProvider({ children }: { children: ReactNode }) {
  const [swUpdateReady, setSwUpdateReady] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [iosBannerDismissed, setIosBannerDismissed] = useState(false);
  const waitingSwRef = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    // Detect standalone mode
    const mq = window.matchMedia('(display-mode: standalone)');
    setIsInstalled(mq.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

    // Detect iOS
    const ua = navigator.userAgent;
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
    setIsIOS(isIOSDevice);

    // Read iOS banner dismissal from localStorage
    try {
      setIosBannerDismissed(localStorage.getItem(IOS_BANNER_KEY) === '1');
    } catch {}

    // Listen for SW update messages
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SW_UPDATED') {
        setSwUpdateReady(true);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleMessage);

    // Listen for waiting SW via updatefound
    const handleSWUpdate = (registration: ServiceWorkerRegistration) => {
      const sw = registration.installing;
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          // A new SW is installed and waiting — show the update toast
          waitingSwRef.current = sw;
          setSwUpdateReady(true);
        }
      });
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg) return;
        reg.addEventListener('updatefound', () => handleSWUpdate(reg));
        // If there's already a waiting SW when the page loads
        if (reg.waiting && navigator.serviceWorker.controller) {
          waitingSwRef.current = reg.waiting;
          setSwUpdateReady(true);
        }
      });

      // When the controller changes (new SW took control), reload
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }

    // Listen for the install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPromptEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Detect if user installs the app
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setInstallPromptEvent(null);
    });

    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const confirmUpdate = useCallback(() => {
    if (waitingSwRef.current) {
      waitingSwRef.current.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  }, []);

  const showInstallPrompt = useCallback(async () => {
    if (!installPromptEvent) return;
    await installPromptEvent.prompt();
    const { outcome } = await installPromptEvent.userChoice;
    if (outcome === 'accepted') {
      setInstallPromptEvent(null);
      setIsInstalled(true);
    }
  }, [installPromptEvent]);

  const dismissIOSBanner = useCallback(() => {
    setIosBannerDismissed(true);
    try {
      localStorage.setItem(IOS_BANNER_KEY, '1');
    } catch {}
  }, []);

  return (
    <PWAContext.Provider
      value={{
        swUpdateReady,
        confirmUpdate,
        installPromptEvent,
        isInstalled,
        isIOS,
        iosBannerDismissed,
        showInstallPrompt,
        dismissIOSBanner,
      }}
    >
      {children}
    </PWAContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePWA(): PWAContextValue {
  return useContext(PWAContext);
}
