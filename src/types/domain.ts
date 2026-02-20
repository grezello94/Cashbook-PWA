export type AppRole = "admin" | "editor";
export type DashboardScope = "full" | "shift";
export type CategoryType = "income" | "expense";
export type CashDirection = "cash_in" | "cash_out";
export type EntryStatus = "active" | "deleted";
export type DeleteRequestStatus = "pending" | "approved" | "rejected";

export interface Workspace {
  id: string;
  name: string;
  industry: string;
  timezone: string;
  currency: string;
  created_by: string;
  created_at: string;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  role: AppRole;
  can_delete_entries: boolean;
  can_manage_categories: boolean;
  can_manage_users: boolean;
  dashboard_scope: DashboardScope;
  access_disabled: boolean;
}

export interface WorkspaceMemberDirectory extends WorkspaceMember {
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

export interface Category {
  id: string;
  workspace_id: string;
  name: string;
  type: CategoryType;
  icon: string | null;
  color: string | null;
  source: "system" | "ai_generated" | "manual";
  is_active: boolean;
}

export interface Entry {
  id: string;
  workspace_id: string;
  direction: CashDirection;
  amount: number;
  category_id: string;
  remarks: string | null;
  receipt_url: string | null;
  entry_at: string;
  created_by: string;
  status: EntryStatus;
  created_at: string;
}

export interface DeleteRequest {
  id: string;
  workspace_id: string;
  entry_id: string;
  requested_by: string;
  reason: string;
  status: DeleteRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

export interface WorkspaceContext {
  workspace: Workspace;
  member: WorkspaceMember;
}

export interface WorkspaceAccessRequest {
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

export interface CreateWorkspaceInput {
  name: string;
  industry: string;
  timezone: string;
  currency: string;
}

export interface EntryInsertInput {
  workspace_id: string;
  direction: CashDirection;
  amount: number;
  category_id: string;
  remarks?: string;
  receipt_url?: string;
  entry_at?: string;
  created_by: string;
}
