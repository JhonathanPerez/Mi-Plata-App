import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { useTheme } from '@/app/providers/ThemeProvider';
import { useToast } from '@/app/providers/ToastProvider';
import { BudgetSheet } from '@/components/expenses/BudgetSheet';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Row } from '@/components/ui/Row';
import { Segmented } from '@/components/ui/Segmented';
import { Toggle } from '@/components/ui/Toggle';
import { PendingReminderCard } from '@/components/cards/PendingReminderCard';
import { ReminderSettingsCard } from '@/components/cards/ReminderSettingsCard';
import { APP_AUTHOR, APP_NAME, APP_VERSION } from '@/config/constants';
import { useQuery } from '@/hooks/useQuery';
import { authenticate, getBiometricSupport, type BiometricSupport } from '@/lib/biometrics';
import { currentYearMonth } from '@/lib/dates';
import { normalizeLockDelay } from '@/lib/lockPolicy';
import { errorMessage } from '@/lib/errors';
import { formatCOP } from '@/lib/money';
import { pluralize } from '@/lib/text';
import { backupService, parseBackup } from '@/services/backupService';
import { budgetService } from '@/services/budgetService';
import { captureService } from '@/services/captureService';
import { importService } from '@/services/importService';
import { lockService } from '@/services/lockService';
import type { ThemeMode } from '@/types/models';

interface GroupProps {
  title: string;
  children: ReactNode;
  /** `true`: filas pegadas a los bordes de la tarjeta, con divisores. `false`: tarjeta con margen para controles. */
  flush?: boolean;
}

/** Una sección de Ajustes: un título y una sola tarjeta. */
function Group({ title, children, flush = true }: GroupProps) {
  return (
    <section className="section">
      <h2 className="section__title">{title}</h2>
      <div className={flush ? 'card card--flush' : 'card stack'}>{children}</div>
    </section>
  );
}

export function SettingsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { mode, setMode } = useTheme();
  const yearMonth = currentYearMonth();
  const { data: budget } = useQuery(() => budgetService.getAmount(yearMonth), [yearMonth]);
  const { data: lock } = useQuery(() => lockService.getConfig());
  const { data: pendingCount } = useQuery(() => captureService.countPending());
  const [support, setSupport] = useState<BiometricSupport | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getBiometricSupport().then(setSupport);
  }, []);

  const onToggleLock = async (next: boolean) => {
    if (support === 'web') {
      toast.show('El bloqueo funciona en la app instalada en el teléfono.', 'info');
      return;
    }
    if (next && support !== 'available') {
      toast.show('Primero configura una huella, un rostro o un PIN en los ajustes de tu teléfono.', 'error');
      return;
    }
    // Se confirma la identidad tanto para activar (prueba que funciona) como para desactivar (evita que otro lo apague).
    if (support === 'available') {
      const outcome = await authenticate(next ? 'Confirma para activar el bloqueo' : 'Confirma para desactivar el bloqueo');
      if (!outcome.ok) {
        if (!outcome.cancelled) toast.show(outcome.message, 'error');
        return;
      }
    }
    try {
      await lockService.setEnabled(next);
      toast.show(next ? 'Bloqueo activado' : 'Bloqueo desactivado');
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    }
  };

  const onImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy('Importando gastos…');
    try {
      const result = await importService.importFromXlsx(await file.arrayBuffer());
      const parts = [`Se importaron ${result.imported} ${pluralize(result.imported, 'gasto', 'gastos')}.`];
      if (result.duplicates > 0) parts.push(`${result.duplicates} ya existían.`);
      if (result.invalid > 0) parts.push(`${result.invalid} filas se omitieron por datos inválidos.`);
      toast.show(parts.join(' '), result.invalid > 0 ? 'info' : 'success');
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    } finally {
      setBusy(null);
    }
  };

  const onBackup = async () => {
    setBusy('Creando copia…');
    try {
      const result = await backupService.exportBackupFile();
      if (result.outcome === 'downloaded') toast.show(`Copia descargada: ${result.fileName}`);
      else if (result.outcome === 'shared') toast.show('Copia de seguridad lista');
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    } finally {
      setBusy(null);
    }
  };

  const onRestore = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const backup = parseBackup(text);
      const count = backup.data.expenses.length;
      const ok = await confirm({
        title: '¿Restaurar esta copia?',
        message: `Se reemplazarán TODOS tus datos actuales por los de la copia (${count} ${pluralize(count, 'gasto', 'gastos')}, creada el ${backup.exportedAt.slice(0, 10)}). Esta acción no se puede deshacer.`,
        confirmLabel: 'Restaurar',
        danger: true,
      });
      if (!ok) return;
      setBusy('Restaurando…');
      await backupService.restore(text);
      toast.show('Copia restaurada');
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page">
      <PageHeader title="Ajustes" />

      {/* 1 · Lo que defines una vez: presupuesto y cómo se organizan tus gastos. La flecha «›» marca lo que abre otra pantalla u hoja. */}
      <Group title="Presupuesto y organización">
        <Row
          icon="target"
          title="Presupuesto mensual"
          detail={budget && budget > 0 ? formatCOP(budget) : 'Sin definir'}
          chevron="chevronRight"
          onClick={() => setBudgetOpen(true)}
        />
        <Row to="/ajustes/categorias" icon="tag" title="Categorías" detail="Crear y editar" chevron="chevronRight" />
        <Row to="/ajustes/metodos" icon="card" title="Métodos de pago" detail="Efectivo y tarjetas" chevron="chevronRight" />
        <Row to="/tarjetas" icon="calendar" title="Tarjetas y extractos" detail="Cortes, pagos y qué debes" chevron="chevronRight" />
      </Group>

      {/* 2 · Seguridad */}
      <Group title="Seguridad" flush={false}>
        <Toggle
          checked={lock?.enabled ?? true}
          onChange={(next) => void onToggleLock(next)}
          label="Bloqueo con huella o rostro"
          hint={
            support === 'none'
              ? 'Tu teléfono no tiene huella, rostro ni PIN configurado: no se puede proteger la app.'
              : 'Se pide al abrir la app. Si falla el sensor, usas el PIN del teléfono.'
          }
        />
        {lock?.enabled && support !== 'none' && (
          <div className="field">
            <span className="field__label">Volver a pedirlo</span>
            <Segmented<string>
              label="Cuándo volver a pedir el bloqueo"
              value={String(lock.delaySeconds)}
              onChange={(value) => void lockService.setDelay(normalizeLockDelay(value))}
              options={[
                { value: '0', label: 'Siempre' },
                { value: '60', label: '1 min' },
                { value: '300', label: '5 min' },
              ]}
            />
            <p className="field__hint">«Siempre» lo pide cada vez que vuelves a la app; con un tiempo, solo si pasó más de eso.</p>
          </div>
        )}
      </Group>

      {/* 3 · Captura y avisos: de dónde llegan los gastos y cuándo te avisa el teléfono, todo en una tarjeta con divisores. */}
      <Group title="Captura y avisos">
        <Row
          to="/pendientes"
          icon="inbox"
          title="Por categorizar"
          detail={pendingCount ? `${pendingCount} ${pluralize(pendingCount, 'pendiente', 'pendientes')}` : 'Ninguno por ahora'}
          chevron="chevronRight"
        />
        <Row
          to="/ajustes/captura"
          icon="bell"
          title="Notificaciones y SMS del banco"
          detail="Detectar compras automáticamente"
          chevron="chevronRight"
        />
        <ReminderSettingsCard />
        <PendingReminderCard />
      </Group>

      {/* 4 · Apariencia */}
      <Group title="Apariencia" flush={false}>
        <div className="setting-theme">
          <Icon name="moon" size={22} />
          <span>Tema</span>
        </div>
        <Segmented<ThemeMode>
          label="Tema de la aplicación"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'system', label: 'Sistema' },
            { value: 'light', label: 'Claro' },
            { value: 'dark', label: 'Oscuro' },
          ]}
        />
      </Group>

      {/* 5 · Datos y Acerca de. Importar, copia y restaurar abren el selector de archivos, por eso no llevan flecha. */}
      <section className="section">
        <h2 className="section__title">Datos y acerca de</h2>
        <div className="card card--flush">
          <Row to="/ajustes/exportar" icon="download" title="Exportar a Excel" detail="Por mes, año o rango de fechas" chevron="chevronRight" />
          <Row
            icon="upload"
            title="Importar desde Excel"
            detail="Desde un archivo .xlsx"
            onClick={() => importRef.current?.click()}
            disabled={busy !== null}
          />
          <Row icon="save" title="Crear copia de seguridad" detail="Un archivo para guardar o compartir" onClick={() => void onBackup()} disabled={busy !== null} />
          <Row
            icon="refresh"
            title="Restaurar copia de seguridad"
            detail="Reemplaza todos tus datos actuales"
            tone="danger"
            onClick={() => restoreRef.current?.click()}
            disabled={busy !== null}
          />
        </div>
        <p className="section__hint">Para importar, el Excel necesita las columnas Fecha, Categoría, Descripción, Método y Valor. Estado es opcional.</p>

        <div className="card about">
          <p className="about__name">
            {APP_NAME} <span className="muted">v{APP_VERSION}</span>
          </p>
          <p className="about__line">
            <Icon name="user" size={18} />
            <span>Desarrollado por {APP_AUTHOR}</span>
          </p>
          <p className="about__line">
            <Icon name="shield" size={18} />
            <span>Tus datos viven solo en este teléfono y la app funciona sin Internet. No pedimos claves ni números de tarjeta.</span>
          </p>
        </div>
      </section>

      <input
        ref={importRef}
        type="file"
        hidden
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={onImport}
      />
      <input ref={restoreRef} type="file" hidden accept=".json,application/json" onChange={onRestore} />

      {busy && (
        <div className="busy" role="status">
          {busy}
        </div>
      )}

      <BudgetSheet open={budgetOpen} onClose={() => setBudgetOpen(false)} yearMonth={yearMonth} currentAmount={budget ?? 0} />
    </div>
  );
}
