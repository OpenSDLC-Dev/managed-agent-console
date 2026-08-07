import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    // test/fidelity holds no product code, but the shot manifest has an
    // invariant CI should enforce: a duplicate id silently overwrites another
    // surface's screenshot, which reads as coverage while losing it.
    include: ["src/**/*.test.{ts,tsx}", "test/fidelity/*.test.ts"],
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
