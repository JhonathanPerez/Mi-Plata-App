import { IconButton } from './Button';

interface StepperProps {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  prevLabel: string;
  nextLabel: string;
  /** Deshabilita la flecha derecha (por ejemplo, para no pasar del mes actual). */
  nextDisabled?: boolean;
}

/** Selector "< Septiembre 2026 >" reutilizable para meses y años. */
export function Stepper({ label, onPrev, onNext, prevLabel, nextLabel, nextDisabled }: StepperProps) {
  return (
    <div className="stepper">
      <IconButton icon="chevronLeft" label={prevLabel} onClick={onPrev} />
      <span className="stepper__label" aria-live="polite">
        {label}
      </span>
      <IconButton icon="chevronRight" label={nextLabel} onClick={onNext} disabled={nextDisabled} />
    </div>
  );
}
