import type { CashDirection } from "@/types/domain";

interface FabBarProps {
  open: boolean;
  onToggle: () => void;
  onPick: (direction: CashDirection) => void;
}

export function FabBar({ open, onToggle, onPick }: FabBarProps): JSX.Element {
  return (
    <div className="fab-wrap">
      {open && (
        <>
          <button className="fab-action fab-out" onClick={() => onPick("cash_out")}>
            Cash Out
          </button>
          <button className="fab-action fab-in" onClick={() => onPick("cash_in")}>
            Cash In
          </button>
        </>
      )}
      <button className={`fab-main ${open ? "open" : ""}`.trim()} onClick={onToggle}>
        {open ? "Close" : "Add"}
      </button>
    </div>
  );
}
