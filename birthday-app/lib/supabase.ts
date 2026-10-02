import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase is optional. Without the two environment variables the site runs
 * exactly as it did before, on browser storage alone, so nothing breaks while
 * the project is being set up.
 */
/**
 * These two are publishable by design: they identify the project and are
 * meant to sit in client code, which is why they are here rather than in a
 * secret. Row level security is what actually guards the data. The secret
 * key and the database password must never appear in this file.
 *
 * Repository secrets still win if they are set, so the values can be moved
 * without touching the code.
 */
const DEFAULT_URL = "https://qmgsmncnhjugmmubipvt.supabase.co";
const DEFAULT_KEY = "sb_publishable_HFm6lXSJbBK1AfcEOMn4KQ_xiQKMWkW";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_KEY;

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
