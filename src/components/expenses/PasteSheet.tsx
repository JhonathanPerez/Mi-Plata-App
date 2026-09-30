import { useEffect, useState } from 'react';
import { useToast } from '@/app/providers/ToastProvider';
import { Field } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';
import { describeFailure } from '@/lib/parseNotification';
import { captureService } from '@/services/captureService';
import { errorMessage } from '@/lib/errors';

interface PasteSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Permite pegar el texto de un SMS o notificación del banco. Sirve para registrar un aviso que no se capturó solo
 * y para comprobar cómo interpreta la app los mensajes de tu banco.
 */
export function PasteSheet({ open, onClose }: PasteSheetProps) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setText('');
      setError('');
    }
  }, [open]);

  const submit = async () => {
    if (!text.trim()) {
      setError('Pega primero el texto del mensaje.');
      return;
    }
    setBusy(true);
    try {
      const result = await captureService.addFromText(text);
      if (result.status === 'added') {
        toast.show('Agregado a tus pendientes');
        onClose();
      } else if (result.status === 'duplicate') {
        setError('Ese mensaje ya está en tu lista (o ya lo categorizaste).');
      } else {
        setError(describeFailure(result.reason));
      }
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      title="Pegar un mensaje"
      onClose={onClose}
      actions={{ primary: { label: 'Detectar gasto', icon: 'check', loading: busy, onClick: () => void submit() } }}
    >
      <Field
        label="Texto del SMS o de la notificación"
        htmlFor="paste-text"
        error={error || undefined}
        hint="Copia el mensaje del banco y pégalo aquí. Se leerá el valor y el comercio."
      >
        <textarea
          id="paste-text"
          className="input input--area"
          rows={6}
          value={text}
          placeholder="Ej.: Compra por $25.000 en RAPPI con tu tarjeta *1234"
          onChange={(event) => setText(event.target.value)}
        />
      </Field>
    </Sheet>
  );
}
