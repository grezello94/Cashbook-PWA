import { NeonCard } from "@/components/common/NeonCard";
import { formatCurrency } from "@/lib/format";
import type { Category, DeleteRequest, Entry, Workspace, WorkspaceMember } from "@/types/domain";

interface DashboardPageProps {
  workspace: Workspace;
  member: WorkspaceMember;
  categories: Category[];
  entries: Entry[];
  pendingDeleteRequests: DeleteRequest[];
  onOpenQuickAdd: () => void;
  onDeleteEntry: (entry: Entry) => Promise<void>;
  onReviewDeleteRequest: (id: string, approved: boolean) => Promise<void>;
}

export function DashboardPage(props: DashboardPageProps): JSX.Element {
  const {
    workspace,
    member,
    categories,
    entries,
    pendingDeleteRequests,
    onOpenQuickAdd,
    onDeleteEntry,
    onReviewDeleteRequest
  } = props;

  const categoryMap = new Map(categories.map((category) => [category.id, category.name]));

  const today = new Date().toISOString().slice(0, 10);
  const todayEntries = entries.filter((entry) => entry.entry_at.slice(0, 10) === today);
  const todayBalance = todayEntries.reduce((sum, entry) => {
    return sum + (entry.direction === "cash_in" ? entry.amount : -entry.amount);
  }, 0);

  const ticker = entries.slice(0, 3);

  return (
    <section className="stack-lg">
      <NeonCard title="Today" subtitle={today}>
        <p className={`hud-balance ${todayBalance >= 0 ? "positive" : "negative"}`.trim()}>
          {formatCurrency(todayBalance, workspace.currency)}
        </p>
        <button className="secondary-btn" onClick={onOpenQuickAdd}>
          Quick Add
        </button>
      </NeonCard>

      <NeonCard title="Live Ticker" subtitle="Latest transactions">
        <div className="ticker-wrap">
          {ticker.length === 0 && <p className="muted">No transactions yet.</p>}
          {ticker.map((entry) => (
            <div className="ticker-row" key={entry.id}>
              <span>{entry.direction === "cash_in" ? "IN" : "OUT"}</span>
              <span>{categoryMap.get(entry.category_id) ?? "Unknown"}</span>
              <strong>{formatCurrency(entry.amount, workspace.currency)}</strong>
            </div>
          ))}
        </div>
      </NeonCard>

      <NeonCard title="Recent Entries" subtitle="Swipe flow output">
        <div className="stack">
          {entries.slice(0, 15).map((entry) => (
            <article className="entry-row" key={entry.id}>
              <div>
                <strong>{categoryMap.get(entry.category_id) ?? "Unknown"}</strong>
                <small>{new Date(entry.entry_at).toLocaleString()}</small>
              </div>
              <div className="entry-row-right">
                <span className={entry.direction === "cash_in" ? "amt-in" : "amt-out"}>
                  {entry.direction === "cash_in" ? "+" : "-"}
                  {formatCurrency(entry.amount, workspace.currency)}
                </span>
                <button className="text-btn" onClick={() => onDeleteEntry(entry)}>
                  Delete
                </button>
              </div>
            </article>
          ))}
          {!entries.length && <p className="muted">No entries yet.</p>}
        </div>
      </NeonCard>

      {(member.role === "admin" || member.can_delete_entries) && (
        <NeonCard title="Delete Requests" subtitle="Approval queue">
          <div className="stack">
            {pendingDeleteRequests.map((request) => (
              <article className="entry-row" key={request.id}>
                <div>
                  <strong>Entry #{request.entry_id.slice(0, 8)}</strong>
                  <small>{request.reason}</small>
                </div>
                <div className="inline-actions">
                  <button className="approve-btn" onClick={() => onReviewDeleteRequest(request.id, true)}>
                    Approve
                  </button>
                  <button className="reject-btn" onClick={() => onReviewDeleteRequest(request.id, false)}>
                    Reject
                  </button>
                </div>
              </article>
            ))}
            {!pendingDeleteRequests.length && <p className="muted">No pending requests.</p>}
          </div>
        </NeonCard>
      )}
    </section>
  );
}
