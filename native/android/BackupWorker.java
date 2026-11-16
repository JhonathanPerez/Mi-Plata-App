package __PACKAGE__;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * La copia de seguridad en segundo plano. A la hora elegida (y si ya toca según la frecuencia) lee las tablas de la base de
 * datos, las cifra con la contraseña y las deja en la carpeta de la nube que la persona eligió, aunque la app esté cerrada.
 * Nunca escribe sin cifrar: sin contraseña, falla y lo anota. Siempre deja programada la siguiente ejecución, haya salido
 * bien o mal; la app lee el resultado cuando se abre y lo muestra.
 */
public class BackupWorker extends Worker {

    public BackupWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        String slot = getInputData().getString(BackupScheduler.KEY_SLOT);
        try {
            if (BackupScheduleStore.enabled(context)) runIfDue(context);
        } finally {
            if (BackupScheduleStore.enabled(context)) BackupScheduler.enqueue(context, BackupScheduler.otherSlot(slot));
        }
        // Siempre «éxito»: un fallo ya quedó anotado y WorkManager no debe reintentar ni cancelar la cadena.
        return Result.success();
    }

    private void runIfDue(Context context) {
        long now = System.currentTimeMillis();
        if (!BackupTiming.isDue(
            BackupScheduleStore.lastOkAt(context), now, TimeZone.getDefault(),
            BackupScheduleStore.intervalDays(context), BackupScheduleStore.hour(context), BackupScheduleStore.minute(context)
        )) return;
        try {
            runBackup(context, now);
        } catch (Exception e) {
            BackupScheduleStore.recordRun(context, now, e.getMessage() == null || e.getMessage().isEmpty() ? e.getClass().getSimpleName() : e.getMessage());
        }
    }

    private void runBackup(Context context, long now) throws Exception {
        String dump;
        String password;
        try (SqliteDumpSource source = SqliteDumpSource.open(context)) {
            // Instalación nueva (o sin datos todavía): no hay nada que guardar. No se escribe ni se anota como fallo; se vuelve a
            // revisar en la próxima ejecución. Una copia vacía solo serviría para desplazar a las buenas.
            if (!source.hasUserData()) return;
            if (CloudFolderStore.savedTree(context) == null) throw new IOException(CloudFolderStore.NO_FOLDER_MESSAGE);
            password = SecretStore.read(context);
            if (password == null || password.isEmpty()) throw new IOException("Falta la contraseña de cifrado en este teléfono. Defínela de nuevo en la app.");
            dump = RawDump.build(source, isoUtc(now));
        }
        String envelope = BackupCrypto.encrypt(dump, password, BackupCrypto.KDF_ITERATIONS);

        String date = BackupNames.isoDate(now, TimeZone.getDefault());
        String name = BackupNames.cloudFileName(date);
        CloudFolderStore.writeFile(context, name, envelope, "application/json");
        BackupScheduleStore.recordRun(context, now, null);
        BackupScheduleStore.setLastCloudDate(context, date);

        pruneOld(context, name);
    }

    /** Conserva solo las últimas copias. Un fallo aquí no invalida la copia que ya quedó guardada. */
    private void pruneOld(Context context, String justWritten) {
        try {
            List<String> names = CloudFolderStore.listNames(context);
            for (String old : BackupNames.toPrune(names, BackupScheduleStore.keep(context))) {
                if (!old.equals(justWritten)) CloudFolderStore.deleteFile(context, old);
            }
        } catch (Exception ignored) {
            // Se intentará de nuevo con la próxima copia.
        }
    }

    private static String isoUtc(long millis) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date(millis));
    }
}
