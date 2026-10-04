package __PACKAGE__;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Almacén local del lector de notificaciones: la lista de apps vigiladas y la cola de avisos capturados.
 * El servicio escribe aunque la app esté cerrada; la parte web recoge la cola al abrirse (drain).
 * Servicio y plugin viven en el mismo proceso, así que un candado estático basta.
 */
final class CaptureStore {

    interface Listener {
        void onCaptured();
    }

    private static final String PREFS = "miplata_capture";
    private static final String KEY_QUEUE = "queue";
    private static final String KEY_PACKAGES = "packages";
    private static final String KEY_REM_ENABLED = "rem_enabled";
    private static final String KEY_REM_MINUTES = "rem_minutes";
    private static final String KEY_REM_COVERED = "rem_covered_until";
    private static final String KEY_REM_PENDING = "rem_pending_count";
    private static final String KEY_UNSEEN = "unseen_expenses";
    private static final String KEY_UNSEEN_AMOUNT = "unseen_last_amount";
    private static final String KEY_RECENT = "recent_expenses";
    private static final String KEY_FB_START = "fb_start";
    private static final String KEY_FB_SENT = "fb_sent";
    private static final String KEY_FB_NEXT = "fb_next_at";
    private static final int MAX_QUEUE = 200;
    /** Mensajes de gasto ya contados que se recuerdan (aunque la app los recoja) para no contar dos veces el mismo. */
    private static final int MAX_RECENT = 50;
    private static final long RECENT_KEEP_MS = 6L * 3_600_000L;
    /** Igual que `CAPTURE_DEDUPE_WINDOW_MS` en `config/capture.ts`: el mismo texto dentro de este margen es el mismo gasto. */
    private static final long DUPLICATE_WINDOW_MS = 2L * 60_000L;
    private static final Object LOCK = new Object();
    private static volatile Listener listener;

    private CaptureStore() {}

    static void setListener(Listener value) {
        listener = value;
    }

    static void notifyCaptured() {
        Listener current = listener;
        if (current != null) current.onCaptured();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Apps cuyas notificaciones se leen. Vacío hasta que la app las configura: sin lista, no se captura nada. */
    static Set<String> getPackages(Context context) {
        Set<String> stored = prefs(context).getStringSet(KEY_PACKAGES, null);
        return stored == null ? new HashSet<String>() : new HashSet<String>(stored);
    }

    static void setPackages(Context context, Collection<String> packages) {
        prefs(context).edit().putStringSet(KEY_PACKAGES, new HashSet<String>(packages)).apply();
    }

    // ---- Recordatorio de pendientes con la app cerrada (ver PendingReminderReceiver) ----

    /** La parte web publica aquí su configuración, hasta cuándo dejó avisos programados y cuántos gastos hay por categorizar. */
    static void setReminderConfig(Context context, boolean enabled, int minutes, long coveredUntil, int pendingCount) {
        prefs(context).edit()
                .putBoolean(KEY_REM_ENABLED, enabled)
                .putInt(KEY_REM_MINUTES, minutes)
                .putLong(KEY_REM_COVERED, coveredUntil)
                .putInt(KEY_REM_PENDING, Math.max(0, pendingCount))
                .commit();
    }

    /** Gastos por categorizar que la parte web ya tenía guardados la última vez que se abrió. */
    static int getReminderPendingCount(Context context) {
        return prefs(context).getInt(KEY_REM_PENDING, 0);
    }

    static boolean isReminderEnabled(Context context) {
        return prefs(context).getBoolean(KEY_REM_ENABLED, false);
    }

    static int getReminderMinutes(Context context) {
        return Math.max(15, prefs(context).getInt(KEY_REM_MINUTES, 240));
    }

    static long getReminderCoveredUntil(Context context) {
        return prefs(context).getLong(KEY_REM_COVERED, 0L);
    }

    /** Gastos detectados que la app todavía no ha recogido (se vacía en drain). */
    static int getUnseenExpenses(Context context) {
        return prefs(context).getInt(KEY_UNSEEN, 0);
    }

    /** Valor del último gasto detectado sin recoger (0 si no se pudo leer). Solo sirve cuando es el único pendiente. */
    static long getLastUnseenAmount(Context context) {
        return prefs(context).getLong(KEY_UNSEEN_AMOUNT, 0L);
    }

    /**
     * Cuenta un gasto detectado que la app todavía no ha recogido. Devuelve false (y no suma) si es el mismo mensaje
     * que ya se contó: las apps de SMS y de bancos suelen volver a publicar la notificación, y la parte web lo
     * descartaría como repetido (mismo texto, a menos de 2 minutos), así que contarlo daría "2 compras" con un solo gasto.
     * `foldedText` es el texto sin tildes ni mayúsculas ni espacios repetidos (igual que la huella de `parseNotification.ts`).
     * La lista de recientes NO se vacía en drain: el repetido puede llegar después de que la app ya recogió el original.
     */
    static boolean registerUnseenExpense(Context context, String foldedText, long time, long amount) {
        synchronized (LOCK) {
            SharedPreferences p = prefs(context);
            long now = System.currentTimeMillis();
            JSONArray recent = readArray(p.getString(KEY_RECENT, null));
            List<JSONObject> kept = new ArrayList<JSONObject>();
            boolean duplicate = false;
            for (int i = 0; i < recent.length(); i++) {
                JSONObject entry = recent.optJSONObject(i);
                if (entry == null || now - entry.optLong("seenAt") > RECENT_KEEP_MS) continue;
                kept.add(entry);
                if (foldedText.equals(entry.optString("k")) && Math.abs(time - entry.optLong("t")) <= DUPLICATE_WINDOW_MS) {
                    duplicate = true;
                }
            }
            if (!duplicate) {
                try {
                    JSONObject entry = new JSONObject();
                    entry.put("k", foldedText);
                    entry.put("t", time);
                    entry.put("seenAt", now);
                    kept.add(entry);
                } catch (JSONException error) {
                    return false;
                }
            }
            JSONArray saved = new JSONArray();
            for (int i = Math.max(0, kept.size() - MAX_RECENT); i < kept.size(); i++) saved.put(kept.get(i));
            SharedPreferences.Editor editor = p.edit().putString(KEY_RECENT, saved.toString());
            if (!duplicate) {
                editor.putInt(KEY_UNSEEN, p.getInt(KEY_UNSEEN, 0) + 1).putLong(KEY_UNSEEN_AMOUNT, amount);
            }
            editor.commit();
            return !duplicate;
        }
    }

    static long getFallbackStart(Context context) {
        return prefs(context).getLong(KEY_FB_START, 0L);
    }

    static int getFallbackSent(Context context) {
        return prefs(context).getInt(KEY_FB_SENT, 0);
    }

    static long getFallbackNextAt(Context context) {
        return prefs(context).getLong(KEY_FB_NEXT, 0L);
    }

    static void setFallbackChain(Context context, long start, int sent, long nextAt) {
        prefs(context).edit()
                .putLong(KEY_FB_START, start)
                .putInt(KEY_FB_SENT, sent)
                .putLong(KEY_FB_NEXT, nextAt)
                .commit();
    }

    static void clearFallbackChain(Context context) {
        prefs(context).edit().remove(KEY_FB_START).remove(KEY_FB_SENT).remove(KEY_FB_NEXT).commit();
    }

    static void append(Context context, JSONObject event) {
        synchronized (LOCK) {
            JSONArray queue = readQueue(context);
            String pkg = event.optString("pkg");
            String text = event.optString("text");
            long time = event.optLong("time");
            for (int i = 0; i < queue.length(); i++) {
                JSONObject existing = queue.optJSONObject(i);
                if (existing != null
                        && pkg.equals(existing.optString("pkg"))
                        && text.equals(existing.optString("text"))
                        && time == existing.optLong("time")) {
                    return; // La misma notificación republicada.
                }
            }
            queue.put(event);
            if (queue.length() > MAX_QUEUE) {
                JSONArray trimmed = new JSONArray();
                for (int i = queue.length() - MAX_QUEUE; i < queue.length(); i++) trimmed.put(queue.opt(i));
                queue = trimmed;
            }
            prefs(context).edit().putString(KEY_QUEUE, queue.toString()).commit();
        }
    }

    /** Devuelve todo lo pendiente y vacía la cola. */
    static List<JSONObject> drain(Context context) {
        synchronized (LOCK) {
            JSONArray queue = readQueue(context);
            List<JSONObject> events = new ArrayList<JSONObject>();
            for (int i = 0; i < queue.length(); i++) {
                JSONObject event = queue.optJSONObject(i);
                if (event != null) events.add(event);
            }
            prefs(context).edit().remove(KEY_QUEUE).remove(KEY_UNSEEN).remove(KEY_UNSEEN_AMOUNT).commit();
            return events;
        }
    }

    private static JSONArray readQueue(Context context) {
        return readArray(prefs(context).getString(KEY_QUEUE, null));
    }

    private static JSONArray readArray(String raw) {
        if (raw == null) return new JSONArray();
        try {
            return new JSONArray(raw);
        } catch (JSONException e) {
            return new JSONArray();
        }
    }
}
