package __PACKAGE__;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Puente para que la app web programe la copia en segundo plano, guarde la contraseña de cifrado donde la tarea pueda leerla
 * y lea cómo le fue a la última ejecución.
 */
@CapacitorPlugin(name = "BackupSchedule")
public class BackupSchedulePlugin extends Plugin {

    /** Programa la tarea: a la hora «HH:MM», una vez cada `intervalDays` días, conservando `keep` copias. Se puede llamar cuantas veces haga falta. */
    @PluginMethod
    public void schedule(PluginCall call) {
        int[] time = BackupTiming.parseTime(call.getString("time"));
        Integer intervalDays = call.getInt("intervalDays");
        Integer keep = call.getInt("keep");
        if (time == null || intervalDays == null || intervalDays < 1 || intervalDays > 31 || keep == null || keep < 1 || keep > 100) {
            call.reject("Horario inválido.");
            return;
        }
        try {
            BackupScheduler.schedule(getContext(), time[0], time[1], intervalDays, keep);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo programar la copia en segundo plano: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        try {
            BackupScheduler.cancel(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo cancelar la copia en segundo plano: " + e.getMessage());
        }
    }

    /** Si está programada y cómo le fue al último intento. Los campos que no aplican se omiten. */
    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        boolean enabled = BackupScheduleStore.enabled(getContext());
        result.put("scheduled", enabled);
        if (enabled) {
            result.put("time", String.format(java.util.Locale.US, "%02d:%02d", BackupScheduleStore.hour(getContext()), BackupScheduleStore.minute(getContext())));
            result.put("intervalDays", BackupScheduleStore.intervalDays(getContext()));
            long nextRunAt = BackupScheduleStore.nextRunAt(getContext());
            if (nextRunAt > 0) result.put("nextRunAt", nextRunAt);
        }
        long lastRunAt = BackupScheduleStore.lastRunAt(getContext());
        if (lastRunAt > 0) {
            result.put("lastRunAt", lastRunAt);
            result.put("lastOk", BackupScheduleStore.lastOk(getContext()));
            String error = BackupScheduleStore.lastError(getContext());
            if (error != null && !BackupScheduleStore.lastOk(getContext())) result.put("lastError", error);
        }
        String lastCloudDate = BackupScheduleStore.lastCloudDate(getContext());
        if (lastCloudDate != null) result.put("lastCloudDate", lastCloudDate);
        call.resolve(result);
    }

    /** Guarda la contraseña de cifrado (cifrada con el Keystore de Android) para que la tarea en segundo plano la use. */
    @PluginMethod
    public void setPassword(PluginCall call) {
        String password = call.getString("password");
        if (password == null || password.isEmpty()) {
            call.reject("Contraseña inválida.");
            return;
        }
        try {
            SecretStore.save(getContext(), password);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo guardar la contraseña de forma segura: " + e.getMessage());
        }
    }

    /** La contraseña guardada; el campo se omite si no hay ninguna. */
    @PluginMethod
    public void getPassword(PluginCall call) {
        try {
            String password = SecretStore.read(getContext());
            JSObject result = new JSObject();
            if (password != null) result.put("password", password);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("No se pudo leer la contraseña guardada: " + e.getMessage());
        }
    }

    @PluginMethod
    public void clearPassword(PluginCall call) {
        SecretStore.clear(getContext());
        call.resolve();
    }
}
