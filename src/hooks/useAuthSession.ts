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
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

interface AuthSettings {
  external?: Record<string, boolean>;
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

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((event, current) => {
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

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) {
      throw new Error("Supabase is not configured");
    }

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

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        skipBrowserRedirect: true,
        queryParams: {
          prompt: "select_account",
          access_type: "offline"
        }
      }
    });

    if (error) {
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
