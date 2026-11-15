package __PACKAGE__;

import android.content.Context;
import android.content.SharedPreferences;

/** Lo que la tarea en segundo plano necesita recordar: el horario elegido y cómo le fue la última vez. */
final class BackupScheduleStore {

    private static final String PREFS = "backup_schedule";

    private BackupScheduleStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void saveConfig(Context context, int hour, int minute, int intervalDays, int keep) {
        prefs(context).edit()
            .putBoolean("enabled", true)
            .putInt("hour", hour)
            .putInt("minute", minute)
            .putInt("interval_days", intervalDays)
            .putInt("keep", keep)
            .apply();
    }

    static void disable(Context context) {
        prefs(context).edit().putBoolean("enabled", false).putLong("next_run_at", 0L).apply();
    }

    static boolean enabled(Context context) {
        return prefs(context).getBoolean("enabled", false);
    }

    static int hour(Context context) {
        return prefs(context).getInt("hour", 21);
    }

    static int minute(Context context) {
        return prefs(context).getInt("minute", 0);
    }

    static int intervalDays(Context context) {
        return prefs(context).getInt("interval_days", 1);
    }

    /** Cuántas copias se conservan en la carpeta (las más antiguas se borran). */
    static int keep(Context context) {
        return prefs(context).getInt("keep", 5);
    }

    static boolean sameConfig(Context context, int hour, int minute, int intervalDays, int keep) {
        return enabled(context) && hour(context) == hour && minute(context) == minute && intervalDays(context) == intervalDays && keep(context) == keep;
    }

    /** Anota el resultado del último intento. `error` es null si salió bien. */
    static void recordRun(Context context, long at, String error) {
        SharedPreferences.Editor editor = prefs(context).edit().putLong("last_run_at", at).putBoolean("last_ok", error == null);
        if (error == null) editor.remove("last_error").putLong("last_ok_at", at);
        else editor.putString("last_error", error);
        editor.apply();
    }

    /** Cuándo fue el último intento (milisegundos); 0 si nunca. */
    static long lastRunAt(Context context) {
        return prefs(context).getLong("last_run_at", 0L);
    }

    static boolean lastOk(Context context) {
        return prefs(context).getBoolean("last_ok", false);
    }

    static String lastError(Context context) {
        return prefs(context).getString("last_error", null);
    }

    /** Cuándo salió bien por última vez; null si nunca. */
    static Long lastOkAt(Context context) {
        SharedPreferences prefs = prefs(context);
        return prefs.contains("last_ok_at") ? Long.valueOf(prefs.getLong("last_ok_at", 0L)) : null;
    }

    /** La fecha (AAAA-MM-DD) de la última copia que llegó a la carpeta; la app la usa para no repetirla. */
    static void setLastCloudDate(Context context, String isoDate) {
        prefs(context).edit().putString("last_cloud_date", isoDate).apply();
    }

    static String lastCloudDate(Context context) {
        return prefs(context).getString("last_cloud_date", null);
    }

    /** Cuándo está prevista la próxima ejecución programada (milisegundos); 0 si no hay. */
    static void setNextRunAt(Context context, long at) {
        prefs(context).edit().putLong("next_run_at", at).apply();
    }

    static long nextRunAt(Context context) {
        return prefs(context).getLong("next_run_at", 0L);
    }
}
