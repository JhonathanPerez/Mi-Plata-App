package __PACKAGE__;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Copia de seguridad en una carpeta elegida por la persona (Storage Access Framework). La persona escoge una carpeta una
 * sola vez con el selector de Android; la app guarda el permiso de forma persistente y escribe ahí cada copia, sin pedir
 * ningún permiso de almacenamiento. La carpeta puede ser del teléfono (que una app de nube sincroniza) o de una nube que
 * ofrezca su propio proveedor de documentos. Google Drive, en muchos teléfonos, no aparece en el selector de carpetas.
 *
 * La parte web nunca pasa rutas ni URIs: solo el nombre de un archivo dentro de la carpeta elegida, sin subcarpetas.
 * No necesita permisos en el manifiesto.
 */
@CapacitorPlugin(name = "CloudFolder")
public class CloudFolderPlugin extends Plugin {

    private static final String PREFS = "cloud_folder";
    private static final String KEY_TREE = "tree_uri";
    private static final String JSON_MIME = "application/json";
    private static final int RW_FLAGS = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private ContentResolver resolver() {
        return getContext().getContentResolver();
    }

    /** La carpeta elegida, solo si Android todavía nos deja escribir en ella (la persona pudo revocarla o borrarla). */
    private Uri savedTree() {
        String saved = prefs().getString(KEY_TREE, null);
        if (saved == null) return null;
        Uri tree = Uri.parse(saved);
        List<UriPermission> granted = resolver().getPersistedUriPermissions();
        for (UriPermission permission : granted) {
            if (permission.getUri().equals(tree) && permission.isWritePermission()) return tree;
        }
        return null;
    }

    private Uri treeRoot(Uri tree) {
        return DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
    }

    private Uri childrenOf(Uri tree) {
        return DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
    }

    private String displayName(Uri documentUri) {
        try (Cursor cursor = resolver().query(documentUri, new String[] {DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) return cursor.getString(0);
        } catch (Exception ignored) {
            // Sin nombre: la parte web muestra un texto genérico.
        }
        return "";
    }

    private void releasePermission(Uri tree) {
        try {
            resolver().releasePersistableUriPermission(tree, RW_FLAGS);
        } catch (Exception ignored) {
            // Ya estaba liberado.
        }
    }

    private JSObject describe(Uri tree) {
        JSObject result = new JSObject();
        result.put("uri", tree.toString());
        result.put("name", displayName(treeRoot(tree)));
        return result;
    }

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(RW_FLAGS | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        try {
            startActivityForResult(call, intent, "onFolderPicked");
        } catch (ActivityNotFoundException e) {
            call.reject("Este teléfono no tiene un selector de carpetas.");
        }
    }

    @ActivityCallback
    private void onFolderPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.reject("cancelled");
            return;
        }
        Uri tree = data.getData();
        try {
            resolver().takePersistableUriPermission(tree, RW_FLAGS);
        } catch (SecurityException e) {
            call.reject("No se pudo guardar el permiso de esa carpeta. Elige otra.");
            return;
        }
        String previous = prefs().getString(KEY_TREE, null);
        if (previous != null && !previous.equals(tree.toString())) releasePermission(Uri.parse(previous));
        prefs().edit().putString(KEY_TREE, tree.toString()).apply();
        call.resolve(describe(tree));
    }

    @PluginMethod
    public void getFolder(PluginCall call) {
        JSObject result = new JSObject();
        Uri tree = savedTree();
        if (tree == null) {
            result.put("configured", false);
        } else {
            result.put("configured", true);
            result.put("uri", tree.toString());
            result.put("name", displayName(treeRoot(tree)));
        }
        call.resolve(result);
    }

    /** Id del documento hijo con ese nombre, o null si no existe. */
    private Uri findChild(Uri tree, String name) {
        String[] columns = {DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME};
        try (Cursor cursor = resolver().query(childrenOf(tree), columns, null, null, null)) {
            while (cursor != null && cursor.moveToNext()) {
                if (name.equals(cursor.getString(1))) return DocumentsContract.buildDocumentUriUsingTree(tree, cursor.getString(0));
            }
        }
        return null;
    }

    private void writeBytes(Uri document, byte[] bytes) throws IOException {
        try (OutputStream out = resolver().openOutputStream(document, "wt")) {
            if (out == null) throw new IOException("la carpeta no dejó abrir el archivo");
            out.write(bytes);
        }
    }

    private void write(Uri tree, String name, String data) throws IOException {
        byte[] bytes = data.getBytes(StandardCharsets.UTF_8);
        Uri existing = findChild(tree, name);
        if (existing != null) {
            try {
                writeBytes(existing, bytes);
                return;
            } catch (IOException | RuntimeException e) {
                // Algunos proveedores no permiten reescribir: se borra el archivo y se crea de nuevo.
                DocumentsContract.deleteDocument(resolver(), existing);
            }
        }
        Uri created = DocumentsContract.createDocument(resolver(), treeRoot(tree), JSON_MIME, name);
        if (created == null) throw new IOException("la carpeta no permite crear archivos");
        writeBytes(created, bytes);
    }

    private static boolean isPlainFileName(String name) {
        return name != null && !name.isEmpty() && !name.contains("/") && !name.contains("\\");
    }

    /** Guarda (o reemplaza) un archivo de texto en la carpeta elegida. Los plugins corren fuera del hilo principal. */
    @PluginMethod
    public void writeFile(PluginCall call) {
        String name = call.getString("name");
        String data = call.getString("data");
        if (!isPlainFileName(name) || data == null) {
            call.reject("Datos de copia inválidos.");
            return;
        }
        Uri tree = savedTree();
        if (tree == null) {
            call.reject("No hay una carpeta elegida o se perdió el acceso a ella. Elígela de nuevo.");
            return;
        }
        try {
            write(tree, name, data);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo escribir en la carpeta: " + e.getMessage());
        }
    }

    @PluginMethod
    public void listFiles(PluginCall call) {
        Uri tree = savedTree();
        if (tree == null) {
            call.reject("No hay una carpeta elegida o se perdió el acceso a ella. Elígela de nuevo.");
            return;
        }
        JSArray names = new JSArray();
        String[] columns = {DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_MIME_TYPE};
        try (Cursor cursor = resolver().query(childrenOf(tree), columns, null, null, null)) {
            while (cursor != null && cursor.moveToNext()) {
                if (!DocumentsContract.Document.MIME_TYPE_DIR.equals(cursor.getString(1))) names.put(cursor.getString(0));
            }
        } catch (Exception e) {
            call.reject("No se pudo leer la carpeta: " + e.getMessage());
            return;
        }
        JSObject result = new JSObject();
        result.put("names", names);
        call.resolve(result);
    }

    @PluginMethod
    public void deleteFile(PluginCall call) {
        String name = call.getString("name");
        Uri tree = savedTree();
        if (!isPlainFileName(name) || tree == null) {
            call.reject("No se pudo borrar el archivo.");
            return;
        }
        try {
            Uri existing = findChild(tree, name);
            if (existing != null) DocumentsContract.deleteDocument(resolver(), existing);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo borrar el archivo: " + e.getMessage());
        }
    }

    /** Deja de usar la carpeta: libera el permiso y olvida cuál era. Los archivos ya guardados no se tocan. */
    @PluginMethod
    public void clearFolder(PluginCall call) {
        String saved = prefs().getString(KEY_TREE, null);
        if (saved != null) releasePermission(Uri.parse(saved));
        prefs().edit().remove(KEY_TREE).apply();
        call.resolve();
    }
}
