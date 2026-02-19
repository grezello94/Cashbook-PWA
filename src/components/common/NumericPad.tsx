interface NumericPadProps {
  value: string;
  onChange: (value: string) => void;
}

const keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", "←"];

export function NumericPad({ value, onChange }: NumericPadProps): JSX.Element {
  const onPress = (key: string) => {
    if (key === "←") {
      onChange(value.slice(0, -1));
      return;
    }

    if (key === "." && value.includes(".")) {
      return;
    }

    const next = `${value}${key}`;
    if (!/^\d*(\.\d{0,2})?$/.test(next)) {
      return;
    }

    onChange(next);
  };

  return (
    <div className="num-pad">
      {keys.map((key) => (
        <button key={key} type="button" className="num-key" onClick={() => onPress(key)}>
          {key}
        </button>
      ))}
    </div>
  );
}
