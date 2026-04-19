import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { InviteInboxPage } from "./InviteInboxPage";

describe("InviteInboxPage", () => {
  afterEach(cleanup);

  const defaultProps = {
    mode: "decide" as const,
    workspaceLabel: "Test Workspace",
    invites: [],
    respondingId: "",
    onRespond: vi.fn(),
    onJoinWorkspace: vi.fn(),
    onBackToDecide: vi.fn(),
    onCreateWorkspace: vi.fn(),
  };

  it("renders decide mode correctly", () => {
    render(<InviteInboxPage {...defaultProps} />);
    expect(screen.getByText("Join or Create Workspace")).toBeTruthy();
    expect(screen.getByText("Create Your Own Workspace")).toBeTruthy();
  });

  it("handles join workspace click and displays feedback", async () => {
    const mockOnJoin = vi.fn().mockResolvedValue(2);
    render(<InviteInboxPage {...defaultProps} onJoinWorkspace={mockOnJoin} />);
    
    const joinBtn = screen.getByText("Join Workspace");
    fireEvent.click(joinBtn);
    
    expect(screen.getByText("Checking...")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText("Found 2 pending join requests.")).toBeTruthy();
    });
  });

  it("calls onCreateWorkspace when create button is clicked", () => {
    const mockOnCreate = vi.fn();
    render(<InviteInboxPage {...defaultProps} onCreateWorkspace={mockOnCreate} />);
    
    fireEvent.click(screen.getByText("Create Your Own Workspace"));
    expect(mockOnCreate).toHaveBeenCalledTimes(1);
  });
});