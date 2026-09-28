import { addMonths, formatMonthTitle } from '@/lib/dates';
import type { YearMonth } from '@/types/models';
import { Stepper } from './Stepper';

interface MonthNavigatorProps {
  value: YearMonth;
  onChange: (value: YearMonth) => void;
}

export function MonthNavigator({ value, onChange }: MonthNavigatorProps) {
  return (
    <Stepper
      label={formatMonthTitle(value)}
      prevLabel="Mes anterior"
      nextLabel="Mes siguiente"
      onPrev={() => onChange(addMonths(value, -1))}
      onNext={() => onChange(addMonths(value, 1))}
    />
  );
}
