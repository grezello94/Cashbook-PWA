import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { setRememberSessionPreference, supabase, supabaseAnonKey, supabaseUrl } from "@/lib/supabase";
import { trackTelemetry } from "@/lib/telemetry";

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
  signInWithEmail: (email: string, password: string, staySignedIn?: boolean) => Promise<void>;
  signUpWithEmail: (input: SignUpInput, staySignedIn?: boolean) => Promise<void>;
  signInWithGoogle: (emailHint?: string, staySignedIn?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
}

interface AuthSettings {
  external?: Record<string, boolean>;
}

const OAUTH_EMAIL_HINT_KEY = "cashbook:oauth-google-email-hint";
const OAUTH_LAST_ERROR_KEY = "cashbook:oauth-last-error";
const AUTH_NETWORK_RETRY_ATTEMPTS = 2;
const AUTH_NETWORK_RETRY_BASE_DELAY_MS = 350;
const AUTH_NETWORK_ATTEMPT_TIMEOUT_MS = 5000;
const AUTH_RELAY_BASE = normalizeEnvValue(import.meta.env.VITE_AUTH_RELAY_BASE as string | undefined);

interface RelaySignInResponse {
  access_token: string;
  refresh_token: string;
}

function normalizeEnvValue(value: string | undefined): string {
  if (!value) {
    return "";
  }
  return value.trim().replace(/^['"]|['"]$/g, "").trim();
}

function getAuthRelaySignInEndpoint(): string {
  if (!AUTH_RELAY_BASE) {
    return "/api/auth/signin";
  }
  return `${AUTH_RELAY_BASE.replace(/\/+$/, "")}/api/auth/signin`;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Unknown error";
}

function isTransientAuthNetworkError(error: unknown): boolean {
  const message = readErrorMessage(error).toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("load failed") ||
    message.includes("timeout")
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withAttemptTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Auth request timed out")), timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function withAuthNetworkRetry<T>(flow: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= AUTH_NETWORK_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await withAttemptTimeout(fn(), AUTH_NETWORK_ATTEMPT_TIMEOUT_MS);
    } catch (error) {
      lastError = error;
      const transient = isTransientAuthNetworkError(error);
      if (!transient || attempt === AUTH_NETWORK_RETRY_ATTEMPTS) {
        if (transient) {
          trackTelemetry("auth.network.failure", {
            flow,
            attempt,
            maxAttempts: AUTH_NETWORK_RETRY_ATTEMPTS,
            message: readErrorMessage(error)
          });
        }
        throw error;
      }

      trackTelemetry("auth.network.retry", {
        flow,
        attempt,
        maxAttempts: AUTH_NETWORK_RETRY_ATTEMPTS,
        message: readErrorMessage(error)
      });
      await wait(AUTH_NETWORK_RETRY_BASE_DELAY_MS * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Auth request failed");
}

async function signInWithRelay(email: string, password: string): Promise<RelaySignInResponse> {
  const response = await withAttemptTimeout(
    fetch(getAuthRelaySignInEndpoint(), {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        email,
        password
      })
    }),
    AUTH_NETWORK_ATTEMPT_TIMEOUT_MS
  );

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Auth relay endpoint not found. Deploy API route or set VITE_AUTH_RELAY_BASE.");
    }
    const message =
      (payload && typeof payload.error === "string" && payload.error) ||
      (payload && typeof payload.message === "string" && payload.message) ||
      `Relay sign-in failed (${response.status})`;
    throw new Error(message);
  }

  const accessToken = typeof payload?.access_token === "string" ? payload.access_token : "";
  const refreshToken = typeof payload?.refresh_token === "string" ? payload.refresh_token : "";
  if (!accessToken || !refreshToken) {
    throw new Error("Relay did not return a valid auth session.");
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken
  };
}

function clearOAuthEmailHint(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(OAUTH_EMAIL_HINT_KEY);
}

function clearOAuthLastError(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(OAUTH_LAST_ERROR_KEY);
}

async function isGoogleProviderEnabled(): Promise<boolean> {
  if (!supabaseUrl || !supabaseAnonKey) {
    return false;
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
    headers: {
      apikey: supabaseAnonKey
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
    clearOAuthEmailHint();
    clearOAuthLastError();

    sb.auth
      .getSession()
      .then(({ data }) => {
        const initialSession = data.session ?? null;

        if (initialSession) {
          clearOAuthEmailHint();
          clearOAuthLastError();
        }

        setSession(initialSession);
      })
      .catch((error) => {
        trackTelemetry("auth.bootstrap.get_session_error", {
          message: readErrorMessage(error)
        });
        setSession(null);
      })
      .finally(() => {
        setLoading(false);
      });

    const { data } = sb.auth.onAuthStateChange((event, current) => {
      if (current) {
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

  const signInWithEmail = useCallback(async (email: string, password: string, staySignedIn = false) => {
    if (!supabase) {
      throw new Error("Supabase is not configured");
    }
    const sb = supabase;
    setRememberSessionPreference(staySignedIn);
    clearOAuthEmailHint();
    clearOAuthLastError();

    const emailTrimmed = email.trim();
    const emailLower = emailTrimmed.toLowerCase();

    const {
      data: { session: activeSession }
    } = await sb.auth.getSession();
    const activeEmail = (activeSession?.user.email ?? "").trim().toLowerCase();
    if (activeSession && activeEmail && activeEmail !== emailLower) {
      const { error: clearError } = await sb.auth.signOut();
      if (clearError) {
        throw clearError;
      }
      setSession(null);
    }

    let signedEmail = "";
    let sessionToSet: Session | null = null;

    try {
      const { data } = await withAuthNetworkRetry("email_sign_in", async () => {
        const result = await sb.auth.signInWithPassword({
          email: emailTrimmed,
          password
        });
        if (result.error) {
          throw result.error;
        }
        return result;
      });

      signedEmail = (data.user?.email ?? "").trim().toLowerCase();
      sessionToSet = data.session ?? null;
    } catch (error) {
      if (!isTransientAuthNetworkError(error)) {
        throw error;
      }

      trackTelemetry("auth.network.relay_attempt", {
        flow: "email_sign_in"
      });

      const relaySession = await signInWithRelay(emailTrimmed, password);
      const { data: setData, error: setError } = await sb.auth.setSession({
        access_token: relaySession.access_token,
        refresh_token: relaySession.refresh_token
      });
      if (setError) {
        throw setError;
      }

      signedEmail = (setData.session?.user.email ?? "").trim().toLowerCase();
      sessionToSet = setData.session ?? null;
      trackTelemetry("auth.network.relay_success", {
        flow: "email_sign_in"
      });
    }

    if (signedEmail && signedEmail !== emailLower) {
      throw new Error(`Signed in as ${signedEmail}. Please sign out and try again.`);
    }

    setSession(sessionToSet);
  }, []);

  const signUpWithEmail = useCallback(async (input: SignUpInput, staySignedIn = false) => {
    if (!supabase) {
      throw new Error("Supabase is not configured");
    }
    const sb = supabase;
    setRememberSessionPreference(staySignedIn);
    clearOAuthEmailHint();
    clearOAuthLastError();

    const {
      data: { session: activeSession }
    } = await sb.auth.getSession();
    const activeEmail = (activeSession?.user.email ?? "").trim().toLowerCase();
    const nextEmail = input.email.trim().toLowerCase();
    if (activeSession && activeEmail && activeEmail !== nextEmail) {
      const { error: clearError } = await sb.auth.signOut();
      if (clearError) {
        throw clearError;
      }
      setSession(null);
    }

    const { data } = await withAuthNetworkRetry("email_sign_up", async () => {
      const result = await sb.auth.signUp({
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
      if (result.error) {
        throw result.error;
      }
      return result;
    });

    // Supabase may return a user with no identities when account already exists.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error("This email is already registered. Please sign in.");
    }
  }, []);

  const signInWithGoogle = useCallback(async (emailHint?: string, staySignedIn = false) => {
    if (!supabase) {
      throw new Error("Supabase is not configured");
    }
    const sb = supabase;
    setRememberSessionPreference(staySignedIn);

    const normalizedEmailHint = emailHint?.trim().toLowerCase() ?? "";
    clearOAuthLastError();
    clearOAuthEmailHint();

    const {
      data: { session: activeSession }
    } = await sb.auth.getSession();
    if (activeSession) {
      const { error: clearError } = await sb.auth.signOut({ scope: "local" });
      if (clearError) {
        throw clearError;
      }
      setSession(null);
    }

    const googleEnabled = await withAuthNetworkRetry("google_provider_check", isGoogleProviderEnabled);
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

    let redirectUrl = "";
    try {
      const response = await withAuthNetworkRetry("google_oauth_start", async () => {
        const result = await sb.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: window.location.origin,
            skipBrowserRedirect: true,
            queryParams
          }
        });
        if (result.error) {
          throw result.error;
        }
        return result;
      });
      redirectUrl = response.data?.url ?? "";
    } catch (error) {
      clearOAuthEmailHint();
      throw error;
    }

    if (!redirectUrl) {
      throw new Error("Google sign-in URL could not be created.");
    }

    window.location.assign(redirectUrl);
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
