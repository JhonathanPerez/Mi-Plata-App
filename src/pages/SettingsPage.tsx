import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { useTheme } from '@/app/providers/ThemeProvider';
import { useToast } from '@/app/providers/ToastProvider';
import { useUpdate } from '@/app/providers/UpdateProvider';
import { BudgetSheet } from '@/components/expenses/BudgetSheet';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Row } from '@/components/ui/Row';
import { Segmented } from '@/components/ui/Segmented';
import { useReminderStatus } from '@/components/cards/useReminderStatus';
import { APP_AUTHOR, APP_NAME, APP_VERSION } from '@/config/constants';
import { useCaptureAccess } from '@/hooks/useCaptureAccess';
import { useQuery } from '@/hooks/useQuery';
import { currentYearMonth } from '@/lib/dates';
import { describeLockDelay } from '@/lib/lockPolicy';
import { formatInterval } from '@/lib/pendingReminders';
import { HOUR_LABELS } from '@/lib/reminders';
import { errorMessage } from '@/lib/errors';
import { formatCOP } from '@/lib/money';
import { pluralize } from '@/lib/text';
import { backupService, parseBackup } from '@/services/backupService';
import { budgetService } from '@/services/budgetService';
import { captureAppsService } from '@/services/captureAppsService';
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

/** Línea de estado de «Activar notificaciones»: si Mi Plata puede leer las notificaciones del banco. */
function captureAccessDetail({ supported, enabled }: ReturnType<typeof useCaptureAccess>): string | undefined {
  if (!supported) return 'Solo en el teléfono';
  if (enabled === null) return undefined;
  return enabled ? 'Activadas' : 'Desactivadas';
}

/** Línea de estado de «Avisos de pago»: lo que está activo, o por qué no lo está. */
function paymentRemindersDetail({ active, supported, settings }: ReturnType<typeof useReminderStatus>): string {
  if (active && settings) {
    return `Activados · ${HOUR_LABELS[settings.hour]}`;
  }
  return settings?.enabled && supported ? 'Falta el permiso' : 'Desactivados';
}

/** Línea de estado de «Recordatorio de pendientes». */
function pendingRemindersDetail({ pendingActive, supported, pendingSettings }: ReturnType<typeof useReminderStatus>): string {
  if (pendingActive && pendingSettings) return `Activado · cada ${formatInterval(pendingSettings.intervalMinutes)}`;
  return pendingSettings?.enabled && supported ? 'Falta el permiso' : 'Desactivado';
}

/** Línea de estado de «Comprobar actualizaciones»: la versión instalada, o que ya hay una nueva. */
function updateDetail({ supported, checking, available }: ReturnType<typeof useUpdate>): string {
  if (!supported) return 'Solo en el teléfono';
  if (checking) return 'Comprobando…';
  if (available) return `Hay una versión nueva: v${available.version}`;
  return `Versión instalada: v${APP_VERSION}`;
}

export function SettingsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { mode, setMode } = useTheme();
  const yearMonth = currentYearMonth();
  const { data: budget } = useQuery(() => budgetService.getAmount(yearMonth), [yearMonth]);
  const { data: lock } = useQuery(() => lockService.getConfig());
  const { data: pendingCount } = useQuery(() => captureService.countPending());
  const { data: trackedApps } = useQuery(() => captureAppsService.getSelected());
  const reminders = useReminderStatus();
  const captureAccess = useCaptureAccess();
  const update = useUpdate();
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);

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

      {/* 2 · Seguridad: el bloqueo se configura en su propia pantalla. */}
      <Group title="Seguridad">
        <Row
          to="/ajustes/bloqueo"
          icon="lock"
          title="Bloqueo con huella o rostro"
          detail={lock ? (lock.enabled ? `Activado · ${describeLockDelay(lock.delaySeconds)}` : 'Desactivado') : undefined}
          chevron="chevronRight"
        />
      </Group>

      {/* 3 · Seguimiento de apps: de qué apps se leen las compras y dónde caen. El permiso para leer notificaciones va aparte, en «Notificaciones». */}
      <Group title="Seguimiento de apps">
        <Row
          to="/ajustes/apps"
          icon="apps"
          title="Apps que se siguen"
          detail={trackedApps ? `${trackedApps.length} ${pluralize(trackedApps.length, 'app', 'apps')}` : undefined}
          chevron="chevronRight"
        />
        <Row
          to="/pendientes"
          icon="inbox"
          title="Por categorizar"
          detail={pendingCount ? `${pendingCount} ${pluralize(pendingCount, 'pendiente', 'pendientes')}` : 'Ninguno por ahora'}
          chevron="chevronRight"
        />
      </Group>

      {/* 4 · Notificaciones: el permiso para leer las del banco y lo que te avisa el teléfono. Cada cosa se configura en su propia pantalla. */}
      <Group title="Notificaciones">
        <Row
          to="/ajustes/captura"
          icon="bell"
          title="Activar notificaciones"
          detail={captureAccessDetail(captureAccess)}
          chevron="chevronRight"
        />
        <Row
          to="/ajustes/avisos-pago"
          icon="bellRinging"
          title="Avisos de pago"
          detail={paymentRemindersDetail(reminders)}
          chevron="chevronRight"
        />
        <Row
          to="/ajustes/recordatorio-pendientes"
          icon="clockCountdown"
          title="Recordatorio de pendientes"
          detail={pendingRemindersDetail(reminders)}
          chevron="chevronRight"
        />
      </Group>

      {/* 5 · Apariencia */}
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

      {/* 6 · Datos y Acerca de. Importar, copia y restaurar abren el selector de archivos, y «Comprobar actualizaciones» un diálogo: por eso no llevan flecha. */}
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
          <Row icon="save" title="Crear copia de seguridad" detail="Para guardar o compartir" onClick={() => void onBackup()} disabled={busy !== null} />
          <Row
            icon="refresh"
            title="Restaurar copia de seguridad"
            detail="Reemplaza todos tus datos"
            tone="danger"
            onClick={() => restoreRef.current?.click()}
            disabled={busy !== null}
          />
          <Row
            icon="update"
            title="Comprobar actualizaciones"
            detail={updateDetail(update)}
            onClick={() => void update.checkNow()}
            disabled={!update.supported || update.checking}
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
            <span>Tus datos viven solo en este teléfono y la app funciona sin Internet; solo consulta GitHub para buscar versiones nuevas, sin enviar tus datos. No pedimos claves ni números de tarjeta.</span>
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
