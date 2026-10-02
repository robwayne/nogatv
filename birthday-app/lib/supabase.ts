import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase is optional. Without the two environment variables the site runs
 * exactly as it did before, on browser storage alone, so nothing breaks while
 * the project is being set up.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Which shared row this site reads and writes. */
export const ROOM = process.env.NEXT_PUBLIC_SUPABASE_ROOM ?? "nogatv";

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!client) client = createClient(url, anonKey, { auth: { persistSession: false } });
  return client;
}

export function syncConfigured() {
  return Boolean(url && anonKey);
}
