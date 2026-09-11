'use client';

import { useEffect } from 'react';

/**
 * Registers /sw.js only in production environments.
 * Periodically checks for updates and refreshes on tab refocus.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      process.env.NODE_ENV === 'production'
    ) {
      let intervalId: NodeJS.Timeout | null = null;

      const register = async () => {
        try {
          const registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
          });

          // Periodic check every 60 minutes
          intervalId = setInterval(() => {
            registration.update().catch(() => {});
          }, 60 * 60 * 1000);

          // Check for updates whenever the tab regains focus
          const handleFocus = () => {
            registration.update().catch(() => {});
          };
          window.addEventListener('focus', handleFocus);

          return () => {
            if (intervalId) clearInterval(intervalId);
            window.removeEventListener('focus', handleFocus);
          };
        } catch (err) {
          console.warn('[SW] Registration failed:', err);
        }
      };

      register();
    }
  }, []);

  return null;
}
