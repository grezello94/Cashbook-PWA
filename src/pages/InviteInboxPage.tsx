import { NeonCard } from "@/components/common/NeonCard";
import type { WorkspaceAccessRequest } from "@/types/domain";

interface InviteInboxPageProps {
  invites: WorkspaceAccessRequest[];
  respondingId: string;
  onRespond: (requestId: string, decision: "accept" | "reject") => Promise<void>;
  onGoOnboarding: () => void;
}

export function InviteInboxPage(props: InviteInboxPageProps): JSX.Element {
  const { invites, respondingId, onRespond, onGoOnboarding } = props;

  return (
    <div className="center-layout">
      <NeonCard className="max-w-xl" title="Workspace Access Requests" subtitle="Accept or reject requests from admins">
        <div className="stack">
          {invites.map((invite) => {
            const busy = respondingId === invite.id;
            const requester = invite.requested_by_name || invite.requested_by_email || "Workspace admin";
            return (
              <article key={invite.id} className="member-row">
                <div>
                  <strong>{invite.workspace_name}</strong>
                  <small>
                    {invite.workspace_industry} | {invite.workspace_currency} | {invite.workspace_timezone}
                  </small>
                  <small>Requested by: {requester}</small>
                  <small>
                    Role: {invite.role}
                    {invite.role === "editor"
                      ? ` | Delete: ${invite.can_delete_entries ? "Yes" : "No"} | Manage categories: ${invite.can_manage_categories ? "Yes" : "No"}`
                      : ""}
                  </small>
                </div>
                <div className="inline-actions">
                  <button
                    className="secondary-btn"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void onRespond(invite.id, "accept");
                    }}
                  >
                    {busy ? "Saving..." : "Accept"}
                  </button>
                  <button
                    className="ghost-btn"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void onRespond(invite.id, "reject");
                    }}
                  >
                    {busy ? "Saving..." : "Reject"}
                  </button>
                </div>
              </article>
            );
          })}

          {!invites.length && (
            <>
              <p className="muted">No pending access requests.</p>
              <button className="primary-btn" type="button" onClick={onGoOnboarding}>
                Continue to Workspace Setup
              </button>
            </>
          )}
        </div>
      </NeonCard>
    </div>
  );
}
