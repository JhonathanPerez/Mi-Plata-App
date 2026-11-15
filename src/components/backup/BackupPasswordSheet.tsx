import { useEffect, useState, type ReactNode } from 'react';
import { Field } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';
import { validateBackupPassword } from '@/lib/backupCrypto';
import { errorMessage } from '@/lib/errors';

interface BackupPasswordSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  /** true = definir una contraseña nueva (pide repetirla y que tenga el largo mínimo); false = escribir la que ya existe. */
  confirm: boolean;
  submitLabel: string;
  /** Se cierra sola si termina bien; si lanza un error, se muestra aquí y la hoja sigue abierta. */
  onSubmit: (password: string) => Promise<void>;
  onRemove?: { label: string; run: () => Promise<void> };
}

/** Hoja para definir o pedir la contraseña con la que se cifran las copias de la nube. */
export function BackupPasswordSheet({ open, onClose, title, description, confirm, submitLabel, onSubmit, onRemove }: BackupPasswordSheetProps) {
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPassword('');
    setAgain('');
    setError(undefined);
  }, [open]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (confirm) {
      const problem = validateBackupPassword(password);
      if (problem) return setError(problem);
      if (password !== again) return setError('Las contraseñas no coinciden.');
    } else if (!password) {
      return setError('Escribe la contraseña.');
    }
    setError(undefined);
    return void run(() => onSubmit(password));
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      actions={{
        primary: { label: submitLabel, loading: busy, onClick: submit },
        secondary: onRemove ? { label: onRemove.label, disabled: busy, onClick: () => void run(onRemove.run) } : undefined,
      }}
    >
      {description && <p className="muted">{description}</p>}
      <Field label="Contraseña" htmlFor="backup-password" error={confirm ? undefined : error}>
        <input
          id="backup-password"
          className="input"
          type="password"
          autoComplete={confirm ? 'new-password' : 'current-password'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>
      {confirm && (
        <Field label="Repite la contraseña" htmlFor="backup-password-again" error={error}>
          <input
            id="backup-password-again"
            className="input"
            type="password"
            autoComplete="new-password"
            value={again}
            onChange={(event) => setAgain(event.target.value)}
          />
        </Field>
      )}
    </Sheet>
  );
}
