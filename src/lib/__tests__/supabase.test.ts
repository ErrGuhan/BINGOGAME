import { describe, it, expect } from 'vitest';
import { isSupabaseConfigured, getSupabase } from '../supabase';

describe('Supabase Client Configuration', () => {
  it('identifies Supabase as configured via production defaults', () => {
    expect(isSupabaseConfigured()).toBe(true);
  });

  it('creates and returns a singleton SupabaseClient instance', () => {
    const client1 = getSupabase();
    const client2 = getSupabase();

    expect(client1).not.toBeNull();
    expect(client1).toBe(client2);
  });
});
