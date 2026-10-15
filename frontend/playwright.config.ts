import { defineConfig } from '@playwright/test';
const origin = process.env.UI_ORIGIN;
if (!origin || !process.env.TEST_DATABASE_URL?.includes('_test'))
  throw new Error('Run browser checks through node scripts/test-ui.mjs');
export default defineConfig({
  testDir: './test',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  reporter: [['list']],
  use: {
    baseURL: origin,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    browserName: 'chromium',
    channel: process.env.UI_BROWSER_CHANNEL ?? 'chrome',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'tablet', use: { viewport: { width: 834, height: 1112 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    {
      command: 'node dist/src/main.js',
      cwd: '../backend',
      url: 'http://127.0.0.1:5001/api/auth/me',
      reuseExistingServer: false,
      timeout: 30000,
      env: {
        DATABASE_URL: process.env.TEST_DATABASE_URL!,
        JWT_SECRET: process.env.JWT_SECRET!,
        JWT_ISSUER: process.env.JWT_ISSUER!,
        JWT_AUDIENCE: process.env.JWT_AUDIENCE!,
        FRONTEND_URL: origin,
        NODE_ENV: 'test',
        DEMO_AUTH_ENABLED: 'true',
        PORT: '5001',
        HOST: '127.0.0.1',
        STORAGE_ROOT: '.data/browser-files',
        MAX_FILE_BYTES: '5242880',
      },
    },
    {
      command: 'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3001',
      url: origin + '/login',
      reuseExistingServer: false,
      timeout: 30000,
      env: {
        NODE_ENV: 'production',
        API_INTERNAL_URL: 'http://127.0.0.1:5001/api',
        APP_ORIGIN: origin,
      },
    },
  ],
});
