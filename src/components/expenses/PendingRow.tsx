import { useState } from 'react';
import { usePrivacy } from '@/app/providers/PrivacyProvider';
import { ActionSheet } from '@/components/ui/ActionSheet';
import { IconButton } from '@/components/ui/Button';
import { Amount } from '@/components/ui/Money';
import { Row } from '@/components/ui/Row';
import { SwipeRow } from '@/components/ui/SwipeRow';
import { describeSource } from '@/config/capture';
import { useLongPress } from '@/hooks/useLongPress';
import { formatTime } from '@/lib/dates';
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

/** Hora del mensaje ("8:27 p. m."), con espacios duros para que no se parta en dos renglones. El día lo da el grupo de la lista. */
function timeLabel(ms: number): string {
  const date = new Date(ms);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return formatTime(`${hh}:${mm}`).replace(/ /g, '\u00a0');
}

/**
 * Un gasto detectado que espera categoría. Tocar la fila lo abre; deslizarla a la izquierda lo descarta
 * (con confirmación, así un roce accidental no borra nada). El botón ⋮ —y mantener la fila presionada— abre un menú con
 * "Reportar como publicidad" y "Descartar", así no hace falta conocer los gestos.
 */
export function PendingRow({ item, onOpen, onDismiss, onReportSpam, hint }: PendingRowProps) {
  const { hidden } = usePrivacy();
  const title = item.merchant ?? 'Comercio sin identificar';
  const [menuOpen, setMenuOpen] = useState(false);
  const openMenu = () => {
    setMenuOpen(true);
    void haptics.tap();
  };
  const longPress = useLongPress({ onLongPress: openMenu });

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
          className="row--compact pending-row__main"
          holdable
          onClick={() => onOpen(item.id)}
          aria-label={`${title}${hidden ? '' : `, ${formatCOP(item.amount)}`}. Categorizar`}
          {...longPress}
          icon="tag"
          title={title}
          amount={<Amount value={item.amount} />}
        >
          <span className="row__detail row__detail--truncate">
            {describeSource(item.source)} · {timeLabel(item.occurredAt)}
          </span>
          <span className="row__detail row__detail--truncate">{item.rawText}</span>
        </Row>
        <IconButton className="pending-row__more" icon="more" label={`Más opciones de ${title}`} onClick={openMenu} />
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
