interface BrandLogoProps {
  compact?: boolean;
  className?: string;
}

export function BrandLogo({ compact = false, className = "" }: BrandLogoProps): JSX.Element {
  return (
    <div className={`brand-logo-wrap ${compact ? "brand-logo-wrap-compact" : ""} ${className}`.trim()}>
      <img src="/brand/cashbook-logo.png" alt="Cashbook by Routes" className="brand-logo-image" />
    </div>
  );
}
