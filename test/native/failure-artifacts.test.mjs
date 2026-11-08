// Synthetic-only unexpected failures. No backend, issued key or Next server.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { stripVTControlCharacters } from "node:util";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);
const cli = join(
  dirname(require.resolve("@playwright/test/package.json")),
  "cli.js",
);
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

for (const mode of [process.env.NATIVE_FIDELITY ? "chrome" : "chromium"]) {
  test(`native unexpected failure artifacts redact reveal before writing (${mode})`, () => {
    const dir = mkdtempSync(
      join(process.env.NATIVE_EVIDENCE_DIR || tmpdir(), "failure-control-"),
    );
    const output = join(dir, "output");
    mkdirSync(output);
    // The complete marker is never in test source or a source excerpt.
    const marker = [
      "sk",
      "map",
      "api01",
      `SYNTHETIC_NOT_A_CREDENTIAL_${randomUUID()}`,
    ].join("-");
    const spec = join(dir, "failure.spec.ts");
    writeFileSync(
      spec,
      `
import { test, expect } from ${JSON.stringify(join(root, "test/native/test"))};
test.beforeEach(async ({ page }, info) => {
  console.log(JSON.stringify({effective: true, project: info.project.name, channel: info.project.use.channel || "chromium", trace: info.project.use.trace, screenshot: info.project.use.screenshot, video: info.project.use.video, noCopyPrompt: process.env.PLAYWRIGHT_NO_COPY_PROMPT}));
  await page.setContent('<h1>Save your API key</h1><pre data-testid="revealed-api-key"></pre><p>ordinary diagnostic</p>');
  await page.getByTestId("revealed-api-key").evaluate((node, value) => node.textContent = value, process.env.SYNTHETIC_REVEAL);
});
test("unexpected missing locator with visible reveal", async ({ page }) => {
  await expect(page.getByRole("button", { name: "ordinary missing control" })).toBeVisible({ timeout: 50 });
});
test("unexpected received text with visible reveal", async ({ page }) => {
  await expect(page.getByTestId("revealed-api-key")).toHaveText("ordinary wrong expectation", { timeout: 50 });
});
test("unexpected nonmatcher failure with visible reveal", async () => {
  expect(false, "ordinary nonmatcher diagnostic").toBe(true);
});
`,
    );
    const config = join(dir, "config.ts");
    writeFileSync(
      config,
      `
import native from ${JSON.stringify(join(root, "playwright.native.config"))};
export default {...native, testDir: ${JSON.stringify(dir)}, testMatch: "failure.spec.ts", webServer: undefined, retries: 0, outputDir: ${JSON.stringify(output)}, reporter: [["list"], ["json", {outputFile: ${JSON.stringify(join(output, "report.json"))}}]]};
`,
    );
    // Observe the first writes, not just final files. A post-write scrub cannot
    // satisfy this contract. This observer never changes or deletes output.
    const audit = join(dir, "writes.jsonl");
    const preload = join(dir, "write-audit.mjs");
    writeFileSync(
      preload,
      `
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
const append = fs.appendFileSync.bind(fs);
const inspect = (data) => {
  if ((typeof data === "string" || Buffer.isBuffer(data)) && data.toString().includes(process.env.SYNTHETIC_REVEAL))
    append(${JSON.stringify(audit)}, JSON.stringify({secretWrite: true}) + "\\n");
};
for (const name of ["writeFileSync", "appendFileSync", "writeSync"] ) {
  const original = fs[name];
  fs[name] = function(path, data, ...args) { inspect(data); return original.call(this, path, data, ...args); };
}
for (const name of ["writeFile", "appendFile"]) {
  const original = fs.promises[name];
  fs.promises[name] = function(path, data, ...args) { inspect(data); return original.call(this, path, data, ...args); };
}
syncBuiltinESMExports();
`,
    );
    const env = { ...process.env, SYNTHETIC_REVEAL: marker };
    delete env.NATIVE_FIDELITY;
    if (mode === "chrome") env.NATIVE_FIDELITY = "1";
    const result = spawnSync(
      process.execPath,
      ["--import", preload, cli, "test", "--config", config],
      {
        env,
        encoding: "utf8",
        timeout: 90_000,
      },
    );
    writeFileSync(join(output, "stdout.txt"), result.stdout || "");
    writeFileSync(join(output, "stderr.txt"), result.stderr || "");
    assert.equal(
      result.error,
      undefined,
      "child runner must finish, not time out",
    );
    assert.equal(
      result.status,
      1,
      "unexpected assertions must remain failures",
    );
    const report = JSON.parse(
      readFileSync(join(output, "report.json"), "utf8"),
    );
    const results = report.suites.flatMap((suite) =>
      suite.specs.flatMap((spec) => spec.tests),
    );
    const count = mode === "chrome" ? 6 : 3;
    assert.equal(
      results.length,
      count,
      "all named negative controls must be collected",
    );
    assert.ok(
      results.every(
        (t) =>
          t.expectedStatus === "passed" &&
          t.status === "unexpected" &&
          t.results[0].status === "failed",
      ),
    );
    assert.equal(report.stats.unexpected, count);
    for (const result of results) {
      const message = stripVTControlCharacters(
        result.results[0].errors[0].message,
      );
      assert.match(
        message,
        /expect\(.*\)\.toBeVisible\(\) failed|expect\(.*\)\.toHaveText\(.*\) failed|ordinary nonmatcher diagnostic/,
        "failure must be the intended assertion, not setup or guard failure",
      );
    }
    const effective = (result.stdout || "")
      .split("\n")
      .filter((line) => line.startsWith('{"effective":'))
      .map(JSON.parse);
    assert.equal(effective.length, count);
    assert.ok(
      effective.every(
        (v) =>
          v.channel === mode &&
          v.trace === "off" &&
          v.screenshot === "off" &&
          v.video === "off" &&
          v.noCopyPrompt === "1",
      ),
    );
    const artifacts = files(output);
    const leaked = artifacts.filter((path) =>
      readFileSync(path).includes(Buffer.from(marker)),
    );
    const writes = files(dir).includes(audit)
      ? readFileSync(audit, "utf8").trim().split("\n").length
      : 0;
    const summary = {
      mode,
      collected: results.length,
      unexpected: report.stats.unexpected,
      effective,
      secretWrites: writes,
      leakedArtifacts: leaked.map((path) => path.slice(dir.length + 1)),
    };
    writeFileSync(join(dir, "summary.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ directory: dir, ...summary }));
    assert.equal(
      writes,
      0,
      "automatic artifacts must be protected BEFORE the first write",
    );
    assert.equal(
      leaked.length,
      0,
      "artifacts and reporter stdout/stderr must not contain the reveal",
    );
    assert.ok((result.stdout || "").includes("ordinary missing control"));
    assert.ok((result.stdout || "").includes("ordinary wrong expectation"));
    assert.ok((result.stdout || "").includes("ordinary nonmatcher diagnostic"));
    assert.ok(
      artifacts.some((path) => path.endsWith("error-context.md")),
      "ordinary failure diagnostics must remain available",
    );
  });
}
