import { Icon, type IconName } from './Icon';
import { Row } from './Row';
import { Sheet } from './Sheet';

export interface SheetAction {
  icon: IconName;
  label: string;
  /** Línea secundaria que explica la acción. */
  detail?: string;
  tone?: 'default' | 'danger';
  onSelect: () => void;
}

interface ActionSheetProps {
  open: boolean;
  title: string;
  actions: SheetAction[];
  onClose: () => void;
}

/** Menú en una hoja inferior: una lista de acciones. Al elegir una, la hoja se cierra y luego se ejecuta. */
export function ActionSheet({ open, title, actions, onClose }: ActionSheetProps) {
  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <div className="stack">
        {actions.map((action) => (
          <Row
            key={action.label}
            variant="flush"
            tone={action.tone}
            leading={<Icon name={action.icon} size={20} />}
            title={action.label}
            detail={action.detail}
            onClick={() => {
              onClose();
              action.onSelect();
            }}
          />
        ))}
      </div>
    </Sheet>
  );
}
