export function LoadingPanel({ label = "Loading..." }: { label?: string }): JSX.Element {
  return (
    <div className="full-panel">
      <div className="loading-orb" />
      <p>{label}</p>
    </div>
  );
}
