import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Row } from '@/components/ui/Row';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { CAPTURE_SOURCES, type CaptureAppChoice } from '@/config/capture';
import { cx } from '@/lib/cx';
import { haptics } from '@/lib/haptics';
import type { InstalledApp } from '@/lib/notificationCapture';
import { normalizeText } from '@/lib/text';
import { captureAppsService } from '@/services/captureAppsService';

interface CaptureAppsSheetProps {
  open: boolean;
  onClose: () => void;
  /** Apps vigiladas ahora mismo (para marcarlas y para no perderlas si ya no están instaladas). */
  selected: CaptureAppChoice[];
  onSaved: (apps: CaptureAppChoice[]) => void;
}

/** El nombre curado de `CAPTURE_SOURCES` (si lo hay) se ve mejor que el que reporta Android. */
function bestLabel(app: InstalledApp): string {
  return CAPTURE_SOURCES.find((source) => source.pkg === app.pkg)?.label ?? app.label;
}

/**
 * Lista todas las apps instaladas con ícono en el lanzador para que el usuario marque cuáles vigilar.
 * Las que ya estaban elegidas pero se desinstalaron se mantienen al final, así no se pierden sin avisar.
 */
export function CaptureAppsSheet({ open, onClose, selected, onSaved }: CaptureAppsSheetProps) {
  const [loading, setLoading] = useState(true);
  const [apps, setApps] = useState<CaptureAppChoice[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setChecked(new Set(selected.map((app) => app.pkg)));
    setLoading(true);
    void (async () => {
      const installed = await captureAppsService.listInstalledApps();
      const byPkg = new Map<string, CaptureAppChoice>();
      for (const app of installed) byPkg.set(app.pkg, { pkg: app.pkg, label: bestLabel(app) });
      // Una app elegida antes que ya no aparezca instalada se conserva para no desmarcarla sin que se note.
      for (const app of selected) if (!byPkg.has(app.pkg)) byPkg.set(app.pkg, app);
      const list = [...byPkg.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'));
      setApps(list);
      setLoading(false);
    })();
    // Solo al abrir: `selected` puede cambiar de referencia en cada render del padre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = useMemo(() => {
    const needle = normalizeText(query);
    if (!needle) return apps;
    return apps.filter((app) => normalizeText(app.label).includes(needle));
  }, [apps, query]);

  const toggle = (pkg: string) => {
    void haptics.tap();
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(pkg)) next.delete(pkg);
      else next.add(pkg);
      return next;
    });
  };

  const save = () => {
    const result = apps.filter((app) => checked.has(app.pkg));
    onSaved(result);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Elegir apps"
      actions={{
        layout: 'split',
        secondary: { label: 'Cancelar', onClick: onClose },
        primary: { label: `Guardar${checked.size > 0 ? ` (${checked.size})` : ''}`, onClick: save },
      }}
    >
      <div className="stack">
        <div className="search">
          <Icon name="search" size={20} />
          <input
            className="search__input"
            type="search"
            placeholder="Buscar app"
            aria-label="Buscar app"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {loading ? (
          <div className="stack">
            <Skeleton height={48} />
            <Skeleton height={48} />
            <Skeleton height={48} />
          </div>
        ) : filtered.length === 0 ? (
          <p className="muted">No encontré ninguna app con ese nombre.</p>
        ) : (
          <ul className="app-picker">
            {filtered.map((app) => {
              const isChecked = checked.has(app.pkg);
              return (
                <li key={app.pkg}>
                  <Row
                    variant="flush"
                    role="checkbox"
                    aria-checked={isChecked}
                    onClick={() => toggle(app.pkg)}
                    leading={
                      <span className="app-picker__icon" aria-hidden="true">
                        <Icon name="phone" size={20} />
                      </span>
                    }
                    title={app.label}
                    trailing={
                      <span className={cx('app-picker__check', isChecked && 'is-on')} aria-hidden="true">
                        {isChecked && <Icon name="check" size={14} weight="bold" />}
                      </span>
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
