import { useEffect, useState } from "react";
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

export function useAuthSession(): AuthHook {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

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
      setSession(current);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    if (!supabase) {
      throw new Error("Supabase is not configured");
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error) {
      throw error;
    }
  };

  const signUpWithEmail = async (input: SignUpInput) => {
    if (!supabase) {
      throw new Error("Supabase is not configured");
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
  };

  const signInWithGoogle = async () => {
    if (!supabase) {
      throw new Error("Supabase is not configured");
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        skipBrowserRedirect: true
      }
    });

    if (error) {
      throw error;
    }

    if (!data.url) {
      throw new Error("Google sign-in URL could not be created.");
    }

    window.location.assign(data.url);
  };

  const signOut = async () => {
    if (!supabase) {
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
  };

  return {
    session,
    loading,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signOut
  };
}
