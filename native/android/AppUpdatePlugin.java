package __PACKAGE__;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Actualización de la app desde un APK publicado en GitHub Releases: descarga a una carpeta privada, comprueba el
 * archivo y abre el instalador de Android. La parte web nunca pasa rutas: el APK vive siempre en
 * {@code cache/updates/mi-plata-update.apk}, así que no puede pedir que se instale otro archivo.
 *
 * Necesita (los pone `scripts/apply-android-native.mjs`): el permiso REQUEST_INSTALL_PACKAGES, el FileProvider
 * «.updates» y {@code res/xml/update_paths.xml}.
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    private static final String UPDATE_DIR = "updates";
    private static final String APK_NAME = "mi-plata-update.apk";
    private static final String PART_NAME = "mi-plata-update.apk.part";
    private static final String AUTHORITY_SUFFIX = ".updates";
    /** Solo se descarga de GitHub (el enlace del Release redirige a objects.githubusercontent.com, también https). */
    private static final String ALLOWED_URL_PREFIX = "https://github.com/";
    private static final int CONNECT_TIMEOUT_MS = 15000;
    private static final int READ_TIMEOUT_MS = 30000;
    private static final long PROGRESS_EVERY_MS = 200L;

    private final AtomicBoolean downloading = new AtomicBoolean(false);
    private volatile boolean cancelled = false;

    /** Interrumpe el bucle de descarga cuando la persona toca «Cancelar». */
    private static final class CancelledException extends IOException {
        private static final long serialVersionUID = 1L;

        CancelledException() {
            super("cancelled");
        }
    }

    @Override
    public void load() {
        // Si quedó un APK de una actualización que ya se instaló (o uno a medias), se borra para no ocupar espacio.
        // En un hilo aparte: leer el APK no debe frenar el arranque.
        new Thread(new Runnable() {
            @Override
            public void run() {
                cleanLeftovers();
            }
        }, "mi-plata-update-cleanup").start();
    }

    @Override
    protected void handleOnDestroy() {
        cancelled = true;
    }

    /** ¿Android deja a Mi Plata instalar apps? Desde Android 8 es un permiso especial que la persona concede. */
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject result = new JSObject();
        result.put("allowed", installAllowed());
        call.resolve(result);
    }

    /** Abre la pantalla «Instalar apps desconocidas» de Mi Plata. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception first) {
            try {
                Intent details = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:" + getContext().getPackageName()));
                details.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(details);
                call.resolve();
            } catch (Exception second) {
                call.reject("No se pudieron abrir los ajustes de instalación.", second);
            }
        }
    }

    /**
     * Descarga el APK. Avanza en un hilo propio y avisa con el evento {@code downloadProgress}
     * ({@code received}, {@code total}). Escribe en un archivo {@code .part} y solo al terminar lo renombra, así que
     * el archivo final siempre está completo. Si ya hay uno completo del mismo tamaño, lo reutiliza.
     */
    @PluginMethod
    public void download(final PluginCall call) {
        final String url = call.getString("url", "");
        final long expected = call.getData().optLong("size", 0L);
        if (url == null || !url.startsWith(ALLOWED_URL_PREFIX)) {
            call.reject("La dirección de descarga no es válida.", "BAD_URL");
            return;
        }
        if (!downloading.compareAndSet(false, true)) {
            call.reject("Ya hay una descarga en curso.", "BUSY");
            return;
        }
        cancelled = false;

        new Thread(new Runnable() {
            @Override
            public void run() {
                runDownload(call, url, expected);
            }
        }, "mi-plata-update-download").start();
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        cancelled = true;
        call.resolve();
    }

    /** Comprueba el archivo descargado y abre el instalador de Android. */
    @PluginMethod
    public void install(PluginCall call) {
        File apk = apkFile();
        if (!apk.isFile()) {
            call.reject("No hay una actualización descargada.", "NO_FILE");
            return;
        }
        if (!installAllowed()) {
            call.reject("Falta el permiso para instalar apps. Actívalo en los ajustes e inténtalo de nuevo.", "NO_PERMISSION");
            return;
        }
        String problem = verifyArchive(apk);
        if (problem != null) {
            //noinspection ResultOfMethodCallIgnored
            apk.delete();
            call.reject(problem, "VERIFY_FAILED");
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + AUTHORITY_SUFFIX, apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("No se pudo abrir el instalador de Android.", "INSTALL_FAILED", error);
        }
    }

    // ---------- Descarga ----------

    private void runDownload(PluginCall call, String url, long expected) {
        File dir = updateDir();
        File target = apkFile();
        File part = new File(dir, PART_NAME);
        HttpURLConnection connection = null;
        try {
            if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("No se pudo crear la carpeta de descarga");

            // Descarga anterior completa (por ejemplo, la persona canceló el instalador): se reutiliza.
            if (expected > 0 && target.isFile() && target.length() == expected) {
                emitProgress(expected, expected);
                call.resolve();
                return;
            }
            //noinspection ResultOfMethodCallIgnored
            target.delete();
            //noinspection ResultOfMethodCallIgnored
            part.delete();

            connection = (HttpURLConnection) URI.create(url).toURL().openConnection();
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setInstanceFollowRedirects(true);
            connection.setRequestProperty("Accept", "application/octet-stream");
            connection.setRequestProperty("User-Agent", "MiPlata-Android");
            int status = connection.getResponseCode();
            if (status != HttpURLConnection.HTTP_OK) throw new IOException("HTTP " + status);

            long total = connection.getContentLengthLong();
            if (total <= 0) total = expected;

            long received = 0L;
            long lastEmit = 0L;
            InputStream in = connection.getInputStream();
            try {
                OutputStream out = new FileOutputStream(part);
                try {
                    byte[] buffer = new byte[32 * 1024];
                    int read;
                    while ((read = in.read(buffer)) != -1) {
                        if (cancelled) throw new CancelledException();
                        out.write(buffer, 0, read);
                        received += read;
                        long now = SystemClock.elapsedRealtime();
                        if (now - lastEmit >= PROGRESS_EVERY_MS) {
                            emitProgress(received, total);
                            lastEmit = now;
                        }
                    }
                } finally {
                    out.close();
                }
            } finally {
                in.close();
            }

            // Un archivo más corto que lo publicado es una descarga cortada: no se instala.
            if (expected > 0 && part.length() != expected) throw new IOException("El tamaño no coincide");
            if (!part.renameTo(target)) throw new IOException("No se pudo guardar el archivo");
            emitProgress(received, received);
            call.resolve();
        } catch (CancelledException cancel) {
            //noinspection ResultOfMethodCallIgnored
            part.delete();
            call.reject("Descarga cancelada.", "CANCELLED");
        } catch (Exception error) {
            //noinspection ResultOfMethodCallIgnored
            part.delete();
            call.reject("No se pudo descargar la actualización. Revisa tu conexión e inténtalo de nuevo.", "DOWNLOAD_FAILED", error);
        } finally {
            if (connection != null) connection.disconnect();
            downloading.set(false);
        }
    }

    private void emitProgress(long received, long total) {
        JSObject data = new JSObject();
        data.put("received", received);
        data.put("total", total);
        notifyListeners("downloadProgress", data);
    }

    // ---------- Comprobación del archivo ----------

    /**
     * Devuelve {@code null} si el APK es seguro de instalar, o el motivo (ya en español) si no: tiene que ser Mi Plata,
     * una versión más nueva y venir firmado con la misma clave que la app instalada. Android también lo exige al
     * instalar, pero así el mensaje es claro y el archivo malo se borra.
     */
    @SuppressWarnings("deprecation")
    private String verifyArchive(File apk) {
        PackageManager pm = getContext().getPackageManager();
        String selfPackage = getContext().getPackageName();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? PackageManager.GET_SIGNING_CERTIFICATES | PackageManager.GET_SIGNATURES
                : PackageManager.GET_SIGNATURES;
        try {
            PackageInfo archive = pm.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
            if (archive == null) return "El archivo descargado está dañado. Inténtalo de nuevo.";
            if (!selfPackage.equals(archive.packageName)) return "El archivo descargado no corresponde a Mi Plata.";

            PackageInfo installed = pm.getPackageInfo(selfPackage, flags);
            if (versionCodeOf(archive) <= versionCodeOf(installed)) {
                return "Ya tienes esta versión o una más reciente instalada.";
            }

            Set<String> newSigners = signersOf(archive, true);
            Set<String> oldSigners = signersOf(installed, false);
            // Si el sistema no pudo leer las firmas del archivo, no se bloquea: Android las valida al instalar.
            if (!newSigners.isEmpty() && !oldSigners.isEmpty() && !intersects(newSigners, oldSigners)) {
                return "La actualización no está firmada con la misma clave que esta app, así que Android no la instalaría. "
                        + "Si instalaste una versión de pruebas, desinstálala primero (se borran los datos).";
            }
            return null;
        } catch (Exception error) {
            return "No se pudo comprobar el archivo descargado. Inténtalo de nuevo.";
        }
    }

    @SuppressWarnings("deprecation")
    private static long versionCodeOf(PackageInfo info) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
    }

    /**
     * Firmas del paquete. Con {@code includeHistory} también cuenta las anteriores de una clave rotada, para no
     * rechazar una actualización legítima firmada con la clave nueva.
     */
    @SuppressWarnings("deprecation")
    private static Set<String> signersOf(PackageInfo info, boolean includeHistory) {
        Set<String> out = new HashSet<String>();
        Signature[] list = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && info.signingInfo != null) {
            SigningInfo signing = info.signingInfo;
            list = signing.getApkContentsSigners();
            if (includeHistory && !signing.hasMultipleSigners()) {
                Signature[] history = signing.getSigningCertificateHistory();
                if (history != null) {
                    for (Signature signature : history) out.add(signature.toCharsString());
                }
            }
        }
        if ((list == null || list.length == 0) && info.signatures != null) list = info.signatures;
        if (list != null) {
            for (Signature signature : list) out.add(signature.toCharsString());
        }
        return out;
    }

    private static boolean intersects(Set<String> a, Set<String> b) {
        for (String value : a) {
            if (b.contains(value)) return true;
        }
        return false;
    }

    // ---------- Archivos y permisos ----------

    private boolean installAllowed() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
    }

    private File updateDir() {
        return new File(getContext().getCacheDir(), UPDATE_DIR);
    }

    private File apkFile() {
        return new File(updateDir(), APK_NAME);
    }

    /** Borra el {@code .part} huérfano y el APK si ya es la versión instalada (o no se puede leer). */
    @SuppressWarnings("deprecation")
    private void cleanLeftovers() {
        try {
            File dir = updateDir();
            if (!dir.isDirectory()) return;
            //noinspection ResultOfMethodCallIgnored
            new File(dir, PART_NAME).delete();
            File apk = apkFile();
            if (!apk.isFile()) return;
            PackageManager pm = getContext().getPackageManager();
            PackageInfo archive = pm.getPackageArchiveInfo(apk.getAbsolutePath(), 0);
            PackageInfo installed = pm.getPackageInfo(getContext().getPackageName(), 0);
            if (archive == null || versionCodeOf(archive) <= versionCodeOf(installed)) {
                //noinspection ResultOfMethodCallIgnored
                apk.delete();
            }
        } catch (Exception ignored) {
            // No es crítico: se limpia en la próxima apertura.
        }
    }
}
