import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";

interface StatProps extends Pick<
  HTMLAttributes<HTMLElement>,
  "aria-label" | "aria-live"
> {
  label: ReactNode;
  /** La cifra (o el texto) destacado. */
  value: ReactNode;
  /** Pieza pequeña a la izquierda del valor (por ejemplo un `EmojiTile`); el valor pasa a tipografía de texto. */
  leading?: ReactNode;
  /** Línea opcional bajo el valor. */
  foot?: ReactNode;
  /** Contenido extra bajo el pie (una comparación, una ayuda…). */
  children?: ReactNode;
  /** `card`: sobre una tarjeta · `hero`: sobre el fondo verde (Inicio, Pagar tarjeta). */
  tone?: "card" | "hero";
  /** `sm` para cuadrículas de dos columnas · `md` (32 px) por defecto · `lg` (44 px) solo para la cifra principal de Inicio. */
  size?: "sm" | "md" | "lg";
  as?: "div" | "section";
  className?: string;
}

/** Cifra destacada con etiqueta: es el único sitio donde vive ese patrón (Inicio, Estadísticas, Pagar y Exportar). */
export function Stat({
  label,
  value,
  leading,
  foot,
  children,
  tone = "card",
  size = "md",
  as: Tag = "div",
  className,
  ...rest
}: StatProps) {
  return (
    <Tag
      className={cx(
        "stat",
        `stat--${tone}`,
        `stat--${size}`,
        tone === "card" && "card",
        className,
      )}
      {...rest}
    >
      <span className="stat__label">{label}</span>
      <span
        className={cx(
          "stat__value",
          Boolean(leading) && "stat__value--with-icon",
        )}
      >
        {leading}
        {leading ? <span>{value}</span> : value}
      </span>
      {foot && <span className="stat__foot">{foot}</span>}
      {children}
    </Tag>
  );
}
