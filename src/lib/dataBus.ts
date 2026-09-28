/**
 * Bus mínimo de "los datos cambiaron". Los servicios lo notifican tras cada escritura y
 * los hooks de lectura (useQuery) vuelven a consultar. Sin estado global adicional.
 */
let version = 0;
const listeners = new Set<() => void>();

export function notifyDataChanged(): void {
  version += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeDataChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDataVersion(): number {
  return version;
}
