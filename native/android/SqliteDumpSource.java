package __PACKAGE__;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteException;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Lee las filas de la base de datos de Mi Plata directamente del archivo SQLite, sin la app abierta. Solo lectura de las
 * tablas de datos, en un orden fijo.
 */
final class SqliteDumpSource implements RawDump.Source, AutoCloseable {

    /** Las tablas que forman una copia de seguridad (las mismas que arma backupService en la parte web). */
    private static final String[] TABLES = {
        "categories", "payment_methods", "expenses", "budgets", "settings", "card_statement_dates", "savings_accounts", "savings_movements",
    };
    /** Sin estas dos no es una base de Mi Plata inicializada: se prefiere fallar a guardar una copia vacía. */
    private static final String[] REQUIRED = {"categories", "expenses"};

    private final SQLiteDatabase db;

    private SqliteDumpSource(SQLiteDatabase db) {
        this.db = db;
    }

    /** El archivo lo crea el plugin SQLite de Capacitor con el nombre de la base más «SQLite.db». */
    private static File findDatabase(Context context) throws IOException {
        File exact = context.getDatabasePath("miplataSQLite.db");
        if (exact.exists()) return exact;
        File[] candidates = exact.getParentFile() == null ? null : exact.getParentFile().listFiles();
        if (candidates != null) {
            for (File file : candidates) {
                if (file.getName().startsWith("miplata") && file.getName().endsWith("SQLite.db")) return file;
            }
        }
        throw new IOException("No encontré la base de datos de Mi Plata en el teléfono.");
    }

    static SqliteDumpSource open(Context context) throws IOException {
        File file = findDatabase(context);
        SQLiteDatabase db;
        try {
            db = SQLiteDatabase.openDatabase(file.getPath(), null, SQLiteDatabase.OPEN_READONLY);
        } catch (SQLiteException e) {
            // Con el modo WAL, abrir solo para leer puede fallar si no existen los archivos auxiliares: se reintenta con
            // permiso de escritura (solo se lee igual; únicamente SQLite escribe sus propios archivos auxiliares).
            db = SQLiteDatabase.openDatabase(file.getPath(), null, SQLiteDatabase.OPEN_READWRITE);
        }
        return new SqliteDumpSource(db);
    }

    private Set<String> existingTables() {
        Set<String> existing = new HashSet<>();
        try (Cursor cursor = db.rawQuery("SELECT name FROM sqlite_master WHERE type = 'table'", null)) {
            while (cursor.moveToNext()) existing.add(cursor.getString(0));
        }
        return existing;
    }

    /**
     * ¿La persona ya registró algo? Gastos, presupuestos, cuentas de ahorro o fechas de extractos. Una instalación nueva trae
     * categorías y métodos de pago de fábrica pero ningún dato: copiarla solo desplazaría copias buenas.
     */
    boolean hasUserData() {
        Set<String> existing = existingTables();
        for (String table : new String[] {"expenses", "budgets", "savings_accounts", "card_statement_dates"}) {
            if (!existing.contains(table)) continue;
            // `table` sale siempre de la lista fija de arriba.
            try (Cursor cursor = db.rawQuery("SELECT 1 FROM " + table + " LIMIT 1", null)) {
                if (cursor.moveToFirst()) return true;
            }
        }
        return false;
    }

    @Override
    public List<String> tables() {
        Set<String> existing = existingTables();
        for (String required : REQUIRED) {
            if (!existing.contains(required)) throw new IllegalStateException("La base de datos no tiene las tablas esperadas.");
        }
        List<String> tables = new ArrayList<>();
        // Una tabla que esta versión de la base todavía no tiene (cuentas de ahorro, por ejemplo) simplemente no se incluye.
        for (String table : TABLES) {
            if (existing.contains(table)) tables.add(table);
        }
        return tables;
    }

    @Override
    public void forEachRow(String table, RawDump.RowVisitor visitor) throws Exception {
        // `table` sale siempre de la lista fija de arriba, nunca de un dato externo.
        try (Cursor cursor = db.rawQuery("SELECT * FROM " + table, null)) {
            String[] columns = cursor.getColumnNames();
            Object[] values = new Object[columns.length];
            while (cursor.moveToNext()) {
                for (int i = 0; i < columns.length; i++) {
                    switch (cursor.getType(i)) {
                        case Cursor.FIELD_TYPE_NULL: values[i] = null; break;
                        case Cursor.FIELD_TYPE_INTEGER: values[i] = cursor.getLong(i); break;
                        case Cursor.FIELD_TYPE_FLOAT: values[i] = cursor.getDouble(i); break;
                        case Cursor.FIELD_TYPE_STRING: values[i] = cursor.getString(i); break;
                        default: throw new IllegalStateException("La tabla " + table + " tiene un dato binario que no se puede copiar.");
                    }
                }
                visitor.row(columns, values);
            }
        }
    }

    @Override
    public void close() {
        db.close();
    }
}
