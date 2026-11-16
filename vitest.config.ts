import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      // Next.js resolves `server-only` to an empty module on the server.
      // Tests run in Node (server context), so mirror that resolution.
      {
        find: /^server-only$/,
        replacement: fileURLToPath(
          new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url),
        ),
      },
      { find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    restoreMocks: true,
  },
});
