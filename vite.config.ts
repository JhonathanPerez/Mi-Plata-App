import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import pkg from './package.json';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  define: {
    // Inyecta la versión de package.json en el bundle, para que "Acerca de"
    // (src/config/constants.ts -> APP_VERSION) siempre coincida con la versión
    // que publica semantic-release, sin tener que actualizarla a mano.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
