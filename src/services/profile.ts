import { requireSupabase } from "@/lib/supabase";

export interface MyProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
}

export async function getMyProfile(): Promise<MyProfile | null> {
  const sb = requireSupabase();
  const {
    data: { user },
    error: authError
  } = await sb.auth.getUser();

  if (authError) {
    throw authError;
  }

  if (!user) {
    return null;
  }

  const { data, error } = await sb
    .from("profiles")
    .select("id,full_name,phone")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as MyProfile | null) ?? null;
}

export async function saveMyProfile(input: {
  fullName: string;
  phone: string;
  country: string;
  currency: string;
}): Promise<void> {
  const sb = requireSupabase();
  const {
    data: { user },
    error: authError
  } = await sb.auth.getUser();

  if (authError) {
    throw authError;
  }

  if (!user) {
    throw new Error("Not authenticated");
  }

  const { error: profileError } = await sb
    .from("profiles")
    .upsert(
      {
        id: user.id,
        full_name: input.fullName,
        phone: input.phone
      },
      { onConflict: "id" }
    );

  if (profileError) {
    throw profileError;
  }

  const { error: userError } = await sb.auth.updateUser({
    data: {
      full_name: input.fullName,
      phone: input.phone,
      country: input.country,
      currency: input.currency
    }
  });

  if (userError) {
    throw userError;
  }
}
