import { readFileSync } from "fs";
import { requireSupabase } from "@/lib/supabase";

export async function sendAccountDeletionEmail(email: string, token: string) {
  // Call Supabase Edge Function to send the email
  const response = await fetch("/functions/sendAccountDeletionEmail", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, token })
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send account deletion email: ${error}`);
  }
}
