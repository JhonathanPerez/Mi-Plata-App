import { describe, expect, it } from 'vitest';
import { decryptBackup, encryptBackup, isEncryptedBackup, validateBackupPassword, WrongPasswordError } from './backupCrypto';

// Pocas iteraciones: la derivación real (600.000) tarda cerca de un segundo y aquí no es lo que se prueba.
const FAST = 1_000;
const PLAIN = JSON.stringify({ app: 'mi-plata', data: { expenses: [{ note: 'Almuerzo con el equipo — ñandú 🍽️' }] } });

describe('backupCrypto', () => {
  it('descifra con la misma contraseña, incluyendo tildes y emojis', async () => {
    const encrypted = await encryptBackup(PLAIN, 'una contraseña larga', FAST);
    expect(await decryptBackup(encrypted, 'una contraseña larga')).toBe(PLAIN);
  });

  it('no deja el contenido legible dentro del archivo', async () => {
    const encrypted = await encryptBackup(PLAIN, 'una contraseña larga', FAST);
    expect(encrypted).not.toContain('Almuerzo');
    expect(isEncryptedBackup(encrypted)).toBe(true);
  });

  it('con otra contraseña o con el archivo alterado falla en vez de devolver basura', async () => {
    const encrypted = await encryptBackup(PLAIN, 'una contraseña larga', FAST);
    await expect(decryptBackup(encrypted, 'otra contraseña')).rejects.toBeInstanceOf(WrongPasswordError);
    const tampered = JSON.parse(encrypted);
    tampered.data = tampered.data.slice(0, -4) + (tampered.data.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    await expect(decryptBackup(JSON.stringify(tampered), 'una contraseña larga')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('cada copia usa sal e IV distintos', async () => {
    const [a, b] = await Promise.all([encryptBackup(PLAIN, 'una contraseña larga', FAST), encryptBackup(PLAIN, 'una contraseña larga', FAST)]);
    expect(a).not.toBe(b);
  });

  it('solo reconoce como cifrada una copia con el formato de Mi Plata', async () => {
    expect(isEncryptedBackup(PLAIN)).toBe(false);
    expect(isEncryptedBackup('no es json')).toBe(false);
    expect(isEncryptedBackup(JSON.stringify({ format: 'mi-plata-backup-encrypted', version: 1, kdf: 'PBKDF2-SHA256', iterations: 10, salt: '', iv: '', data: '' }))).toBe(false);
    await expect(decryptBackup(PLAIN, 'x')).rejects.toThrow('no es una copia cifrada');
  });

  it('pide una contraseña de al menos 8 caracteres', () => {
    expect(validateBackupPassword('1234567')).not.toBeNull();
    expect(validateBackupPassword('12345678')).toBeNull();
  });
});
