import { requireSupabase } from "@/lib/supabase";
import type { AppRole, DashboardScope, WorkspaceMemberDirectory } from "@/types/domain";

interface MembersRpcRow {
  workspace_id: string;
  user_id: string;
  role: AppRole;
  can_delete_entries: boolean;
  can_manage_categories: boolean;
  can_manage_users: boolean;
  dashboard_scope: DashboardScope;
  full_name: string | null;
  email: string | null;
  phone: string | null;
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
    full_name: row.full_name,
    email: row.email,
    phone: row.phone
  }));
}

export async function grantMemberAccessByContact(
  workspaceId: string,
  contact: string,
  role: AppRole,
  allowDeleteForEditor: boolean
): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("add_workspace_member_by_contact", {
    _workspace_id: workspaceId,
    _contact: contact,
    _role: role,
    _can_delete_entries: role === "admin" ? true : allowDeleteForEditor
  });

  if (error) {
    throw error;
  }

  return data as string;
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
  const { error } = await sb
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}
