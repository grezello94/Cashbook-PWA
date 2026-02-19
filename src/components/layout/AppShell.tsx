import type { ReactNode } from "react";

export type AppTab = "dashboard" | "history" | "team";

interface AppShellProps {
  title: string;
  subtitle: string;
  tab: AppTab;
  onTabChange: (tab: AppTab) => void;
  onSignOut: () => Promise<void>;
  online: boolean;
  queueCount: number;
  children: ReactNode;
}

export function AppShell(props: AppShellProps): JSX.Element {
  const { title, subtitle, tab, onTabChange, onSignOut, online, queueCount, children } = props;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="topbar-right">
          <span className={`pill ${online ? "pill-good" : "pill-warn"}`.trim()}>
            {online ? "Online" : `Offline (${queueCount})`}
          </span>
          <button className="ghost-btn" onClick={onSignOut}>
            Sign Out
          </button>
        </div>
      </header>

      <main>{children}</main>

      <nav className="tabbar">
        <button className={tab === "dashboard" ? "active" : ""} onClick={() => onTabChange("dashboard")}>
          Dashboard
        </button>
        <button className={tab === "history" ? "active" : ""} onClick={() => onTabChange("history")}>
          History
        </button>
        <button className={tab === "team" ? "active" : ""} onClick={() => onTabChange("team")}>
          Team
        </button>
      </nav>
    </div>
  );
}
