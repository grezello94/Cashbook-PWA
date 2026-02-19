import { requireSupabase } from "@/lib/supabase";
import type { CreateWorkspaceInput, WorkspaceContext } from "@/types/domain";

interface WorkspaceRow {
  id: string;
  name: string;
  industry: string;
  timezone: string;
  currency: string;
  created_by: string;
  created_at: string;
}

interface WorkspaceMemberRow {
  workspace_id: string;
  user_id: string;
  role: "admin" | "editor";
  can_delete_entries: boolean;
  can_manage_categories: boolean;
  can_manage_users: boolean;
  dashboard_scope: "full" | "shift";
  workspaces: WorkspaceRow | null;
}

export async function createWorkspaceWithOwner(input: CreateWorkspaceInput): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("create_workspace_with_owner", {
    _name: input.name,
    _industry: input.industry,
    _timezone: input.timezone,
    _currency: input.currency
  });

  if (error) {
    throw error;
  }

  return data as string;
}

export async function listUserWorkspaces(userId: string): Promise<WorkspaceContext[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("workspace_members")
    .select(
      "workspace_id,user_id,role,can_delete_entries,can_manage_categories,can_manage_users,dashboard_scope,workspaces!inner(id,name,industry,timezone,currency,created_by,created_at)"
    )
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as unknown as WorkspaceMemberRow[];
  return rows
    .filter((row) => row.workspaces)
    .map((row) => ({
      workspace: row.workspaces!,
      member: {
        workspace_id: row.workspace_id,
        user_id: row.user_id,
        role: row.role,
        can_delete_entries: row.can_delete_entries,
        can_manage_categories: row.can_manage_categories,
        can_manage_users: row.can_manage_users,
        dashboard_scope: row.dashboard_scope
      }
    }));
}

export async function getWorkspaceContext(workspaceId: string, userId: string): Promise<WorkspaceContext> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("workspace_members")
    .select(
      "workspace_id,user_id,role,can_delete_entries,can_manage_categories,can_manage_users,dashboard_scope,workspaces!inner(id,name,industry,timezone,currency,created_by,created_at)"
    )
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();

  if (error) {
    throw error;
  }

  const row = data as unknown as WorkspaceMemberRow;
  if (!row.workspaces) {
    throw new Error("Workspace not found");
  }

  return {
    workspace: row.workspaces,
    member: {
      workspace_id: row.workspace_id,
      user_id: row.user_id,
      role: row.role,
      can_delete_entries: row.can_delete_entries,
      can_manage_categories: row.can_manage_categories,
      can_manage_users: row.can_manage_users,
      dashboard_scope: row.dashboard_scope
    }
  };
}

export async function updateWorkspaceTimezone(workspaceId: string, timezone: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("workspaces").update({ timezone }).eq("id", workspaceId);

  if (error) {
    throw error;
  }
}
