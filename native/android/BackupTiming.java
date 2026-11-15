package __PACKAGE__;

import java.util.Calendar;
import java.util.TimeZone;

/**
 * Cuentas de horario de las copias en segundo plano, sin nada de Android para poder probarlas solas. Usa Calendar y no
 * java.time porque este último no existe en Android 7 o menor (minSdk 23).
 */
final class BackupTiming {

    static final long DAY_MS = 86_400_000L;
    /** Si la hora elegida queda a menos de esto, se programa para el día siguiente (así no se dispara dos veces seguidas). */
    private static final long MIN_AHEAD_MS = 60_000L;

    private BackupTiming() {}

    /** «HH:MM» (24 horas) a {hora, minuto}; null si no es una hora válida. */
    static int[] parseTime(String value) {
        if (value == null || !value.matches("^([01]\\d|2[0-3]):[0-5]\\d$")) return null;
        return new int[] {Integer.parseInt(value.substring(0, 2)), Integer.parseInt(value.substring(3, 5))};
    }

    /** Milisegundos hasta la próxima vez que el reloj marque esa hora (hoy si falta más de un minuto, si no mañana). */
    static long millisUntilNext(long nowMillis, TimeZone zone, int hour, int minute) {
        Calendar next = Calendar.getInstance(zone);
        next.setTimeInMillis(nowMillis);
        next.set(Calendar.HOUR_OF_DAY, hour);
        next.set(Calendar.MINUTE, minute);
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        if (next.getTimeInMillis() <= nowMillis + MIN_AHEAD_MS) next.add(Calendar.DAY_OF_MONTH, 1);
        return next.getTimeInMillis() - nowMillis;
    }

    /** Número del día de calendario local (días desde 1970). Se calcula a mano: Math.floorDiv no existe en Android 6. */
    static long localDayIndex(long millis, TimeZone zone) {
        long local = millis + zone.getOffset(millis);
        return local >= 0 ? local / DAY_MS : -((-local + DAY_MS - 1) / DAY_MS);
    }

    /** ¿Ya toca? Cuenta días de calendario desde la última vez que salió bien (null = nunca). */
    static boolean isDue(Long lastOkMillis, long nowMillis, TimeZone zone, int intervalDays) {
        if (lastOkMillis == null) return true;
        return localDayIndex(nowMillis, zone) - localDayIndex(lastOkMillis, zone) >= intervalDays;
    }
}
