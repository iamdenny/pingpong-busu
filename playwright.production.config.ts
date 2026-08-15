import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/production-e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:4174/",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "./node_modules/.bin/vite preview --config apps/web/vite.config.ts --configLoader runner --host 127.0.0.1 --port 4174",
    url: "http://127.0.0.1:4174/",
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: "production-chromium", use: devices["Desktop Chrome"] }],
});
