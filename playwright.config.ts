import { defineConfig, devices } from "@playwright/test";

import { readStatusEnv } from "./tests/e2e/support";

// End-to-end tests: the built app (`npm run build`) against the local Supabase stack.
const supabase = readStatusEnv();
const PORT = 3000;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["json", { outputFile: "test-results/e2e.json" }]] : "list",
  use: {
    // Must match the Auth site_url so email links point at this server.
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next start -H 127.0.0.1 -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: supabase.API_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: supabase.PUBLISHABLE_KEY || supabase.ANON_KEY,
      NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${PORT}`,
    },
  },
});
