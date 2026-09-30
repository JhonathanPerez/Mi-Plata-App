import { useEffect, useRef, type ReactNode } from 'react';
import { Drawer } from 'vaul';
import { pushBackHandler } from '@/lib/backStack';
import { Button, IconButton, type ButtonVariant } from './Button';
import type { IconName } from './Icon';

export interface SheetButton {
  label: string;
  onClick: () => void;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  /** Por defecto: `primary` en el botón principal; `ghost` (apilado) o `secondary` (lado a lado) en el secundario. */
  variant?: ButtonVariant;
}

export interface SheetActions {
  primary: SheetButton;
  secondary?: SheetButton;
  /** `stack`: botones anchos, el principal arriba. `split`: dos botones lado a lado, con el secundario a la izquierda. */
  layout?: 'stack' | 'split';
}

interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Botones estándar del pie de la hoja. Para un pie a medida, usa `footer`. */
  actions?: SheetActions;
  footer?: ReactNode;
}

function FooterButton({ button, fallback, big }: { button: SheetButton; fallback: ButtonVariant; big?: boolean }) {
  return (
    <Button
      variant={button.variant ?? fallback}
      size={big ? 'lg' : 'md'}
      block={big}
      icon={button.icon}
      loading={button.loading}
      disabled={button.disabled}
      onClick={button.onClick}
    >
      {button.label}
    </Button>
  );
}

function FooterActions({ primary, secondary, layout = 'stack' }: SheetActions) {
  if (layout === 'split') {
    return (
      <div className="dialog__actions">
        {secondary && <FooterButton button={secondary} fallback="secondary" />}
        <FooterButton button={primary} fallback="primary" />
      </div>
    );
  }
  return (
    <>
      <FooterButton button={primary} fallback="primary" big />
      {secondary && (
        <Button
          variant={secondary.variant ?? 'ghost'}
          block
          icon={secondary.icon}
          loading={secondary.loading}
          disabled={secondary.disabled}
          onClick={secondary.onClick}
        >
          {secondary.label}
        </Button>
      )}
    </>
  );
}

/**
 * Panel inferior modal para formularios cortos (Vaul): se arrastra hacia abajo para cerrarlo, con resistencia
 * y velocidad como en una app nativa, y se acomoda solo cuando aparece el teclado.
 */
export function Sheet({ open, title, onClose, children, actions, footer }: SheetProps) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // El botón Atrás de Android cierra el panel en vez de salir de la pantalla.
  useEffect(() => {
    if (!open) return undefined;
    return pushBackHandler(() => closeRef.current());
  }, [open]);

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) closeRef.current();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="sheet-backdrop" />
        <Drawer.Content className="sheet" aria-describedby={undefined}>
          <div className="sheet__grabber" aria-hidden="true" />
          <div className="sheet__header">
            <Drawer.Title className="sheet__title">{title}</Drawer.Title>
            <IconButton icon="close" label="Cerrar" onClick={onClose} />
          </div>
          <div className="sheet__body">{children}</div>
          {(actions || footer) && <div className="sheet__footer">{actions ? <FooterActions {...actions} /> : footer}</div>}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
