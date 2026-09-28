/**
 * Pila de "cosas que el botón Atrás debe cerrar primero" (paneles, diálogos).
 * El último que se abrió es el primero que se cierra.
 */
type Handler = () => void;
const stack: Handler[] = [];

/** Registra un manejador; devuelve la función para quitarlo. */
export function pushBackHandler(handler: Handler): () => void {
  stack.push(handler);
  return () => {
    const index = stack.lastIndexOf(handler);
    if (index >= 0) stack.splice(index, 1);
  };
}

/** Ejecuta el manejador más reciente. Devuelve true si había uno (y Atrás ya quedó atendido). */
export function runTopBackHandler(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top();
  return true;
}
