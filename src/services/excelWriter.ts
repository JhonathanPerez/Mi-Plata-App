/* eslint-disable @typescript-eslint/no-explicit-any */
import { APP_NAME } from '@/config/constants';
import type { ExportBreakdown, ExportData } from './exportData';

const PESO_FORMAT = '"$"#,##0';
const PERCENT_FORMAT = '0.0%';
const DATE_FORMAT = 'dd/mm/yyyy';
const BRAND = 'FF0B7A63';
const SOFT = 'FFE3EFEA';

function isoToExcelDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  // UTC medianoche: Excel guarda fechas sin zona horaria y así no se corre un día.
  return new Date(Date.UTC(year, month - 1, day));
}

function styleHeader(row: any): void {
  row.eachCell((cell: any) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });
  row.height = 22;
}

function buildExpensesSheet(workbook: any, data: ExportData): void {
  const sheet = workbook.addWorksheet('Gastos', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { key: 'date', width: 13 },
    { key: 'category', width: 20 },
    { key: 'note', width: 36 },
    { key: 'method', width: 20 },
    { key: 'amount', width: 16 },
    { key: 'status', width: 14 },
  ];

  const header = sheet.addRow(['Fecha', 'Categoría', 'Descripción', 'Método de pago', 'Valor', 'Estado']);
  styleHeader(header);
  header.getCell(5).alignment = { vertical: 'middle', horizontal: 'right' };

  for (const item of data.rows) {
    const row = sheet.addRow([isoToExcelDate(item.date), item.category, item.note, item.method, item.amount, item.status]);
    row.getCell(1).numFmt = DATE_FORMAT;
    row.getCell(1).alignment = { horizontal: 'left' };
    row.getCell(5).numFmt = PESO_FORMAT;
  }

  const lastDataRow = data.rows.length + 1;
  if (data.rows.length > 0) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: lastDataRow, column: 6 } };
    const totalRow = sheet.addRow(['Total', '', '', '', { formula: `SUM(E2:E${lastDataRow})`, result: data.summary.total }, '']);
    totalRow.font = { bold: true };
    totalRow.getCell(5).numFmt = PESO_FORMAT;
    totalRow.eachCell((cell: any) => {
      cell.border = { top: { style: 'thin', color: { argb: 'FF7A8F8A' } } };
    });
  }
}

function addBreakdownTable(sheet: any, title: string, firstHeader: string, items: ExportBreakdown[]): void {
  const titleRow = sheet.addRow([title]);
  titleRow.font = { bold: true, size: 12 };
  const header = sheet.addRow([firstHeader, 'Valor', '% del total', 'Transacciones']);
  styleHeader(header);
  for (const item of items) {
    const row = sheet.addRow([item.name, item.total, item.percent / 100, item.count]);
    row.getCell(2).numFmt = PESO_FORMAT;
    row.getCell(3).numFmt = PERCENT_FORMAT;
  }
  if (items.length === 0) sheet.addRow(['Sin datos en este periodo']);
  sheet.addRow([]);
}

function buildSummarySheet(workbook: any, data: ExportData): void {
  const sheet = workbook.addWorksheet('Resumen');
  sheet.columns = [{ width: 32 }, { width: 18 }, { width: 14 }, { width: 16 }];

  const title = sheet.addRow([`${APP_NAME} · Resumen de gastos`]);
  title.font = { bold: true, size: 15 };
  sheet.addRow([`Periodo: ${data.range.label}`]);
  sheet.addRow([]);

  const totalRow = sheet.addRow(['Total gastado', data.summary.total]);
  totalRow.getCell(2).numFmt = PESO_FORMAT;
  totalRow.font = { bold: true, size: 13 };
  totalRow.eachCell((cell: any) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } };
  });
  sheet.addRow(['Número de transacciones', data.summary.count]);
  const average = sheet.addRow(['Promedio diario', Math.round(data.summary.dailyAverage)]);
  average.getCell(2).numFmt = PESO_FORMAT;
  sheet.addRow([]);

  addBreakdownTable(sheet, 'Total por categoría', 'Categoría', data.summary.byCategory);
  addBreakdownTable(sheet, 'Total por método de pago', 'Método de pago', data.summary.byMethod);

  if (data.summary.byMonth.length > 0) {
    sheet.addRow(['Total por mes']).font = { bold: true, size: 12 };
    styleHeader(sheet.addRow(['Mes', 'Valor']));
    for (const month of data.summary.byMonth) {
      const row = sheet.addRow([month.label, month.total]);
      row.getCell(2).numFmt = PESO_FORMAT;
    }
  }
}

/** Genera el .xlsx (hojas "Gastos" y "Resumen"). Compatible con Excel y Google Sheets. */
export async function buildXlsxBytes(data: ExportData): Promise<Uint8Array> {
  const module: any = await import('exceljs/dist/exceljs.min.js');
  const ExcelJS = module.default ?? module;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = APP_NAME;
  workbook.created = new Date();

  buildExpensesSheet(workbook, data);
  buildSummarySheet(workbook, data);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
