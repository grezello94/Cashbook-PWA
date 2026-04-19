import type { ReactNode } from "react";

interface NeonCardProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

export function NeonCard({ title, subtitle, children, className }: NeonCardProps): JSX.Element {
  return (
    <section className={`neon-card ${className ?? ""}`.trim()}>
      <span className="neon-card-glow" aria-hidden="true" />
      <span className="neon-card-grid" aria-hidden="true" />
      {(title || subtitle) && (
        <header className="card-head">
          {title && <h3>{title}</h3>}
          {subtitle && <p>{subtitle}</p>}
        </header>
      )}
      <div className="neon-card-body">{children}</div>
    </section>
  );
}
