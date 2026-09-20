import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isSupabaseConfigured, getSupabase } from '../supabase';

describe('Supabase Client Configuration', () => {
  // In test environments, NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
  // are not set, so isSupabaseConfigured() correctly returns false.
  it('returns false when env vars are not set (test environment)', () => {
    // Verify no credentials are accidentally hardcoded
    expect(isSupabaseConfigured()).toBe(false);
  });

  it('getSupabase() returns null when Supabase is not configured', () => {
    const client = getSupabase();
    expect(client).toBeNull();
  });

  it('getSupabase() returns a singleton client when env vars are set', () => {
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-that-is-long-enough-to-pass-validation';

    expect(isSupabaseConfigured()).toBe(true);
    const client = getSupabase();
    expect(client).not.toBeNull();

    // Restore
    if (originalUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (originalKey !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
    else delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it('supports SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY aliases', () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_token_123';

    expect(isSupabaseConfigured()).toBe(true);

    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
  });

  it('rejects placeholder URLs from .env.example', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://your-project-ref.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'your-anon-key-here';

    expect(isSupabaseConfigured()).toBe(false);

    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });
});
