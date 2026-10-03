import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { pushBackHandler } from '@/lib/backStack';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setOptions(null);
  };

  const closeRef = useRef(close);
  closeRef.current = close;
  const isOpen = options !== null;
  useEffect(() => {
    if (!isOpen) return undefined;
    return pushBackHandler(() => closeRef.current(false));
  }, [isOpen]);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {options &&
        createPortal(
          <div className="dialog-root">
            <div className="dialog-backdrop" onClick={() => close(false)} />
            <div className="dialog" role="alertdialog" aria-modal="true" aria-label={options.title}>
              <h2 className="dialog__title">{options.title}</h2>
              <p className="dialog__text">{options.message}</p>
              <div className="dialog__actions">
                <Button variant={options.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
                  {options.confirmLabel ?? 'Confirmar'}
                </Button>
                <Button variant="secondary" onClick={() => close(false)}>
                  {options.cancelLabel ?? 'Cancelar'}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm debe usarse dentro de ConfirmProvider');
  return context;
}
