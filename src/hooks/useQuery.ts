import { useEffect, useState, useSyncExternalStore } from 'react';
import { getDataVersion, subscribeDataChanged } from '@/lib/dataBus';

export function useDataVersion(): number {
  return useSyncExternalStore(subscribeDataChanged, getDataVersion, getDataVersion);
}

export interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
}

/**
 * Lee datos locales y se actualiza sola cuando cualquier servicio guarda cambios.
 * Mientras recarga conserva los datos anteriores (sin parpadeos).
 */
export function useQuery<T>(fetcher: () => Promise<T>, deps: readonly unknown[] = []): QueryState<T> {
  const version = useDataVersion();
  const [state, setState] = useState<QueryState<T>>({ data: undefined, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    fetcher()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState((prev) => ({
            data: prev.data,
            loading: false,
            error: error instanceof Error ? error : new Error(String(error)),
          }));
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);

  return state;
}
