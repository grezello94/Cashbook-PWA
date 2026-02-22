import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export interface SignUpInput {
  fullName: string;
  email: string;
  password: string;
  phone: string;
  country: string;
  currency: string;
}

interface AuthHook {
  session: Session | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (input: SignUpInput) => Promise<void>;
  signInWithGoogle: (emailHint?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

interface AuthSettings {
  external?: Record<string, boolean>;
}

const OAUTH_EMAIL_HINT_KEY = "cashbook:oauth-google-email-hint";
const OAUTH_LAST_ERROR_KEY = "cashbook:oauth-last-error";
const OAUTH_HINT_MAX_AGE_MS = 10 * 60 * 1000;

interface OAuthEmailHint {
  email: string;
  createdAt: number;
}

function saveOAuthEmailHint(email: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const payload: OAuthEmailHint = {
    email: email.trim().toLowerCase(),
    createdAt: Date.now()
  };
  window.sessionStorage.setItem(OAUTH_EMAIL_HINT_KEY, JSON.stringify(payload));
}

function clearOAuthEmailHint(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(OAUTH_EMAIL_HINT_KEY);
}

function setOAuthLastError(message: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(OAUTH_LAST_ERROR_KEY, message);
}

function clearOAuthLastError(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(OAUTH_LAST_ERROR_KEY);
}

function readOAuthIntent(): OAuthEmailHint | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.sessionStorage.getItem(OAUTH_EMAIL_HINT_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<OAuthEmailHint>;
    const email = typeof parsed.email === "string" ? parsed.email.trim().toLowerCase() : "";
    const createdAt = typeof parsed.createdAt === "number" ? parsed.createdAt : 0;
    if (!createdAt || Date.now() - createdAt > OAUTH_HINT_MAX_AGE_MS) {
      clearOAuthEmailHint();
      return null;
    }
    return {
      email,
      createdAt
    };
  } catch {
    clearOAuthEmailHint();
    return null;
  }
}

function isSessionNewerThanIntent(current: Session | null, intent: OAuthEmailHint): boolean {
  if (!current) {
    return false;
  }

  const lastSignInRaw = current.user.last_sign_in_at ?? current.user.updated_at ?? "";
  const lastSignInMs = Date.parse(lastSignInRaw);
  if (!Number.isFinite(lastSignInMs)) {
    return false;
  }

  return lastSignInMs >= intent.createdAt - 90_000;
}

function isOAuthEmailMismatch(current: Session | null): boolean {
  const intent = readOAuthIntent();
  if (!intent || !intent.email) {
    return false;
  }

  const currentEmail = (current?.user.email ?? "").trim().toLowerCase();
  if (!currentEmail) {
    return false;
  }

  if (currentEmail === intent.email) {
    clearOAuthEmailHint();
    return false;
  }

  return true;
}

function sessionMatchesExpectedEmail(current: Session | null, intent: OAuthEmailHint): boolean {
  if (!intent.email) {
    return false;
  }
  const currentEmail = (current?.user.email ?? "").trim().toLowerCase();
  return Boolean(currentEmail && currentEmail === intent.email);
}

async function isGoogleProviderEnabled(): Promise<boolean> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anonKey) {
    return false;
  }

  const response = await fetch(`${url}/auth/v1/settings`, {
    headers: {
      apikey: anonKey
    }
  });

  if (!response.ok) {
    throw new Error("Could not verify Google provider status.");
  }

  const settings = (await response.json()) as AuthSettings;
  return Boolean(settings.external?.google);
}

export function useAuthSession(): AuthHook {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const sb = supabase;

    sb.auth.getSession().then(async ({ data }) => {
      const initialSession = data.session ?? null;
      const intent = readOAuthIntent();

      if (intent && initialSession) {
        if (isOAuthEmailMismatch(initialSession)) {
          const actual = (initialSession.user.email ?? "another account").trim();
          setOAuthLastError(
            `Signed in as ${actual}. Please choose ${intent.email} and try again.`
          );
          clearOAuthEmailHint();
          await sb.auth.signOut({ scope: "local" });
          setSession(null);
          setLoading(false);
          return;
        }

        const sessionIsNew = isSessionNewerThanIntent(initialSession, intent);
        const sessionMatchesExpected = sessionMatchesExpectedEmail(initialSession, intent);
        if (!sessionIsNew && !sessionMatchesExpected) {
          // OAuth was started but browser restored an older local session.
          setOAuthLastError("Old session was restored. Please sign in again and choose the intended Google account.");
          clearOAuthEmailHint();
          await sb.auth.signOut({ scope: "local" });
          setSession(null);
          setLoading(false);
          return;
        }

        if (sessionIsNew || sessionMatchesExpected) {
          clearOAuthEmailHint();
          clearOAuthLastError();
        }
      }

      setSession(initialSession);
      setLoading(false);
    });

    const { data } = sb.auth.onAuthStateChange((event, current) => {
      if (isOAuthEmailMismatch(current)) {
        const intent = readOAuthIntent();
        const expected = intent?.email ?? "the selected account";
        const actual = (current?.user.email ?? "another account").trim();
        setOAuthLastError(`Signed in as ${actual}. Please choose ${expected} and try again.`);
        clearOAuthEmailHint();
        void sb.auth.signOut({ scope: "local" }).then(() => {
          setSession(null);
        });
        return;
      }

      const intent = readOAuthIntent();
      if (
        intent &&
        current &&
        (isSessionNewerThanIntent(current, intent) || sessionMatchesExpectedEmail(current, intent))
      ) {
        clearOAuthEmailHint();
        clearOAuthLastError();
      }

      if (event === "TOKEN_REFRESHED") {
        return;
      }

      const previous = sessionRef.current;
      const sameUser = previous?.user.id === current?.user.id;
      const sameAccessToken = previous?.access_token === current?.access_token;
      const sameRefreshToken = previous?.refresh_token === current?.refresh_token;
      const sameUserUpdatedAt = previous?.user.updated_at === current?.user.updated_at;

      if (sameUser && sameAccessToken && sameRefreshToken && sameUserUpdatedAt) {
        return;
      }

      setSession(current);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      throw new Error("Supabase is not configured");
    }
    clearOAuthLastError();

    const emailTrimmed = email.trim();
    const emailLower = emailTrimmed.toLowerCase();

    const {
      data: { session: activeSession }
    } = await supabase.auth.getSession();
    const activeEmail = (activeSession?.user.email ?? "").trim().toLowerCase();
    if (activeSession && activeEmail && activeEmail !== emailLower) {
      const { error: clearError } = await supabase.auth.signOut();
      if (clearError) {
        throw clearError;
      }
      setSession(null);
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailTrimmed,
      password
    });

    if (error) {
      throw error;
    }

    const signedEmail = (data.user?.email ?? "").trim().toLowerCase();
    if (signedEmail && signedEmail !== emailLower) {
      throw new Error(`Signed in as ${data.user?.email ?? "another account"}. Please sign out and try again.`);
    }

    setSession(data.session ?? null);
  }, []);

  const signUpWithEmail = useCallback(async (input: SignUpInput) => {
    if (!supabase) {
      throw new Error("Supabase is not configured");
    }
    clearOAuthLastError();

    const {
      data: { session: activeSession }
    } = await supabase.auth.getSession();
    const activeEmail = (activeSession?.user.email ?? "").trim().toLowerCase();
    const nextEmail = input.email.trim().toLowerCase();
    if (activeSession && activeEmail && activeEmail !== nextEmail) {
      const { error: clearError } = await supabase.auth.signOut();
      if (clearError) {
        throw clearError;
      }
      setSession(null);
    }

    const { data, error } = await supabase.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: input.fullName,
          phone: input.phone,
          country: input.country,
          currency: input.currency
        }
      }
    });

    if (error) {
      throw error;
    }

    // Supabase may return a user with no identities when account already exists.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error("This email is already registered. Please sign in.");
    }
  }, []);

  const signInWithGoogle = useCallback(async (emailHint?: string) => {
    if (!supabase) {
      throw new Error("Supabase is not configured");
    }

    const normalizedEmailHint = emailHint?.trim().toLowerCase() ?? "";
    clearOAuthLastError();
    // Keep intent even when no email hint is typed; this blocks stale-session restores.
    saveOAuthEmailHint(normalizedEmailHint);

    const {
      data: { session: activeSession }
    } = await supabase.auth.getSession();
    if (activeSession) {
      const { error: clearError } = await supabase.auth.signOut({ scope: "local" });
      if (clearError) {
        throw clearError;
      }
      setSession(null);
    }

    const googleEnabled = await isGoogleProviderEnabled();
    if (!googleEnabled) {
      throw new Error("Google login is not enabled in Supabase yet. Use email/password or enable Google provider.");
    }

    const queryParams: Record<string, string> = {
      // Browser-agnostic force for account chooser + explicit consent screen.
      prompt: "select_account consent",
      access_type: "offline"
    };
    if (normalizedEmailHint.includes("@")) {
      queryParams.login_hint = normalizedEmailHint;
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        skipBrowserRedirect: true,
        queryParams
      }
    });

    if (error) {
      clearOAuthEmailHint();
      throw error;
    }

    if (!data.url) {
      throw new Error("Google sign-in URL could not be created.");
    }

    window.location.assign(data.url);
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) {
      return;
    }

    clearOAuthEmailHint();
    clearOAuthLastError();
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
    setSession(null);
  }, []);

  return {
    session,
    loading,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signOut
  };
}
