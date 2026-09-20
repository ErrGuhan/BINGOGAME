import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseUrl } from './supabase';

let adminClientInstance: SupabaseClient | null = null;

export const getSupabaseAdminKey = (): string => {
  return (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  );
};

export const getSupabaseAdmin = (): SupabaseClient | null => {
  const url = getSupabaseUrl();
  const key = getSupabaseAdminKey();
  if (!url || !key) return null;

  if (!adminClientInstance) {
    adminClientInstance = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return adminClientInstance;
};
