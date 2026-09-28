import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '@/components/ui/Icon';

type ToastKind = 'success' | 'error' | 'info';

interface ToastState {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastApi {
  show: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, kind: ToastKind = 'success') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), message, kind });
    timer.current = setTimeout(() => setToast(null), kind === 'error' ? 5000 : 2800);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              className={`toast toast--${toast.kind}`}
              initial={{ opacity: 0, y: 18, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 520, damping: 34 }}
            >
              <Icon name={toast.kind === 'error' ? 'warning' : toast.kind === 'info' ? 'info' : 'check'} size={20} />
              <span>{toast.message}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast debe usarse dentro de ToastProvider');
  return context;
}
