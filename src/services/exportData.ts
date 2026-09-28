import {
  diffDays,
  formatMonthTitle,
  formatNumericDate,
  isValidIsoDate,
  monthRange,
  todayIso,
  toYearMonth,
  yearRange,
} from '@/lib/dates';
import { percentOf } from '@/lib/money';
import { expenseRepository } from '@/repositories/expenseRepository';
import type { IsoDate, YearMonth } from '@/types/models';

export interface ExportRange {
  from: IsoDate;
  to: IsoDate;
  /** Texto legible del periodo (aparece en la hoja Resumen). */
  label: string;
  /** Nombre base del archivo, sin extensión. */
  fileBase: string;
}

export interface ExportRow {
  date: IsoDate;
  category: string;
  note: string;
  method: string;
  amount: number;
  /** 'Pagado' o 'Por pagar'. */
  status: string;
}

export interface ExportBreakdown {
  name: string;
  total: number;
  percent: number;
  count: number;
}

export interface ExportSummary {
  total: number;
  count: number;
  dailyAverage: number;
  byCategory: ExportBreakdown[];
  byMethod: ExportBreakdown[];
  /** Solo si el periodo abarca más de un mes. */
  byMonth: Array<{ label: string; total: number }>;
}

export interface ExportData {
  range: ExportRange;
  rows: ExportRow[];
  summary: ExportSummary;
}

export function rangeForMonth(yearMonth: YearMonth): ExportRange {
  return { ...monthRange(yearMonth), label: formatMonthTitle(yearMonth), fileBase: `MiPlata_${yearMonth}` };
}

export function rangeForYear(year: number): ExportRange {
  return { ...yearRange(year), label: `Año ${year}`, fileBase: `MiPlata_${year}` };
}

export function rangeForCustom(from: IsoDate, to: IsoDate): ExportRange {
  return {
    from,
    to,
    label: `${formatNumericDate(from)} al ${formatNumericDate(to)}`,
    fileBase: `MiPlata_${from}_a_${to}`,
  };
}

/** Devuelve un mensaje de error o null si el rango es válido. */
export function validateCustomRange(from: string, to: string): string | null {
  if (!from || !to) return 'Elige la fecha inicial y la final.';
  if (!isValidIsoDate(from) || !isValidIsoDate(to)) return 'Alguna de las fechas no es válida.';
  if (from > to) return 'La fecha inicial no puede ser posterior a la final.';
  return null;
}

export async function previewRange(range: ExportRange): Promise<{ count: number; total: number }> {
  const totals = await expenseRepository.sumBetween(range.from, range.to);
  return { count: totals.count, total: totals.total };
}

/** Reúne todo lo que necesita el archivo Excel. Es independiente de la librería de Excel. */
export async function buildExportData(range: ExportRange, now: Date = new Date()): Promise<ExportData> {
  const [expenses, totals, byCategory, byMethod, daily] = await Promise.all([
    expenseRepository.query({ from: range.from, to: range.to }),
    expenseRepository.sumBetween(range.from, range.to),
    expenseRepository.totalsByCategory(range.from, range.to),
    expenseRepository.totalsByMethod(range.from, range.to),
    expenseRepository.dailyTotals(range.from, range.to),
  ]);

  // La consulta viene de más reciente a más antigua; en Excel se lee mejor cronológico.
  const rows: ExportRow[] = [...expenses].reverse().map((e) => ({
    date: e.date,
    category: e.categoryName,
    note: e.note ?? '',
    method: e.paymentMethodName,
    amount: e.amount,
    status: e.paidAt ? 'Pagado' : 'Por pagar',
  }));

  const today = todayIso(now);
  const lastDay = range.to < today ? range.to : today;
  const days = Math.max(1, diffDays(range.from, lastDay) + 1);

  const monthTotals = new Map<YearMonth, number>();
  for (const day of daily) {
    const key = toYearMonth(day.date);
    monthTotals.set(key, (monthTotals.get(key) ?? 0) + day.total);
  }
  const byMonth =
    monthTotals.size > 1
      ? [...monthTotals.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, total]) => ({ label: formatMonthTitle(key), total }))
      : [];

  return {
    range,
    rows,
    summary: {
      total: totals.total,
      count: totals.count,
      dailyAverage: totals.total / days,
      byCategory: byCategory.map((c) => ({
        name: c.name,
        total: c.total,
        count: c.count,
        percent: percentOf(c.total, totals.total),
      })),
      byMethod: byMethod.map((m) => ({
        name: m.name,
        total: m.total,
        count: m.count,
        percent: percentOf(m.total, totals.total),
      })),
      byMonth,
    },
  };
}
