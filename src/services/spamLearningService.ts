import { notifyDataChanged } from '@/lib/dataBus';
import { nowIso } from '@/lib/ids';
import { buildLearnedPromoPattern, extractCandidatePhrases, phrasesAboveThreshold } from '@/lib/spamLearning';
import { learnedSpamRepository } from '@/repositories/learnedSpamRepository';

/**
 * El patrón (frases aprendidas con suficientes reportes) cambia poco: se cachea en memoria y solo se vuelve
 * a construir cuando se agrega un reporte nuevo, así no se consulta la base de datos por cada mensaje capturado.
 */
let cachedPattern: RegExp | null | undefined;

export const spamLearningService = {
  async getPattern(): Promise<RegExp | null> {
    if (cachedPattern === undefined) {
      const rows = await learnedSpamRepository.listAll();
      cachedPattern = buildLearnedPromoPattern(phrasesAboveThreshold(rows));
    }
    return cachedPattern;
  },

  /** Registra un reporte de publicidad: guarda solo fragmentos de texto (nunca el mensaje completo). */
  async reportText(rawText: string): Promise<void> {
    const phrases = extractCandidatePhrases(rawText);
    const total = await learnedSpamRepository.count();
    await learnedSpamRepository.addReport(phrases, nowIso(), Math.max(0, 300 - total));
    cachedPattern = undefined; // se reconstruye en el próximo mensaje capturado (una frase pudo cruzar el umbral)
  },

  async forgetAll(): Promise<void> {
    await learnedSpamRepository.removeAll();
    cachedPattern = undefined;
    notifyDataChanged();
  },
};
