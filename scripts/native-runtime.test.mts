// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it("probe: runtime receipts precede container start and failure cleanup removes only that container and its volumes", () => {
  const dir = mkdtempSync(join(tmpdir(), "native-receipt-probe-"));
  try {
    const calls = join(dir, "calls");
    const evidence = join(dir, "evidence");
    const preload = join(dir, "commands.mjs");
    // Intercept only this child process. No shell executables or real Docker
    // are needed, including on the Windows leg of the normal unit gate.
    writeFileSync(
      preload,
      `
import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { appendFileSync, readFileSync } from "node:fs";
const original = cp.spawnSync;
cp.spawnSync = (command, args, options) => {
  if (command !== "docker") return original(command, args, options);
  appendFileSync(${JSON.stringify(calls)}, args.join(" ") + "\\n");
  const ok = (stdout = "") => ({ status: 0, stdout, stderr: "" });
  const id = "1".padStart(64, "0");
  switch (args[0]) {
    case "create": case "run": case "rm": return ok(id);
    case "inspect": return ok("[]");
    case "start": {
      const receipt = JSON.parse(readFileSync(${JSON.stringify(join(evidence, "task6-native-receipt.json"))}, "utf8"));
      if (!receipt.container || receipt.containerCreation?.id !== receipt.container) return { status: 2, stdout: "", stderr: "missing original creation receipt" };
      return ok();
    }
    case "port": return { status: 1, stdout: "", stderr: "injected readiness failure" };
    default: return ok();
  }
};
syncBuiltinESMExports();
`,
    );
    const result = spawnSync(
      process.execPath,
      ["--import", pathToFileURL(preload).href, "test/native/runtime.mjs"],
      {
        encoding: "utf8",
        env: {
          NODE_ENV: "test",
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          NATIVE_EVIDENCE_DIR: evidence,
          NATIVE_PLATFORM_SOURCE: dir,
        },
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("injected readiness failure");
    const commands = readFileSync(calls, "utf8").trim().split("\n");
    expect(commands.some((c) => c.startsWith("run "))).toBe(false);
    expect(commands.findIndex((c) => c.startsWith("create "))).toBeLessThan(
      commands.findIndex((c) => c.startsWith("start ")),
    );
    const receipt = JSON.parse(
      readFileSync(join(evidence, "task6-native-receipt.json"), "utf8"),
    );
    expect(receipt.containerCreation.id).toBe(receipt.container);
    expect(commands.filter((c) => c.startsWith("rm "))).toEqual([
      `rm -f -v ${receipt.container}`,
    ]);
    expect(receipt.cleaned).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
