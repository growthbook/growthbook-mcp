import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts"],
    // Cursor's sandbox can block process termination used by child-process pools.
    // Force a threads pool and run in a single thread for reliability.
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});

