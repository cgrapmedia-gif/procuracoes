import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', timeout: 90_000, fullyParallel: false, workers: 1, retries: 0,
  use: { baseURL: process.env.WEB_URL ?? 'http://localhost:3000', viewport: { width: 1440, height: 900 }, locale: 'pt-PT', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  reporter: [['list']],
});
