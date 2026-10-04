package __PACKAGE__;

import java.text.Normalizer;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lee el valor y el comercio de una compra a partir del título y el texto de un aviso del banco o de un SMS.
 *
 * <p>Es gemelo de `parseNotification.ts` (`findAmount`, `findBareAmount`, `extractMerchant`): el aviso al instante
 * sale con la app cerrada y entonces el código TypeScript no se está ejecutando, así que el texto se arma aquí.
 * Si cambias una regla o una lista de palabras en uno, cámbiala también en el otro: de lo contrario el aviso nativo
 * y el de la app dirán cosas distintas.
 *
 * <p>No depende de Android (solo de java.*), para poder probarla en una JVM normal. Sin estado: todo es estático.
 */
final class ExpenseTextParser {

    /** Lo que se pudo leer de la compra: los pesos y, si se reconoció, el comercio (o a quién se le pagó). */
    static final class Parsed {
        final long amount;
        /** Nombre del comercio, o null si no se reconoció. */
        final String merchant;

        Parsed(long amount, String merchant) {
            this.amount = amount;
            this.merchant = merchant;
        }
    }

    private ExpenseTextParser() {}

    /**
     * Valor y comercio de la compra, o null si no hay un valor claro (así el aviso usa un texto sin valor y la
     * parte web lo reemplaza luego por el definitivo).
     */
    static Parsed parse(String title, String text) {
        String prepared = prepare(title, text);
        AmountMatch match = findAmount(prepared);
        if (match == null) return null;
        boolean transferLike = TRANSFER_LIKE.matcher(normalize(prepared)).find();
        return new Parsed(match.amount, extractMerchant(prepared, match.numeric, transferLike));
    }

    /** 1250000 -> "$1.250.000", igual que `formatCOP` en `money.ts`. */
    static String formatCop(long value) {
        String digits = Long.toString(value);
        StringBuilder out = new StringBuilder("$");
        for (int i = 0; i < digits.length(); i++) {
            if (i > 0 && (digits.length() - i) % 3 == 0) out.append('.');
            out.append(digits.charAt(i));
        }
        return out.toString();
    }

    /** Minúsculas y sin tildes, igual que `normalizeText` en `text.ts`, para comparar tolerante a acentos. */
    static String normalize(String value) {
        String decomposed = Normalizer.normalize(value, Normalizer.Form.NFD);
        return decomposed.replaceAll("\\p{Mn}+", "").toLowerCase();
    }

    // ---- Valor: misma idea que `findAmount` en `parseNotification.ts`. Mantén ambos en sintonía. ----
    /**
     * Valores marcados como dinero ("$25.000", "COP 25.000", "25.000 pesos") o, si no hay ninguno, un número claro
     * como valor ("Compra por 25.000"); sin saldos, cupos ni monedas extranjeras.
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
}
