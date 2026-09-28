/**
 * OPCIONAL: regenera los recursos del icono a partir de los SVG de assets/icon/.
 * Los PNG ya vienen generados en assets/android-res/, así que solo necesitas esto si cambias el diseño:
 *   npm i -D sharp && node scripts/generate-icons.mjs && node scripts/apply-android-icon.mjs
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('Falta sharp. Instálalo con: npm i -D sharp');
  process.exit(1);
}

const BG = '#0E3A33';
const root = resolve('assets');
const out = join(root, 'android-res');
const fgSvg = readFileSync(join(root, 'icon/icon-foreground.svg'));
const monoSvg = readFileSync(join(root, 'icon/icon-monochrome.svg'));

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const render = (svg, size) => sharp(svg, { density: (72 * size) / 108 }).resize(size, size).png().toBuffer();

/** Icono "clásico" (Android < 8): fondo + capa frontal, con forma cuadrada redondeada o circular. */
async function legacy(size, round, square = false) {
  const fgSize = Math.round(((size * 108) / 66) * 0.84);
  const fg = await render(fgSvg, fgSize);
  const offset = Math.round((fgSize - size) / 2);
  const cropped = await sharp(fg).extract({ left: offset, top: offset, width: size, height: size }).toBuffer();
  const base = await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: cropped }])
    .png()
    .toBuffer();
  if (square) return base;
  const shape = round
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.22}"/></svg>`;
  return sharp(base).composite([{ input: Buffer.from(shape), blend: 'dest-in' }]).png().toBuffer();
}

rmSync(out, { recursive: true, force: true });
const put = (path, data) => {
  const full = join(out, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, data);
};

for (const [name, scale] of Object.entries(DENSITIES)) {
  put(`mipmap-${name}/ic_launcher.png`, await legacy(Math.round(48 * scale), false));
  put(`mipmap-${name}/ic_launcher_round.png`, await legacy(Math.round(48 * scale), true));
  put(`mipmap-${name}/ic_launcher_foreground.png`, await render(fgSvg, Math.round(108 * scale)));
  put(`mipmap-${name}/ic_launcher_monochrome.png`, await render(monoSvg, Math.round(108 * scale)));
}

const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`;
put('mipmap-anydpi-v26/ic_launcher.xml', adaptive);
put('mipmap-anydpi-v26/ic_launcher_round.xml', adaptive);

put(
  'values/ic_launcher_background.xml',
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BG}</color>
</resources>
`,
);

// Pantalla de arranque: fondo esmeralda + logo centrado (sin deformarse en ninguna pantalla).
put('drawable-nodpi/splash_logo.png', await render(fgSvg, 1024));
put(
  'drawable/splash_brand.xml',
  `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/ic_launcher_background"/>
    <item>
        <bitmap android:gravity="center" android:src="@drawable/splash_logo"/>
    </item>
</layer-list>
`,
);

// Para la ficha de Google Play (512×512, cuadrado completo) y como imagen maestra.
writeFileSync(join(root, 'icon/icon-512.png'), await legacy(512, false, true));
writeFileSync(join(root, 'icon/icon-1024.png'), await legacy(1024, false, true));
console.log('Recursos de icono generados en assets/android-res/');
