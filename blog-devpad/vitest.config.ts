import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/server/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/server/src/**/*.ts"],
      exclude: ["**/__tests__/**", "**/*.d.ts"],
    },
    globals: true,
    setupFiles: ["packages/server/__tests__/setup.ts"],
  },
  resolve: {
    alias: {
      "@blog/schema": resolve(__dirname, "./packages/schema/src/index.ts"),
      "@blog/server": resolve(__dirname, "./packages/server/src/index.ts"),
      "@blog/api": resolve(__dirname, "./packages/api/src/index.ts"),
    },
  },
});
