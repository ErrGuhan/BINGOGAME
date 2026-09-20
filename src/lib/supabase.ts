import { createClient, SupabaseClient } from '@supabase/supabase-js';

// These MUST be set via environment variables (.env.local in development, Vercel env in production).
// See .env.example for the required variable names.
// IMPORTANT: Never commit actual credentials here — even anon keys should be kept out of source.
export const getSupabaseUrl = (): string => {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_URL ||
    process.env.SUPABASE_URL ||
    ''
  );
};

export const getSupabaseKey = (): string => {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  );
};

let hasLoggedConfigError = false;

export const resetSupabaseConfigLog = (): void => {
  hasLoggedConfigError = false;
};

export const getSupabaseConfigStatus = (): {
  configured: boolean;
  missingVars: string[];
  placeholderVars: string[];
} => {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  const missingVars: string[] = [];
  const placeholderVars: string[] = [];

  if (!url) {
    missingVars.push('NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)');
  } else if (url.includes('your-supabase-url') || url.includes('your-project-ref')) {
    placeholderVars.push('NEXT_PUBLIC_SUPABASE_URL (unconfigured placeholder URL)');
  }

  if (!key) {
    missingVars.push('NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)');
  } else if (key.includes('your-anon-key') || key.includes('your-publishable-key')) {
    placeholderVars.push('NEXT_PUBLIC_SUPABASE_ANON_KEY (unconfigured placeholder key)');
  }

  return {
    configured: missingVars.length === 0 && placeholderVars.length === 0,
    missingVars,
    placeholderVars,
  };
};

export const isSupabaseConfigured = (logErrors: boolean = true): boolean => {
  const status = getSupabaseConfigStatus();
  if (!status.configured && logErrors && !hasLoggedConfigError) {
    hasLoggedConfigError = true;
    if (status.missingVars.length > 0) {
      console.error(
        `[Supabase Config Error] Missing required environment variable(s): ${status.missingVars.join(', ')}. ` +
        `Please check your .env.local (local dev) or Vercel Environment Variables (production).`
      );
    }
    if (status.placeholderVars.length > 0) {
      console.error(
        `[Supabase Config Error] Placeholder values detected: ${status.placeholderVars.join(', ')}. ` +
        `Please replace them with your actual Supabase project credentials.`
      );
    }
  }
  return status.configured;
};

let clientInstance: SupabaseClient | null = null;

export const resetSupabaseClient = (): void => {
  clientInstance = null;
  hasLoggedConfigError = false;
};

export const getSupabase = (): SupabaseClient | null => {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!clientInstance) {
    const url = getSupabaseUrl();
    const key = getSupabaseKey();
    clientInstance = createClient(url, key, {
      realtime: {
        params: {
          eventsPerSecond: 20,
        },
      },
    });
  }
  return clientInstance;
};
