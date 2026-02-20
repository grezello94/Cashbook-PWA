import { requireSupabase } from "@/lib/supabase";

function makeToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export async function requestAccountDeletion(email: string): Promise<void> {
  const sb = requireSupabase();
  const token = makeToken();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const { error: requestError } = await sb.rpc("request_account_deletion", {
    _email: email.trim(),
    _token: token,
    _expires_at: expiresAt
  });

  if (requestError) {
    throw requestError;
  }

  const redirectUrl = new URL(window.location.href);
  redirectUrl.searchParams.set("account_delete_token", token);

  const { error: otpError } = await sb.auth.signInWithOtp({
    email: email.trim(),
    options: {
      shouldCreateUser: false,
      emailRedirectTo: redirectUrl.toString()
    }
  });

  if (otpError) {
    throw otpError;
  }
}

export async function confirmAccountDeletion(token: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("confirm_account_deletion", {
    _token: token
  });

  if (error) {
    throw error;
  }
}
