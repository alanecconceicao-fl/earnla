import { useEffect, useRef, useState } from "react";

export default function AmountInput({ value, onChange, max, ...props }: {
  value: number;
  onChange: (value: number) => void;
  max?: number;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "max">) {
  const [text, setText] = useState(value.toFixed(2));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(value.toFixed(2)); }, [value]);
  return <input {...props} type="number" min="0" step="0.01" max={max} value={text}
    onFocus={() => { focused.current = true; }}
    onChange={event => {
      setText(event.target.value);
      const number = Number(event.target.value);
      if (Number.isFinite(number) && number >= 0 && (max == null || number <= max)) onChange(number);
    }}
    onBlur={event => {
      focused.current = false;
      const number = Math.max(0, Math.min(max ?? Infinity, Number(event.target.value) || 0));
      setText(number.toFixed(2));
      if (number !== value) onChange(number);
    }} />;
}
