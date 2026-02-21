import { useState } from "react";
import { NeonCard } from "@/components/common/NeonCard";
import type { WorkspaceAccessRequest } from "@/types/domain";

interface InviteInboxPageProps {
  mode: "decide" | "join";
  invites: WorkspaceAccessRequest[];
  respondingId: string;
  onRespond: (requestId: string, decision: "accept" | "reject") => Promise<void>;
  onJoinWorkspace: () => Promise<number>;
  onBackToDecide: () => void;
  onCreateWorkspace: () => void;
}

export function InviteInboxPage(props: InviteInboxPageProps): JSX.Element {
  const { mode, invites, respondingId, onRespond, onJoinWorkspace, onBackToDecide, onCreateWorkspace } = props;
  const [checkingJoin, setCheckingJoin] = useState(false);
  const [joinFeedback, setJoinFeedback] = useState("");

  return (
    <div className="center-layout">
      <NeonCard
        className="max-w-xl"
        title={mode === "join" ? "Join Workspace" : "Join or Create Workspace"}
        subtitle={
          mode === "join"
            ? "You can only access a workspace after accepting an admin request"
            : "Choose how you want to continue"
        }
      >
        <div className="stack">
          {mode === "decide" && (
            <>
              <p className="muted">
                Join a workspace only through admin request approval. Until accepted, you cannot access workspace data or add
                entries.
              </p>
              <div className="inline-actions">
                <button
                  className="secondary-btn"
                  type="button"
                  disabled={checkingJoin}
                  onClick={() => {
                    void (async () => {
                      setCheckingJoin(true);
                      setJoinFeedback("");
                      try {
                        const pendingCount = await onJoinWorkspace();
                        setJoinFeedback(
                          pendingCount > 0
                            ? `Found ${pendingCount} pending join request${pendingCount === 1 ? "" : "s"}.`
                            : "No pending join request yet. Ask your admin to send one."
                        );
                      } catch {
                        setJoinFeedback("Could not check join requests right now. Please try again.");
                      } finally {
                        setCheckingJoin(false);
                      }
                    })();
                  }}
                >
                  {checkingJoin ? "Checking..." : "Join Workspace"}
                </button>
                <button className="primary-btn" type="button" onClick={onCreateWorkspace}>
                  Create Your Own Workspace
                </button>
              </div>
              {!!joinFeedback && <p className="muted">{joinFeedback}</p>}
            </>
          )}

          {mode === "join" && (
            <>
              <p className="muted">
                Waiting for an admin request. You can only review and accept a request if it was sent to your account.
              </p>
              <div className="inline-actions">
                <button
                  className="secondary-btn"
                  type="button"
                  disabled={checkingJoin}
                  onClick={() => {
                    void (async () => {
                      setCheckingJoin(true);
                      setJoinFeedback("");
                      try {
                        const pendingCount = await onJoinWorkspace();
                        setJoinFeedback(
                          pendingCount > 0
                            ? `Found ${pendingCount} pending join request${pendingCount === 1 ? "" : "s"} below.`
                            : "No pending join request yet. Ask your admin to send one."
                        );
                      } catch {
                        setJoinFeedback("Could not refresh requests right now. Please try again.");
                      } finally {
                        setCheckingJoin(false);
                      }
                    })();
                  }}
                >
                  {checkingJoin ? "Refreshing..." : "Refresh Requests"}
                </button>
                <button className="ghost-btn" type="button" onClick={onBackToDecide}>
                  Back
                </button>
              </div>
              {!!joinFeedback && <p className="muted">{joinFeedback}</p>}

              {!!invites.length && <p className="muted">Pending request links</p>}
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
                        {busy ? "Saving..." : "Accept Request"}
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

              {!invites.length && <p className="muted">No pending join request yet.</p>}
            </>
          )}
        </div>
      </NeonCard>
    </div>
  );
}
