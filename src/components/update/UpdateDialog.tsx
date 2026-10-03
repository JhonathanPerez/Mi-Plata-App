import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { APP_VERSION } from '@/config/constants';
import { downloadPercent, formatBytes, type AvailableRelease } from '@/lib/appUpdate';
import { cssVars } from '@/lib/cssVars';

/** En qué paso va la actualización. Mientras no haya ninguno, el diálogo no se dibuja. */
export type UpdatePhase =
  /** El aviso: «Descargar» o «Cancelar». */
  | { name: 'prompt'; release: AvailableRelease }
  /** Android pide un permiso especial antes de poder instalar apps. */
  | { name: 'permission'; release: AvailableRelease }
  | { name: 'downloading'; release: AvailableRelease; received: number; total: number }
  /** Comprobando el archivo y abriendo el instalador de Android. */
  | { name: 'installing'; release: AvailableRelease };

interface UpdateDialogProps {
  phase: UpdatePhase | null;
  onDownload: () => void;
  onCancel: () => void;
  onOpenSettings: () => void;
}

/** Aviso de versión nueva, con el mismo marco que los demás diálogos de la app (ver ConfirmProvider). */
export function UpdateDialog({ phase, onDownload, onCancel, onOpenSettings }: UpdateDialogProps) {
  if (!phase) return null;
  const { release } = phase;
  const size = formatBytes(release.apk.size);
  // Mientras se prepara la instalación no hay nada que cancelar: tocar fuera del diálogo no hace nada.
  const dismissible = phase.name !== 'installing';

  return createPortal(
    <div className="dialog-root">
      <div className="dialog-backdrop" onClick={dismissible ? onCancel : undefined} />
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="update-dialog-title">
        <span className="dialog__badge" aria-hidden="true">
          <Icon name="update" size={28} />
        </span>

        {phase.name === 'prompt' && (
          <>
            <h2 className="dialog__title" id="update-dialog-title">
              Nueva versión disponible
            </h2>
            <p className="dialog__text">
              Mi Plata v{release.version} ya está lista; tienes la v{APP_VERSION}.{size ? ` La descarga pesa ${size}.` : ''}
            </p>
            <p className="dialog__meta">Tus gastos se conservan al actualizar.</p>
            <div className="dialog__actions">
              <Button icon="download" onClick={onDownload}>
                Descargar
              </Button>
              <Button variant="secondary" onClick={onCancel}>
                Cancelar
              </Button>
            </div>
          </>
        )}

        {phase.name === 'permission' && (
          <>
            <h2 className="dialog__title" id="update-dialog-title">
              Falta un permiso
            </h2>
            <p className="dialog__text">
              Para instalar la actualización, Android necesita que permitas a Mi Plata instalar apps. Toca <strong>Abrir ajustes</strong>, activa{' '}
              <strong>Permitir de esta fuente</strong> y vuelve a la app: la descarga empezará sola.
            </p>
            <div className="dialog__actions">
              <Button icon="sliders" onClick={onOpenSettings}>
                Abrir ajustes
              </Button>
              <Button variant="secondary" onClick={onCancel}>
                Cancelar
              </Button>
            </div>
          </>
        )}

        {phase.name === 'downloading' && <Downloading phase={phase} onCancel={onCancel} />}

        {phase.name === 'installing' && (
          <>
            <h2 className="dialog__title" id="update-dialog-title">
              Preparando la instalación
            </h2>
            <p className="dialog__text" role="status">
              Comprobando que la descarga esté completa y sea de Mi Plata…
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Downloading({ phase, onCancel }: { phase: Extract<UpdatePhase, { name: 'downloading' }>; onCancel: () => void }) {
  const percent = downloadPercent(phase.received, phase.total);
  const received = formatBytes(phase.received);
  const total = formatBytes(phase.total);
  return (
    <>
      <h2 className="dialog__title" id="update-dialog-title">
        Descargando v{phase.release.version}
      </h2>
      <div className="progress" role="progressbar" aria-label="Progreso de la descarga" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}>
        <span className="progress__bar" style={cssVars({ '--progress': (percent ?? 0) / 100 })} />
      </div>
      <p className="dialog__text">
        {percent === null ? 'Descargando…' : `${percent} %`}
        {received && total ? ` · ${received} de ${total}` : ''}
      </p>
      <div className="dialog__actions">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </>
  );
}
