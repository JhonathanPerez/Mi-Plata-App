package __PACKAGE__;

import java.util.List;

/**
 * Arma el volcado de la base de datos: las filas de cada tabla tal cual están guardadas, en JSON. No interpreta nada:
 * la parte web (src/lib/rawDump.ts) lo convierte a una copia normal con las mismas funciones con que lee la base. Se
 * escribe a mano (sin org.json) para controlar el formato y poder probarlo fuera de Android.
 */
final class RawDump {

    static final String FORMAT = "mi-plata-raw-dump";
    static final int VERSION = 1;

    /** De dónde salen las filas (la base de datos real en la app; una lista en las pruebas). */
    interface Source {
        List<String> tables() throws Exception;

        void forEachRow(String table, RowVisitor visitor) throws Exception;
    }

    interface RowVisitor {
        void row(String[] columns, Object[] values) throws Exception;
    }

    private RawDump() {}

    static String build(Source source, String exportedAtIso) throws Exception {
        StringBuilder out = new StringBuilder(1 << 16);
        out.append("{\"format\":\"").append(FORMAT).append("\",\"version\":").append(VERSION).append(",\"app\":\"Mi Plata\",\"exportedAt\":");
        appendString(out, exportedAtIso);
        out.append(",\"tables\":{");
        boolean firstTable = true;
        for (String table : source.tables()) {
            if (!firstTable) out.append(',');
            firstTable = false;
            appendString(out, table);
            out.append(":[");
            final boolean[] firstRow = {true};
            source.forEachRow(table, (columns, values) -> {
                if (!firstRow[0]) out.append(',');
                firstRow[0] = false;
                out.append('{');
                for (int i = 0; i < columns.length; i++) {
                    if (i > 0) out.append(',');
                    appendString(out, columns[i]);
                    out.append(':');
                    appendValue(out, values[i]);
                }
                out.append('}');
            });
            out.append(']');
        }
        return out.append("}}").toString();
    }

    private static void appendValue(StringBuilder out, Object value) {
        if (value == null) {
            out.append("null");
        } else if (value instanceof Long || value instanceof Integer || value instanceof Short || value instanceof Byte) {
            out.append(value.toString());
        } else if (value instanceof Double || value instanceof Float) {
            double number = ((Number) value).doubleValue();
            // JSON no tiene NaN ni infinito.
            out.append(Double.isNaN(number) || Double.isInfinite(number) ? "null" : value.toString());
        } else if (value instanceof String) {
            appendString(out, (String) value);
        } else {
            // Mi Plata no guarda datos binarios: si apareciera uno, mejor fallar que perderlo en silencio.
            throw new IllegalStateException("Tipo de dato no soportado en la copia: " + value.getClass().getSimpleName());
        }
    }

    static void appendString(StringBuilder out, String text) {
        out.append('"');
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            switch (c) {
                case '"': out.append("\\\""); break;
                case '\\': out.append("\\\\"); break;
                case '\n': out.append("\\n"); break;
                case '\r': out.append("\\r"); break;
                case '\t': out.append("\\t"); break;
                case '\b': out.append("\\b"); break;
                case '\f': out.append("\\f"); break;
                default:
                    if (c < 0x20) out.append(String.format("\\u%04x", (int) c));
                    else out.append(c);
            }
        }
        out.append('"');
    }
}
