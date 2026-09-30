import { useEffect, useRef, useState, type ChangeEvent, type ComponentProps, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
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

/** Fila de ajustes: la fila genérica con su ícono y una flecha al final. */
function SettingsRow(props: Omit<ComponentProps<typeof Row>, 'chevron'>) {
  return <Row chevron="chevronRight" {...props} />;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section">
      <h2 className="section__title">{title}</h2>
      <div className="card card--flush">{children}</div>
    </section>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
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
      <PageHeader title="Configuración" />

      <Group title="Presupuesto">
        <SettingsRow
          icon="target"
          title="Presupuesto mensual"
          detail={budget && budget > 0 ? formatCOP(budget) : 'Sin definir'}
          onClick={() => setBudgetOpen(true)}
        />
      </Group>

      <Group title="Organizar">
        <SettingsRow icon="tag" title="Categorías" detail="Crear y editar" onClick={() => navigate('/ajustes/categorias')} />
        <SettingsRow icon="card" title="Métodos de pago" detail="Efectivo y tarjetas" onClick={() => navigate('/ajustes/metodos')} />
        <SettingsRow icon="calendar" title="Tarjetas y extractos" detail="Cortes, pagos y qué debes" onClick={() => navigate('/tarjetas')} />
      </Group>

      <section className="section">
        <h2 className="section__title">Seguridad</h2>
        <div className="card stack">
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
            <>
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
              <p className="field__hint">
                «Siempre» lo pide cada vez que sales de la app y regresas. Con un tiempo, no lo pide si vuelves antes.
              </p>
            </>
          )}
        </div>
      </section>

      <Group title="Captura automática">
        <SettingsRow
          icon="inbox"
          title="Gastos por categorizar"
          detail={pendingCount ? `${pendingCount} ${pluralize(pendingCount, 'pendiente', 'pendientes')}` : 'Ninguno por ahora'}
          onClick={() => navigate('/pendientes')}
        />
        <SettingsRow
          icon="bell"
          title="Notificaciones y SMS del banco"
          detail="Detectar compras automáticamente"
          onClick={() => navigate('/ajustes/captura')}
        />
      </Group>

      <section className="section">
        <h2 className="section__title">Avisos de pago</h2>
        <ReminderSettingsCard />
      </section>

      <section className="section">
        <h2 className="section__title">Gastos por categorizar</h2>
        <PendingReminderCard />
      </section>

      <section className="section">
        <h2 className="section__title">Apariencia</h2>
        <div className="card">
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
        </div>
      </section>

      <Group title="Tus datos">
        <SettingsRow icon="download" title="Exportar a Excel" detail="Por mes, año o rango de fechas" onClick={() => navigate('/ajustes/exportar')} />
        <SettingsRow icon="upload" title="Importar desde Excel" detail="Columnas: Fecha, Categoría, Descripción, Método, Valor (y Estado, opcional)" onClick={() => importRef.current?.click()} disabled={busy !== null} />
        <SettingsRow icon="save" title="Crear copia de seguridad" detail="Archivo completo para guardar o compartir" onClick={onBackup} disabled={busy !== null} />
        <SettingsRow icon="refresh" title="Restaurar copia de seguridad" detail="Reemplaza todos los datos actuales" onClick={() => restoreRef.current?.click()} disabled={busy !== null} />
      </Group>

      <input
        ref={importRef}
        type="file"
        hidden
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={onImport}
      />
      <input ref={restoreRef} type="file" hidden accept=".json,application/json" onChange={onRestore} />

      <section className="section">
        <h2 className="section__title">Acerca de</h2>
        <div className="card about">
          <p className="about__name">
            {APP_NAME} <span className="muted">v{APP_VERSION}</span>
          </p>
          <p className="about__line">
            <Icon name="edit" size={18} />
            <span>Desarrollado por {APP_AUTHOR}</span>
          </p>
          <p className="about__line">
            <Icon name="shield" size={18} />
            <span>Tus datos se guardan solo en este teléfono y la app funciona sin Internet.</span>
          </p>
          <p className="about__line">
            <Icon name="info" size={18} />
            <span>
              No pedimos claves ni acceso a tus cuentas bancarias, ni guardamos números de tarjeta (solo los últimos 4
              dígitos). Si activas la captura automática, la app lee las notificaciones y SMS de tus bancos, solo en este
              teléfono.
            </span>
          </p>
        </div>
      </section>

      {busy && (
        <div className="busy" role="status">
          {busy}
        </div>
      )}

      <BudgetSheet open={budgetOpen} onClose={() => setBudgetOpen(false)} yearMonth={yearMonth} currentAmount={budget ?? 0} />
    </div>
  );
}
