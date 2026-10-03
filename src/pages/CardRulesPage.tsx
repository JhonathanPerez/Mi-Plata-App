import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '@/app/providers/ToastProvider';
import { RuleSheet } from '@/components/cards/RuleSheet';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { Row } from '@/components/ui/Row';
import { Skeleton } from '@/components/ui/Skeleton';
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
import { periodMonthName, statementDatesLabel } from '@/lib/statementText';
import { capitalize } from '@/lib/text';
import { paymentMethodService } from '@/services/paymentMethodService';

const DEFAULT_RULES: CycleRules = { cut: { kind: 'last' }, due: { kind: 'day', day: 20 }, dueNextMonth: true, weekend: 'keep' };

const TITLE = 'Reglas de corte y pago';

/** Una regla: su nombre arriba y la regla vigente en texto; al tocarla se abre la hoja para cambiarla. */
function RuleRow({ label, value, onOpen }: { label: string; value: string; onOpen: () => void }) {
  return (
    <Row
      aria-haspopup="dialog"
      onClick={onOpen}
      title={<span className="rule-row__label">{label}</span>}
      detail={<span className="rule-row__value">{value}</span>}
      chevron="chevronRight"
    />
  );
}

/** Mientras llegan los datos: las dos tarjetas con sus proporciones reales, sin mostrar reglas que aún no son las de la tarjeta. */
function RulesSkeleton() {
  const block = (rows: number) => (
    <div className="card card--flush">
      {Array.from({ length: rows }, (_, n) => (
        <div key={n} className="skeleton-row skeleton-row--expense">
          <div className="skeleton-row__body">
            <Skeleton height={13} width="35%" />
            <Skeleton height={20} width="75%" />
          </div>
          <Skeleton height={16} width="16px" />
        </div>
      ))}
    </div>
  );
  return (
    <div className="page-skeleton" role="status" aria-label="Cargando las reglas">
      <Skeleton height={22} width="45%" />
      {block(2)}
      <Skeleton height={22} width="45%" />
      {block(3)}
    </div>
  );
}

/** Reglas de corte y pago de una tarjeta de crédito: día fijo, último día o "el segundo viernes". */
export function CardRulesPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const today = todayIso();
  const { data: methods, loading, error, retry } = useQuery(() => paymentMethodService.list(true));
  const method = methods?.find((m) => m.id === id) ?? null;

  const [rules, setRules] = useState<CycleRules>(DEFAULT_RULES);
  // Hasta que se cargan las reglas guardadas no se dibuja nada editable: así no se ven unas reglas que no son las de la tarjeta.
  const [ready, setReady] = useState(false);
  const [sheet, setSheet] = useState<'cut' | 'due' | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (ready || !method) return;
    setRules(method.cycle ?? DEFAULT_RULES);
    setReady(true);
  }, [method, ready]);

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

  // Un error de lectura no es una tarjeta borrada: cada caso dice lo suyo y ofrece su salida.
  if (error && !methods) {
    return (
      <div className="page">
        <PageHeader title={TITLE} back />
        <div className="card">
          <ErrorState description="No pudimos leer las reglas de esta tarjeta. Inténtalo de nuevo." onRetry={retry} />
        </div>
      </div>
    );
  }

  if (!loading && !method) {
    return (
      <div className="page">
        <PageHeader title={TITLE} back />
        <div className="card">
          <EmptyState
            icon="card"
            title="Esta tarjeta ya no existe"
            description="Puede que la hayas eliminado o desactivado."
            action={
              <Button icon="card" onClick={() => navigate('/tarjetas', { replace: true })}>
                Ir a Tarjetas
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  if (method && method.type !== 'credit_card') {
    return (
      <div className="page">
        <PageHeader title={TITLE} subtitle={method.name} back />
        <div className="card">
          <EmptyState
            icon="calendar"
            title="Solo para tarjetas de crédito"
            description="Los demás métodos de pago no tienen fecha de corte ni de pago."
            action={
              <Button variant="secondary" icon="back" onClick={() => navigate(-1)}>
                Volver
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      await paymentMethodService.setCycleRules(id, rules);
      toast.show('Reglas de corte y pago guardadas');
      navigate(-1);
    } catch (error) {
      toast.show(errorMessage(error), 'error');
      setSaving(false);
    }
  };

  return (
    <div className="page page--form">
      <PageHeader title={TITLE} subtitle={method?.name} back />

      {!ready ? (
        <RulesSkeleton />
      ) : (
        <>
          <section className="section" aria-labelledby="rules-heading">
            <h2 className="section__title" id="rules-heading">
              Reglas de siempre
            </h2>
            <div className="card card--flush">
              <RuleRow label="Día de corte" value={describeCut(rules)} onOpen={() => setSheet('cut')} />
              <RuleRow label="Fecha límite de pago" value={describeDue(rules)} onOpen={() => setSheet('due')} />
              {canFallOnWeekend && (
                <RuleRow label="Si el pago cae en fin de semana" value={WEEKEND_LABELS[rules.weekend]} onOpen={() => setSheet('due')} />
              )}
            </div>
          </section>

          <Notice>Si un mes el banco las cambia, ajusta solo ese extracto en Extractos. Los ya pagados conservan sus fechas.</Notice>

          {problem ? (
            <Notice tone="danger" role="alert">
              {problem}
            </Notice>
          ) : (
            <section className="section" aria-labelledby="upcoming-heading">
              <div className="section__heading">
                <h2 className="section__title" id="upcoming-heading">
                  Próximos extractos
                </h2>
                <p className="section__hint">Así quedarían con estas reglas</p>
              </div>
              <div className="card card--flush">
                {upcoming.map((item) => {
                  const year = item.period.slice(0, 4);
                  return (
                    <Row
                      as="div"
                      key={item.period}
                      title={`${capitalize(periodMonthName(item.period))}${year !== today.slice(0, 4) ? ` ${year}` : ''}`}
                      detail={statementDatesLabel(item.cut, item.due)}
                    />
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      <div className="form__footer">
        <Button block size="lg" icon="check" loading={saving} disabled={!ready || Boolean(problem)} onClick={() => void save()}>
          Guardar
        </Button>
      </div>

      {sheet && <RuleSheet open which={sheet} rules={rules} onChange={setRules} onClose={() => setSheet(null)} fromPeriod={fromPeriod} />}
    </div>
  );
}
