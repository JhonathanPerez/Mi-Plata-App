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

import java.text.Normalizer;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
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
     * El emoji de billete (U+1F4B5) va como escape para que no dependa de la codificación al compilar.
     */
    private static final String DETECTED_TITLE = "Nuevo gasto detectado \uD83D\uDCB5";
    private static final String DETECTED_BODY_FALLBACK = "Nueva compra detectada. Abre Mi Plata para categorizarlo.";
    private static final long CAPTURE_ID_BASE = 2_000_000L;
    private static final long CAPTURE_ID_SPAN = 900_000L;

    /**
     * Valor del gasto para mostrarlo en el aviso "al instante". Misma idea que `findMarkedAmount` en
     * `parseNotification.ts` (`findAmount`): valores marcados como dinero ("$25.000", "COP 25.000", "25.000 pesos")
     * o, si no hay ninguno, un número claro como valor ("Compra por 25.000"); sin saldos, cupos ni monedas
     * extranjeras. Si no hay uno claro, el aviso usa un texto sin valor y la
     * parte web lo reemplaza luego por el definitivo. Mantén ambos en sintonía.
     */
    private static final Pattern MARKED_AMOUNT = Pattern.compile(
            "(?:\\$|\\bcop\\s?)\\s?(\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)"
                    + "|\\b(\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d{1,2})?|\\d+)\\s?(?:cop\\b|pesos\\b)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern NOT_THE_SPEND_BEFORE = Pattern.compile(
            "(saldo|cupo|disponible|limite|minimo|acumulad[oa]|puntos|total a pagar|deuda)\\D{0,25}\\z");
    private static final Pattern FOREIGN_BEFORE = Pattern.compile(
            "(\\bus|\\busd|\\beur|\\bmxn|\\bbrl|\\bcad|\\bgbp|\u20AC|\u00A3|\\br)\\s?\\z");
    private static final Pattern CENTS_FORMAT = Pattern.compile("^\\d{1,3}[.,]\\d{2}$");
    private static final Pattern TRAILING_DECIMALS = Pattern.compile("[.,]\\d{1,2}$");
    // Mensajes sin "$", "COP" ni "pesos" ("Compra por 25.000 en TIENDA"): plan B, igual que `findBareAmount`.
    private static final Pattern BARE_NUMBER = Pattern.compile("\\d[\\d.,]*");
    private static final Pattern BARE_FORMATTED = Pattern.compile("^\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d{1,2})?$");
    private static final Pattern BARE_PLAIN = Pattern.compile("^\\d{3,}$");
    private static final Pattern PREV_CHAR_BLOCKS = Pattern.compile("[\\w*#/:]");
    private static final Pattern CURRENCY_BEFORE = Pattern.compile("(?:[$\u20AC\u00A3]\\s?|\\bcop\\s?)\\z");
    private static final Pattern SPEND_CUE_BEFORE = Pattern.compile(
            "\\b(por|valor|vlr|monto|total|compra|compraste|pagaste|pago|retiro|retiraste|transferiste|enviaste"
                    + "|consumo|cargo|debito|debitaron|cobro)(\\s+de)?\\s*:?\\s*\\z");
    private static final Pattern NOT_PESOS_AFTER = Pattern.compile(
            "^\\s?(puntos|pts|cuotas|meses|dias|usd|eur|euros|dolar|dolares|km|%)");
    private static final long MIN_AMOUNT = 100L;
    private static final long MAX_AMOUNT = 999_999_999_999L;

    // ---- Comercio: mismas reglas que "Comercio" en `parseNotification.ts`. Mantén ambos en sintonía. ----
    private static final int MAX_MERCHANT_LENGTH = 60;
    private static final int MAX_MERCHANT_WORDS = 6;
    private static final Pattern TRANSFER_LIKE = Pattern.compile("\\b(transferiste|enviaste|envio|pagaste|transferencia|giro)\\b");
    private static final Set<String> STOP_WORDS = words(
            "con", "usando", "desde", "por", "hoy", "ayer", "tarjeta", "tarj", "tc", "td", "terminada", "terminado",
            "cuotas", "cuota", "aprobada", "aprobado", "exitosa", "exitoso", "fue", "ha", "sido", "saldo", "cupo",
            "disponible", "inquietudes", "llama", "llame", "gracias", "ref", "referencia", "autorizacion", "aut", "recibo");
    private static final Set<String> EN_NOT_MERCHANT = words(
            "tu", "su", "tus", "sus", "cuotas", "cuota", "efectivo", "total", "linea", "pesos", "dolares", "cop", "usd",
            "proceso", "curso", "resumen", "nu", "cajero");
    private static final Set<String> ARTICLES = words("la", "el", "un", "una", "este", "esta", "los", "las");
    private static final Set<String> EN_ARTICLE_NOT_MERCHANT = words(
            "app", "aplicacion", "cuenta", "tarjeta", "cajero", "exterior", "fecha", "hora", "resumen", "cupo", "dia",
            "mes", "semana", "tiempo", "cuotas", "plazo");
    private static final Set<String> A_NOT_MERCHANT = words(
            "las", "la", "tu", "su", "el", "un", "una", "traves", "partir", "nombre", "cuenta", "favor", "tiempo");
    private static final Set<String> LABELS = words("comercio", "establecimiento", "negocio", "lugar");
    private static final Pattern PROCESSOR_PREFIX = Pattern.compile(
            "^(payu|merpago|mercadopago|mp|pp|sq|tst|dlocal|dlo|epayco|wompi|bold|zonapagos)\\s?\\*\\s?",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern BOUNDARY_TOKEN = Pattern.compile("^[.\\-\u2013\u2014|:;,]+$");
    private static final Pattern CARD_MASK = Pattern.compile("^\\*+\\d");
    private static final Pattern DATE_TOKEN = Pattern.compile("^\\d{1,2}[/-]\\d{1,2}([/-]\\d{2,4})?[.,;]?$");
    private static final Pattern TIME_TOKEN = Pattern.compile("^\\d{1,2}:\\d{2}");
    private static final Pattern T_CARD = Pattern.compile("^t\\.(cre|deb)");
    private static final Pattern DAY_WORDS = Pattern.compile(
            "^(\\d{1,2}([/-]|$)|dia|lunes|martes|miercoles|jueves|viernes|sabado|domingo)");
    private static final Pattern HAS_LOWERCASE = Pattern.compile("[a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1\u00fc]");
    private static final Pattern WORD_START = Pattern.compile("(^|[\\s*/-])([a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1\u00fc])");
    private static final Pattern EDGE_PUNCTUATION = Pattern.compile(
            "^[\\s.,;:!\\-\u2013\u2014*\"'()]+|[\\s.,;:!\\-\u2013\u2014*\"'()]+$");
    private static final Pattern ONLY_SYMBOLS = Pattern.compile("^[\\d\\s.,*-]+$");

    /** Valor encontrado: los pesos y el texto numérico tal como apareció ("25.000"), para ubicar el comercio. */
    private static final class AmountMatch {
        final long amount;
        final String numeric;

        AmountMatch(long amount, String numeric) {
            this.amount = amount;
            this.numeric = numeric;
        }
    }

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
            String folded = normalize(storedTitle + " " + storedText);
            boolean looksLikeExpense = !NOT_AN_EXPENSE.matcher(folded).find()
                    && !INCOME.matcher(folded).find()
                    && SPEND.matcher(folded).find();
            if (looksLikeExpense) {
                notifyDetected(displayText(storedTitle, storedText), detectedBody(storedTitle, storedText));
                // Con la app cerrada, la parte web no puede programar el recordatorio de "gastos por categorizar":
                // se deja armado desde aquí (si el usuario lo activó y no hay ya avisos programados).
                CaptureStore.incrementUnseenExpenses(this);
                PendingReminderReceiver.onExpenseCaptured(this);
            }
            return true;
        } catch (JSONException error) {
            return false;
        }
    }

    /**
     * "Nueva compra por $25.000 en Rappi. Abre Mi Plata para categorizarlo." Si no se reconoce el comercio,
     * solo el valor; si tampoco hay un valor claro, una versión sin valor (la parte web la reemplaza luego).
     */
    private static String detectedBody(String title, String text) {
        String prepared = prepare(title, text);
        AmountMatch match = findAmount(prepared);
        if (match == null) return DETECTED_BODY_FALLBACK;
        boolean transferLike = TRANSFER_LIKE.matcher(normalize(prepared)).find();
        String merchant = extractMerchant(prepared, match.numeric, transferLike);
        StringBuilder body = new StringBuilder("Nueva compra por ").append(formatCop(match.amount));
        if (merchant != null) body.append(" en ").append(merchant);
        return body.append(". Abre Mi Plata para categorizarlo.").toString();
    }

    private static Set<String> words(String... values) {
        return new HashSet<>(Arrays.asList(values));
    }

    /** Igual que `prepare` en `parseNotification.ts`: título y cuerpo unidos con un punto, sin saltos ni espacios repetidos. */
    private static String prepare(String title, String text) {
        StringBuilder joined = new StringBuilder();
        for (String part : new String[] {title, text}) {
            String trimmed = part == null ? "" : Normalizer.normalize(part, Normalizer.Form.NFC).trim();
            if (trimmed.isEmpty()) continue;
            if (joined.length() > 0) joined.append(" . ");
            joined.append(trimmed);
        }
        return joined.toString().replaceAll("\\s*[\\r\\n]+\\s*", " . ").replaceAll("[ \\t\\u00a0]+", " ").trim();
    }

    /** Primer valor en pesos válido del texto, o null si no hay ninguno claro. Igual que `findAmount` en TS. */
    private static AmountMatch findAmount(String text) {
        AmountMatch marked = findMarkedAmount(text);
        return marked != null ? marked : findBareAmount(text);
    }

    /** Sin centavos, entero y dentro del rango razonable de un gasto en pesos; -1 si no cumple. */
    private static long toValidAmount(String numeric) {
        if (CENTS_FORMAT.matcher(numeric).matches()) return -1L;
        // Los decimales se descartan: los pesos se manejan enteros.
        String integerPart = TRAILING_DECIMALS.matcher(numeric).replaceFirst("");
        String digits = integerPart.replaceAll("[.,]", "");
        if (digits.isEmpty() || digits.length() > 12) return -1L;
        long value = Long.parseLong(digits);
        return value < MIN_AMOUNT || value > MAX_AMOUNT ? -1L : value;
    }

    /** True si lo que va antes del número indica que NO es el gasto (saldo, cupo, otra moneda…). */
    private static boolean isNotTheSpend(String before) {
        if (NOT_THE_SPEND_BEFORE.matcher(before).find()) return true;
        String lastChars = before.length() > 6 ? before.substring(before.length() - 6) : before;
        return FOREIGN_BEFORE.matcher(lastChars).find();
    }

    private static String textBefore(String text, int index) {
        return normalize(text.substring(Math.max(0, index - 30), index));
    }

    /** Valor marcado como dinero: "$25.000", "COP 25.000" o "25.000 pesos". */
    private static AmountMatch findMarkedAmount(String text) {
        Matcher matcher = MARKED_AMOUNT.matcher(text);
        while (matcher.find()) {
            String numeric = matcher.group(1) != null ? matcher.group(1) : matcher.group(2);
            if (numeric == null) continue;
            if (isNotTheSpend(textBefore(text, matcher.start()))) continue;
            long value = toValidAmount(numeric);
            if (value >= 0) return new AmountMatch(value, numeric);
        }
        return null;
    }

    /** Plan B sin "$", "COP" ni "pesos": descarta fechas, horas, tarjetas y códigos. Igual que `findBareAmount` en TS. */
    private static AmountMatch findBareAmount(String text) {
        Matcher matcher = BARE_NUMBER.matcher(text);
        while (matcher.find()) {
            String numeric = matcher.group().replaceAll("[.,]+$", "");
            int start = matcher.start();
            int end = start + numeric.length();

            // Pegado a letras, "*", "#", "/" o ":" -> parte de una referencia, tarjeta, fecha u hora.
            if (start > 0 && PREV_CHAR_BLOCKS.matcher(String.valueOf(text.charAt(start - 1))).matches()) continue;
            // Seguido de "/" o ":" (fecha, hora) o de "-dígito" (rango, fecha).
            if (end < text.length()) {
                char next = text.charAt(end);
                boolean digitAfterDash = next == '-' && end + 1 < text.length() && Character.isDigit(text.charAt(end + 1));
                if (next == '/' || next == ':' || digitAfterDash) continue;
            }

            String before = textBefore(text, start);
            if (CURRENCY_BEFORE.matcher(before).find()) continue;
            if (isNotTheSpend(before)) continue;
            if (NOT_PESOS_AFTER.matcher(normalize(text.substring(end, Math.min(text.length(), end + 14)))).find()) continue;

            boolean formatted = BARE_FORMATTED.matcher(numeric).matches();
            boolean plainWithCue = BARE_PLAIN.matcher(numeric).matches() && SPEND_CUE_BEFORE.matcher(before).find();
            if (!formatted && !plainWithCue) continue;

            long value = toValidAmount(numeric);
            if (value >= 0) return new AmountMatch(value, numeric);
        }
        return null;
    }

    // ---------- Comercio ----------

    private static String wordKey(String raw) {
        return normalize(raw).replaceAll("^[^a-z0-9]+|[^a-z0-9]+$", "");
    }

    private static boolean isMerchantAfterEn(String[] keys, int index) {
        if (index + 1 >= keys.length) return false;
        String next = keys[index + 1];
        if (next.isEmpty()) return false;
        if (EN_NOT_MERCHANT.contains(next) || next.matches("\\d+")) return false;
        if (ARTICLES.contains(next) && index + 2 < keys.length) {
            String following = keys[index + 2];
            if (!following.isEmpty() && EN_ARTICLE_NOT_MERCHANT.contains(following)) return false;
        }
        return true;
    }

    /** Donde empieza el nombre del comercio, o -1 si no se reconoce. */
    private static int findMerchantStart(String[] tokens, String[] keys, int amountIndex, boolean transferLike) {
        // 1) "Comercio: X"
        for (int i = 0; i < tokens.length - 1; i++) {
            if (LABELS.contains(keys[i])) {
                int start = i + 1;
                while (start < tokens.length && BOUNDARY_TOKEN.matcher(tokens[start]).matches()) start++;
                if (start < tokens.length) return start;
            }
        }
        // 2) "… en X"
        for (int i = 0; i < tokens.length - 1; i++) {
            if (keys[i].equals("en") && isMerchantAfterEn(keys, i)) return i + 1;
        }
        // 3) "Pagaste $X a Juan Pérez" (solo en pagos y transferencias, después del valor)
        if (transferLike) {
            for (int i = Math.max(0, amountIndex + 1); i < tokens.length - 1; i++) {
                if ((keys[i].equals("a") || keys[i].equals("para")) && !A_NOT_MERCHANT.contains(keys[i + 1])) return i + 1;
            }
        }
        return -1;
    }

    private static String collectMerchant(String[] tokens, String[] keys, int start) {
        StringBuilder out = new StringBuilder();
        int count = 0;
        for (int i = start; i < tokens.length && count < MAX_MERCHANT_WORDS; i++) {
            String raw = tokens[i];
            String key = keys[i];
            if (BOUNDARY_TOKEN.matcher(raw).matches()) break;
            if (CARD_MASK.matcher(raw).find() || DATE_TOKEN.matcher(raw).matches() || TIME_TOKEN.matcher(raw).find()
                    || raw.startsWith("$")) break;
            if (STOP_WORDS.contains(key) || T_CARD.matcher(key).find()) break;
            if (key.equals("en") && count > 0) break;
            String nextKey = i + 1 < keys.length ? keys[i + 1] : "";
            if (key.equals("el") && count > 0 && DAY_WORDS.matcher(nextKey).find()) break;
            if (key.equals("a") && count > 0 && nextKey.equals("las")) break;
            if (count > 0) out.append(' ');
            out.append(raw);
            count++;
            // Un punto o coma al final del nombre cierra la frase.
            if (raw.matches(".*[.,;:]$")) break;
        }
        return out.toString();
    }

    private static String toDisplayCase(String text) {
        if (!HAS_LOWERCASE.matcher(text).find()) {
            Matcher matcher = WORD_START.matcher(text.toLowerCase(Locale.ROOT));
            StringBuffer out = new StringBuffer();
            while (matcher.find()) {
                matcher.appendReplacement(out, Matcher.quoteReplacement(matcher.group(1) + matcher.group(2).toUpperCase(Locale.ROOT)));
            }
            matcher.appendTail(out);
            return out.toString();
        }
        return text.substring(0, 1).toUpperCase(Locale.ROOT) + text.substring(1);
    }

    private static String cleanMerchant(String value) {
        String text = EDGE_PUNCTUATION.matcher(value).replaceAll("");
        text = PROCESSOR_PREFIX.matcher(text).replaceFirst("").replaceAll("\\s{2,}", " ").trim();
        if (text.length() < 2 || ONLY_SYMBOLS.matcher(text).matches()) return null;
        if (text.length() > MAX_MERCHANT_LENGTH) text = text.substring(0, MAX_MERCHANT_LENGTH).trim();
        return toDisplayCase(text);
    }

    /** Nombre del comercio (o a quién se le pagó), o null si no se reconoce. Igual que `extractMerchant` en TS. */
    private static String extractMerchant(String original, String numeric, boolean transferLike) {
        String[] tokens = original.split(" ", -1);
        String[] keys = new String[tokens.length];
        int amountIndex = -1;
        for (int i = 0; i < tokens.length; i++) {
            keys[i] = wordKey(tokens[i]);
            if (amountIndex < 0 && tokens[i].contains(numeric)) amountIndex = i;
        }
        int start = findMerchantStart(tokens, keys, amountIndex, transferLike);
        if (start < 0) return null;
        return cleanMerchant(collectMerchant(tokens, keys, start));
    }

    /** 1250000 -> "$1.250.000", igual que `formatCOP` en `money.ts`. */
    private static String formatCop(long value) {
        String digits = Long.toString(value);
        StringBuilder out = new StringBuilder("$");
        for (int i = 0; i < digits.length(); i++) {
            if (i > 0 && (digits.length() - i) % 3 == 0) out.append('.');
            out.append(digits.charAt(i));
        }
        return out.toString();
    }

    /** Minúsculas y sin tildes, igual que `normalizeText` en `text.ts`, para comparar tolerante a acentos. */
    private static String normalize(String value) {
        String decomposed = Normalizer.normalize(value, Normalizer.Form.NFD);
        return decomposed.replaceAll("\\p{Mn}+", "").toLowerCase();
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
