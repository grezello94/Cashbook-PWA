import { requireSupabase } from "@/lib/supabase";
import type { AppRole, DashboardScope, WorkspaceAccessRequest, WorkspaceMemberDirectory } from "@/types/domain";

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

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "";
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
): Promise<"requested" | "granted_legacy"> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("request_workspace_access_by_contact", {
    _workspace_id: workspaceId,
    _contact: contact,
    _role: role,
    _can_delete_entries: role === "admin" ? true : allowDeleteForEditor,
    _can_manage_categories: role === "admin" ? true : allowManageCategoriesForEditor
  });

  if (!error) {
    return "requested";
  }

  const message = readErrorMessage(error).toLowerCase();
  const missingRpc =
    message.includes("could not find the function public.request_workspace_access_by_contact") ||
    message.includes("schema cache");

  if (missingRpc) {
    const { data: fallbackTargetUserId, error: fallbackError } = await sb.rpc("add_workspace_member_by_contact", {
      _workspace_id: workspaceId,
      _contact: contact,
      _role: role,
      _can_delete_entries: role === "admin" ? true : allowDeleteForEditor
    });

    if (fallbackError) {
      throw fallbackError;
    }

    if (role === "editor") {
      const { error: adjustError } = await sb
        .from("workspace_members")
        .update({
          can_delete_entries: allowDeleteForEditor,
          can_manage_categories: allowManageCategoriesForEditor,
          can_manage_users: false,
          dashboard_scope: "shift"
        })
        .eq("workspace_id", workspaceId)
        .eq("user_id", fallbackTargetUserId as string);

      if (adjustError) {
        throw adjustError;
      }
    }

    return "granted_legacy";
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
