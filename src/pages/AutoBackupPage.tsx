import { useEffect, useState } from 'react';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { useToast } from '@/app/providers/ToastProvider';
import { BackupPasswordSheet } from '@/components/backup/BackupPasswordSheet';
import { ActionSheet } from '@/components/ui/ActionSheet';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { ManagedListSkeleton } from '@/components/ui/ManagedListSkeleton';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { Row } from '@/components/ui/Row';
import { Segmented } from '@/components/ui/Segmented';
import { AUTO_BACKUP_KEEP } from '@/config/constants';
import { useQuery } from '@/hooks/useQuery';
import { formatBytes } from '@/lib/appUpdate';
import { AUTO_BACKUP_OPTIONS, DEFAULT_AUTO_BACKUP_TIME, describeCloudLag, describeNextBackup, type AutoBackupFrequency } from '@/lib/autoBackup';
import type { StoredBackup } from '@/lib/backupStore';
import { formatLongDate, isValidTime } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { pluralize } from '@/lib/text';
import { autoBackupService } from '@/services/autoBackupService';
import { backupService, parseBackup } from '@/services/backupService';
import { cloudBackupService } from '@/services/cloudBackupService';

async function loadState() {
  const [frequency, time, last, copies, folder, encryption, cloudLast, cloudError] = await Promise.all([
    autoBackupService.getFrequency(),
    autoBackupService.getTime(),
    autoBackupService.getLastDate(),
    autoBackupService.list(),
    cloudBackupService.getFolder(),
    cloudBackupService.getEncryption(),
    cloudBackupService.getLastDate(),
    cloudBackupService.getLastError(),
  ]);
  return { frequency, time, last, copies, folder, encryption, cloudLast, cloudError };
}

/**
 * Ajustes › Copias de seguridad: todo lo de las copias en un solo lugar. La persona elige cada cuánto y a qué hora se hace
 * la copia, y la app la guarda en el teléfono y, si hay carpeta elegida, también la envía a la nube. Desde aquí también se
 * comparte o se restaura una copia guardada.
 */
export function AutoBackupPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const supported = autoBackupService.isSupported();
  const { data, loading, error, retry } = useQuery(loadState);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<StoredBackup | null>(null);
  const [folderMenu, setFolderMenu] = useState(false);
  // La hora se guarda mientras se elige: así el campo responde al instante y no espera a leer de la base de datos.
  const [time, setTime] = useState(DEFAULT_AUTO_BACKUP_TIME);
  useEffect(() => {
    if (data) setTime(data.time);
  }, [data]);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const guard = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (failure) {
      toast.show(errorMessage(failure), 'error');
    } finally {
      setBusy(false);
    }
  };

  const changeFrequency = (frequency: AutoBackupFrequency) =>
    guard(async () => {
      await autoBackupService.setFrequency(frequency);
      // Al encenderla o acortarla, si ya toca, la copia se hace de una vez.
      await autoBackupService.runIfDue();
      await autoBackupService.runCloudIfDue().catch(() => undefined);
      retry();
    });

  const changeTime = (value: string) =>
    guard(async () => {
      await autoBackupService.setTime(value);
      retry();
    });

  // Aviso de atraso: la copia de la nube ya debía haber llegado y no llegó.
  const cloudLag = data?.folder ? describeCloudLag(data.frequency, data.cloudLast, isValidTime(time) ? time : data.time, new Date()) : null;

  const backupNow = () =>
    guard(async () => {
      const { sentToCloud } = await autoBackupService.backupEverywhere();
      toast.show(sentToCloud ? 'Copia guardada y enviada a la nube' : 'Copia guardada');
      retry();
    });

  const chooseFolder = () =>
    guard(async () => {
      const folder = await cloudBackupService.pickFolder();
      if (!folder) return;
      toast.show('Carpeta elegida');
      // Si ya toca, se envía la primera copia de una vez; un fallo se avisa pero no deshace la elección.
      await autoBackupService.runCloudIfDue().catch((failure) => toast.show(errorMessage(failure), 'error'));
      retry();
    });

  const removeFolder = () =>
    guard(async () => {
      await cloudBackupService.clearFolder();
      toast.show('Carpeta quitada. Lo que ya estaba en ella no se borró.');
      retry();
    });

  const uploadNow = () =>
    guard(async () => {
      await autoBackupService.uploadToCloud();
      toast.show('Copia enviada a la carpeta');
      retry();
    });

  const share = (copy: StoredBackup) =>
    guard(async () => {
      const text = await autoBackupService.read(copy.name);
      const { saveAndShareFile, textToBytes } = await import('@/lib/fileIO');
      await saveAndShareFile({ fileName: `MiPlata_copia_${copy.date}.json`, bytes: textToBytes(text), mimeType: 'application/json', title: 'Copia de seguridad de Mi Plata' });
    });

  const restore = (copy: StoredBackup) =>
    guard(async () => {
      const text = await autoBackupService.read(copy.name);
      const backup = parseBackup(text);
      const count = backup.data.expenses.length;
      const ok = await confirm({
        title: '¿Restaurar esta copia?',
        message: `Se reemplazarán TODOS tus datos actuales por los de la copia del ${formatLongDate(copy.date)} (${count} ${pluralize(count, 'gasto', 'gastos')}). Esta acción no se puede deshacer.`,
        confirmLabel: 'Restaurar',
        danger: true,
      });
      if (!ok) return;
      await backupService.restore(text);
      toast.show('Copia restaurada');
      retry();
    });

  return (
    <div className="page">
      <PageHeader title="Copias de seguridad" back />

      {!supported ? (
        <Notice tone="info">Las copias de seguridad solo funcionan en la app del teléfono.</Notice>
      ) : error && !data ? (
        <div className="card">
          <ErrorState description="No pudimos leer tus copias. Inténtalo de nuevo." onRetry={retry} />
        </div>
      ) : loading && !data ? (
        <ManagedListSkeleton label="Cargando copias" />
      ) : (
        <>
          <section className="section">
            <h2 className="section__title">Programación</h2>
            <Segmented label="Frecuencia de las copias" tone="primary" value={data?.frequency ?? 'weekly'} options={AUTO_BACKUP_OPTIONS} onChange={(value) => void changeFrequency(value)} />
            {data && data.frequency !== 'off' && (
              <Field label="Hora de la copia" htmlFor="backup-time">
                <input
                  id="backup-time"
                  className="input"
                  type="time"
                  value={time}
                  onChange={(event) => {
                    setTime(event.target.value);
                    if (isValidTime(event.target.value)) void changeTime(event.target.value);
                  }}
                />
              </Field>
            )}
            <p className="section__hint" role="status">
              {data
                ? (describeNextBackup(data.frequency, data.last, isValidTime(time) ? time : data.time, new Date()) ?? 'Las copias automáticas están apagadas.')
                : null}
              {data && data.frequency !== 'off' && data.folder ? ` Se enviará también a «${data.folder.name}».` : ''}
            </p>
            <p className="section__hint">
              {data?.last ? `Última copia: ${formatLongDate(data.last)}. ` : 'Todavía no se ha hecho ninguna copia. '}
              Si Mi Plata está cerrada a la hora elegida, la copia se hace en cuanto la abras: Android no deja que una app cerrada trabaje por su cuenta.
            </p>
            <Button variant="secondary" icon="save" block loading={busy} onClick={() => void backupNow()}>
              Hacer una copia ahora
            </Button>
          </section>

          <section className="section">
            <h2 className="section__title">Copias guardadas</h2>
            {(data?.copies.length ?? 0) === 0 ? (
              <div className="card">
                <EmptyState icon="save" title="Aún no hay copias" description="Cuando se haga la primera, aparecerá aquí." />
              </div>
            ) : (
              <div className="card card--flush list-gap">
                {data?.copies.map((copy) => (
                  <Row
                    key={copy.name}
                    icon="save"
                    title={formatLongDate(copy.date)}
                    detail={formatBytes(copy.size) ?? undefined}
                    chevron="chevronRight"
                    onClick={() => setSelected(copy)}
                    disabled={busy}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="section">
            <h2 className="section__title">Copia en la nube</h2>
            {data?.folder ? (
              <>
                <div className="card card--flush list-gap">
                  <Row
                    icon="upload"
                    title={data.folder.name}
                    detail={data.cloudLast ? `Última copia: ${formatLongDate(data.cloudLast)}` : 'Aún no se ha enviado ninguna'}
                    chevron="chevronRight"
                    onClick={() => setFolderMenu(true)}
                    disabled={busy}
                  />
                  <Row
                    icon="shield"
                    title="Cifrar con contraseña"
                    detail={data.encryption === 'on' ? 'Activado' : data.encryption === 'missing' ? 'Falta la contraseña en este teléfono' : 'Apagado: la copia se envía sin cifrar'}
                    chevron="chevronRight"
                    onClick={() => setPasswordOpen(true)}
                    disabled={busy}
                  />
                </div>
                {cloudLag && (
                  <Notice tone="warning" icon="warning" title="La copia en la nube está atrasada" role="status">
                    {cloudLag}
                    {data.cloudError ? ` Último error: ${data.cloudError}` : ''}
                  </Notice>
                )}
                {data.encryption === 'missing' && (
                  <Notice tone="warning" icon="warning">
                    El cifrado está activado, pero este teléfono no tiene la contraseña. Defínela de nuevo para que las copias vuelvan a enviarse.
                  </Notice>
                )}
                <Button variant="secondary" icon="upload" block loading={busy} onClick={() => void uploadNow()}>
                  Enviar una copia ahora
                </Button>
              </>
            ) : (
              <div className="card card--flush">
                <Row icon="upload" title="Elegir una carpeta" detail="Una carpeta de tu teléfono o de una app de nube" chevron="chevronRight" onClick={() => void chooseFolder()} disabled={busy} />
              </div>
            )}
            <p className="section__hint">
              Cada copia también se envía a la carpeta que elijas, a la misma hora y con la misma frecuencia (las últimas {AUTO_BACKUP_KEEP}). Google Drive normalmente no aparece como carpeta: elige una carpeta del
              teléfono que una app de sincronización suba a tu nube. Para restaurar, usa «Restaurar copia de seguridad» en Ajustes y busca el archivo.
            </p>
          </section>

          <Notice tone="info" icon="shield" title="Las copias del teléfono son privadas">
            Las copias de arriba se guardan en un lugar privado de la app (las últimas {AUTO_BACKUP_KEEP}) y no salen del teléfono. Si desinstalas Mi Plata o cambias de teléfono se pierden: usa la copia en la
            nube o compártelas de vez en cuando.
          </Notice>
        </>
      )}

      <ActionSheet
        open={folderMenu}
        title={data?.folder?.name ?? 'Carpeta'}
        onClose={() => setFolderMenu(false)}
        actions={[
          { icon: 'refresh', label: 'Cambiar de carpeta', onSelect: () => void chooseFolder() },
          { icon: 'trash', label: 'Dejar de usar esta carpeta', detail: 'No borra las copias que ya están en ella', tone: 'danger', onSelect: () => void removeFolder() },
        ]}
      />

      <BackupPasswordSheet
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        title="Cifrar la copia en la nube"
        description="Así, quien tenga acceso a tu nube no podrá leer tus finanzas. Guarda esta contraseña en un lugar seguro: si la olvidas, las copias cifradas no se pueden abrir y no hay forma de recuperarlas."
        confirm
        submitLabel={data?.encryption === 'off' ? 'Activar cifrado' : 'Cambiar contraseña'}
        onSubmit={async (password) => {
          await cloudBackupService.enableEncryption(password);
          toast.show('Cifrado activado');
          retry();
        }}
        onRemove={
          data?.encryption === 'off'
            ? undefined
            : {
                label: 'Quitar el cifrado',
                run: async () => {
                  await cloudBackupService.disableEncryption();
                  toast.show('Cifrado desactivado');
                  retry();
                },
              }
        }
      />

      <ActionSheet
        open={selected !== null}
        title={selected ? `Copia del ${formatLongDate(selected.date)}` : 'Copia'}
        onClose={() => setSelected(null)}
        actions={
          selected
            ? [
                { icon: 'upload', label: 'Compartir o guardar en otro sitio', detail: 'Drive, Archivos, correo…', onSelect: () => void share(selected) },
                { icon: 'refresh', label: 'Restaurar esta copia', detail: 'Reemplaza todos tus datos', tone: 'danger', onSelect: () => void restore(selected) },
              ]
            : []
        }
      />
    </div>
  );
}
