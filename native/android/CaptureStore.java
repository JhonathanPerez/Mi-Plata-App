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
    private static final String KEY_FB_START = "fb_start";
    private static final String KEY_FB_SENT = "fb_sent";
    private static final String KEY_FB_NEXT = "fb_next_at";
    private static final int MAX_QUEUE = 200;
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

    static void incrementUnseenExpenses(Context context, long amount) {
        synchronized (LOCK) {
            SharedPreferences p = prefs(context);
            p.edit()
                    .putInt(KEY_UNSEEN, p.getInt(KEY_UNSEEN, 0) + 1)
                    .putLong(KEY_UNSEEN_AMOUNT, amount)
                    .commit();
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
        String raw = prefs(context).getString(KEY_QUEUE, null);
        if (raw == null) return new JSONArray();
        try {
            return new JSONArray(raw);
        } catch (JSONException e) {
            return new JSONArray();
        }
    }
}
