import { defineConfig, devices } from "@playwright/test";

// E2E for the hub. Deliberately small and loud: one worker, no retries, so a
// flake fails instead of being papered over by a re-run.
export default defineConfig({
  testDir: "./tests",
  // Keep traces/screenshots inside e2e/ instead of dropping them at the repo root.
  outputDir: "./.artifacts",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    viewport: { width: 1400, height: 900 },
    // The app has no network dependency worth testing here; every spec also
    // aborts api.github.com explicitly (see tests/helpers.ts).
    offline: false,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    // Locally there is usually a dev server already up — attach to it.
    // On CI nothing is running, so Playwright starts (and owns) its own.
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    cwd: "..",
  },
});
