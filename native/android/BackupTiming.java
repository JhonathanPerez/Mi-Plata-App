package __PACKAGE__;

import java.util.Calendar;
import java.util.TimeZone;

/** Cálculos puros del horario de copias; no depende de APIs Android y se puede probar con JUnit. */
final class BackupTiming {

    static final long DAY_MS = 86_400_000L;

    private BackupTiming() {}

    /** Convierte HH:mm (24 horas) en [hora, minuto]. Devuelve null si el valor no es válido. */
    static int[] parseTime(String value) {
        if (value == null || !value.matches("^([01]\\d|2[0-3]):[0-5]\\d$")) return null;
        return new int[] {
            Integer.parseInt(value.substring(0, 2)),
            Integer.parseInt(value.substring(3, 5))
        };
    }

    /** Milisegundos hasta la próxima ocurrencia local de HH:mm (hoy si aún no pasó; mañana en caso contrario). */
    static long millisUntilNext(long nowMillis, TimeZone zone, int hour, int minute) {
        if (zone == null || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            throw new IllegalArgumentException("Zona horaria u hora inválida.");
        }

        Calendar next = Calendar.getInstance(zone);
        next.setTimeInMillis(nowMillis);
        next.set(Calendar.HOUR_OF_DAY, hour);
        next.set(Calendar.MINUTE, minute);
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);

        // Comparación exacta: una ejecución anticipada debe poder reprogramarse para hoy,
        // incluso si faltan solo unos milisegundos para la hora configurada.
        if (next.getTimeInMillis() <= nowMillis) {
            next.add(Calendar.DAY_OF_MONTH, 1);
        }
        return next.getTimeInMillis() - nowMillis;
    }

    /** Índice del día de calendario local; respeta el offset de zona horaria de ese instante. */
    static long localDayIndex(long millis, TimeZone zone) {
        long local = millis + zone.getOffset(millis);
        return local >= 0 ? local / DAY_MS : -((-local + DAY_MS - 1) / DAY_MS);
    }

    /**
     * Solo permite la copia cuando ya llegó HH:mm en la zona local y se cumplió el intervalo
     * de días calendario desde la última copia correcta. Nunca usa el intento fallido como base.
     */
    static boolean isDue(Long lastOkMillis, long nowMillis, TimeZone zone,
                         int intervalDays, int hour, int minute) {
        if (zone == null || intervalDays < 1 || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            return false;
        }

        Calendar now = Calendar.getInstance(zone);
        now.setTimeInMillis(nowMillis);
        int currentMinuteOfDay = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
        int scheduledMinuteOfDay = hour * 60 + minute;

        // WorkManager puede entregar una tarea antes de la hora solicitada. En ese caso,
        // el Worker no hace la copia y su finally programa la siguiente comprobación.
        if (currentMinuteOfDay < scheduledMinuteOfDay) return false;
        if (lastOkMillis == null) return true;

        return localDayIndex(nowMillis, zone) - localDayIndex(lastOkMillis, zone) >= intervalDays;
    }
}
