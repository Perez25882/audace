export function Quantity({ value, max, label = "Quantity", disabled = false, onChange }: {
  value: number; max: number; label?: string; disabled?: boolean; onChange: (value: number) => void;
}) {
  return (
    <div className="quantity" role="group" aria-label={label}>
      <button type="button" aria-label="Decrease quantity" disabled={disabled || value <= 1} onClick={() => onChange(value - 1)}>−</button>
      <span aria-live="polite">{value}</span>
      <button type="button" aria-label="Increase quantity" disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}
