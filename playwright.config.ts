import { defineConfig, devices } from "@playwright/test";

const chromeChannel = process.env.CI ? undefined : "chrome";
const useExternalServer = process.env.AGENTPAY_EXTERNAL_SERVER === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  use: {
    acceptDownloads: true,
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  webServer: useExternalServer
    ? undefined
    : {
        command: "npx vite --host 127.0.0.1 --port 5173",
        reuseExistingServer: false,
        url: "http://127.0.0.1:5173",
        timeout: 60_000,
      },
  projects: [
    {
      name: "chrome",
      use: {
        ...devices["Desktop Chrome"],
        channel: chromeChannel,
      },
    },
  ],
});
