import { useState } from 'react';
import { ActionSheet } from '@/components/ui/ActionSheet';
import { IconButton } from '@/components/ui/Button';
import { Row } from '@/components/ui/Row';
import { SwipeRow } from '@/components/ui/SwipeRow';
import { describeSource } from '@/config/capture';
import { useLongPress } from '@/hooks/useLongPress';
import { formatDayHeading, formatTime, todayIso } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { formatCOP } from '@/lib/money';
import type { PendingCapture } from '@/types/models';

interface PendingRowProps {
  item: PendingCapture;
  onOpen: (id: string) => void;
  onDismiss: (id: string) => void;
  onReportSpam: (id: string) => void;
  /** La fila «asoma» el fondo de descartar para enseñar que se desliza (solo la primera de la lista). */
  hint?: boolean;
}

function whenLabel(ms: number): string {
  const date = new Date(ms);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  // Espacios duros: "6:49 a. m." y "sáb 19 sep" no deben partirse en dos líneas.
  const NBSP = '\u00a0';
  const day = formatDayHeading(todayIso(date)).replace(/ /g, NBSP);
  const time = formatTime(`${hh}:${mm}`).replace(/ /g, NBSP);
  return `${day} · ${time}`;
}

/**
 * Un gasto detectado que espera categoría. Tocar la fila lo abre; deslizarla a la izquierda lo descarta
 * (con confirmación, así un roce accidental no borra nada). El botón ⋮ —y mantener la fila presionada— abre un menú con
 * "Reportar como publicidad" y "Descartar", así no hace falta conocer los gestos. Para lector de pantalla y teclado
 * hay botones equivalentes.
 */
export function PendingRow({ item, onOpen, onDismiss, onReportSpam, hint }: PendingRowProps) {
  const title = item.merchant ?? 'Comercio sin identificar';
  const [menuOpen, setMenuOpen] = useState(false);
  const longPress = useLongPress({
    onLongPress: () => {
      setMenuOpen(true);
      void haptics.tap();
    },
  });

  return (
    <>
      <SwipeRow
        collapse
        hint={hint}
        swipeLeft={{
          label: 'Descartar',
          icon: 'trash',
          tone: 'danger',
          srLabel: `Descartar ${title}`,
          onCommit: () => onDismiss(item.id),
        }}
      >
        <Row
          className="pending-row__main"
          align="start"
          holdable
          onClick={() => onOpen(item.id)}
          aria-label={`${title}, ${formatCOP(item.amount)}. Categorizar`}
          {...longPress}
          title={title}
          amount={formatCOP(item.amount)}
        >
          <span className="row__detail">
            {describeSource(item.source)} · {whenLabel(item.occurredAt)}
          </span>
          <span className="row__detail row__detail--clamp">{item.rawText}</span>
        </Row>
        <IconButton
          className="pending-row__more"
          icon="more"
          label={`Más opciones de ${title}`}
          onClick={() => {
            setMenuOpen(true);
            void haptics.tap();
          }}
        />
      </SwipeRow>

      <ActionSheet
        open={menuOpen}
        title={title}
        onClose={() => setMenuOpen(false)}
        actions={[
          {
            icon: 'flag',
            label: 'Reportar como publicidad',
            detail: 'Ayuda a que mensajes parecidos dejen de aparecer aquí',
            onSelect: () => onReportSpam(item.id),
          },
          { icon: 'trash', label: 'Descartar', tone: 'danger', onSelect: () => onDismiss(item.id) },
        ]}
      />
    </>
  );
}
