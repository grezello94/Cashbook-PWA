import { Component, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.error("Unhandled app error:", error);
  }

  private reloadApp = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="center-layout">
        <section className="neon-card max-w-xl">
          <div className="stack">
            <h3>Something went wrong</h3>
            <p className="muted">The app hit an unexpected issue. Reload to continue safely.</p>
            <button type="button" className="primary-btn" onClick={this.reloadApp}>
              Reload App
            </button>
          </div>
        </section>
      </div>
    );
  }
}
