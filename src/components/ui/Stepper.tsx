import { IconButton } from './Button';

interface StepperProps {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  prevLabel: string;
  nextLabel: string;
}

/** Selector "< Septiembre 2026 >" reutilizable para meses y años. */
export function Stepper({ label, onPrev, onNext, prevLabel, nextLabel }: StepperProps) {
  return (
    <div className="stepper">
      <IconButton icon="chevronLeft" label={prevLabel} onClick={onPrev} />
      <span className="stepper__label" aria-live="polite">
        {label}
      </span>
      <IconButton icon="chevronRight" label={nextLabel} onClick={onNext} />
    </div>
  );
}
