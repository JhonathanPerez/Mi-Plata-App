import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { useToast } from '@/app/providers/ToastProvider';
import { BackupPasswordSheet } from '@/components/backup/BackupPasswordSheet';
import { ActionSheet } from '@/components/ui/ActionSheet';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Field } from '@/components/ui/Field';
import { ManagedListSkeleton } from '@/components/ui/ManagedListSkeleton';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { Row } from '@/components/ui/Row';
import { Segmented } from '@/components/ui/Segmented';
import { AUTO_BACKUP_KEEP } from '@/config/constants';
import { useQuery } from '@/hooks/useQuery';
import { formatBytes } from '@/lib/appUpdate';
import { AUTO_BACKUP_OPTIONS, DEFAULT_AUTO_BACKUP_TIME, describeCloudLag, describeNextBackup, type AutoBackupFrequency } from '@/lib/autoBackup';
import { decryptBackup, isEncryptedBackup } from '@/lib/backupCrypto';
import type { StoredBackup } from '@/lib/backupStore';
import { formatLongDate, isValidTime } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { pluralize } from '@/lib/text';
import { autoBackupService } from '@/services/autoBackupService';
import { backupService, parseBackup } from '@/services/backupService';
import { cloudBackupService } from '@/services/cloudBackupService';

async function loadState() {
  // Antes de leer las fechas, se anota lo que la tarea en segundo plano hizo con la app cerrada.
  await autoBackupService.reconcileBackgroundBackup().catch(() => undefined);
  const [frequency, time, last, copies, folder, encryption, cloudLast, cloudError, hasData] = await Promise.all([
    autoBackupService.getFrequency(),
    autoBackupService.getTime(),
    autoBackupService.getLastDate(),
    autoBackupService.list(),
    cloudBackupService.getFolder(),
    cloudBackupService.getEncryption(),
    cloudBackupService.getLastDate(),
    cloudBackupService.getLastError(),
    autoBackupService.hasData(),
  ]);
  return { frequency, time, last, copies, folder, encryption, cloudLast, cloudError, hasData };
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
  const restoreRef = useRef<HTMLInputElement>(null);
  // Si el archivo elegido está cifrado (las copias de la nube lo están), se guarda aquí mientras se pide la contraseña.
  const [encryptedBackup, setEncryptedBackup] = useState<string | null>(null);
  // Lo que hay que hacer apenas la persona termine de definir la contraseña (elegir la carpeta, compartir una copia…).
  const afterPassword = useRef<(() => Promise<void>) | null>(null);
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
  const cloudLag = data?.folder && data.hasData ? describeCloudLag(data.frequency, data.cloudLast, isValidTime(time) ? time : data.time, new Date()) : null;

  /** Ejecuta `next` ya si hay contraseña; si no, pide definirla primero y lo ejecuta al terminar. Nada sale sin cifrar. */
  const withPassword = (next: () => Promise<void>) => {
    if (data?.encryption === 'on') {
      void next();
      return;
    }
    afterPassword.current = next;
    setPasswordOpen(true);
  };

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
      await autoBackupService.syncBackgroundSchedule().catch(() => undefined);
      // Si ya toca, se envía la primera copia de una vez; un fallo se avisa pero no deshace la elección.
      await autoBackupService.runCloudIfDue().catch((failure) => toast.show(errorMessage(failure), 'error'));
      retry();
    });

  const removeFolder = () =>
    guard(async () => {
      await cloudBackupService.clearFolder();
      await autoBackupService.syncBackgroundSchedule().catch(() => undefined);
      toast.show('Carpeta quitada. Lo que ya estaba en ella no se borró.');
      retry();
    });

  const share = (copy: StoredBackup) =>
    guard(async () => {
      // Lo que sale del teléfono siempre va cifrado: el archivo compartido solo se abre con tu contraseña.
      const encrypted = await cloudBackupService.encryptForExport(await autoBackupService.read(copy.name));
      const { saveAndShareFile, textToBytes } = await import('@/lib/fileIO');
      await saveAndShareFile({ fileName: `MiPlata_copia_${copy.date}.json`, bytes: textToBytes(encrypted), mimeType: 'application/json', title: 'Copia de seguridad de Mi Plata (cifrada)' });
    });

  /** Confirma y reemplaza todos los datos por los de una copia (guardada en el teléfono o elegida de un archivo). */
  const restoreText = async (text: string) => {
    const backup = parseBackup(text);
    const count = backup.data.expenses.length;
    const ok = await confirm({
      title: '¿Restaurar esta copia?',
      message: `Se reemplazarán TODOS tus datos actuales por los de la copia del ${formatLongDate(backup.exportedAt.slice(0, 10))} (${count} ${pluralize(count, 'gasto', 'gastos')}). Esta acción no se puede deshacer.`,
      confirmLabel: 'Restaurar',
      danger: true,
    });
    if (!ok) return;
    await backupService.restore(text);
    toast.show('Copia restaurada');
    retry();
  };

  const restore = (copy: StoredBackup) => guard(async () => restoreText(await autoBackupService.read(copy.name)));

  const onRestoreFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await guard(async () => {
      const text = await file.text();
      if (isEncryptedBackup(text)) setEncryptedBackup(text);
      else await restoreText(text);
    });
  };

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
                ? data.frequency !== 'off' && !data.hasData
                  ? 'Todavía no hay datos que guardar: la primera copia se hará cuando registres un gasto.'
                  : (describeNextBackup(data.frequency, data.last, isValidTime(time) ? time : data.time, new Date()) ?? 'Las copias automáticas están apagadas.')
                : null}
              {data && data.frequency !== 'off' && data.folder ? ` Se enviará también a «${data.folder.name}».` : ''}
            </p>
            <p className="section__hint">{data?.last ? `Última copia: ${formatLongDate(data.last)}.` : 'Todavía no se ha hecho ninguna copia.'}</p>
            <Button variant="secondary" icon="save" block loading={busy} onClick={() => (data?.folder ? withPassword(backupNow) : void backupNow())}>
              Hacer una copia ahora
            </Button>
          </section>

          <section className="section">
            <h2 className="section__title">Copias guardadas localmente</h2>
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
                    title="Contraseña de cifrado"
                    detail={data.encryption === 'on' ? 'Las copias salen cifradas' : data.encryption === 'missing' ? 'Falta la contraseña en este teléfono' : 'Sin contraseña: no se enviará nada'}
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
                {data.encryption !== 'on' && (
                  <Notice tone="warning" icon="warning" title="Falta la contraseña">
                    {data.encryption === 'missing'
                      ? 'Este teléfono no tiene la contraseña con la que se cifraban tus copias. '
                      : 'Las copias de la nube ahora siempre van cifradas. '}
                    Defínela para que vuelvan a enviarse; mientras tanto no se sube nada.
                  </Notice>
                )}
              </>
            ) : (
              <div className="card card--flush">
                <Row icon="upload" title="Elegir una carpeta" detail="Te pedimos una contraseña para cifrar las copias" chevron="chevronRight" onClick={() => withPassword(chooseFolder)} disabled={busy} />
              </div>
            )}
            <p className="section__hint">
              Cada copia también se envía cifrada a la carpeta que elijas, a la misma hora (las últimas {AUTO_BACKUP_KEEP}). Google Drive normalmente no aparece como carpeta: elige una del teléfono que tu app de nube
              sincronice.
            </p>
          </section>
        </>
      )}

      <section className="section">
        <h2 className="section__title">Restaurar</h2>
        <div className="card card--flush">
          <Row
            icon="refresh"
            title="Restaurar copia de seguridad"
            detail="Reemplaza todos tus datos"
            tone="danger"
            onClick={() => restoreRef.current?.click()}
            disabled={busy}
          />
        </div>
      </section>
      <input ref={restoreRef} type="file" hidden accept=".json,application/json" onChange={(event) => void onRestoreFile(event)} />

      <ActionSheet
        open={folderMenu}
        title={data?.folder?.name ?? 'Carpeta'}
        onClose={() => setFolderMenu(false)}
        actions={[
          { icon: 'refresh', label: 'Cambiar de carpeta', onSelect: () => withPassword(chooseFolder) },
          { icon: 'trash', label: 'Dejar de usar esta carpeta', detail: 'No borra las copias que ya están en ella', tone: 'danger', onSelect: () => void removeFolder() },
        ]}
      />

      <BackupPasswordSheet
        open={encryptedBackup !== null}
        onClose={() => setEncryptedBackup(null)}
        title="Copia cifrada"
        description="Esta copia está protegida con una contraseña. Escríbela para abrirla."
        confirm={false}
        submitLabel="Abrir copia"
        onSubmit={async (password) => {
          if (!encryptedBackup) return;
          const plain = await decryptBackup(encryptedBackup, password);
          setEncryptedBackup(null);
          // Se restaura aparte: la hoja se cierra y aparece la confirmación de siempre.
          void guard(() => restoreText(plain));
        }}
      />

      <BackupPasswordSheet
        open={passwordOpen}
        onClose={() => {
          setPasswordOpen(false);
          afterPassword.current = null;
        }}
        title="Contraseña de las copias"
        description={`Todo lo que sale de tu teléfono (la nube y lo que compartas) va cifrado con esta contraseña, así nadie que vea el archivo puede leer tus finanzas. Guárdala en un lugar seguro: si la olvidas, esas copias no se pueden abrir y no hay forma de recuperarlas.${
          data?.encryption === 'on' ? ' Las copias que ya salieron se siguen abriendo con la contraseña anterior.' : ''
        }`}
        confirm
        submitLabel={data?.encryption === 'on' ? 'Cambiar contraseña' : 'Guardar contraseña'}
        onSubmit={async (password) => {
          await cloudBackupService.enableEncryption(password);
          toast.show('Contraseña guardada');
          retry();
          // Lo que la persona estaba haciendo (elegir la carpeta, compartir una copia…) continúa ahora, ya con contraseña.
          const next = afterPassword.current;
          afterPassword.current = null;
          if (next) void next();
        }}
      />

      <ActionSheet
        open={selected !== null}
        title={selected ? `Copia del ${formatLongDate(selected.date)}` : 'Copia'}
        onClose={() => setSelected(null)}
        actions={
          selected
            ? [
                { icon: 'upload', label: 'Compartir o guardar en otro sitio', detail: 'Se envía cifrada con tu contraseña', onSelect: () => withPassword(() => share(selected)) },
                { icon: 'refresh', label: 'Restaurar esta copia', detail: 'Reemplaza todos tus datos', tone: 'danger', onSelect: () => void restore(selected) },
              ]
            : []
        }
      />
    </div>
  );
}
