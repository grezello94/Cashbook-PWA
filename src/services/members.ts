import { requireSupabase } from "@/lib/supabase";
import type {
  AppRole,
  DashboardScope,
  WorkspaceAccessRequest,
  WorkspaceAccessRequestSent,
  WorkspaceMemberDirectory
} from "@/types/domain";

interface MembersRpcRow {
  workspace_id: string;
  user_id: string;
  role: AppRole;
  can_delete_entries: boolean;
  can_manage_categories: boolean;
  can_manage_users: boolean;
  dashboard_scope: DashboardScope;
  access_disabled?: boolean;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

interface AccessRequestRpcRow {
  id: string;
  workspace_id: string;
  workspace_name: string;
  workspace_industry: string;
  workspace_currency: string;
  workspace_timezone: string;
  requested_by: string;
  requested_by_name: string | null;
  requested_by_email: string | null;
  role: AppRole;
  can_delete_entries: boolean;
  can_manage_categories: boolean;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  requested_at: string;
}

interface SentAccessRequestRpcRow {
  id: string;
  workspace_id: string;
  target_user_id: string;
  target_name: string | null;
  target_email: string | null;
  target_phone: string | null;
  requested_by: string;
  role: AppRole;
  can_delete_entries: boolean;
  can_manage_categories: boolean;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  requested_at: string;
  reviewed_at: string | null;
  note: string | null;
}

interface SentAccessRequestTableRow {
  id: string;
  workspace_id: string;
  target_user_id: string;
  requested_by: string;
  role: AppRole;
  can_delete_entries: boolean;
  can_manage_categories: boolean;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  requested_at: string;
  reviewed_at: string | null;
  note: string | null;
}

interface AuditLogRow {
  entity_id: string;
  meta: {
    contact?: unknown;
  } | null;
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

function isMissingSentRequestsRpc(error: unknown): boolean {
  const message = readErrorMessage(error).toLowerCase();
  return (
    message.includes("could not find the function public.list_workspace_access_requests_sent") ||
    message.includes("list_workspace_access_requests_sent") ||
    message.includes("schema cache")
  );
}

function isMissingCancelRequestRpc(error: unknown): boolean {
  const message = readErrorMessage(error).toLowerCase();
  return (
    message.includes("could not find the function public.cancel_workspace_access_request") ||
    message.includes("cancel_workspace_access_request") ||
    message.includes("schema cache")
  );
}

export async function listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberDirectory[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("list_workspace_members", {
    _workspace_id: workspaceId
  });

  if (error) {
    throw error;
  }

  return ((data ?? []) as MembersRpcRow[]).map((row) => ({
    workspace_id: row.workspace_id,
    user_id: row.user_id,
    role: row.role,
    can_delete_entries: row.can_delete_entries,
    can_manage_categories: row.can_manage_categories,
    can_manage_users: row.can_manage_users,
    dashboard_scope: row.dashboard_scope,
    access_disabled: Boolean(row.access_disabled),
    full_name: row.full_name,
    email: row.email,
    phone: row.phone
  }));
}

export async function grantMemberAccessByContact(
  workspaceId: string,
  contact: string,
  role: AppRole,
  allowDeleteForEditor: boolean,
  allowManageCategoriesForEditor: boolean
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("request_workspace_access_by_contact", {
    _workspace_id: workspaceId,
    _contact: contact,
    _role: role,
    _can_delete_entries: role === "admin" ? true : allowDeleteForEditor,
    _can_manage_categories: role === "admin" ? true : allowManageCategoriesForEditor
  });

  if (!error) {
    return;
  }

  const message = readErrorMessage(error).toLowerCase();
  const missingRpc =
    message.includes("could not find the function public.request_workspace_access_by_contact") ||
    message.includes("schema cache");

  if (missingRpc) {
    throw new Error(
      "Secure invite workflow is not enabled in this database yet. Run latest Supabase migrations and reload schema."
    );
  }

  throw error;
}

export async function updateWorkspaceMemberRole(
  workspaceId: string,
  userId: string,
  role: AppRole,
  allowDeleteForEditor: boolean,
  allowManageCategoriesForEditor = false
): Promise<void> {
  const sb = requireSupabase();
  const payload =
    role === "admin"
      ? {
          role: "admin" as const,
          can_delete_entries: true,
          can_manage_categories: true,
          can_manage_users: true,
          dashboard_scope: "full" as const
        }
      : {
          role: "editor" as const,
          can_delete_entries: allowDeleteForEditor,
          can_manage_categories: allowManageCategoriesForEditor,
          can_manage_users: false,
          dashboard_scope: "shift" as const
        };

  const { error } = await sb
    .from("workspace_members")
    .update(payload)
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}

export async function revokeWorkspaceMember(workspaceId: string, userId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("remove_workspace_member", {
    _workspace_id: workspaceId,
    _target_user_id: userId
  });

  if (!error) {
    return;
  }

  const message = readErrorMessage(error).toLowerCase();
  const missingRpc =
    message.includes("could not find the function public.remove_workspace_member") ||
    message.includes("schema cache");

  if (missingRpc) {
    // Backward compatibility if the new migration hasn't been applied yet.
    const { error: fallbackError } = await sb
      .from("workspace_members")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId);

    if (fallbackError) {
      throw fallbackError;
    }
    return;
  }

  throw error;
}

export async function setWorkspaceMemberAccessDisabled(
  workspaceId: string,
  userId: string,
  disabled: boolean
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("set_workspace_member_access_disabled", {
    _workspace_id: workspaceId,
    _target_user_id: userId,
    _disabled: disabled
  });

  if (!error) {
    return;
  }

  const message = readErrorMessage(error).toLowerCase();
  const missingRpc =
    message.includes("could not find the function public.set_workspace_member_access_disabled") ||
    message.includes("schema cache");

  if (missingRpc) {
    const { error: fallbackError } = await sb
      .from("workspace_members")
      .update({ access_disabled: disabled })
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId);

    if (!fallbackError) {
      return;
    }

    const fallbackMessage = readErrorMessage(fallbackError).toLowerCase();
    if (fallbackMessage.includes("access_disabled")) {
      throw new Error("Temporary disable is not enabled in your database yet. Use Revoke permanently for now.");
    }
    throw fallbackError;
  }

  throw error;
}

export async function listMyWorkspaceAccessRequests(): Promise<WorkspaceAccessRequest[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("list_my_workspace_access_requests");

  if (error) {
    throw error;
  }

  return ((data ?? []) as AccessRequestRpcRow[]).map((row) => ({
    id: row.id,
    workspace_id: row.workspace_id,
    workspace_name: row.workspace_name,
    workspace_industry: row.workspace_industry,
    workspace_currency: row.workspace_currency,
    workspace_timezone: row.workspace_timezone,
    requested_by: row.requested_by,
    requested_by_name: row.requested_by_name,
    requested_by_email: row.requested_by_email,
    role: row.role,
    can_delete_entries: row.can_delete_entries,
    can_manage_categories: row.can_manage_categories,
    status: row.status,
    requested_at: row.requested_at
  }));
}

export async function respondWorkspaceAccessRequest(requestId: string, decision: "accept" | "reject"): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("respond_workspace_access_request", {
    _request_id: requestId,
    _decision: decision
  });

  if (error) {
    throw error;
  }
}

export async function cancelWorkspaceAccessRequest(requestId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("cancel_workspace_access_request", {
    _request_id: requestId
  });

  if (!error) {
    return;
  }

  if (!isMissingCancelRequestRpc(error)) {
    throw error;
  }

  const { error: fallbackError } = await sb
    .from("workspace_access_requests")
    .update({
      status: "cancelled",
      reviewed_at: new Date().toISOString(),
      note: "Cancelled by admin"
    })
    .eq("id", requestId)
    .eq("status", "pending");

  if (!fallbackError) {
    return;
  }

  throw new Error(
    "Cancel request is not enabled in this database yet. Run the latest Supabase migrations and reload the schema cache."
  );
}

export async function listWorkspaceAccessRequestsSent(workspaceId: string): Promise<WorkspaceAccessRequestSent[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("list_workspace_access_requests_sent", {
    _workspace_id: workspaceId
  });

  if (!error) {
    return ((data ?? []) as SentAccessRequestRpcRow[]).map((row) => ({
      id: row.id,
      workspace_id: row.workspace_id,
      target_user_id: row.target_user_id,
      target_name: row.target_name,
      target_email: row.target_email,
      target_phone: row.target_phone,
      requested_by: row.requested_by,
      role: row.role,
      can_delete_entries: row.can_delete_entries,
      can_manage_categories: row.can_manage_categories,
      status: row.status,
      requested_at: row.requested_at,
      reviewed_at: row.reviewed_at,
      note: row.note
    }));
  }

  if (!isMissingSentRequestsRpc(error)) {
    throw error;
  }

  const [{ data: requestRows, error: requestError }, { data: auditRows, error: auditError }] = await Promise.all([
    sb
      .from("workspace_access_requests")
      .select(
        "id, workspace_id, target_user_id, requested_by, role, can_delete_entries, can_manage_categories, status, requested_at, reviewed_at, note"
      )
      .eq("workspace_id", workspaceId)
      .order("requested_at", { ascending: false }),
    sb
      .from("audit_logs")
      .select("entity_id, meta")
      .eq("workspace_id", workspaceId)
      .eq("action", "workspace_access_requested")
      .eq("entity_type", "workspace_access_request")
  ]);

  if (requestError) {
    throw requestError;
  }

  if (auditError) {
    throw auditError;
  }

  const contactByRequestId = new Map<string, string>();
  for (const row of (auditRows ?? []) as AuditLogRow[]) {
    const contact = typeof row.meta?.contact === "string" ? row.meta.contact.trim() : "";
    if (contact) {
      contactByRequestId.set(row.entity_id, contact);
    }
  }

  return ((requestRows ?? []) as SentAccessRequestTableRow[]).map((row) => {
    const contact = contactByRequestId.get(row.id) ?? "";
    const targetEmail = contact.includes("@") ? contact : null;
    const targetPhone = targetEmail ? null : contact || null;

    return {
      id: row.id,
      workspace_id: row.workspace_id,
      target_user_id: row.target_user_id,
      target_name: null,
      target_email: targetEmail,
      target_phone: targetPhone,
      requested_by: row.requested_by,
      role: row.role,
      can_delete_entries: row.can_delete_entries,
      can_manage_categories: row.can_manage_categories,
      status: row.status,
      requested_at: row.requested_at,
      reviewed_at: row.reviewed_at,
      note: row.note
    };
  });
}
