import { useMemo, useState } from "react";
import { NeonCard } from "@/components/common/NeonCard";
import { dateKeyInTimeZone, formatCurrency, formatDateTimeInTimeZone } from "@/lib/format";
import type { Category, Entry, WorkspaceMember } from "@/types/domain";

type DatePreset =
  | "today_so_far"
  | "yesterday"
  | "this_week_so_far"
  | "last_week"
  | "this_month_so_far"
  | "this_month"
  | "last_month"
  | "custom";

interface HistoryPageProps {
  workspaceName: string;
  currency: string;
  timezone: string;
  member: WorkspaceMember;
  categories: Category[];
  entries: Entry[];
  onAddCategory: (name: string, type: "income" | "expense") => Promise<void>;
  onDropCategory: (categoryId: string) => Promise<void>;
}

export function HistoryPage({
  workspaceName,
  currency,
  timezone,
  member,
  categories,
  entries,
  onAddCategory,
  onDropCategory
}: HistoryPageProps): JSX.Element {
  const presetOptions: Array<{ value: DatePreset; label: string }> = [
    { value: "today_so_far", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "this_week_so_far", label: "This Week" },
    { value: "last_week", label: "Last Week" },
    { value: "this_month_so_far", label: "This Month So Far" },
    { value: "this_month", label: "This Month" },
    { value: "last_month", label: "Last Month" },
    { value: "custom", label: "Custom" }
  ];

  const [categoryId, setCategoryId] = useState<string>("");
  const [datePreset, setDatePreset] = useState<DatePreset>("this_month");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryType, setNewCategoryType] = useState<"income" | "expense">("expense");
  const [savingCategory, setSavingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState("");
  const [droppingId, setDroppingId] = useState("");
  const [confirmDropId, setConfirmDropId] = useState("");
  const [showCategoryList, setShowCategoryList] = useState(false);

  const canManageCategories = member.role === "admin" || member.can_manage_categories;

  const dateRange = useMemo(() => {
    const now = new Date();
    const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
    const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
    const startOfWeek = (date: Date) => {
      const day = date.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const d = new Date(date);
      d.setDate(date.getDate() + diff);
      return startOfDay(d);
    };
    const endOfWeek = (date: Date) => {
      const start = startOfWeek(date);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return endOfDay(end);
    };
    const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
    const endOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

    if (datePreset === "today_so_far") {
      return { from: startOfDay(now), to: now, label: "Today so far" };
    }
    if (datePreset === "yesterday") {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y), label: "Yesterday" };
    }
    if (datePreset === "this_week_so_far") {
      return { from: startOfWeek(now), to: now, label: "This week so far" };
    }
    if (datePreset === "last_week") {
      const w = new Date(now);
      w.setDate(w.getDate() - 7);
      return { from: startOfWeek(w), to: endOfWeek(w), label: "Last week" };
    }
    if (datePreset === "this_month") {
      return { from: startOfMonth(now), to: endOfMonth(now), label: "This month" };
    }
    if (datePreset === "last_month") {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
      return { from: startOfMonth(prev), to: endOfMonth(prev), label: "Last month" };
    }
    if (datePreset === "custom") {
      const from = customFrom ? startOfDay(new Date(customFrom)) : null;
      const to = customTo ? endOfDay(new Date(customTo)) : null;
      return {
        from,
        to,
        label: from && to ? "Custom range" : "Custom range (set start and end date)"
      };
    }
    return { from: startOfMonth(now), to: now, label: "This month so far" };
  }, [datePreset, customFrom, customTo]);

  const filtered = useMemo(() => {
    const fromTs = dateRange.from ? dateRange.from.getTime() : null;
    const toTs = dateRange.to ? dateRange.to.getTime() : null;

    return entries.filter((entry) => {
      const entryTs = new Date(entry.entry_at).getTime();
      const inTimeRange = (fromTs === null || entryTs >= fromTs) && (toTs === null || entryTs <= toTs);
      const inCategory = !categoryId || entry.category_id === categoryId;
      return inTimeRange && inCategory;
    });
  }, [entries, categoryId, dateRange.from, dateRange.to]);

  const categoryMap = new Map(categories.map((item) => [item.id, item.name]));
  const activeCategoryName = categoryId ? categoryMap.get(categoryId) ?? "Unknown" : "All categories";
  const fromLabel = dateRange.from ? dateRange.from.toLocaleDateString() : "Start";
  const toLabel = dateRange.to ? dateRange.to.toLocaleDateString() : "End";
  const exportDisabled = (datePreset === "custom" && (!dateRange.from || !dateRange.to)) || filtered.length === 0;
  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, item) => {
        if (item.direction === "cash_in") {
          acc.cashIn += item.amount;
        } else {
          acc.cashOut += item.amount;
        }
        return acc;
      },
      { cashIn: 0, cashOut: 0 }
    );
  }, [filtered]);
  const net = totals.cashIn - totals.cashOut;

  const safe = (value: string): string =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  const buildReportHtml = (): string => {
    const rows = filtered
      .map((entry) => {
        const amount =
          entry.direction === "cash_in"
            ? `+${formatCurrency(entry.amount, currency)}`
            : `-${formatCurrency(entry.amount, currency)}`;
        return `<tr>
          <td>${safe(new Date(entry.entry_at).toLocaleString())}</td>
          <td>${safe(categoryMap.get(entry.category_id) ?? "Unknown")}</td>
          <td>${entry.direction === "cash_in" ? "Cash In" : "Cash Out"}</td>
          <td style="text-align:right; color:${entry.direction === "cash_in" ? "#0f766e" : "#b91c1c"}; font-weight:700;">${safe(amount)}</td>
          <td>${safe(entry.remarks ?? "-")}</td>
        </tr>`;
      })
      .join("");

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Cashbook Statement</title>
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; margin: 24px; color: #0f172a; }
    .sheet { border: 1px solid #bfdbfe; border-radius: 14px; overflow: hidden; }
    .head { padding: 18px; background: linear-gradient(135deg, #1d4ed8, #2563eb); color: #fff; }
    .sub { display:flex; flex-wrap:wrap; gap:12px; margin-top:8px; font-size:13px; opacity:0.95; }
    .meta { display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap:10px; padding:12px 16px; background:#eff6ff; border-bottom:1px solid #bfdbfe; }
    .meta-item { background:#fff; border:1px solid #bfdbfe; border-radius:10px; padding:8px 10px; }
    table { width:100%; border-collapse: collapse; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #dbeafe; font-size: 13px; vertical-align: top; }
    th { background: #eff6ff; color: #1e3a8a; text-align: left; }
    .foot { display:flex; justify-content:flex-end; gap:12px; padding:12px 16px; background:#f8fbff; }
    .pill { border:1px solid #bfdbfe; background:#fff; border-radius:999px; padding:6px 10px; font-size:12px; }
    .empty { padding: 16px; color: #475569; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <h2 style="margin:0;">Cashbook Balance Statement</h2>
      <div class="sub">
        <span><strong>Workspace:</strong> ${safe(workspaceName)}</span>
        <span><strong>Generated:</strong> ${safe(new Date().toLocaleString())}</span>
      </div>
    </div>
    <div class="meta">
      <div class="meta-item"><strong>Period</strong><br/>${safe(fromLabel)} - ${safe(toLabel)}</div>
      <div class="meta-item"><strong>Category</strong><br/>${safe(activeCategoryName)}</div>
      <div class="meta-item"><strong>Total Entries</strong><br/>${filtered.length}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Date & Time</th>
          <th>Category</th>
          <th>Type</th>
          <th style="text-align:right;">Amount</th>
          <th>Remarks</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td class="empty" colspan="5">No entries for selected filters.</td></tr>`}
      </tbody>
    </table>
    <div class="foot">
      <span class="pill">Cash In: ${safe(formatCurrency(totals.cashIn, currency))}</span>
      <span class="pill">Cash Out: ${safe(formatCurrency(totals.cashOut, currency))}</span>
      <span class="pill"><strong>Net: ${safe(formatCurrency(net, currency))}</strong></span>
    </div>
  </div>
</body>
</html>`;
  };

  const downloadExcel = () => {
    if (exportDisabled) {
      return;
    }
    const html = buildReportHtml();
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cashbook-statement-${new Date().toISOString().slice(0, 10)}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    if (exportDisabled) {
      return;
    }
    const win = window.open("", "_blank", "width=1100,height=900");
    if (!win) {
      return;
    }
    win.document.open();
    win.document.write(buildReportHtml());
    win.document.close();
    win.focus();
    win.print();
  };

  const createCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      setCategoryError("Category name is required.");
      return;
    }

    setSavingCategory(true);
    setCategoryError("");
    try {
      await onAddCategory(name, newCategoryType);
      setNewCategoryName("");
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : "Could not add category.");
    } finally {
      setSavingCategory(false);
    }
  };

  const dropCategory = async (targetCategoryId: string) => {
    if (confirmDropId !== targetCategoryId) {
      setConfirmDropId(targetCategoryId);
      setCategoryError("Tap Confirm Drop again within 4 seconds to remove category.");
      window.setTimeout(() => {
        setConfirmDropId((current) => (current === targetCategoryId ? "" : current));
      }, 4000);
      return;
    }

    setDroppingId(targetCategoryId);
    setCategoryError("");
    try {
      await onDropCategory(targetCategoryId);
      if (categoryId === targetCategoryId) {
        setCategoryId("");
      }
      setConfirmDropId("");
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : "Could not drop category.");
    } finally {
      setDroppingId("");
    }
  };

  return (
    <section className="stack-lg history-page">
      <NeonCard title="Time Travel Dial" subtitle={dateRange.label}>
        <div className="quick-preset-row" role="group" aria-label="Quick date filters">
          {presetOptions.map((preset) => (
            <button
              key={preset.value}
              type="button"
              className={`quick-preset-chip ${datePreset === preset.value ? "quick-preset-chip-active" : ""}`.trim()}
              onClick={() => setDatePreset(preset.value)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="history-filter-row">
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">All categories</option>
            <optgroup label="Income">
              {categories
                .filter((category) => category.type === "income")
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Expense">
              {categories
                .filter((category) => category.type === "expense")
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </optgroup>
          </select>
          <button className="secondary-btn" type="button" disabled={!categoryId} onClick={() => setCategoryId("")}>
            Clear category
          </button>
        </div>

        {datePreset === "custom" && (
          <div className="grid-2">
            <input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} />
            <input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} />
          </div>
        )}

        <div className="history-summary-row">
          <div className="history-summary-tile history-summary-in">
            <small>Cash In</small>
            <strong>{formatCurrency(totals.cashIn, currency)}</strong>
          </div>
          <div className="history-summary-tile history-summary-out">
            <small>Cash Out</small>
            <strong>{formatCurrency(totals.cashOut, currency)}</strong>
          </div>
          <div className="history-summary-tile history-summary-net">
            <small>Net</small>
            <strong className={net >= 0 ? "amt-in" : "amt-out"}>
              {net >= 0 ? "+" : "-"}
              {formatCurrency(Math.abs(net), currency)}
            </strong>
          </div>
        </div>

        {canManageCategories && (
          <div className="category-admin">
            <h4>Category Controls</h4>
            <p className="muted">Create category and pick its type before adding.</p>
            <div className="grid-2">
              <input
                type="text"
                placeholder="New category name"
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
              />
              <div className="type-segment" role="group" aria-label="Category type">
                <button
                  type="button"
                  className={`type-option type-option-expense ${newCategoryType === "expense" ? "type-option-active" : ""}`.trim()}
                  aria-pressed={newCategoryType === "expense"}
                  onClick={() => setNewCategoryType("expense")}
                >
                  <span className="type-option-check" aria-hidden="true">
                    {newCategoryType === "expense" ? "✓" : ""}
                  </span>
                  Expense
                </button>
                <button
                  type="button"
                  className={`type-option type-option-income ${newCategoryType === "income" ? "type-option-active" : ""}`.trim()}
                  aria-pressed={newCategoryType === "income"}
                  onClick={() => setNewCategoryType("income")}
                >
                  <span className="type-option-check" aria-hidden="true">
                    {newCategoryType === "income" ? "✓" : ""}
                  </span>
                  Income
                </button>
              </div>
            </div>
            <div className="type-selection-note">
              Selected type:
              <span
                className={`category-type-badge ${
                  newCategoryType === "income" ? "category-type-income" : "category-type-expense"
                }`.trim()}
              >
                {newCategoryType === "income" ? "Income" : "Expense"}
              </span>
            </div>
            <div className="category-actions-row">
              <button className="primary-btn" type="button" onClick={createCategory} disabled={savingCategory}>
                {savingCategory ? "Adding..." : "Add Category"}
              </button>
              <button
                type="button"
                className="ghost-btn category-list-toggle"
                onClick={() => setShowCategoryList((prev) => !prev)}
                aria-expanded={showCategoryList}
              >
                {showCategoryList ? "Hide existing categories" : "Manage existing categories"}
              </button>
            </div>

            <div className="category-list-wrap">

              {showCategoryList && (
                <div className="stack">
                  {categories.map((category) => (
                    <div key={category.id} className="category-admin-row">
                      <span className="category-admin-label">
                        <strong>{category.name}</strong>
                        <span
                          className={`category-type-badge ${
                            category.type === "income" ? "category-type-income" : "category-type-expense"
                          }`.trim()}
                        >
                          {category.type === "income" ? "Income" : "Expense"}
                        </span>
                      </span>
                      <div className="category-row-actions">
                        {confirmDropId === category.id && droppingId !== category.id && (
                          <small className="error-text">Confirm drop?</small>
                        )}
                        <button
                          className={confirmDropId === category.id ? "reject-btn drop-armed" : "reject-btn"}
                          type="button"
                          disabled={droppingId === category.id}
                          onClick={() => dropCategory(category.id)}
                        >
                          {droppingId === category.id
                            ? "Dropping..."
                            : confirmDropId === category.id
                              ? "Confirm Drop"
                              : "Drop"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {categoryError && <small className="error-text">{categoryError}</small>}
          </div>
        )}
      </NeonCard>

      <NeonCard title="Filtered Entries" subtitle="Smart lookup output">
        <div className="stack">
          {filtered.map((entry) => (
            <article className="entry-row" key={entry.id}>
              <div>
                <strong>{categoryMap.get(entry.category_id) ?? "Unknown"}</strong>
                <small>{formatDateTimeInTimeZone(entry.entry_at, timezone)}</small>
              </div>
              <span className={entry.direction === "cash_in" ? "amt-in" : "amt-out"}>
                {entry.direction === "cash_in" ? "+" : "-"}
                {formatCurrency(entry.amount, currency)}
              </span>
            </article>
          ))}
          {!filtered.length && <p className="muted">No entries in selected range.</p>}
        </div>
      </NeonCard>

      <NeonCard title="Balance Sheet Export" subtitle="Professional report from current filters">
        <div className="stack">
          <div className="inline-actions">
            <button className="secondary-btn" type="button" onClick={downloadExcel} disabled={exportDisabled}>
              Export Excel
            </button>
            <button className="primary-btn" type="button" onClick={exportPdf} disabled={exportDisabled}>
              Export PDF
            </button>
          </div>
          <small>Records in current filter: {filtered.length}</small>
          {exportDisabled && (
            <small className="error-text">
              {datePreset === "custom" && (!dateRange.from || !dateRange.to)
                ? "Set both custom date fields to export the statement."
                : "No records found for current filters. Change date/category filter and try export again."}
            </small>
          )}
          <small>
            Export includes selected period, selected category, entry list, and cash in/out/net totals in Cashbook template.
          </small>
        </div>
      </NeonCard>
    </section>
  );
}
