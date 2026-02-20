import { useEffect, type ReactNode } from "react";
import { BrandLogo } from "@/components/common/BrandLogo";

export type AppTab = "dashboard" | "history" | "team";

interface AppShellProps {
  title: string;
  subtitle: string;
  tab: AppTab;
  onTabChange: (tab: AppTab) => void;
  onSignOut: () => Promise<void>;
  onEnableNotifications: () => Promise<void>;
  onInstallApp: () => Promise<void>;
  notificationSupported: boolean;
  notificationPermission: NotificationPermission | "unsupported";
  installAvailable: boolean;
  online: boolean;
  queueCount: number;
  syncBanner?: string;
  children: ReactNode;
}

export function AppShell(props: AppShellProps): JSX.Element {
  const {
    title,
    subtitle,
    tab,
    onTabChange,
    onSignOut,
    onEnableNotifications,
    onInstallApp,
    notificationSupported,
    notificationPermission,
    installAvailable,
    online,
    queueCount,
    syncBanner,
    children
  } = props;

  const pickTab = (nextTab: AppTab): void => {
    onTabChange(nextTab);
  };

  useEffect(() => {
    document.body.classList.add("app-shell-active");
    return () => {
      document.body.classList.remove("app-shell-active");
    };
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <BrandLogo compact className="header-logo" />
          <h1>{title}</h1>
          <p>{subtitle}</p>
          <nav className="header-tabs">
            <button className={tab === "dashboard" ? "active" : ""} onClick={() => pickTab("dashboard")}>
              Dashboard
            </button>
            <button className={tab === "history" ? "active" : ""} onClick={() => pickTab("history")}>
              History
            </button>
            <button className={tab === "team" ? "active" : ""} onClick={() => pickTab("team")}>
              Team
            </button>
          </nav>
        </div>
        <div className="topbar-right">
          <button
            className="ghost-btn"
            onClick={onInstallApp}
            disabled={!installAvailable}
            title={!installAvailable ? "Install is not available in this browser." : undefined}
          >
            Install App
          </button>
          <button
            className="ghost-btn"
            onClick={onEnableNotifications}
            disabled={!notificationSupported}
            title={!notificationSupported ? "Alerts are not supported in this browser." : undefined}
          >
            {notificationPermission === "granted" ? "Alerts On" : "Enable Alerts"}
          </button>
          <span className={`pill ${online ? "pill-good" : "pill-warn"}`.trim()}>
            {online ? "Online" : `Offline (${queueCount})`}
          </span>
          <button className="ghost-btn" onClick={onSignOut}>
            Sign Out
          </button>
        </div>
      </header>

      {syncBanner && <div className={`sync-banner ${online ? "sync-banner-warn" : "sync-banner-offline"}`}>{syncBanner}</div>}

      <main className="app-main">{children}</main>

      <nav className="tabbar">
        <button className={tab === "dashboard" ? "active" : ""} onClick={() => pickTab("dashboard")}>
          Dashboard
        </button>
        <button className={tab === "history" ? "active" : ""} onClick={() => pickTab("history")}>
          History
        </button>
        <button className={tab === "team" ? "active" : ""} onClick={() => pickTab("team")}>
          Team
        </button>
      </nav>
    </div>
  );
}
