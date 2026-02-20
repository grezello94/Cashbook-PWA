import type { CashDirection } from "@/types/domain";

interface FabBarProps {
  onPick: (direction: CashDirection) => void;
  className?: string;
}

export function FabBar({ onPick, className = "" }: FabBarProps): JSX.Element {
  return (
    <div className={`fab-wrap ${className}`.trim()}>
      <button className="fab-action fab-in" onClick={() => onPick("cash_in")}>
        Cash In
      </button>
      <button className="fab-action fab-out" onClick={() => onPick("cash_out")}>
        Cash Out
      </button>
    </div>
  );
}
