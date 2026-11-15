/**
 * Cifrado de las copias que salen del teléfono (la carpeta de la nube). AES-256-GCM con una clave derivada de la
 * contraseña con PBKDF2-SHA256 (sal e IV aleatorios por copia). GCM además autentica: con otra contraseña, o con un
 * archivo alterado, descifrar falla en vez de devolver basura. Todo con la Web Crypto del sistema, sin librerías.
 *
 * Si se olvida la contraseña no hay forma de recuperar la copia.
 */
export const MIN_PASSWORD_LENGTH = 8;
const ENVELOPE_FORMAT = 'mi-plata-backup-encrypted';
const ENVELOPE_VERSION = 1;
/** Recomendación OWASP para PBKDF2-SHA256. Va dentro de cada copia, así que se puede subir más adelante sin romper las viejas. */
export const KDF_ITERATIONS = 600_000;
const MIN_ITERATIONS = 1_000;
const MAX_ITERATIONS = 5_000_000;

export class WrongPasswordError extends Error {
  constructor() {
    super('La contraseña no es correcta, o el archivo está dañado.');
    this.name = 'WrongPasswordError';
  }
}

export function validateBackupPassword(password: string): string | null {
  return password.length < MIN_PASSWORD_LENGTH ? `Usa al menos ${MIN_PASSWORD_LENGTH} caracteres.` : null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

interface Envelope {
  format: string;
  version: number;
  kdf: string;
  iterations: number;
  salt: string;
  iv: string;
  data: string;
}

function readEnvelope(text: string): Envelope | null {
  try {
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== 'object' || raw === null) return null;
    const e = raw as Record<string, unknown>;
    if (e.format !== ENVELOPE_FORMAT || e.version !== ENVELOPE_VERSION || e.kdf !== 'PBKDF2-SHA256') return null;
    if (typeof e.iterations !== 'number' || !Number.isInteger(e.iterations) || e.iterations < MIN_ITERATIONS || e.iterations > MAX_ITERATIONS) return null;
    if (typeof e.salt !== 'string' || typeof e.iv !== 'string' || typeof e.data !== 'string') return null;
    return e as unknown as Envelope;
  } catch {
    return null;
  }
}

/** ¿Este texto es una copia cifrada de Mi Plata? (Para saber si hay que pedir la contraseña antes de restaurar.) */
export function isEncryptedBackup(text: string): boolean {
  return text.includes(ENVELOPE_FORMAT) && readEnvelope(text) !== null;
}

/** Cifra el texto de una copia. `iterations` solo se cambia en las pruebas. */
export async function encryptBackup(plain: string, password: string, iterations: number = KDF_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  const envelope: Envelope = {
    format: ENVELOPE_FORMAT,
    version: ENVELOPE_VERSION,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(cipher)),
  };
  return JSON.stringify(envelope);
}

/** Descifra una copia. Lanza `WrongPasswordError` si la contraseña no es la correcta o el archivo fue alterado. */
export async function decryptBackup(text: string, password: string): Promise<string> {
  const envelope = readEnvelope(text);
  if (!envelope) throw new Error('Este archivo no es una copia cifrada de Mi Plata.');
  try {
    const key = await deriveKey(password, fromBase64(envelope.salt), envelope.iterations);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(envelope.iv) as BufferSource }, key, fromBase64(envelope.data) as BufferSource);
    return new TextDecoder().decode(plain);
  } catch {
    throw new WrongPasswordError();
  }
}
