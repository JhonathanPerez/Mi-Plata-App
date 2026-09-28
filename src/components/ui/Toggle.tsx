import { haptics } from '@/lib/haptics';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}

export function Toggle({ checked, onChange, label, hint }: ToggleProps) {
  return (
    <label className="toggle">
      <span className="toggle__text">
        <span className="toggle__label">{label}</span>
        {hint && <span className="toggle__hint">{hint}</span>}
      </span>
      <input
        className="toggle__input"
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => {
          void haptics.tap();
          onChange(event.target.checked);
        }}
      />
      <span className="toggle__track" aria-hidden="true" />
    </label>
  );
}
