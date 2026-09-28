import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '@/app/providers/ToastProvider';
import { RuleSheet } from '@/components/cards/RuleSheet';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { useQuery } from '@/hooks/useQuery';
import {
  WEEKEND_LABELS,
  addMonths,
  describeCut,
  describeDue,
  periodFor,
  statementDates,
  validateCycleRules,
  type CycleRules,
} from '@/lib/cycles';
import { todayIso } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { formatDayMonth, periodMonthName } from '@/lib/statementText';
import { capitalize } from '@/lib/text';
import { paymentMethodService } from '@/services/paymentMethodService';

const DEFAULT_RULES: CycleRules = { cut: { kind: 'last' }, due: { kind: 'day', day: 20 }, dueNextMonth: true, weekend: 'keep' };

function RuleField({ label, value, hint, onOpen }: { label: string; value: string; hint?: string; onOpen: () => void }) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <button type="button" className="picker-link" aria-haspopup="dialog" onClick={onOpen}>
        <span className="picker-link__text">
          <span className="picker-link__name">{value}</span>
        </span>
        <span className="picker-link__action">
          Cambiar
          <Icon name="chevronRight" size={16} />
        </span>
      </button>
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

/** Reglas de corte y pago de una tarjeta de crédito: día fijo, último día o "el segundo viernes". */
export function CardRulesPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: methods, loading } = useQuery(() => paymentMethodService.list(true));
  const method = methods?.find((m) => m.id === id) ?? null;

  const [rules, setRules] = useState<CycleRules>(DEFAULT_RULES);
  const [sheet, setSheet] = useState<'cut' | 'due' | null>(null);
  const [saving, setSaving] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || !method) return;
    initialized.current = true;
    setRules(method.cycle ?? DEFAULT_RULES);
  }, [method]);

  const problem = useMemo(() => validateCycleRules(rules), [rules]);
  const fromPeriod = useMemo(() => {
    const datesFor = (period: string) => statementDates(rules, period);
    return periodFor(todayIso(), datesFor);
  }, [rules]);
  const upcoming = [0, 1, 2].map((offset) => {
    const period = addMonths(fromPeriod, offset);
    return { period, ...statementDates(rules, period) };
  });
  // Un pago "el segundo martes" nunca cae en fin de semana: en ese caso no se ofrece la opción.
  const canFallOnWeekend = !(rules.due.kind === 'nth' && rules.due.weekday >= 1 && rules.due.weekday <= 5);

  if (!loading && (!method || method.type !== 'credit_card')) {
    return (
      <div className="page">
        <PageHeader title="Fechas del ciclo" back />
        <p className="muted">Las fechas de corte y pago son solo para tarjetas de crédito.</p>
      </div>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      await paymentMethodService.setCycleRules(id, rules);
      toast.show('Fechas del ciclo guardadas');
      navigate(-1);
    } catch (error) {
      toast.show(errorMessage(error), 'error');
      setSaving(false);
    }
  };

  return (
    <div className="page page--form">
      <PageHeader title={method ? `Fechas de ${method.name}` : 'Fechas del ciclo'} back />

      <section className="cy-block">
        <h2 className="cy-block__title">
          <Icon name="calendar" size={20} />
          Fechas del ciclo
        </h2>
        <RuleField label="Corte" value={describeCut(rules)} onOpen={() => setSheet('cut')} />
        <RuleField label="Fecha límite de pago" value={describeDue(rules)} onOpen={() => setSheet('due')} />
        {canFallOnWeekend && <RuleField label="Si el pago cae en fin de semana" value={WEEKEND_LABELS[rules.weekend]} onOpen={() => setSheet('due')} />}
        <p className="cy-note">
          <Icon name="info" size={16} />
          <span>
            Son las reglas de siempre. Si un mes el banco las cambia, ajusta solo ese extracto desde <strong>Tarjetas</strong>. Los extractos ya pagados
            conservan sus fechas.
          </span>
        </p>
      </section>

      {problem && (
        <p className="field__error" role="alert">
          <Icon name="warning" size={16} />
          <span>{problem}</span>
        </p>
      )}

      {!problem && (
        <section className="rl-up" aria-label="Próximos extractos">
          <h3 className="rl-up__title">
            <Icon name="calendar" size={18} />
            Próximos extractos
          </h3>
          {upcoming.map((item) => (
            <div className="rl-up__row" key={item.period}>
              <strong>{capitalize(periodMonthName(item.period)).slice(0, 3)}</strong>
              <span>
                Corte <b>{formatDayMonth(item.cut)}</b>
              </span>
              <span>
                Pago <b>{formatDayMonth(item.due)}</b>
              </span>
            </div>
          ))}
        </section>
      )}

      <div className="form__footer">
        <Button block size="lg" icon="check" loading={saving} disabled={Boolean(problem)} onClick={() => void save()}>
          Guardar
        </Button>
      </div>

      {sheet && <RuleSheet open which={sheet} rules={rules} onChange={setRules} onClose={() => setSheet(null)} fromPeriod={fromPeriod} />}
    </div>
  );
}
