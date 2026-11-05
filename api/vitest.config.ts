import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Semua tes memakai satu database; jalankan berurutan supaya tidak saling timpa.
    fileParallelism: false,
    testTimeout: 15000,
  },
});
