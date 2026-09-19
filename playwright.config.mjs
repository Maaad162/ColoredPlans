import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 45000,
  use: { baseURL: 'http://127.0.0.1:4173', headless: true, trace: 'retain-on-failure',
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173', reuseExistingServer: false,
    env: { VITE_USE_EMULATORS: 'true', VITE_FIREBASE_PROJECT_ID: 'demo-coloredplans',
      VITE_FIREBASE_API_KEY: 'emulator-only', VITE_FIREBASE_AUTH_DOMAIN: 'demo-coloredplans.firebaseapp.com',
      VITE_FIREBASE_APP_ID: 'demo-coloredplans' },
  },
});
