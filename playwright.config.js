import { defineConfig } from '@playwright/test';

const projects = process.env.CI
  ? [{ name: 'chromium', use: { browserName: 'chromium' } }]
  : [
      { name: 'chrome', use: { browserName: 'chromium', channel: 'chrome' } },
      { name: 'edge', use: { browserName: 'chromium', channel: 'msedge' } }
    ];

export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'line',
  use: { baseURL: 'http://127.0.0.1:4174', viewport: { width: 1440, height: 900 }, acceptDownloads: true },
  projects,
  webServer: { command: 'node scripts/serve-static.mjs', url: 'http://127.0.0.1:4174', env: { PORT: '4174' }, reuseExistingServer: true, timeout: 30000 }
});
