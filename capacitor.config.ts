import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.miplata.app',
  appName: 'Mi Plata',
  webDir: 'dist',
  plugins: {
    // Ícono pequeño de los avisos de pago (lo instala scripts/apply-android-native.mjs).
    LocalNotifications: { smallIcon: 'ic_stat_miplata', iconColor: '#0B7A63' },
  },
};

export default config;
