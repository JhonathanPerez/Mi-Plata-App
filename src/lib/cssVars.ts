import type { CSSProperties } from 'react';

/** Variables CSS personalizadas (`--nombre`) mezcladas con las propiedades normales de `style`. */
type CssVars = CSSProperties & Record<`--${string}`, string | number>;

/**
 * Pasa valores que solo se conocen en ejecución (el color de una categoría, un porcentaje) al CSS
 * como variables. Así el aspecto vive en la hoja de estilos y el componente solo aporta el dato.
 */
export function cssVars(vars: CssVars): CSSProperties {
  return vars;
}
