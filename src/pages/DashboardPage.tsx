import { NeonCard } from "@/components/common/NeonCard";
import { dateKeyInTimeZone, formatCurrency, formatDateTimeInTimeZone, todayInTimeZone } from "@/lib/format";
import type { CashDirection, Category, DeleteRequest, Entry, Workspace, WorkspaceMember } from "@/types/domain";

interface DashboardPageProps {
  workspace: Workspace;
  member: WorkspaceMember;
  categories: Category[];
  entries: Entry[];
  pendingDeleteRequests: DeleteRequest[];
  onOpenQuickAdd: (direction: CashDirection) => void;
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

  const today = todayInTimeZone(workspace.timezone);
  const todayEntries = entries.filter((entry) => dateKeyInTimeZone(entry.entry_at, workspace.timezone) === today);
  const todayIncome = todayEntries
    .filter((entry) => entry.direction === "cash_in")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const todayExpense = todayEntries
    .filter((entry) => entry.direction === "cash_out")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const todayBalance = todayEntries.reduce((sum, entry) => {
    return sum + (entry.direction === "cash_in" ? entry.amount : -entry.amount);
  }, 0);
  const balanceLabel = `${todayBalance >= 0 ? "+" : "-"}${formatCurrency(Math.abs(todayBalance), workspace.currency)}`;
  const needsExpenseControl = todayExpense > todayIncome;
  const expenseRatio = todayIncome > 0 ? todayExpense / todayIncome : todayExpense > 0 ? Number.POSITIVE_INFINITY : 0;
  const aiInsight = (() => {
    if (todayIncome === 0 && todayExpense === 0) {
      return {
        tone: "neutral" as const,
        text: "AI Coach: No movement yet today. Start by recording your first sale or expense."
      };
    }
    if (needsExpenseControl && expenseRatio >= 1.2) {
      return {
        tone: "warn" as const,
        text: "AI Coach: Expenses are significantly above sales. Pause non-essential spends and focus on top-selling items."
      };
    }
    if (needsExpenseControl) {
      return {
        tone: "warn" as const,
        text: "AI Coach: Expense is higher than income today. Reduce low-priority spending to recover margin."
      };
    }
    if (todayBalance > 0) {
      return {
        tone: "good" as const,
        text: "AI Coach: Positive day so far. Keep repeat-selling categories in focus to maintain momentum."
      };
    }
    return {
      tone: "neutral" as const,
      text: "AI Coach: Break-even trend. One or two strong sales can push you positive."
    };
  })();

  const ticker = entries.slice(0, 3);
  const canDeleteDirect = member.role === "admin" || member.can_delete_entries;

  return (
    <section className="stack-lg">
      <NeonCard title="Today" subtitle={today}>
        <p className={`hud-balance ${todayBalance >= 0 ? "positive" : "negative"}`.trim()}>
          {balanceLabel}
        </p>
        <div className="today-health">
          <span className="pill">Income: {formatCurrency(todayIncome, workspace.currency)}</span>
          <span className="pill">Expense: {formatCurrency(todayExpense, workspace.currency)}</span>
          <div className={`health-status ${aiInsight.tone}`.trim()}>
            <span className={`health-indicator ${aiInsight.tone}`.trim()} aria-hidden="true" />
            <small className={`health-note ${aiInsight.tone}`.trim()}>{aiInsight.text}</small>
          </div>
        </div>
        <div className="dashboard-primary-actions">
          <button className="fab-action fab-in" onClick={() => onOpenQuickAdd("cash_in")}>
            Cash In
          </button>
          <button className="fab-action fab-out" onClick={() => onOpenQuickAdd("cash_out")}>
            Cash Out
          </button>
        </div>
      </NeonCard>

      <NeonCard title="Live Ticker" subtitle="Latest transactions">
        <div className="ticker-wrap">
          {ticker.length === 0 && <p className="muted">No transactions yet.</p>}
          {ticker.map((entry) => (
            <div className="ticker-row" key={entry.id}>
              <span
                className={`ticker-side-chip ${
                  entry.direction === "cash_in" ? "ticker-side-chip-in" : "ticker-side-chip-out"
                }`.trim()}
              >
                {entry.direction === "cash_in" ? "IN" : "OUT"}
              </span>
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
                <small>{formatDateTimeInTimeZone(entry.entry_at, workspace.timezone)}</small>
              </div>
              <div className="entry-row-right">
                <span className={entry.direction === "cash_in" ? "amt-in" : "amt-out"}>
                  {entry.direction === "cash_in" ? "+" : "-"}
                  {formatCurrency(entry.amount, workspace.currency)}
                </span>
                <button className="text-btn" onClick={() => onDeleteEntry(entry)}>
                  {canDeleteDirect ? "Delete" : "Request Delete"}
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
