import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@/hooks/useQuery';
import { HIDDEN_AMOUNT, HIDDEN_AMOUNT_COMPACT, formatCOP, formatCOPCompact } from '@/lib/money';
import { settingsService } from '@/services/settingsService';

interface PrivacyContextValue {
  /** true = los valores en pesos se muestran enmascarados. */
  hidden: boolean;
  toggle: () => void;
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

/**
 * Modo privacidad: un solo interruptor para toda la app (Inicio, Gastos y Estadísticas comparten el mismo ojito).
 * La preferencia se guarda en la base de datos local, así que se conserva al cerrar y volver a abrir la app.
 * Mientras se lee, los valores permanecen ocultos: nunca se "cuela" un monto durante el arranque.
 */
export function PrivacyProvider({ children }: { children: ReactNode }) {
  const stored = useQuery(() => settingsService.getHideAmounts());
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (stored.data !== undefined) setHidden(stored.data);
  }, [stored.data]);

  const toggle = useCallback(() => {
    const next = !hidden;
    setHidden(next);
    // Si no se pudo guardar, el cambio sigue valiendo en esta sesión.
    settingsService.setHideAmounts(next).catch(() => undefined);
  }, [hidden]);

  const value = useMemo(() => ({ hidden, toggle }), [hidden, toggle]);
  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy(): PrivacyContextValue {
  const context = useContext(PrivacyContext);
  if (!context) throw new Error('usePrivacy debe usarse dentro de PrivacyProvider');
  return context;
}

/** Formateadores que respetan el modo privacidad; para montos dentro de frases (texto plano). */
export function useAmountFormat() {
  const { hidden } = usePrivacy();
  return useMemo(
    () => ({
      hidden,
      cop: (value: number): string => (hidden ? HIDDEN_AMOUNT : formatCOP(value)),
      compact: (value: number): string => (hidden ? HIDDEN_AMOUNT_COMPACT : formatCOPCompact(value)),
    }),
    [hidden],
  );
}
