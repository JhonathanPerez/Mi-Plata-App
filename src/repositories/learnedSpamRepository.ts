import { getDb } from '@/db/connection';
import type { LearnedPhraseRow } from '@/lib/spamLearning';

export const learnedSpamRepository = {
  async listAll(): Promise<LearnedPhraseRow[]> {
    const db = await getDb();
    const rows = await db.query<{ phrase: string; report_count: number }>(
      'SELECT phrase, report_count FROM learned_spam_phrases',
    );
    return rows.map((row) => ({ phrase: row.phrase, reportCount: Number(row.report_count) }));
  },

  async count(): Promise<number> {
    const db = await getDb();
    const rows = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM learned_spam_phrases');
    return Number(rows[0]?.n ?? 0);
  },

  /** Suma un reporte a cada frase (o la crea con 1) sin pasarse del límite de frases nuevas. */
  async addReport(phrases: string[], nowIso: string, roomForNew: number): Promise<void> {
    if (phrases.length === 0) return;
    const db = await getDb();
    let remainingRoom = roomForNew;
    for (const phrase of phrases) {
      const existing = await db.query<{ phrase: string }>('SELECT phrase FROM learned_spam_phrases WHERE phrase = ?', [
        phrase,
      ]);
      if (existing.length > 0) {
        await db.run('UPDATE learned_spam_phrases SET report_count = report_count + 1, last_seen = ? WHERE phrase = ?', [
          nowIso,
          phrase,
        ]);
      } else if (remainingRoom > 0) {
        await db.run(
          'INSERT INTO learned_spam_phrases (phrase, report_count, first_seen, last_seen) VALUES (?, 1, ?, ?)',
          [phrase, nowIso, nowIso],
        );
        remainingRoom -= 1;
      }
      // Si no hay espacio y la frase es nueva, se descarta: ya hay bastantes frases aprendidas (ver
      // MAX_LEARNED_PHRASES); las que ya existían siguen sumando reportes sin problema.
    }
  },

  async removeAll(): Promise<void> {
    const db = await getDb();
    await db.run('DELETE FROM learned_spam_phrases');
  },
};
