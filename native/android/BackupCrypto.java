package __PACKAGE__;

import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Cifra una copia con el MISMO formato que la parte web (src/lib/backupCrypto.ts): AES-256-GCM con una clave derivada de la
 * contraseña con PBKDF2-SHA256, sal e IV aleatorios, todo dentro de un sobre JSON. Así una copia hecha por la tarea en
 * segundo plano se abre con la contraseña desde Ajustes igual que cualquiera.
 */
final class BackupCrypto {

    static final int KDF_ITERATIONS = 600_000;
    private static final String FORMAT = "mi-plata-backup-encrypted";
    private static final int VERSION = 1;

    private BackupCrypto() {}

    static String encrypt(String plain, String password, int iterations) throws GeneralSecurityException {
        SecureRandom random = new SecureRandom();
        byte[] salt = new byte[16];
        byte[] iv = new byte[12];
        random.nextBytes(salt);
        random.nextBytes(iv);
        byte[] key = Pbkdf2.derive(password.getBytes(StandardCharsets.UTF_8), salt, iterations, 32);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
        // GCM devuelve el texto cifrado seguido de la etiqueta de 16 bytes, igual que Web Crypto.
        byte[] encrypted = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
        return "{\"format\":\"" + FORMAT + "\",\"version\":" + VERSION + ",\"kdf\":\"PBKDF2-SHA256\",\"iterations\":" + iterations
            + ",\"salt\":\"" + Base64.encodeToString(salt, Base64.NO_WRAP) + "\",\"iv\":\"" + Base64.encodeToString(iv, Base64.NO_WRAP)
            + "\",\"data\":\"" + Base64.encodeToString(encrypted, Base64.NO_WRAP) + "\"}";
    }
}
