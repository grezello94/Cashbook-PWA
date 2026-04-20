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

function clearPersistedAuthStorage(): void {
  if (typeof window === "undefined") {
    return;
  }

  const wipeStorage = (storage: Storage | null) => {
    if (!storage) {
      return;
    }

    const keysToDelete: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index) ?? "";
      if (
        key.startsWith("cashbook:") ||
        key.startsWith("cashbook.") ||
        (key.startsWith("sb-") && key.includes("-auth-token"))
      ) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => {
      storage.removeItem(key);
    });
  };

  try {
    wipeStorage(window.localStorage);
  } catch {
    // Ignore browser storage cleanup errors.
  }

  try {
    wipeStorage(window.sessionStorage);
  } catch {
    // Ignore browser storage cleanup errors.
  }
}

clearPersistedAuthStorage();

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
