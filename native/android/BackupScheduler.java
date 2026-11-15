package __PACKAGE__;

import android.content.Context;

import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;

import java.util.List;
import java.util.TimeZone;
import java.util.concurrent.TimeUnit;

/**
 * Programa la tarea de la copia a la hora elegida con WorkManager, que Android conserva aunque se cierre la app o se
 * reinicie el teléfono. Es una cadena de tareas de una sola vez: cada una, al terminar, programa la siguiente para la
 * próxima vez que el reloj marque la hora. Así no se acumula retraso (las tareas periódicas de WorkManager sí derivan).
 * Se alternan dos nombres («a» y «b») para que una tarea pueda programar a la siguiente sin cancelarse a sí misma.
 * Android puede atrasar la tarea unos minutos para ahorrar batería: es «a esa hora, más o menos», no al segundo.
 */
final class BackupScheduler {

    static final String KEY_SLOT = "slot";
    private static final String WORK_A = "miplata_backup_a";
    private static final String WORK_B = "miplata_backup_b";

    private BackupScheduler() {}

    private static String nameOf(String slot) {
        return "b".equals(slot) ? WORK_B : WORK_A;
    }

    static String otherSlot(String slot) {
        return "b".equals(slot) ? "a" : "b";
    }

    /** ¿Hay una tarea esperando (o corriendo)? */
    private static boolean isScheduled(Context context) {
        try {
            WorkManager manager = WorkManager.getInstance(context);
            for (String name : new String[] {WORK_A, WORK_B}) {
                List<WorkInfo> infos = manager.getWorkInfosForUniqueWork(name).get();
                for (WorkInfo info : infos) {
                    if (info.getState() == WorkInfo.State.ENQUEUED || info.getState() == WorkInfo.State.RUNNING || info.getState() == WorkInfo.State.BLOCKED) return true;
                }
            }
        } catch (Exception ignored) {
            // Sin poder saberlo, se vuelve a programar: es lo seguro.
        }
        return false;
    }

    /**
     * Programa (o reprograma) la tarea. Si el horario es el mismo y ya hay una tarea esperando no hace nada: la app llama a
     * esto cada vez que se abre y no debe interrumpir una tarea en curso ni reiniciar la espera.
     */
    static void schedule(Context context, int hour, int minute, int intervalDays, int keep) {
        boolean same = BackupScheduleStore.sameConfig(context, hour, minute, intervalDays, keep);
        BackupScheduleStore.saveConfig(context, hour, minute, intervalDays, keep);
        if (same && isScheduled(context)) return;
        WorkManager.getInstance(context).cancelUniqueWork(WORK_B);
        enqueue(context, "a");
    }

    static void enqueue(Context context, String slot) {
        long delay = BackupTiming.millisUntilNext(System.currentTimeMillis(), TimeZone.getDefault(), BackupScheduleStore.hour(context), BackupScheduleStore.minute(context));
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(BackupWorker.class)
            .setInitialDelay(delay, TimeUnit.MILLISECONDS)
            .setInputData(new Data.Builder().putString(KEY_SLOT, slot).build())
            .build();
        // Se anota cuándo debería correr, para mostrarlo en la pantalla.
        BackupScheduleStore.setNextRunAt(context, System.currentTimeMillis() + delay);
        WorkManager.getInstance(context).enqueueUniqueWork(nameOf(slot), ExistingWorkPolicy.REPLACE, request);
    }

    static void cancel(Context context) {
        BackupScheduleStore.disable(context);
        WorkManager manager = WorkManager.getInstance(context);
        manager.cancelUniqueWork(WORK_A);
        manager.cancelUniqueWork(WORK_B);
    }
}
