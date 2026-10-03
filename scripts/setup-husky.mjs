// Se ejecuta con `npm install` (script "prepare"): activa los hooks de Git (.husky) solo en máquinas de desarrollo.
// En CI y en instalaciones sin las dependencias de desarrollo no hace nada, para que nunca rompa una instalación
// ni se valide el mensaje del commit de versión que crea semantic-release.
if (process.env.CI || process.env.HUSKY === '0') process.exit(0);

try {
  const { default: husky } = await import('husky');
  const message = husky();
  if (message) console.log(message);
} catch {
  // husky no está instalado (por ejemplo, `npm ci --omit=dev`): no hay hooks que activar.
}
