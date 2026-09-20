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

export const isSupabaseConfigured = (): boolean => {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  return Boolean(
    url &&
    key &&
    !url.includes('your-supabase-url') &&
    !url.includes('your-project-ref') &&
    !key.includes('your-anon-key') &&
    !key.includes('your-publishable-key')
  );
};

let clientInstance: SupabaseClient | null = null;

export const resetSupabaseClient = (): void => {
  clientInstance = null;
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
