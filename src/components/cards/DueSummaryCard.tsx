import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmojiTile } from "@/components/ui/EmojiTile";
import { Icon } from "@/components/ui/Icon";
import { Amount } from "@/components/ui/Money";
import { Notice } from "@/components/ui/Notice";
import { Row } from "@/components/ui/Row";
import { dueTone, type DueTone } from "@/lib/cardDue";
import { formatDayMonth, relativeDays } from "@/lib/statementText";
import type { DueSummary } from "@/services/cardService";

const LABEL_CLASS: Record<DueTone, string> = {
  neutral: "due-label due-label--neutral",
  warning: "due-label due-label--warning",
  danger: "due-label due-label--danger",
};

/**
 * Vencimiento sin óvalo: texto del color de la urgencia y, si hay que atenderlo, un icono de advertencia al final.
 * El texto fluye en línea; el icono viaja pegado a la última palabra para no quedar solo en un renglón.
 */
function DueLabel({ tone, children }: { tone: DueTone; children: string }) {
  if (tone === "neutral")
    return <span className={LABEL_CLASS[tone]}>{children}</span>;
  const words = children.split(" ");
  const last = words.pop();
  return (
    <span className={LABEL_CLASS[tone]}>
      {words.join(" ")}{" "}
      <span className="due-label__tail">
        {last}
        <Icon name="warning" size={16} />
      </span>
    </span>
  );
}

/** «Próximo pago en 6 días» (la fecha va aparte, bajo el monto): cabe en un renglón. Hoy y vencido siguen diciendo «Vence hoy» y «Vencido hace…». */
function dueText(daysLeft: number): string {
  if (daysLeft < 0)
    return `Vencido hace ${-daysLeft} ${-daysLeft === 1 ? "día" : "días"}`;
  if (daysLeft === 0) return "Vence hoy";
  return `Pago ${relativeDays(daysLeft)}`;
}

interface DueSummaryCardProps {
  summary: DueSummary;
  onPay: () => void;
}

/** Tarjeta de Inicio: cuánto se debe en tarjetas de crédito y cuándo vence lo más próximo. */
export function DueSummaryCard({ summary, onPay }: DueSummaryCardProps) {
  const hasCards = summary.cards.length > 0;
  const anyClosed = summary.cards.some((card) => card.hasClosedStatement);
  const [infoOpen, setInfoOpen] = useState(false);
  const info = (
    <button
      type="button"
      className="due-summary__info"
      aria-expanded={infoOpen}
      aria-label="¿Esto cuenta en mis gastos del mes?"
      onClick={() => setInfoOpen((open) => !open)}
    >
      <Icon name="info" size={20} />
    </button>
  );
  // Con una sola fila su monto ya es el total: el encabezado solo suma cuando hay varias.
  const rowCount = summary.cards.length + (summary.other.count > 0 ? 1 : 0);
  return (
    <section className="due-summary" aria-label="Por pagar">
      <div className="due-summary__head">
        <span>
          <Icon name="card" size={18} />
          Por pagar
          {rowCount > 1 && info}
        </span>
        {rowCount > 1 ? (
          <strong>
            <Amount value={summary.total + summary.other.total} />
          </strong>
        ) : (
          info
        )}
      </div>
      {infoOpen && (
        <Notice>
          Ya está incluido en «Gastado este mes»: pagar no cambia tu
          presupuesto.
        </Notice>
      )}

      <div className="due-summary__list">
        {summary.cards.map((card) => {
          const label = card.nextDue
            ? dueText(card.nextDue.daysLeft)
            : card.configured
              ? "Ciclo abierto"
              : "Falta configurar las fechas";
          return (
            <Row
              as="div"
              key={card.methodId}
              leading={<EmojiTile emoji={card.icon} color={card.color} />}
              title={card.name}
              detail={
                card.nextDue ? (
                  <DueLabel tone={dueTone(card.nextDue.daysLeft)}>
                    {label}
                  </DueLabel>
                ) : (
                  label
                )
              }
              amount={<Amount value={card.total} />}
              aside={
                card.nextDue ? formatDayMonth(card.nextDue.date) : undefined
              }
            />
          );
        })}

        {summary.other.count > 0 && (
          <Row
            to="/gastos?estado=por-pagar"
            leading={<EmojiTile emoji="🧾" color="var(--neutral-tile)" />}
            title="Otros métodos"
            detail={`${summary.other.count} ${summary.other.count === 1 ? "gasto pendiente" : "gastos pendientes"}`}
            amount={<Amount value={summary.other.total} />}
          />
        )}
      </div>

      {hasCards && (
        <Button block icon={anyClosed ? "check" : "card"} onClick={onPay}>
          {anyClosed ? "Pagar tarjeta" : "Ver tarjetas"}
        </Button>
      )}
    </section>
  );
}
