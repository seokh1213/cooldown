import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

// Keep test deployments separate from the user's local PWA preview on 4173.
const previewPort = process.env.PLAYWRIGHT_PORT ?? "4180";
const baseURL = `http://127.0.0.1:${previewPort}/cooldown/`;

export default defineConfig({
  testDir: "../tests/e2e",
  outputDir: path.join(repositoryRoot, "dev/artifacts/test-results"),
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  failOnFlakyTests: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { outputFolder: path.join(repositoryRoot, "dev/artifacts/playwright-report"), open: "never" }]]
    : "list",
  use: {
    baseURL,
    channel: process.env.PLAYWRIGHT_CHANNEL,
    trace: "on-first-retry",
  },
  webServer: {
    cwd: repositoryRoot,
    command: `npm run preview -- --host 127.0.0.1 --port ${previewPort}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
