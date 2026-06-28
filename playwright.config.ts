import { defineConfig, devices } from "@playwright/test";

const chromePath =
  process.env.CI
    ? undefined
    : (process.env.PLAYWRIGHT_CHROME_PATH ??
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");

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
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5173",
    reuseExistingServer: !process.env.CI,
    url: "http://127.0.0.1:5173",
    timeout: 60_000,
  },
  projects: [
    {
      name: "chrome",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: chromePath ? { executablePath: chromePath } : {},
      },
    },
  ],
});
