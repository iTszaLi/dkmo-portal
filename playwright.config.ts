import { defineConfig, devices } from "@playwright/test";

const basePath = "/dkmo-e2e";
const port = 4173;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}${basePath}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: `BASE_PATH=${basePath}/ PORT=${port} NODE_ENV=test pnpm --filter @workspace/dkmo-portal run dev`,
    url: `http://127.0.0.1:${port}${basePath}/dkmo-track`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});