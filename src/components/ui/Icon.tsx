import {
  ArrowDown,
  ArrowLeft,
  ArrowCircleUp,
  ArrowUp,
  ArrowsClockwise,
  Bell,
  BellRinging,
  CalendarBlank,
  CaretLeft,
  CaretRight,
  ChartBar,
  Check,
  ClockCountdown,
  CreditCard,
  DeviceMobile,
  DotsThreeVertical,
  DownloadSimple,
  Eye,
  EyeSlash,
  Flag,
  FloppyDisk,
  Funnel,
  House,
  Info,
  ListBullets,
  Lock,
  MagnifyingGlass,
  Moon,
  PencilSimple,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  SquaresFour,
  Tag,
  Target,
  Trash,
  Tray,
  UploadSimple,
  User,
  Warning,
  X,
  type Icon as PhosphorIcon,
  type IconWeight,
} from '@phosphor-icons/react';

export type IconName =
  | 'home' | 'list' | 'chart' | 'sliders' | 'plus' | 'back' | 'close' | 'chevronRight' | 'chevronLeft'
  | 'check' | 'trash' | 'edit' | 'search' | 'filter' | 'calendar' | 'download' | 'upload' | 'warning'
  | 'arrowUp' | 'arrowDown' | 'shield' | 'info' | 'moon' | 'tag' | 'card' | 'target' | 'refresh' | 'save'
  | 'lock' | 'bell' | 'bellRinging' | 'clockCountdown' | 'inbox' | 'apps' | 'phone' | 'eye' | 'eyeOff' | 'flag' | 'user' | 'more' | 'update';

/**
 * Íconos Phosphor. Los de "contenido" (casa, tarjeta, campana…) van en duotono, con un tono suave de relleno;
 * los de "control" (flechas, cerrar, más…) van en trazo grueso para que se lean bien en tamaños pequeños.
 */
const ICONS: Record<IconName, { Component: PhosphorIcon; weight: IconWeight }> = {
  home: { Component: House, weight: 'duotone' },
  list: { Component: ListBullets, weight: 'bold' },
  chart: { Component: ChartBar, weight: 'duotone' },
  sliders: { Component: SlidersHorizontal, weight: 'duotone' },
  plus: { Component: Plus, weight: 'bold' },
  back: { Component: ArrowLeft, weight: 'bold' },
  close: { Component: X, weight: 'bold' },
  chevronRight: { Component: CaretRight, weight: 'bold' },
  chevronLeft: { Component: CaretLeft, weight: 'bold' },
  check: { Component: Check, weight: 'bold' },
  trash: { Component: Trash, weight: 'duotone' },
  edit: { Component: PencilSimple, weight: 'duotone' },
  search: { Component: MagnifyingGlass, weight: 'bold' },
  filter: { Component: Funnel, weight: 'duotone' },
  calendar: { Component: CalendarBlank, weight: 'duotone' },
  download: { Component: DownloadSimple, weight: 'bold' },
  upload: { Component: UploadSimple, weight: 'bold' },
  warning: { Component: Warning, weight: 'duotone' },
  arrowUp: { Component: ArrowUp, weight: 'bold' },
  arrowDown: { Component: ArrowDown, weight: 'bold' },
  shield: { Component: ShieldCheck, weight: 'duotone' },
  info: { Component: Info, weight: 'duotone' },
  moon: { Component: Moon, weight: 'duotone' },
  tag: { Component: Tag, weight: 'duotone' },
  card: { Component: CreditCard, weight: 'duotone' },
  target: { Component: Target, weight: 'duotone' },
  refresh: { Component: ArrowsClockwise, weight: 'bold' },
  save: { Component: FloppyDisk, weight: 'duotone' },
  lock: { Component: Lock, weight: 'duotone' },
  bell: { Component: Bell, weight: 'duotone' },
  bellRinging: { Component: BellRinging, weight: 'duotone' },
  clockCountdown: { Component: ClockCountdown, weight: 'duotone' },
  inbox: { Component: Tray, weight: 'duotone' },
  apps: { Component: SquaresFour, weight: 'duotone' },
  phone: { Component: DeviceMobile, weight: 'duotone' },
  eye: { Component: Eye, weight: 'duotone' },
  eyeOff: { Component: EyeSlash, weight: 'duotone' },
  flag: { Component: Flag, weight: 'duotone' },
  user: { Component: User, weight: 'duotone' },
  more: { Component: DotsThreeVertical, weight: 'bold' },
  update: { Component: ArrowCircleUp, weight: 'duotone' },
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  /** Sobrescribe el grosor por defecto (por ejemplo 'fill' para el ítem activo de la barra). */
  weight?: IconWeight;
}

export function Icon({ name, size = 24, className, weight }: IconProps) {
  const { Component, weight: defaultWeight } = ICONS[name];
  return <Component className={className} size={size} weight={weight ?? defaultWeight} aria-hidden="true" focusable="false" />;
}
