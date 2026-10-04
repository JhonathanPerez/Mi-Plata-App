package __PACKAGE__;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Parcelable;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.regex.Pattern;

/**
 * Lee las notificaciones de las apps de tu lista (por ejemplo Nu y las apps de SMS) y guarda en una cola
 * las que traen un monto en pesos. Todo lo demás se descarta al instante, sin guardarse.
 * No usa Internet: la cola solo la recoge la propia app de Mi Plata.
 */
public class CaptureListenerService extends NotificationListenerService {

    private static final String TAG = "MiPlataCapture";
    private static final int MAX_TEXT = 600;
    /**
     * Filtro de privacidad: solo se guarda un aviso que parezca traer un monto en pesos. Es un filtro amplio a
     * propósito; el análisis fino (fechas, saldos, códigos…) lo hace `parseNotification.ts`. Mantén ambos en sintonía.
     * Cuenta como monto: un "$", "COP" o "pesos"; un número con separador de miles ("25.000", "1,250,000"), que
     * es lo típico de un SMS que omite el "$"; o una palabra de gasto seguida de 3+ dígitos ("compra por 25000").
     */
    private static final Pattern CURRENCY = Pattern.compile("\\b(COP|pesos)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern FORMATTED_NUMBER =
            Pattern.compile("(?<![\\d.,/:*#])\\d{1,3}(?:[.,]\\d{3})+(?![\\d/:])");
    private static final Pattern SPEND_CUE_NUMBER = Pattern.compile(
            "\\b(por|valor|vlr|monto|total|compra|compraste|pagaste|pago|retiro|retiraste|transferiste|enviaste"
                    + "|consumo|cargo|d[e\\u00e9]bito|debitaron|cobro)(\\s+de)?\\s*:?\\s*\\d{3,}",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    /**
     * Avisos que NO son un gasto real (mismas categorías que descarta primero `parseNotification.ts`:
     * SECURITY, PROMO, REMINDER, REJECTED). Se guardan igual en la cola (la web los ignorará), pero no
     * disparan el aviso "al instante": no tiene sentido mostrar una notificación que un segundo después
     * se retira. Mantén esta lista en sintonía con la de `parseNotification.ts`.
     */
    private static final Pattern NOT_AN_EXPENSE = Pattern.compile(
            "\\b(codigo|clave|token|otp)\\b.{0,80}\\b(es|sera)\\s*:?\\s*\\d{4,8}\\b"
                    + "|\\b(clave dinamica|clave temporal|codigo de seguridad|codigo de verificacion|codigo unico|otp)\\b"
                    + "|\\b(oferta|promocion|promo|preaprobad[oa]|aprovecha|solicita|te prestamos|obten|sorteo|participa)\\b"
                    + "|\\b(vence|vencimiento|fecha limite|extracto|factura disponible|recordatorio|recuerda|pago minimo|paga antes|estas al dia)\\b"
                    + "|\\b(rechazad[oa]|declinad[oa]|no aprobad[oa]|fallid[oa]|cancelad[oa]|anulad[oa]|no pudimos|no se pudo)\\b");
    /** Dinero que entra (no es un gasto nuevo). Igual que INCOME en `parseNotification.ts`. */
    private static final Pattern INCOME = Pattern.compile(
            "\\b(recibiste|recibido|recibida|te enviaron|te transfirieron|te consignaron|te pagaron|te depositaron"
                    + "|abono|abonaste|abonaron|deposito|depositaron|consignacion|ingreso|reembolso|devolucion"
                    + "|reversion|reverso|rendimientos?|cashback|pago de tu tarjeta|pago a tu tarjeta"
                    + "|pagaste tu tarjeta|pagaste tu factura)\\b");
    /**
     * Palabra que describe que efectivamente se gastó dinero. Igual que SPEND en `parseNotification.ts`.
     * Sin esto, cualquier mensaje con un valor y sin palabras de "aviso" (publicidad de otro tipo de
     * producto, planes de celular, etc.) disparaba la notificación instantánea aunque no fuera un gasto.
     */
    private static final Pattern SPEND = Pattern.compile(
            "\\b(compra|compras|compraste|pagaste|pago|pagos|retiro|retiraste|transferiste|enviaste|envio"
                    + "|consumo|cargo|debito|debitaron|debitamos|transaccion|avance|cobro|suscripcion"
                    + "|renovacion|pse)\\b");

    /**
     * Aviso "al instante": mismo canal e igual rango de ids que `captureNotifications` en `localNotifications.ts`.
     * Se muestra desde aquí, sin depender de que la app esté abierta, y luego la parte web lo reemplaza (mismo id)
     * por uno con los datos ya interpretados, o lo retira si el mensaje no resultó ser un gasto real.
     * Mantén estas constantes y `notificationIdFor` en sintonía con su gemela `captureNotificationId` en TS.
     */
    private static final String CAPTURE_CHANNEL_ID = "capturas";
    /**
     * Texto del aviso. Gemelo de `CAPTURE_NOTIFICATION_TITLE` y `captureNotificationBody` en `captureCopy.ts`.
     * El emoji de dólar (U+1F4B2) va como escape para que no dependa de la codificación al compilar.
     */
    private static final String DETECTED_TITLE = "Nuevo gasto detectado \uD83D\uDCB8";
    private static final String DETECTED_BODY_FALLBACK = "Nueva compra detectada. Abre Mi Plata para categorizarlo.";
    /** Un mensaje mucho más viejo que su captura es historial que se volvió a mostrar. Igual que `CAPTURE_MAX_LAG_MS` en `config/capture.ts`. */
    private static final long MAX_LAG_MS = 6L * 3_600_000L;
    private static final long CAPTURE_ID_BASE = 2_000_000L;
    private static final long CAPTURE_ID_SPAN = 900_000L;

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            handle(sbn);
        } catch (Throwable error) {
            // Un aviso raro nunca debe tumbar el servicio.
            Log.w(TAG, "No se pudo procesar una notificación", error);
        }
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            try {
                NotificationListenerService.requestRebind(new ComponentName(this, CaptureListenerService.class));
            } catch (Throwable ignored) {
                // Si el sistema no lo permite, se reconecta la próxima vez que se abra la app.
            }
        }
    }

    @SuppressWarnings("deprecation")
    private void handle(StatusBarNotification sbn) {
        if (sbn == null) return;
        String pkg = sbn.getPackageName();
        if (pkg == null || !CaptureStore.getPackages(this).contains(pkg)) return;

        Notification notification = sbn.getNotification();
        if (notification == null || notification.extras == null) return;
        if ((notification.flags & Notification.FLAG_ONGOING_EVENT) != 0) return;

        Bundle extras = notification.extras;
        String title = asText(extras.getCharSequence(Notification.EXTRA_TITLE));
        long postTime = sbn.getPostTime();
        long now = System.currentTimeMillis();
        boolean captured = false;

        Parcelable[] messages = extras.getParcelableArray(Notification.EXTRA_MESSAGES);
        if (messages != null && messages.length > 0) {
            // Apps de mensajes: cada mensaje trae su propia hora, así un mensaje viejo que la app vuelve a
            // mostrar se reconoce como repetido.
            for (Parcelable item : messages) {
                if (!(item instanceof Bundle)) continue;
                Bundle message = (Bundle) item;
                String text = asText(message.getCharSequence("text"));
                String who = title.isEmpty() ? asText(message.getCharSequence("sender")) : title;
                captured |= store(pkg, who, text, message.getLong("time", postTime), now);
            }
        } else {
            captured |= store(pkg, title, bestBody(extras), postTime, now);
        }

        if (captured) CaptureStore.notifyCaptured();
    }

    private boolean store(String pkg, String title, String text, long time, long capturedAt) {
        if (text.isEmpty() || !looksMonetary(title + " " + text)) return false;
        String storedTitle = truncate(title);
        String storedText = truncate(text);
        try {
            JSONObject event = new JSONObject();
            event.put("pkg", pkg);
            event.put("title", storedTitle);
            event.put("text", storedText);
            event.put("time", time);
            event.put("capturedAt", capturedAt);
            CaptureStore.append(this, event);
            // La app igual descartará estos avisos al procesarlos si no son un gasto real; evitamos además
            // mostrar-y-retirar una notificación que el usuario ya alcanzó a ver. Mismo criterio que usa
            // `parseCapture` en `parseNotification.ts` para aceptar un mensaje como gasto: no debe ser un
            // aviso conocido (código, publicidad, recordatorio, rechazo), no debe ser un ingreso, y debe
            // traer una palabra que describa que sí se gastó dinero (compra, pago, retiro…).
            String folded = ExpenseTextParser.normalize(storedTitle + " " + storedText);
            boolean looksLikeExpense = !NOT_AN_EXPENSE.matcher(folded).find()
                    && !INCOME.matcher(folded).find()
                    && SPEND.matcher(folded).find();
            if (looksLikeExpense) {
                ExpenseTextParser.Parsed parsed = ExpenseTextParser.parse(storedTitle, storedText);
                notifyDetected(displayText(storedTitle, storedText), detectedBody(parsed));
                // Con la app cerrada, la parte web no puede programar el recordatorio de "gastos por categorizar":
                // se deja armado desde aquí (si el usuario lo activó y no hay ya avisos programados). Solo cuenta lo que
                // la parte web también registraría como pendiente (con valor legible, reciente y no repetido); si no, el
                // recordatorio diría más compras de las que hay. El valor se guarda para que, si es la única, diga cuánto fue.
                if (parsed != null
                        && capturedAt - time <= MAX_LAG_MS
                        && CaptureStore.registerUnseenExpense(
                                this, collapse(ExpenseTextParser.normalize(storedText)), time, parsed.amount)) {
                    PendingReminderReceiver.onExpenseCaptured(this);
                }
            }
            return true;
        } catch (JSONException error) {
            return false;
        }
    }

    /**
     * "Nueva compra por $25.000 en Rappi. Abre Mi Plata para categorizarlo." Si no se reconoce el comercio,
     * solo el valor; si tampoco hay un valor claro, una versión sin valor (la parte web la reemplaza luego).
     * La lectura del valor y del comercio vive en {@link ExpenseTextParser}.
     */
    private static String detectedBody(ExpenseTextParser.Parsed parsed) {
        if (parsed == null) return DETECTED_BODY_FALLBACK;
        StringBuilder body = new StringBuilder("Nueva compra por ").append(ExpenseTextParser.formatCop(parsed.amount));
        if (parsed.merchant != null) body.append(" en ").append(parsed.merchant);
        return body.append(". Abre Mi Plata para categorizarlo.").toString();
    }

    /**
     * Muestra de inmediato un aviso del sistema: la parte web puede tardar en abrirse y procesar la cola
     * (o la app puede estar cerrada), así que esto avisa apenas se detecta algo que parece un gasto.
     * No interrumpe nada si falla (permiso no concedido, etc.).
     */
    private void notifyDetected(String key, String body) {
        try {
            if (!NotificationManagerCompat.from(this).areNotificationsEnabled()) return;
            ensureCaptureChannel();

            Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent tap = null;
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                tap = PendingIntent.getActivity(this, 0, launch, flags);
            }

            int icon = getResources().getIdentifier("ic_stat_miplata", "drawable", getPackageName());
            NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CAPTURE_CHANNEL_ID)
                    .setSmallIcon(icon != 0 ? icon : android.R.drawable.stat_notify_chat)
                    .setContentTitle(DETECTED_TITLE)
                    .setContentText(body)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setCategory(NotificationCompat.CATEGORY_STATUS)
                    .setAutoCancel(true);
            if (tap != null) builder.setContentIntent(tap);

            NotificationManagerCompat.from(this).notify(notificationIdFor(key), builder.build());
        } catch (Throwable error) {
            // Sin permiso de notificaciones (o algo raro): la cola queda igual y la web avisará al abrirse.
            Log.w(TAG, "No se pudo mostrar el aviso al instante", error);
        }
    }

    private void ensureCaptureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
                CAPTURE_CHANNEL_ID, "Gastos detectados", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Avisa cuando la app registra automáticamente un gasto desde una notificación o SMS del banco");
        channel.enableVibration(true);
        // Crearlo de nuevo con los mismos datos no hace nada (Android lo deja igual si ya existía).
        manager.createNotificationChannel(channel);
    }

    /** Igual que `displayText` en `parseNotification.ts`: título y cuerpo, unidos, sin espacios repetidos. */
    private static String displayText(String title, String text) {
        String t = collapse(title);
        String b = collapse(text);
        if (t.isEmpty()) return b;
        if (b.isEmpty()) return t;
        return t + " — " + b;
    }

    private static String collapse(String value) {
        return value == null ? "" : value.trim().replaceAll("\\s+", " ");
    }

    /** Igual algoritmo que `captureNotificationId` en `localNotifications.ts`: mismo texto, mismo id. */
    private static int notificationIdFor(String text) {
        int hash = 0;
        for (int i = 0; i < text.length(); i++) {
            hash = hash * 31 + text.charAt(i);
        }
        long unsigned = hash & 0xFFFFFFFFL;
        return (int) (CAPTURE_ID_BASE + (unsigned % CAPTURE_ID_SPAN));
    }

    private static boolean looksMonetary(String value) {
        boolean hasDigit = false;
        for (int i = 0; i < value.length(); i++) {
            if (Character.isDigit(value.charAt(i))) {
                hasDigit = true;
                break;
            }
        }
        if (!hasDigit) return false;
        return value.indexOf('$') >= 0
                || CURRENCY.matcher(value).find()
                || FORMATTED_NUMBER.matcher(value).find()
                || SPEND_CUE_NUMBER.matcher(value).find();
    }

    private static String bestBody(Bundle extras) {
        String big = asText(extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
        if (!big.isEmpty()) return big;
        String text = asText(extras.getCharSequence(Notification.EXTRA_TEXT));
        if (!text.isEmpty()) return text;
        CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
        if (lines == null) return "";
        StringBuilder joined = new StringBuilder();
        for (CharSequence line : lines) {
            if (line == null) continue;
            if (joined.length() > 0) joined.append('\n');
            joined.append(line);
        }
        return joined.toString().trim();
    }

    private static String asText(CharSequence value) {
        return value == null ? "" : value.toString().trim();
    }

    private static String truncate(String value) {
        return value.length() <= MAX_TEXT ? value : value.substring(0, MAX_TEXT);
    }
}
