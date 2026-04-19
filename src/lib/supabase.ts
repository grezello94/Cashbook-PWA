import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function normalizeEnvValue(value: string | undefined): string {
  if (!value) {
    return "";
  }
  return value.trim().replace(/^['"]|['"]$/g, "").trim();
}

export const supabaseUrl = normalizeEnvValue(import.meta.env.VITE_SUPABASE_URL);
export const supabaseAnonKey = normalizeEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY);

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: false,
        detectSessionInUrl: true
      }
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error("Missing Supabase configuration. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }
  return supabase;
}
