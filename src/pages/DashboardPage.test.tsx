import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DashboardPage } from "./DashboardPage";
import type { Workspace, WorkspaceMember, Entry } from "@/types/domain";

const mockWorkspace: Workspace = { 
  id: "ws-1", 
  name: "Test Workspace", 
  industry: "Retail", 
  currency: "USD", 
  timezone: "UTC", 
  created_by: "user-1", 
  created_at: new Date().toISOString() 
};

const mockMember: WorkspaceMember = { 
  workspace_id: "ws-1", 
  user_id: "user-1", 
  role: "admin", 
  can_delete_entries: true, 
  can_manage_categories: true, 
  can_manage_users: true, 
  dashboard_scope: "full",
  access_disabled: false
};

// Helper to quickly generate entries for "today" to trigger the AI Coach logic
const createEntry = (amount: number, direction: "cash_in" | "cash_out"): Entry => ({
  id: Math.random().toString(),
  workspace_id: "ws-1",
  amount,
  direction,
  category_id: "cat-1",
  remarks: "",
  created_by: "user-1",
  entry_at: new Date().toISOString(), // Matches "today" in tests
  status: "active",
  created_at: new Date().toISOString(),
  receipt_url: null
});

describe("DashboardPage AI Coach Logic", () => {
  afterEach(cleanup);

  const defaultProps = {
    workspace: mockWorkspace,
    member: mockMember,
    categories: [],
    pendingDeleteRequests: [],
    onOpenQuickAdd: vi.fn(),
    onDeleteEntry: vi.fn(),
    onReviewDeleteRequest: vi.fn(),
  };

  it("shows a neutral tone when there are no entries today", () => {
    render(<DashboardPage {...defaultProps} entries={[]} />);
    expect(screen.getByText(/No movement yet today/i)).toBeTruthy();
  });

  it("shows a good tone when balance is positive", () => {
    const entries = [createEntry(100, "cash_in")];
    render(<DashboardPage {...defaultProps} entries={entries} />);
    expect(screen.getByText(/Positive day so far/i)).toBeTruthy();
  });

  it("shows a severe warning when expenses are significantly higher than income (ratio >= 1.2)", () => {
    const entries = [createEntry(100, "cash_in"), createEntry(150, "cash_out")];
    render(<DashboardPage {...defaultProps} entries={entries} />);
    expect(screen.getByText(/Expenses are significantly above sales/i)).toBeTruthy();
  });

  it("shows a mild warning when expenses are slightly higher than income (ratio < 1.2)", () => {
    const entries = [createEntry(100, "cash_in"), createEntry(110, "cash_out")];
    render(<DashboardPage {...defaultProps} entries={entries} />);
    expect(screen.getByText(/Expense is higher than income today/i)).toBeTruthy();
  });

  it("shows a neutral tone when breaking even", () => {
    const entries = [createEntry(100, "cash_in"), createEntry(100, "cash_out")];
    render(<DashboardPage {...defaultProps} entries={entries} />);
    expect(screen.getByText(/Break-even trend/i)).toBeTruthy();
  });
});