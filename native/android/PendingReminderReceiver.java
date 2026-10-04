package __PACKAGE__;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import java.util.Calendar;

/**
 * Recordatorio de "gastos por categorizar" que funciona con la app CERRADA.
 *
 * El recordatorio normal lo programa la parte web (Capacitor) y solo cuando la app se abre. Si un gasto se captura
 * automáticamente y la app nunca se abre, la parte web no corre y nadie programa nada. Este receptor cubre ese hueco:
 * cuando el lector de notificaciones registra un gasto y NO hay un plan de avisos vigente, programa aquí mismo
 * (AlarmManager) una cadena de avisos, cada `intervalMinutes`, que se repite mientras el usuario no abra la app.
 * Al abrirla, la parte web recoge los gastos y vuelve a tomar el control (setPendingReminder cancela esta cadena).
 *
 * Mantén las horas de silencio y los límites en sintonía con `pendingReminders.ts`.
 */
public class PendingReminderReceiver extends BroadcastReceiver {

    private static final String TAG = "MiPlataReminder";
    private static final String ACTION = "__PACKAGE__.PENDING_REMINDER";
    private static final String CHANNEL_ID = "capturas";
    /** Gemelo de `PENDING_REMINDER_TITLE` en `captureCopy.ts`. */
    private static final String REMINDER_TITLE = "Gastos por categorizar";
    private static final int REQUEST_CODE = 7301;
    /** Fuera del rango de ids que usa la parte web (2_100_000_000 + 0..39) para no pisarse con sus avisos. */
    private static final int NOTIFICATION_ID = 2_100_000_500;
    private static final int QUIET_FROM_HOUR = 22;
    private static final int QUIET_UNTIL_HOUR = 8;
    private static final int MAX_CHAIN = 40;
    private static final long HORIZON_MS = 7L * 24 * 3_600_000L;

    /** Lo llama el servicio cada vez que registra algo que parece un gasto. */
    static void onExpenseCaptured(Context context) {
        try {
            Context app = context.getApplicationContext();
            if (!CaptureStore.isReminderEnabled(app)) return;
            long now = System.currentTimeMillis();
            // La parte web ya dejó avisos programados para hoy: ellos se encargan.
            if (CaptureStore.getReminderCoveredUntil(app) > now) return;
            // Ya hay una cadena en marcha: no se reinicia (así el intervalo se cuenta desde el primer gasto).
            if (CaptureStore.getFallbackNextAt(app) > now) return;

            CaptureStore.setFallbackChain(app, now, 0, 0);
            scheduleNext(app, now);
        } catch (Throwable error) {
            Log.w(TAG, "No se pudo programar el recordatorio", error);
        }
    }

    /** Cancela la cadena (la app se abrió y la parte web retoma el recordatorio, o se desactivó). */
    static void cancelFallback(Context context) {
        try {
            Context app = context.getApplicationContext();
            AlarmManager alarms = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
            if (alarms != null) alarms.cancel(alarmIntent(app));
            CaptureStore.clearFallbackChain(app);
        } catch (Throwable error) {
            Log.w(TAG, "No se pudo cancelar el recordatorio", error);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            Context app = context.getApplicationContext();
            long now = System.currentTimeMillis();
            boolean stillNeeded = CaptureStore.isReminderEnabled(app)
                    && CaptureStore.getUnseenExpenses(app) > 0
                    && CaptureStore.getReminderCoveredUntil(app) <= now;
            if (!stillNeeded) {
                CaptureStore.clearFallbackChain(app);
                return;
            }
            show(app);

            long start = CaptureStore.getFallbackStart(app);
            int sent = CaptureStore.getFallbackSent(app) + 1;
            CaptureStore.setFallbackChain(app, start, sent, 0);
            if (sent >= MAX_CHAIN || now - start > HORIZON_MS) {
                CaptureStore.clearFallbackChain(app);
                return;
            }
            scheduleNext(app, now);
        } catch (Throwable error) {
            Log.w(TAG, "No se pudo mostrar el recordatorio", error);
        }
    }

    private static void scheduleNext(Context app, long from) {
        long stepMs = CaptureStore.getReminderMinutes(app) * 60_000L;
        long at = outOfQuiet(from + stepMs);
        AlarmManager alarms = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        PendingIntent pending = alarmIntent(app);

        boolean exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms();
        try {
            if (exact) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
            else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
        } catch (SecurityException denied) {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
        }
        CaptureStore.setFallbackChain(app, CaptureStore.getFallbackStart(app), CaptureStore.getFallbackSent(app), at);
    }

    /** Si `millis` cae entre las 10 pm y las 8 am, lo pasa a las 8:00 am siguientes. */
    static long outOfQuiet(long millis) {
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(millis);
        int hour = cal.get(Calendar.HOUR_OF_DAY);
        if (hour < QUIET_FROM_HOUR && hour >= QUIET_UNTIL_HOUR) return millis;
        if (hour >= QUIET_FROM_HOUR) cal.add(Calendar.DAY_OF_YEAR, 1);
        cal.set(Calendar.HOUR_OF_DAY, QUIET_UNTIL_HOUR);
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        return cal.getTimeInMillis();
    }

    private static PendingIntent alarmIntent(Context app) {
        Intent intent = new Intent(app, PendingReminderReceiver.class).setAction(ACTION);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(app, REQUEST_CODE, intent, flags);
    }

    /**
     * Gemelo de `pendingReminderBody` en `captureCopy.ts`: el valor si es una sola compra, la cantidad si son varias.
     * Si es una sola y no se conoce su valor (`singleAmount` <= 0), no se inventa una cifra.
     */
    static String reminderBody(int count, long singleAmount) {
        if (count == 1) {
            return singleAmount > 0
                    ? "Tienes una compra por " + ExpenseTextParser.formatCop(singleAmount) + " pendiente por categorizar"
                    : "Tienes una compra pendiente por categorizar";
        }
        return "Tienes " + count + " compras pendientes por categorizar";
    }

    private static void show(Context app) {
        if (!NotificationManagerCompat.from(app).areNotificationsEnabled()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = app.getSystemService(NotificationManager.class);
            if (manager != null) {
                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID, "Gastos detectados", NotificationManager.IMPORTANCE_HIGH);
                channel.enableVibration(true);
                manager.createNotificationChannel(channel);
            }
        }

        Intent launch = app.getPackageManager().getLaunchIntentForPackage(app.getPackageName());
        PendingIntent tap = null;
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
            tap = PendingIntent.getActivity(app, 1, launch, flags);
        }

        // Los que la app ya tenía guardados + los detectados desde entonces. Con una sola compra, el único valor
        // posible es el del gasto detectado con la app cerrada (si ya había uno guardado, el total sería 2 o más).
        int total = CaptureStore.getReminderPendingCount(app) + CaptureStore.getUnseenExpenses(app);
        int icon = app.getResources().getIdentifier("ic_stat_miplata", "drawable", app.getPackageName());
        NotificationCompat.Builder builder = new NotificationCompat.Builder(app, CHANNEL_ID)
                .setSmallIcon(icon != 0 ? icon : android.R.drawable.stat_notify_chat)
                .setContentTitle(REMINDER_TITLE)
                .setContentText(reminderBody(total, CaptureStore.getLastUnseenAmount(app)))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setAutoCancel(true);
        if (tap != null) builder.setContentIntent(tap);
        NotificationManagerCompat.from(app).notify(NOTIFICATION_ID, builder.build());
    }
}
