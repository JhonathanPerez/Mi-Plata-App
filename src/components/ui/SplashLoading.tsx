/** Spinner y texto de la pantalla de arranque. Lo comparten la carga de datos y la comprobación del bloqueo, para que se vean como una sola pantalla. */
export function SplashLoading() {
  return (
    <>
      <div className="splash__spinner" role="status" aria-label="Cargando" />
      <p className="splash__text">Organizando tus gastos…</p>
    </>
  );
}
