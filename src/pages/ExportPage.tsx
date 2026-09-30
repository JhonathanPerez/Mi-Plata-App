import { useState } from "react";
import { useToast } from "@/app/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { DateField } from "@/components/ui/DateField";
import { Field } from "@/components/ui/Field";
import { MonthNavigator } from "@/components/ui/MonthNavigator";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segmented } from "@/components/ui/Segmented";
import { Stat } from "@/components/ui/Stat";
import { Stepper } from "@/components/ui/Stepper";
import { useQuery } from "@/hooks/useQuery";
import { currentYearMonth, todayIso } from "@/lib/dates";
import { errorMessage } from "@/lib/errors";
import { formatCOP } from "@/lib/money";
import { pluralize } from "@/lib/text";
import { exportService } from "@/services/exportService";
import {
  previewRange,
  rangeForCustom,
  rangeForMonth,
  rangeForYear,
  validateCustomRange,
  type ExportRange,
} from "@/services/exportData";
import type { YearMonth } from "@/types/models";

type Mode = "month" | "year" | "range";

export function ExportPage() {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("month");
  const [yearMonth, setYearMonth] = useState<YearMonth>(currentYearMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(todayIso());
  const [exporting, setExporting] = useState(false);

  const rangeError = mode === "range" ? validateCustomRange(from, to) : null;
  const range: ExportRange | null =
    mode === "month"
      ? rangeForMonth(yearMonth)
      : mode === "year"
        ? rangeForYear(year)
        : rangeError
          ? null
          : rangeForCustom(from, to);

  const { data: preview } = useQuery(
    async () => (range ? previewRange(range) : { count: 0, total: 0 }),
    [range?.from, range?.to],
  );

  const doExport = async () => {
    if (!range) return;
    setExporting(true);
    try {
      const result = await exportService.exportToExcel(range);
      if (result.outcome === "downloaded")
        toast.show(`Archivo descargado: ${result.fileName}`);
      else if (result.outcome === "shared")
        toast.show("Archivo de Excel listo");
    } catch (error) {
      toast.show(errorMessage(error), "error");
    } finally {
      setExporting(false);
    }
  };

  const count = preview?.count ?? 0;

  return (
    <div className="page">
      <PageHeader title="Exportar a Excel" back />

      <Field label="¿Qué periodo quieres exportar?">
        <Segmented<Mode>
          label="Periodo a exportar"
          value={mode}
          onChange={setMode}
          options={[
            { value: "month", label: "Mes" },
            { value: "year", label: "Año" },
            { value: "range", label: "Rango" },
          ]}
        />
      </Field>

      {mode === "month" && (
        <MonthNavigator value={yearMonth} onChange={setYearMonth} />
      )}
      {mode === "year" && (
        <Stepper
          label={String(year)}
          prevLabel="Año anterior"
          nextLabel="Año siguiente"
          onPrev={() => setYear(year - 1)}
          onNext={() => setYear(year + 1)}
        />
      )}
      {mode === "range" && (
        <div className="inline inline--start">
          <DateField label="Desde" value={from} onChange={setFrom} />
          <DateField label="Hasta" value={to} onChange={setTo} />
        </div>
      )}
      {rangeError && (
        <p className="field__error" role="alert">
          {rangeError}
        </p>
      )}

      <Stat
        as="section"
        aria-live="polite"
        label="El archivo incluirá"
        value={`${count} ${pluralize(count, "gasto", "gastos")}`}
        foot={`Total: ${formatCOP(preview?.total ?? 0)}`}
      >
        <p className="field__hint">
          Hojas: <strong>Gastos</strong> (Fecha, Categoría, Descripción, Método
          de pago, Valor, Estado) y <strong>Resumen</strong> (totales por
          categoría y método).
        </p>
      </Stat>

      <Button
        size="lg"
        block
        icon="download"
        loading={exporting}
        disabled={!range || count === 0}
        onClick={doExport}
      >
        Exportar a Excel
      </Button>
      {range && count === 0 && (
        <p className="field__hint">
          No hay gastos en este periodo para exportar.
        </p>
      )}
      <p className="field__hint">
        Se abrirá el menú del teléfono para guardar el archivo en Drive/Archivos
        o compartirlo.
      </p>
    </div>
  );
}
