import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    // Multi-step tests take 3–4 s on a typical CI run under coverage, and
    // three of them reached 5.1 s on a slow runner and failed at Vitest's
    // 5 s default (#217). The slowest takes 7.3 s. A hung test still fails.
    testTimeout: 15_000,
    // test/fidelity holds no product code, but the shot manifest has an
    // invariant CI should enforce: a duplicate id silently overwrites another
    // surface's screenshot, which reads as coverage while losing it.
    include: [
      "src/**/*.test.{ts,tsx}",
      "test/playwright-env.test.ts",
      "test/playwright-contract-config.test.ts",
      "test/fidelity/*.test.ts",
      // The changelog transform releasing leans on: a bad cut corrupts the one
      // file that carries every change's narrative.
      "scripts/*.test.mts",
    ],
    coverage: {
      provider: "v8",
      // Everything we wrote counts; src/components/ui is vendored shadcn
      // (third-party primitives committed into the repo) and excluded —
      // documented in docs/plan/02_quality-guardrails.md.
      include: ["src/**"],
      exclude: [
        "src/components/ui/**",
        "src/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
      ],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 85,
      },
    },
  },
});
