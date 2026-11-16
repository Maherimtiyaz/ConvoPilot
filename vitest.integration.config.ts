import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Integration tests run against the local Supabase stack (`npm run db:start`).
// They are kept out of `npm test` so unit tests never need Docker.
export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) }],
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
