import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.theoryexam.mobile.dev',
  appName: '理论考试练习（开发版）',
  webDir: 'dist',
  android: { allowMixedContent: false },
  plugins: {
    App: { disableBackButtonHandler: true },
  },
};

export default config;
