import { requireSupabase } from "@/lib/supabase";

function makeToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "";
}

function isMissingBackendDeletionFlow(error: unknown): boolean {
  const message = readErrorMessage(error).toLowerCase();
  return (
    message.includes("could not find the function public.request_account_deletion") ||
    message.includes("could not find the function public.confirm_account_deletion") ||
    message.includes("account_deletion_requests") ||
    message.includes("schema cache")
  );
}

async function setDeletionMetadata(token: string, expiresAt: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.auth.updateUser({
    data: {
      account_delete_token: token,
      account_delete_expires_at: expiresAt,
      account_delete_requested_at: new Date().toISOString()
    }
  });

  if (error) {
    throw error;
  }
}

async function confirmDeletionViaMetadata(token: string): Promise<void> {
  const sb = requireSupabase();
  const {
    data: { user },
    error: userError
  } = await sb.auth.getUser();

  if (userError) {
    throw userError;
  }
  if (!user) {
    throw new Error("Authentication required");
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const pendingToken = typeof meta.account_delete_token === "string" ? meta.account_delete_token : "";
  const expiresAtRaw = typeof meta.account_delete_expires_at === "string" ? meta.account_delete_expires_at : "";
  const expiresAtMs = Date.parse(expiresAtRaw);

  if (!pendingToken || pendingToken !== token) {
    throw new Error("Invalid deletion link for this account.");
  }
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) {
    throw new Error("Deletion link has expired. Please request a new one.");
  }

  // Best effort: if deleted_at exists in profiles, keep DB state aligned too.
  await sb
    .from("profiles")
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", user.id);

  const { error: updateUserError } = await sb.auth.updateUser({
    data: {
      account_deleted_at: new Date().toISOString(),
      account_delete_token: null,
      account_delete_expires_at: null,
      account_delete_requested_at: null
    }
  });

  if (updateUserError) {
    throw updateUserError;
  }
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
    if (isMissingBackendDeletionFlow(requestError)) {
      await setDeletionMetadata(token, expiresAt);
    } else {
      throw requestError;
    }
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

  if (!error) {
    const { error: markDeletedError } = await sb.auth.updateUser({
      data: {
        account_deleted_at: new Date().toISOString()
      }
    });
    if (markDeletedError) {
      throw markDeletedError;
    }
    return;
  }

  if (error) {
    const fallbackAllowed =
      isMissingBackendDeletionFlow(error) || readErrorMessage(error).toLowerCase().includes("invalid or expired");

    if (fallbackAllowed) {
      await confirmDeletionViaMetadata(token);
      return;
    }
    throw error;
  }
}
