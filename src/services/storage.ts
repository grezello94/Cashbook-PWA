import { requireSupabase } from "@/lib/supabase";

function sanitize(fileName: string): string {
  return fileName.toLowerCase().replace(/[^a-z0-9.\-_]/g, "-");
}

export async function uploadReceipt(workspaceId: string, userId: string, file: File): Promise<string> {
  const sb = requireSupabase();
  const path = `${workspaceId}/${userId}/${Date.now()}-${sanitize(file.name)}`;

  const { error } = await sb.storage.from("receipts").upload(path, file, {
    cacheControl: "3600",
    upsert: false
  });

  if (error) {
    throw error;
  }

  const { data } = sb.storage.from("receipts").getPublicUrl(path);
  return data.publicUrl;
}
