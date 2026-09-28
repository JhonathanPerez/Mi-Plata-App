import { Capacitor } from '@capacitor/core';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';

/**
 * Envoltorio del plugin de huella/rostro. Toda la app pasa por aquí para no depender del plugin en otros sitios.
 * Se permite el PIN, patrón o clave del teléfono como respaldo: así nunca quedas fuera si el sensor falla.
 */

export type BiometricSupport = 'available' | 'none' | 'web';
export type AuthOutcome = { ok: true } | { ok: false; cancelled: boolean; message: string };

/** Mientras se muestra el diálogo del sistema (y un instante después) Android puede avisar que la app "salió". */
const PROMPT_COOLDOWN_MS = 1500;
let openPrompts = 0;
let lastPromptEnd = 0;

/** ¿Hay un diálogo de huella abierto ahora mismo? (para no abrir dos a la vez) */
export function isBiometricPromptOpen(): boolean {
  return openPrompts > 0;
}

/**
 * ¿Hay un diálogo abierto o recién cerrado? Android puede avisar que la app "salió" y "volvió" alrededor del
 * diálogo; con esto no se confunde con que el usuario realmente la dejó en segundo plano.
 */
export function isBiometricPromptActive(now: number = Date.now()): boolean {
  return openPrompts > 0 || now - lastPromptEnd < PROMPT_COOLDOWN_MS;
}

export async function getBiometricSupport(): Promise<BiometricSupport> {
  if (!Capacitor.isNativePlatform()) return 'web';
  try {
    const info = await BiometricAuth.checkBiometry();
    return info.isAvailable || info.deviceIsSecure ? 'available' : 'none';
  } catch {
    return 'none';
  }
}

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : '';
}

function friendlyMessage(code: string): string {
  switch (code) {
    case 'biometryLockout':
      return 'Demasiados intentos. Espera un momento o usa el PIN del teléfono.';
    case 'biometryNotEnrolled':
    case 'biometryNotAvailable':
    case 'passcodeNotSet':
    case 'noDeviceCredential':
      return 'Tu teléfono no tiene huella, rostro ni PIN configurado.';
    default:
      return 'No se pudo verificar tu identidad. Inténtalo de nuevo.';
  }
}

export async function authenticate(reason: string): Promise<AuthOutcome> {
  openPrompts += 1;
  try {
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: 'Cancelar',
      allowDeviceCredential: true,
      androidTitle: 'Mi Plata',
    });
    return { ok: true };
  } catch (error) {
    const code = errorCode(error);
    const cancelled = code === 'userCancel' || code === 'systemCancel' || code === 'appCancel';
    return { ok: false, cancelled, message: cancelled ? '' : friendlyMessage(code) };
  } finally {
    openPrompts -= 1;
    lastPromptEnd = Date.now();
  }
}
