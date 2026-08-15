import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'game.splitio.app',
  appName: 'Split.io',
  webDir: 'dist',
  backgroundColor: '#0d0d12',
  server: { androidScheme: 'https' }
};

export default config;
