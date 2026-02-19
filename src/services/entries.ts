import { requireSupabase } from "@/lib/supabase";
import type { Entry, EntryInsertInput } from "@/types/domain";

export async function listEntries(workspaceId: string, limit = 80): Promise<Entry[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("entries")
    .select("id,workspace_id,direction,amount,category_id,remarks,receipt_url,entry_at,created_by,status,created_at")
    .eq("workspace_id", workspaceId)
    .order("entry_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return ((data ?? []) as Entry[]).filter((item) => item.status === "active");
}

export async function countActiveEntries(workspaceId: string): Promise<number> {
  const sb = requireSupabase();
  const { count, error } = await sb
    .from("entries")
    .select("id", { head: true, count: "exact" })
    .eq("workspace_id", workspaceId)
    .eq("status", "active");

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function addEntry(input: EntryInsertInput): Promise<Entry> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("entries")
    .insert({
      workspace_id: input.workspace_id,
      direction: input.direction,
      amount: input.amount,
      category_id: input.category_id,
      remarks: input.remarks ?? null,
      receipt_url: input.receipt_url ?? null,
      created_by: input.created_by,
      entry_at: input.entry_at ?? new Date().toISOString()
    })
    .select("id,workspace_id,direction,amount,category_id,remarks,receipt_url,entry_at,created_by,status,created_at")
    .single();

  if (error) {
    throw error;
  }

  return data as Entry;
}

export async function deleteEntryDirect(workspaceId: string, entryId: string, userId: string): Promise<void> {
  const sb = requireSupabase();
  const { data: canDelete, error: canDeleteError } = await sb.rpc("can_delete_entries", {
    _workspace_id: workspaceId
  });

  if (canDeleteError) {
    throw canDeleteError;
  }

  if (!canDelete) {
    throw new Error("You do not have permission to delete entries directly.");
  }

  const { error } = await sb
    .from("entries")
    .update({
      status: "deleted",
      deleted_by: userId,
      deleted_at: new Date().toISOString()
    })
    .eq("workspace_id", workspaceId)
    .eq("id", entryId)
    .eq("status", "active");

  if (error) {
    throw error;
  }
}
