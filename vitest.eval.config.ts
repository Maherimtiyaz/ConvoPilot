import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Model evaluation against a real provider (docs/EVALUATION.md §5). Manual: `npm run eval`.
 * Not part of CI: it needs ANTHROPIC_API_KEY and costs money (capped by EVAL_MAX_USD).
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^server-only$/, replacement: fileURLToPath(new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url)) },
      { find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/evaluation/**/*.eval.ts"],
    testTimeout: 30 * 60 * 1000,
  },
});
