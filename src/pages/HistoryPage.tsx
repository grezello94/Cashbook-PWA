import { useMemo, useState } from "react";
import { NeonCard } from "@/components/common/NeonCard";
import { formatCurrency } from "@/lib/format";
import type { Category, Entry } from "@/types/domain";

interface HistoryPageProps {
  currency: string;
  categories: Category[];
  entries: Entry[];
}

export function HistoryPage({ currency, categories, entries }: HistoryPageProps): JSX.Element {
  const [categoryId, setCategoryId] = useState<string>("");
  const [lookbackDays, setLookbackDays] = useState<number>(30);

  const filtered = useMemo(() => {
    const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
    return entries.filter((entry) => {
      const inTimeRange = new Date(entry.entry_at).getTime() >= cutoff;
      const inCategory = !categoryId || entry.category_id === categoryId;
      return inTimeRange && inCategory;
    });
  }, [entries, lookbackDays, categoryId]);

  const categoryMap = new Map(categories.map((item) => [item.id, item.name]));

  return (
    <section className="stack-lg">
      <NeonCard title="Time Travel Dial" subtitle={`Viewing last ${lookbackDays} days`}>
        <input
          type="range"
          min={1}
          max={365}
          value={lookbackDays}
          onChange={(event) => setLookbackDays(Number(event.target.value))}
        />
        <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </NeonCard>

      <NeonCard title="Filtered Entries" subtitle="Smart lookup output">
        <div className="stack">
          {filtered.map((entry) => (
            <article className="entry-row" key={entry.id}>
              <div>
                <strong>{categoryMap.get(entry.category_id) ?? "Unknown"}</strong>
                <small>{new Date(entry.entry_at).toLocaleString()}</small>
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
    </section>
  );
}
