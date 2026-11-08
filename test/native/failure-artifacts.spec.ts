import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test, expect } from "./test";

test("native unexpected failures keep reveal out of first writes and reporter output", () => {
  const result = spawnSync(
    process.execPath,
    ["--test", resolve("test/native/failure-artifacts.test.mjs")],
    { env: process.env, encoding: "utf8", timeout: 60_000 },
  );
  expect(result.error).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
});
