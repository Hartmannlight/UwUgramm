import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  workers: 1,
  use: {
    baseURL: process.env.STATIC_TEST_URL || "http://127.0.0.1:4173/UwUgramm/",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: process.env.STATIC_TEST_URL
    ? undefined
    : {
        command:
          "npm run build:static -- --base /UwUgramm/ && npm exec vite preview -- --host 127.0.0.1 --port 4173 --strictPort --base /UwUgramm/",
        url: "http://127.0.0.1:4173/UwUgramm/",
        timeout: 180_000,
        reuseExistingServer: false,
      },
});
