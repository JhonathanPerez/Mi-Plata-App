package __PACKAGE__;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Acceso a la carpeta que la persona eligió para sus copias (Storage Access Framework). Lo usan el plugin que la elige
 * (CloudFolderPlugin) y la tarea en segundo plano (BackupWorker), que corre sin pantalla y por eso no puede depender del
 * plugin. Solo trabaja con nombres de archivo dentro de esa carpeta, nunca con rutas ni subcarpetas.
 */
final class CloudFolderStore {

    static final int RW_FLAGS = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
    static final String NO_FOLDER_MESSAGE = "No hay una carpeta elegida o se perdió el acceso a ella. Elígela de nuevo.";

    private static final String PREFS = "cloud_folder";
    private static final String KEY_TREE = "tree_uri";

    private CloudFolderStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** La carpeta elegida, solo si Android todavía nos deja escribir en ella (la persona pudo revocarla o borrarla). */
    static Uri savedTree(Context context) {
        String saved = prefs(context).getString(KEY_TREE, null);
        if (saved == null) return null;
        Uri tree = Uri.parse(saved);
        List<UriPermission> granted = context.getContentResolver().getPersistedUriPermissions();
        for (UriPermission permission : granted) {
            if (permission.getUri().equals(tree) && permission.isWritePermission()) return tree;
        }
        return null;
    }

    static Uri treeRoot(Uri tree) {
        return DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
    }

    private static Uri childrenOf(Uri tree) {
        return DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
    }

    static String displayName(Context context, Uri documentUri) {
        String[] columns = {DocumentsContract.Document.COLUMN_DISPLAY_NAME};
        try (Cursor cursor = context.getContentResolver().query(documentUri, columns, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) return cursor.getString(0);
        } catch (Exception ignored) {
            // Sin nombre: la parte web muestra un texto genérico.
        }
        return "";
    }

    static void releasePermission(Context context, Uri tree) {
        try {
            context.getContentResolver().releasePersistableUriPermission(tree, RW_FLAGS);
        } catch (Exception ignored) {
            // Ya estaba liberado.
        }
    }

    /** Guarda el permiso de la carpeta recién elegida y suelta el de la anterior. Lanza SecurityException si Android lo niega. */
    static void remember(Context context, Uri tree) {
        context.getContentResolver().takePersistableUriPermission(tree, RW_FLAGS);
        String previous = prefs(context).getString(KEY_TREE, null);
        if (previous != null && !previous.equals(tree.toString())) releasePermission(context, Uri.parse(previous));
        prefs(context).edit().putString(KEY_TREE, tree.toString()).apply();
    }

    /** Deja de usar la carpeta: libera el permiso y olvida cuál era. Los archivos ya guardados no se tocan. */
    static void forget(Context context) {
        String saved = prefs(context).getString(KEY_TREE, null);
        if (saved != null) releasePermission(context, Uri.parse(saved));
        prefs(context).edit().remove(KEY_TREE).apply();
    }

    private static Uri requireTree(Context context) throws IOException {
        Uri tree = savedTree(context);
        if (tree == null) throw new IOException(NO_FOLDER_MESSAGE);
        return tree;
    }

    /** El documento hijo con ese nombre, o null si no existe. */
    private static Uri findChild(Context context, Uri tree, String name) {
        String[] columns = {DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME};
        try (Cursor cursor = context.getContentResolver().query(childrenOf(tree), columns, null, null, null)) {
            while (cursor != null && cursor.moveToNext()) {
                if (name.equals(cursor.getString(1))) return DocumentsContract.buildDocumentUriUsingTree(tree, cursor.getString(0));
            }
        }
        return null;
    }

    private static void writeBytes(ContentResolver resolver, Uri document, byte[] bytes) throws IOException {
        try (OutputStream out = resolver.openOutputStream(document, "wt")) {
            if (out == null) throw new IOException("la carpeta no dejó abrir el archivo");
            out.write(bytes);
        }
    }

    /** Guarda (o reemplaza) un archivo de texto en la carpeta elegida. */
    static void writeFile(Context context, String name, String data, String mimeType) throws IOException {
        Uri tree = requireTree(context);
        ContentResolver resolver = context.getContentResolver();
        byte[] bytes = data.getBytes(StandardCharsets.UTF_8);
        Uri existing = findChild(context, tree, name);
        if (existing != null) {
            try {
                writeBytes(resolver, existing, bytes);
                return;
            } catch (IOException | RuntimeException e) {
                // Algunos proveedores no permiten reescribir: se borra el archivo y se crea de nuevo.
                DocumentsContract.deleteDocument(resolver, existing);
            }
        }
        Uri created = DocumentsContract.createDocument(resolver, treeRoot(tree), mimeType, name);
        if (created == null) throw new IOException("la carpeta no permite crear archivos");
        writeBytes(resolver, created, bytes);
    }

    /** Los nombres de los archivos (no carpetas) que hay en la carpeta elegida. */
    static List<String> listNames(Context context) throws IOException {
        Uri tree = requireTree(context);
        List<String> names = new ArrayList<>();
        String[] columns = {DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_MIME_TYPE};
        try (Cursor cursor = context.getContentResolver().query(childrenOf(tree), columns, null, null, null)) {
            while (cursor != null && cursor.moveToNext()) {
                if (!DocumentsContract.Document.MIME_TYPE_DIR.equals(cursor.getString(1))) names.add(cursor.getString(0));
            }
        }
        return names;
    }

    static void deleteFile(Context context, String name) throws IOException {
        Uri tree = requireTree(context);
        Uri existing = findChild(context, tree, name);
        if (existing != null) DocumentsContract.deleteDocument(context.getContentResolver(), existing);
    }

    static boolean isPlainFileName(String name) {
        return name != null && !name.isEmpty() && !name.contains("/") && !name.contains("\\");
    }
}
