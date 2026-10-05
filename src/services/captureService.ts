import {
  BANK_ALIASES,
  CAPTURE_DEDUPE_WINDOW_MS,
  CAPTURE_KEEP_RESOLVED_DAYS,
  CAPTURE_MAX_LAG_MS,
  type BankKey,
} from '@/config/capture';
import { notifyDataChanged } from '@/lib/dataBus';
import { newId, nowIso } from '@/lib/ids';
import { captureNotifications } from '@/lib/localNotifications';
import { displayText, fingerprintOf, parseCapture, type ParseFailure } from '@/lib/parseNotification';
import { normalizeText } from '@/lib/text';
import { pendingCaptureRepository } from '@/repositories/pendingCaptureRepository';
import { spamLearningService } from '@/services/spamLearningService';
import type { PaymentMethod, PendingCapture } from '@/types/models';

/** Lo que entrega el código nativo por cada notificación o SMS que pasó su filtro. */
export interface RawCaptureEvent {
  pkg: string;
  title: string;
  text: string;
  /** Hora del mensaje (ms). */
  time: number;
  /** Momento en que el servicio nativo lo capturó (ms). */
  capturedAt: number;
}

export interface IngestSummary {
  added: number;
  skipped: number;
}

async function addIfNew(event: { pkg: string; title: string; text: string; time: number }): Promise<PendingCapture | 'duplicate' | ParseFailure> {
  const learnedPromo = await spamLearningService.getPattern();
  const parsed = parseCapture({ pkg: event.pkg, title: event.title, text: event.text }, learnedPromo);
  if (!parsed.ok) return parsed.reason;

  const fingerprint = fingerprintOf(event.text);
  if (await pendingCaptureRepository.existsFingerprint(fingerprint, event.time - CAPTURE_DEDUPE_WINDOW_MS, event.time + CAPTURE_DEDUPE_WINDOW_MS)) {
    return 'duplicate';
  }

  const item: PendingCapture = {
    id: newId(),
    source: event.pkg,
    bank: parsed.value.bank,
    amount: parsed.value.amount,
    merchant: parsed.value.merchant,
    last4: parsed.value.last4,
    rawText: displayText(event),
    occurredAt: event.time,
    fingerprint,
    status: 'pending',
    createdAt: nowIso(),
    resolvedAt: null,
  };
  await pendingCaptureRepository.insert(item);
  return item;
}

/**
 * Sugiere el método de pago de un aviso: primero por los últimos 4 dígitos de la tarjeta y luego por el banco
 * (comparando con el nombre de tus métodos). Devuelve null si no hay una coincidencia clara.
 */
export function suggestPaymentMethodId(
  methods: Array<Pick<PaymentMethod, 'id' | 'name' | 'last4' | 'isActive'> & Partial<Pick<PaymentMethod, 'savingsAccountId'>>>,
  hint: { bank: string | null; last4: string | null },
): string | null {
  const active = methods.filter((method) => method.isActive);

  // Los últimos 4 dígitos identifican una tarjeta o una cuenta de ahorro del banco.
  if (hint.last4) {
    const byCard = active.filter((method) => method.last4 === hint.last4);
    if (byCard.length === 1) return byCard[0].id;
  }

  // Por el nombre del banco solo se sugieren los métodos normales: una cuenta de ahorro se sugiere únicamente por sus 4 dígitos,
  // porque un banco puede tener tarjeta y cuenta a la vez y adivinar movería plata de la cuenta equivocada.
  const named = active.filter((method) => !method.savingsAccountId);

  const aliases = hint.bank ? BANK_ALIASES[hint.bank as BankKey] : undefined;
  if (aliases) {
    const found = named.find((method) => {
      const words = normalizeText(method.name).split(/[^a-z0-9]+/).filter(Boolean);
      return aliases.some((alias) => words.includes(alias));
    });
    if (found) return found.id;
  }
  return null;
}

/** Avisa (notificación local) de lo que se acaba de registrar solo; nunca interrumpe el flujo si falla. */
async function notifyNewCaptures(items: PendingCapture[]): Promise<void> {
  try {
    // Uno por uno: cada aviso reemplaza (mismo id) al aviso "al instante" que ya mostró el lado nativo
    // para ese mismo mensaje, así no se duplican.
    for (const item of items) {
      await captureNotifications.notify(item);
    }
  } catch (error) {
    console.warn('[captura] No se pudo avisar', error);
  }
}

/** Retira el aviso "al instante" de un mensaje que resultó no ser un gasto real; nunca lanza errores. */
async function clearPlaceholder(event: { title: string; text: string }): Promise<void> {
  try {
    await captureNotifications.cancel(displayText(event));
  } catch (error) {
    console.warn('[captura] No se pudo retirar el aviso', error);
  }
}

export const captureService = {
  /** Procesa lo que capturó el teléfono. Los avisos que no son gastos, repetidos o viejos se descartan. */
  async ingestEvents(events: RawCaptureEvent[]): Promise<IngestSummary> {
    const summary: IngestSummary = { added: 0, skipped: 0 };
    const added: PendingCapture[] = [];
    for (const event of events) {
      // Un mensaje mucho más viejo que su captura es historial que la app de SMS volvió a mostrar.
      if (event.capturedAt - event.time > CAPTURE_MAX_LAG_MS) {
        summary.skipped += 1;
        void clearPlaceholder(event);
        continue;
      }
      const outcome = await addIfNew(event);
      if (typeof outcome === 'string') {
        summary.skipped += 1;
        void clearPlaceholder(event);
      } else {
        summary.added += 1;
        added.push(outcome);
      }
    }
    if (summary.added > 0) {
      notifyDataChanged();
      void notifyNewCaptures(added);
    }
    return summary;
  },

  listPending(): Promise<PendingCapture[]> {
    return pendingCaptureRepository.listPending();
  },

  countPending(): Promise<number> {
    return pendingCaptureRepository.countPending();
  },

  getPending(id: string): Promise<PendingCapture | null> {
    return pendingCaptureRepository.getPendingById(id);
  },

  async dismiss(id: string): Promise<void> {
    await pendingCaptureRepository.resolve(id, 'dismissed', nowIso());
    notifyDataChanged();
  },

  /**
   * "No es un gasto, es publicidad": además de quitarlo de la bandeja, guarda fragmentos de su texto
   * (nunca el mensaje completo) para que mensajes parecidos dejen de aparecer en el futuro.
   * Ver `lib/spamLearning.ts` para cómo funciona ese aprendizaje.
   */
  async reportSpam(id: string): Promise<void> {
    const item = await pendingCaptureRepository.getPendingById(id);
    if (item) await spamLearningService.reportText(item.rawText);
    await pendingCaptureRepository.resolve(id, 'spam', nowIso());
    notifyDataChanged();
  },

  /** Borra las huellas de avisos ya resueltos con más de 60 días. */
  async pruneOld(now: number = Date.now()): Promise<void> {
    const cutoff = new Date(now - CAPTURE_KEEP_RESOLVED_DAYS * 86_400_000).toISOString();
    await pendingCaptureRepository.pruneResolvedBefore(cutoff);
  },
};
