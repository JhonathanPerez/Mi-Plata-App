import { errorMessage } from '@/lib/errors';
import { buildXlsxBytes } from './excelWriter';
import { buildExportData, type ExportRange } from './exportData';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface ExportResult {
  fileName: string;
  count: number;
  outcome: 'shared' | 'downloaded' | 'cancelled';
}

export const exportService = {
  /** Genera el archivo y abre el menú de guardar/compartir del teléfono. */
  async exportToExcel(range: ExportRange): Promise<ExportResult> {
    try {
      const data = await buildExportData(range);
      const bytes = await buildXlsxBytes(data);
      const fileName = `${range.fileBase}.xlsx`;
      const { saveAndShareFile } = await import('@/lib/fileIO');
      const outcome = await saveAndShareFile({ fileName, bytes, mimeType: XLSX_MIME, title: 'Exportar gastos' });
      return { fileName, count: data.rows.length, outcome };
    } catch (error) {
      throw new Error(`No se pudo crear el archivo de Excel. ${errorMessage(error)}`);
    }
  },
};
