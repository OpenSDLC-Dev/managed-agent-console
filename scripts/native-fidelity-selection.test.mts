// @vitest-environment node
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it.each([
  [undefined, true],
  ["", true],
  ["native-last-admin", true],
  ["native-last-admn", false],
  ["native-last-admin,native-last-admn", false],
] as const)(
  "probe: actual native walker validates selection %s before setup",
  (selection, valid) => {
    const dir = mkdtempSync(join(tmpdir(), "nf-"));
    try {
      const result = spawnSync(
        process.execPath,
        [
          "node_modules/@playwright/test/cli.js",
          "test",
          "--config",
          "playwright.native.config.ts",
          "--list",
        ],
        {
          encoding: "utf8",
          timeout: 15_000,
          env: {
            NODE_ENV: "test",
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            SystemRoot: process.env.SystemRoot,
            NATIVE_FIDELITY: "1",
            NATIVE_EVIDENCE_DIR: dir,
            ...(selection === undefined
              ? {}
              : { NATIVE_FIDELITY_IDS: selection }),
          },
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status, result.stdout + result.stderr).toBe(valid ? 0 : 1);
      if (valid)
        expect(result.stdout).toContain("walk native manifest in owned Chrome");
      else
        expect(result.stdout + result.stderr).toContain(
          "Unknown NATIVE_FIDELITY_IDS: native-last-admn",
        );
      expect(existsSync(join(dir, "task6-native-receipt.json"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
