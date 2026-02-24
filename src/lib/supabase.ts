import { createClient, type SupabaseClient, type SupportedStorage } from "@supabase/supabase-js";

function normalizeEnvValue(value: string | undefined): string {
  if (!value) {
    return "";
  }
  return value.trim().replace(/^['"]|['"]$/g, "").trim();
}

export const supabaseUrl = normalizeEnvValue(import.meta.env.VITE_SUPABASE_URL);
export const supabaseAnonKey = normalizeEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY);
const REMEMBER_SESSION_KEY = "cashbook:remember-session";

function getBrowserStorage(kind: "localStorage" | "sessionStorage"): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window[kind];
  } catch {
    return null;
  }
}

function readRememberSessionPreference(): boolean {
  const local = getBrowserStorage("localStorage");
  if (!local) {
    return false;
  }
  return local.getItem(REMEMBER_SESSION_KEY) === "1";
}

function writeRememberSessionPreference(value: boolean): void {
  const local = getBrowserStorage("localStorage");
  if (!local) {
    return;
  }
  local.setItem(REMEMBER_SESSION_KEY, value ? "1" : "0");
}

const authStorage: SupportedStorage = {
  getItem(key: string): string | null {
    const local = getBrowserStorage("localStorage");
    const session = getBrowserStorage("sessionStorage");
    const rememberSession = readRememberSessionPreference();
    const primary = rememberSession ? local : session;
    const secondary = rememberSession ? session : local;
    return primary?.getItem(key) ?? secondary?.getItem(key) ?? null;
  },
  setItem(key: string, value: string): void {
    const local = getBrowserStorage("localStorage");
    const session = getBrowserStorage("sessionStorage");
    const rememberSession = readRememberSessionPreference();
    const primary = rememberSession ? local : session;
    const secondary = rememberSession ? session : local;

    if (primary) {
      primary.setItem(key, value);
    } else {
      secondary?.setItem(key, value);
    }
    secondary?.removeItem(key);
  },
  removeItem(key: string): void {
    const local = getBrowserStorage("localStorage");
    const session = getBrowserStorage("sessionStorage");
    local?.removeItem(key);
    session?.removeItem(key);
  }
};

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storage: authStorage
      }
    })
  : null;

export function setRememberSessionPreference(value: boolean): void {
  writeRememberSessionPreference(value);
}

export function getRememberSessionPreference(): boolean {
  return readRememberSessionPreference();
}

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error("Missing Supabase configuration. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }
  return supabase;
}
