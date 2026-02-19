import { requireSupabase } from "@/lib/supabase";
import type { DeleteRequest, DeleteRequestStatus } from "@/types/domain";

export async function listPendingDeleteRequests(workspaceId: string): Promise<DeleteRequest[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("delete_requests")
    .select("id,workspace_id,entry_id,requested_by,reason,status,reviewed_by,reviewed_at,review_note,created_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as DeleteRequest[];
}

export async function requestDelete(
  workspaceId: string,
  entryId: string,
  requestedBy: string,
  reason: string
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("delete_requests").insert({
    workspace_id: workspaceId,
    entry_id: entryId,
    requested_by: requestedBy,
    reason,
    status: "pending"
  });

  if (error) {
    throw error;
  }
}

export async function reviewDeleteRequest(
  requestId: string,
  status: Exclude<DeleteRequestStatus, "pending">,
  note: string
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb
    .from("delete_requests")
    .update({
      status,
      review_note: note || null
    })
    .eq("id", requestId)
    .eq("status", "pending");

  if (error) {
    throw error;
  }
}
