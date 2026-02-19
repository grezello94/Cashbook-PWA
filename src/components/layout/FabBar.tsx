import type { CashDirection } from "@/types/domain";

interface FabBarProps {
  onPick: (direction: CashDirection) => void;
}

export function FabBar({ onPick }: FabBarProps): JSX.Element {
  return (
    <div className="fab-wrap">
      <button className="fab-action fab-in" onClick={() => onPick("cash_in")}>
        Cash In
      </button>
      <button className="fab-action fab-out" onClick={() => onPick("cash_out")}>
        Cash Out
      </button>
    </div>
  );
}
