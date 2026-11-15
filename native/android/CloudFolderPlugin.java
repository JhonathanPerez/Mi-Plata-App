package __PACKAGE__;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

/**
 * Copia de seguridad en una carpeta elegida por la persona (Storage Access Framework). La persona escoge una carpeta una
 * sola vez con el selector de Android; la app guarda el permiso de forma persistente y escribe ahí cada copia, sin pedir
 * ningún permiso de almacenamiento. La carpeta puede ser del teléfono (que una app de nube sincroniza) o de una nube que
 * ofrezca su propio proveedor de documentos. Google Drive, en muchos teléfonos, no aparece en el selector de carpetas.
 *
 * La parte web nunca pasa rutas ni URIs: solo el nombre de un archivo dentro de la carpeta elegida, sin subcarpetas.
 * El trabajo con la carpeta vive en CloudFolderStore, que también usa la tarea en segundo plano.
 * No necesita permisos en el manifiesto.
 */
@CapacitorPlugin(name = "CloudFolder")
public class CloudFolderPlugin extends Plugin {

    private static final String JSON_MIME = "application/json";

    private JSObject describe(Uri tree) {
        JSObject result = new JSObject();
        result.put("uri", tree.toString());
        result.put("name", CloudFolderStore.displayName(getContext(), CloudFolderStore.treeRoot(tree)));
        return result;
    }

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(CloudFolderStore.RW_FLAGS | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
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
            CloudFolderStore.remember(getContext(), tree);
        } catch (SecurityException e) {
            call.reject("No se pudo guardar el permiso de esa carpeta. Elige otra.");
            return;
        }
        call.resolve(describe(tree));
    }

    @PluginMethod
    public void getFolder(PluginCall call) {
        JSObject result = new JSObject();
        Uri tree = CloudFolderStore.savedTree(getContext());
        if (tree == null) {
            result.put("configured", false);
        } else {
            result.put("configured", true);
            JSObject folder = describe(tree);
            result.put("uri", folder.getString("uri"));
            result.put("name", folder.getString("name"));
        }
        call.resolve(result);
    }

    /** Guarda (o reemplaza) un archivo de texto en la carpeta elegida. Los plugins corren fuera del hilo principal. */
    @PluginMethod
    public void writeFile(PluginCall call) {
        String name = call.getString("name");
        String data = call.getString("data");
        if (!CloudFolderStore.isPlainFileName(name) || data == null) {
            call.reject("Datos de copia inválidos.");
            return;
        }
        try {
            CloudFolderStore.writeFile(getContext(), name, data, JSON_MIME);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo escribir en la carpeta: " + e.getMessage());
        }
    }

    @PluginMethod
    public void listFiles(PluginCall call) {
        try {
            List<String> names = CloudFolderStore.listNames(getContext());
            JSArray array = new JSArray();
            for (String name : names) array.put(name);
            JSObject result = new JSObject();
            result.put("names", array);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("No se pudo leer la carpeta: " + e.getMessage());
        }
    }

    @PluginMethod
    public void deleteFile(PluginCall call) {
        String name = call.getString("name");
        if (!CloudFolderStore.isPlainFileName(name)) {
            call.reject("No se pudo borrar el archivo.");
            return;
        }
        try {
            CloudFolderStore.deleteFile(getContext(), name);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo borrar el archivo: " + e.getMessage());
        }
    }

    /** Deja de usar la carpeta. Los archivos ya guardados no se tocan. */
    @PluginMethod
    public void clearFolder(PluginCall call) {
        CloudFolderStore.forget(getContext());
        call.resolve();
    }
}
