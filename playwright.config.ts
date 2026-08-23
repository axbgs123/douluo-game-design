import { defineConfig, devices } from "@playwright/test";

const e2eDataDirectory = process.env.DOULUO_E2E_DATA_DIR ?? "/tmp/douluo-text-rpg-e2e";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node scripts/mock-deepseek.mjs",
      url: "http://127.0.0.1:18999/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "node_modules/.bin/concurrently -n SERVER,WEB -c yellow,cyan \"node_modules/.bin/tsx server/index.ts\" \"node_modules/.bin/vite --host 127.0.0.1\"",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      env: {
        DOULUO_DATA_DIR: e2eDataDirectory,
        DEEPSEEK_API_KEY: "local-e2e-key",
        DEEPSEEK_BASE_URL: "http://127.0.0.1:18999",
        DEEPSEEK_MODEL: "local-e2e-model",
      },
    },
  ],
});
