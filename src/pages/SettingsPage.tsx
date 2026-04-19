import { NeonCard } from "@/components/common/NeonCard";
import type { AppErrorLogEntry } from "@/lib/errorLog";

interface SettingsPageProps {
  errorLogEntries: AppErrorLogEntry[];
  onClearErrorLog: () => void;
}

export function SettingsPage(props: SettingsPageProps): JSX.Element {
  const { errorLogEntries, onClearErrorLog } = props;

  const formatDateTime = (value: string): string => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "Recently";
    }
    return parsed.toLocaleString();
  };

  return (
    <section className="stack-lg">
      <NeonCard title="Error Log" subtitle="Runtime, database, API, and unhandled errors captured on this device. Sensitive tokens are redacted.">
        <div className="stack">
          <div className="sent-requests-head">
            <div>
              <small className="muted">Newest errors stay in this browser so you can trace failures from Supabase, internal app logic, or unexpected browser/runtime issues.</small>
            </div>
            <button className="ghost-btn" type="button" onClick={onClearErrorLog} disabled={!errorLogEntries.length}>
              Clear Log
            </button>
          </div>

          <div className="error-log-list">
            {errorLogEntries.map((entry) => (
              <article key={entry.id} className="error-log-row">
                <div className="error-log-head">
                  <strong>{entry.location}</strong>
                  <span className="category-type-badge category-type-neutral">{formatDateTime(entry.at)}</span>
                </div>
                <small className="error-text">{entry.message}</small>
                {!!entry.detail && <pre className="error-log-detail">{entry.detail}</pre>}
              </article>
            ))}

            {!errorLogEntries.length && <p className="muted">No runtime, database, or internal app errors have been captured on this device yet.</p>}
          </div>
        </div>
      </NeonCard>
    </section>
  );
}
