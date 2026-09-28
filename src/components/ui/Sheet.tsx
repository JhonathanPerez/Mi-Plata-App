import { useEffect, useRef, type ReactNode } from 'react';
import { Drawer } from 'vaul';
import { pushBackHandler } from '@/lib/backStack';
import { IconButton } from './Button';

interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Panel inferior modal para formularios cortos (Vaul): se arrastra hacia abajo para cerrarlo, con resistencia
 * y velocidad como en una app nativa, y se acomoda solo cuando aparece el teclado.
 */
export function Sheet({ open, title, onClose, children, footer }: SheetProps) {
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
          {footer && <div className="sheet__footer">{footer}</div>}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
