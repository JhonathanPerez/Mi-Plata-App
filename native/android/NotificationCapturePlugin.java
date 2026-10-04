package __PACKAGE__;

import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Puente entre la app web y el lector de notificaciones (CaptureListenerService). */
@CapacitorPlugin(name = "NotificationCapture")
public class NotificationCapturePlugin extends Plugin {

    @Override
    public void load() {
        // Con la app abierta, avisa a la parte web en cuanto llega un gasto para que lo recoja al momento.
        CaptureStore.setListener(new CaptureStore.Listener() {
            @Override
            public void onCaptured() {
                notifyListeners("captured", new JSObject());
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        CaptureStore.setListener(null);
    }

    /** ¿Tiene Mi Plata concedido "Acceso a notificaciones"? */
    @PluginMethod
    public void isEnabled(PluginCall call) {
        JSObject result = new JSObject();
        result.put("enabled", isListenerEnabled());
        call.resolve(result);
    }

    /** Abre la pantalla de Android donde se concede ese acceso. */
    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            getActivity().startActivity(new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"));
            call.resolve();
        } catch (Exception first) {
            try {
                Intent details = new Intent(
                        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(details);
                call.resolve();
            } catch (Exception second) {
                call.reject("No se pudieron abrir los ajustes de notificaciones.", second);
            }
        }
    }

    @PluginMethod
    public void setPackages(PluginCall call) {
        JSArray array = call.getArray("packages");
        Set<String> packages = new HashSet<String>();
        if (array != null) {
            for (int i = 0; i < array.length(); i++) {
                String value = array.optString(i, "");
                if (!value.isEmpty()) packages.add(value);
            }
        }
        CaptureStore.setPackages(getContext(), packages);
        call.resolve();
    }

    /**
     * Apps instaladas con ícono en el lanzador (para elegir cuáles vigilar). Se excluye Mi Plata.
     * Requiere el bloque {@code <queries>} del manifiesto (ver `apply-android-native.mjs`); sin él,
     * Android 11+ solo dejaría ver un puñado de apps del sistema.
     */
    @PluginMethod
    public void listApps(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        String selfPackage = getContext().getPackageName();

        Intent launcher = new Intent(Intent.ACTION_MAIN);
        launcher.addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> resolved = pm.queryIntentActivities(launcher, 0);

        // Un mismo paquete puede traer varias actividades de lanzador: se queda con una sola fila.
        final Map<String, String> labelByPackage = new LinkedHashMap<String, String>();
        for (ResolveInfo info : resolved) {
            String pkg = info.activityInfo != null ? info.activityInfo.packageName : null;
            if (pkg == null || pkg.equals(selfPackage) || labelByPackage.containsKey(pkg)) continue;
            CharSequence label = info.loadLabel(pm);
            labelByPackage.put(pkg, label == null || label.length() == 0 ? pkg : label.toString());
        }

        List<String> packages = new ArrayList<String>(labelByPackage.keySet());
        Collections.sort(packages, new Comparator<String>() {
            @Override
            public int compare(String a, String b) {
                return labelByPackage.get(a).compareToIgnoreCase(labelByPackage.get(b));
            }
        });

        JSArray apps = new JSArray();
        for (String pkg : packages) {
            JSObject app = new JSObject();
            app.put("pkg", pkg);
            app.put("label", labelByPackage.get(pkg));
            apps.put(app);
        }
        JSObject result = new JSObject();
        result.put("apps", apps);
        call.resolve(result);
    }

    /**
     * La parte web informa cómo quedó el recordatorio de pendientes: si está activo, cada cuántos minutos, hasta cuándo
     * dejó avisos programados (0 = ninguno) y cuántos gastos hay por categorizar. Como la app está abierta, se cancela
     * la cadena nativa: la web toma el control.
     */
    @PluginMethod
    public void setPendingReminder(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        Integer minutes = call.getInt("intervalMinutes", 240);
        long coveredUntil = call.getData().optLong("coveredUntil", 0L);
        Integer pending = call.getInt("pendingCount", 0);
        CaptureStore.setReminderConfig(
                getContext(), enabled, minutes == null ? 240 : minutes, coveredUntil, pending == null ? 0 : pending);
        PendingReminderReceiver.cancelFallback(getContext());
        call.resolve();
    }

    /** Entrega los avisos capturados desde la última vez y vacía la cola. */
    @PluginMethod
    public void drain(PluginCall call) {
        JSArray events = new JSArray();
        List<JSONObject> queued = CaptureStore.drain(getContext());
        for (JSONObject event : queued) events.put(event);
        JSObject result = new JSObject();
        result.put("events", events);
        call.resolve(result);
    }

    /** Pide a Android reconectar el lector si el sistema lo había desconectado. */
    @PluginMethod
    public void rebind(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isListenerEnabled()) {
            try {
                NotificationListenerService.requestRebind(
                        new ComponentName(getContext(), CaptureListenerService.class));
            } catch (Throwable ignored) {
                // No es crítico: se reintenta en la próxima apertura.
            }
        }
        call.resolve();
    }

    private boolean isListenerEnabled() {
        String flat = Settings.Secure.getString(getContext().getContentResolver(), "enabled_notification_listeners");
        if (flat == null || flat.isEmpty()) return false;
        String mine = getContext().getPackageName();
        for (String part : flat.split(":")) {
            ComponentName component = ComponentName.unflattenFromString(part);
            if (component != null && mine.equals(component.getPackageName())) return true;
        }
        return false;
    }
}
