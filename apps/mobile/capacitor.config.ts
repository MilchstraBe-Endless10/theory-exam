import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.theoryexam.mobile.dev',
  appName: '理论考试练习（开发版）',
  webDir: 'dist',
  loggingBehavior: 'none',
  android: { allowMixedContent: false },
};

export default config;
