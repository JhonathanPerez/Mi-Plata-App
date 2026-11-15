package __PACKAGE__;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Guarda la contraseña de cifrado de las copias donde la tarea en segundo plano pueda leerla sin la app abierta, y sin
 * dejarla a la vista: se cifra con una clave del Android Keystore (que no se puede sacar del teléfono) y solo el texto cifrado
 * queda en las preferencias privadas de la app.
 */
final class SecretStore {

    private static final String ALIAS = "miplata_backup_secret";
    private static final String PREFS = "backup_secret";
    private static final String KEY_BLOB = "password_blob";

    private SecretStore() {}

    private static SecretKey key() throws GeneralSecurityException, IOException {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build());
        return generator.generateKey();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void save(Context context, String password) throws GeneralSecurityException, IOException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] encrypted = cipher.doFinal(password.getBytes(StandardCharsets.UTF_8));
        String blob = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(encrypted, Base64.NO_WRAP);
        prefs(context).edit().putString(KEY_BLOB, blob).apply();
    }

    /** La contraseña, o null si no hay ninguna guardada. */
    static String read(Context context) throws GeneralSecurityException, IOException {
        String blob = prefs(context).getString(KEY_BLOB, null);
        if (blob == null) return null;
        String[] parts = blob.split(":");
        if (parts.length != 2) throw new GeneralSecurityException("La contraseña guardada está dañada.");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }

    static void clear(Context context) {
        prefs(context).edit().remove(KEY_BLOB).apply();
    }
}
