export function LoadingPanel({ label = "Loading..." }: { label?: string }): JSX.Element {
  return (
    <div className="full-panel" role="status" aria-live="polite">
      <div className="loader-stage" aria-hidden="true">
        <div className="loader-ring loader-ring-outer" />
        <div className="loader-ring loader-ring-middle" />
        <div className="loader-ring loader-ring-inner" />
        <div className="loader-grid" />
        <div className="loader-core">
          <span className="loader-core-dot" />
        </div>
      </div>
      <p className="loading-label">{label}</p>
      <p className="loading-subtle">Preparing secure workspace context</p>
    </div>
  );
}
