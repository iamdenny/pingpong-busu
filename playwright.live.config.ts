import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/live-e2e',
  use: { baseURL: 'http://127.0.0.1:5173/pingpong-busu/', trace: 'on-first-retry' },
  projects: [
    { name: 'chromium-live', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-live', use: { ...devices['Pixel 7'] } },
  ],
});
