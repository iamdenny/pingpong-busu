import { defineConfig, devices } from "@playwright/test";

const configuredBasePath = process.env.PRODUCTION_E2E_BASE_PATH?.trim() || "/";
const basePath =
  configuredBasePath === "/"
    ? "/"
    : `/${configuredBasePath.replace(/^\/+|\/+$/gu, "")}/`;
const previewUrl = `http://127.0.0.1:4174${basePath}`;

export default defineConfig({
  testDir: "./tests/production-e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: previewUrl,
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "./node_modules/.bin/vite preview --config apps/web/vite.config.ts --configLoader runner --host 127.0.0.1 --port 4174",
    url: previewUrl,
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: "production-chromium", use: devices["Desktop Chrome"] }],
});
