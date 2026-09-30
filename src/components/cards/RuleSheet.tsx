import { Chip } from '@/components/ui/Chip';
import { Row } from '@/components/ui/Row';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { cx } from '@/lib/cx';
import {
  WEEKDAY_NAMES,
  addMonths,
  describeRule,
  statementDates,
  type CycleRule,
  type CycleRules,
  type Ordinal,
  type Weekday,
  type WeekendPolicy,
} from '@/lib/cycles';
import { formatDayMonth, periodMonthName } from '@/lib/statementText';
import { capitalize } from '@/lib/text';

type Which = 'cut' | 'due';
type Kind = CycleRule['kind'];

interface RuleSheetProps {
  open: boolean;
  which: Which;
  rules: CycleRules;
  onChange: (rules: CycleRules) => void;
  onClose: () => void;
  /** Periodo desde el cual mostrar el ejemplo "Así quedaría" (por defecto, el mes actual). */
  fromPeriod: string;
}

const ORDINALS: Array<{ value: Ordinal; label: string }> = [
  { value: 1, label: 'Primer' },
  { value: 2, label: 'Segundo' },
  { value: 3, label: 'Tercer' },
  { value: 4, label: 'Cuarto' },
  { value: 'last', label: 'Último' },
];
const WEEK_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
// Orden lunes → domingo; el valor es el de `Date.getDay()` (0 = domingo).
const WEEK_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

/** Convierte una regla a otro tipo conservando lo que se pueda (por ejemplo, el día ya elegido). */
function withKind(rule: CycleRule, kind: Kind): CycleRule {
  if (kind === rule.kind) return rule;
  if (kind === 'last') return { kind: 'last' };
  if (kind === 'day') return { kind: 'day', day: 15 };
  return { kind: 'nth', nth: 2, weekday: 5 };
}

/**
 * Hoja para editar UNA regla (corte o pago): día fijo, último día del mes o n-ésimo día de la semana.
 * En el pago también se elige en qué mes cae y qué hacer si cae en fin de semana.
 * Los cambios se aplican al instante sobre las reglas de la pantalla; "Listo" solo cierra la hoja.
 */
export function RuleSheet({ open, which, rules, onChange, onClose, fromPeriod }: RuleSheetProps) {
  const rule = rules[which];
  const setRule = (next: CycleRule) => onChange({ ...rules, [which]: next });
  const isDue = which === 'due';

  const examples = [0, 1, 2].map((offset) => {
    const period = addMonths(fromPeriod, offset);
    const dates = statementDates(rules, period);
    return { period, date: isDue ? dates.due : dates.cut };
  });

  return (
    <Sheet
      open={open}
      title={isDue ? 'Fecha límite de pago' : 'Día de corte'}
      onClose={onClose}
      actions={{ primary: { label: 'Listo', icon: 'check', onClick: onClose } }}
    >
      <div className="stack">
        <Segmented<Kind>
          label="Tipo de regla"
          value={rule.kind}
          onChange={(kind) => setRule(withKind(rule, kind))}
          options={[
            { value: 'day', label: 'Día fijo' },
            { value: 'last', label: 'Último día' },
            { value: 'nth', label: 'Día de semana' },
          ]}
        />

        {rule.kind === 'day' && (
          <div className="field">
            <span className="field__label">Día del mes</span>
            <div className="rule-stepper">
              <button type="button" aria-label="Un día menos" onClick={() => setRule({ kind: 'day', day: Math.max(1, rule.day - 1) })}>
                −
              </button>
              <strong aria-live="polite">{rule.day}</strong>
              <button type="button" aria-label="Un día más" onClick={() => setRule({ kind: 'day', day: Math.min(31, rule.day + 1) })}>
                +
              </button>
            </div>
            {rule.day > 28 && <p className="field__hint">En los meses más cortos cae en su último día.</p>}
          </div>
        )}

        {rule.kind === 'nth' && (
          <>
            <div className="field">
              <span className="field__label">¿Cuál?</span>
              <div className="chip-row">
                {ORDINALS.map((o) => (
                  <Chip key={String(o.value)} selected={rule.nth === o.value} onClick={() => setRule({ ...rule, nth: o.value })}>
                    {o.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="field__label">Día de la semana</span>
              <div className="weekday-picker" role="radiogroup" aria-label="Día de la semana">
                {WEEK_ORDER.map((weekday, i) => (
                  <button
                    key={weekday}
                    type="button"
                    role="radio"
                    aria-checked={rule.weekday === weekday}
                    aria-label={WEEKDAY_NAMES[weekday]}
                    className={cx('weekday-picker__day', rule.weekday === weekday && 'is-selected')}
                    onClick={() => setRule({ ...rule, weekday })}
                  >
                    {WEEK_LETTERS[i]}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <p className="rule-sentence">
          <strong>{describeRule(rule)}</strong>
          {isDue ? (rules.dueNextMonth ? ' del mes siguiente' : ' del mismo mes') : ' de cada mes'}
        </p>

        {isDue && (
          <>
            <div className="field">
              <span className="field__label">¿En qué mes?</span>
              <Segmented<string>
                label="Mes del pago"
                value={rules.dueNextMonth ? 'next' : 'same'}
                onChange={(value) => onChange({ ...rules, dueNextMonth: value === 'next' })}
                options={[
                  { value: 'same', label: 'Mismo mes del corte' },
                  { value: 'next', label: 'Mes siguiente' },
                ]}
              />
            </div>
            <div className="field">
              <span className="field__label">Si cae en fin de semana</span>
              <Segmented<WeekendPolicy>
                label="Fin de semana"
                value={rules.weekend}
                onChange={(weekend) => onChange({ ...rules, weekend })}
                options={[
                  { value: 'keep', label: 'Mantener' },
                  { value: 'before', label: 'Hábil anterior' },
                  { value: 'after', label: 'Hábil siguiente' },
                ]}
              />
            </div>
          </>
        )}

        <section className="upcoming-statements upcoming-statements--sheet" aria-label="Así quedaría">
          <h3 className="upcoming-statements__title">Así quedaría</h3>
          {examples.map((example) => (
            <Row
              as="div"
              key={example.period}
              title={capitalize(periodMonthName(example.period))}
              detail={
                <>
                  {isDue ? 'Pago' : 'Corte'} <b>{formatDayMonth(example.date)}</b>
                </>
              }
            />
          ))}
        </section>
      </div>
    </Sheet>
  );
}
