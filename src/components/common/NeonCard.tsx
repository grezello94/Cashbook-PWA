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
      {(title || subtitle) && (
        <header className="card-head">
          {title && <h3>{title}</h3>}
          {subtitle && <p>{subtitle}</p>}
        </header>
      )}
      {children}
    </section>
  );
}
