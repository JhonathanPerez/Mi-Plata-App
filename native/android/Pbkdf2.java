package __PACKAGE__;

import java.security.GeneralSecurityException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * PBKDF2-HMAC-SHA256 hecho a mano con Mac. SecretKeyFactory solo ofrece «PBKDF2WithHmacSHA256» desde Android 8 y la app
 * llega a Android 6: así funciona igual en todas. El resultado es el mismo que da la Web Crypto de la parte web con la que se
 * abren las copias (hay una prueba que lo comprueba).
 */
final class Pbkdf2 {

    private Pbkdf2() {}

    static byte[] derive(byte[] password, byte[] salt, int iterations, int keyLength) throws GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(password, "HmacSHA256"));
        int hashLength = mac.getMacLength();
        int blocks = (keyLength + hashLength - 1) / hashLength;
        byte[] derived = new byte[keyLength];
        for (int block = 1; block <= blocks; block++) {
            mac.update(salt);
            mac.update(new byte[] {(byte) (block >>> 24), (byte) (block >>> 16), (byte) (block >>> 8), (byte) block});
            byte[] u = mac.doFinal();
            byte[] t = u.clone();
            for (int i = 1; i < iterations; i++) {
                u = mac.doFinal(u);
                for (int j = 0; j < t.length; j++) t[j] ^= u[j];
            }
            int offset = (block - 1) * hashLength;
            System.arraycopy(t, 0, derived, offset, Math.min(hashLength, keyLength - offset));
        }
        return derived;
    }
}
