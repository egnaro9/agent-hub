import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    // e2e/ is Playwright's; vitest owns the unit tests beside the source.
    include: ["src/**/*.test.ts"],
  },
});
