// No Docker daemon or Next process is started by these configuration contracts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
function probe(
  selectors = { DOCKER_HOST: "unix:///verified-A.sock" },
  blocked = false,
) {
  const dir = mkdtempSync(join(tmpdir(), "env-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const calls = join(dir, "calls.jsonl");
  // HOME stays untouched. This fake models HOME's default context B without
  // reading a real profile, contacting B, or allowing a resource operation.
  writeFileSync(
    join(bin, "docker"),
    `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
const env = process.env;
const selected = env.DOCKER_CONTEXT === "verified-A" || (!env.DOCKER_CONTEXT && env.DOCKER_HOST === "unix:///verified-A.sock");
fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify({args, selected, telemetryDisabled:env.NEXT_TELEMETRY_DISABLED === "1", selectorNames:Object.keys(env).filter(k => k.startsWith("DOCKER_"))}) + "\\n");
if (args[0] === "context" && args[1] === "show") console.log(env.DOCKER_CONTEXT || "home-B");
else if (args[0] === "context" && args[1] === "inspect") console.log(selected ? "unix:///verified-A.sock" : "tcp://remote-B:2375");
else if (args[0] === "ps" && selected) console.log(args.includes("--filter") && ${blocked} ? "foreign-fixture" : "");
else if (args[0] === "volume" && selected) console.log("");
else { console.error("fake Docker refuses unverified target or resource operation"); process.exit(1); }
`,
    { mode: 0o700 },
  );
  try {
    const env = { ...process.env };
    for (const key of Object.keys(env))
      if (key.startsWith("DOCKER_")) delete env[key];
    const result = spawnSync(
      process.execPath,
      [join(root, "test/native/runtime.mjs"), "--check-environment"],
      {
        env: {
          ...env,
          ...selectors,
          PATH: `${bin}:${env.PATH}`,
          NATIVE_EVIDENCE_DIR: dir,
          NATIVE_PLATFORM_SOURCE: root,
          RUN_LIVE_FUTURE: "synthetic",
          MODEL_API_KEY: "synthetic",
          OTEL_EXPORTER_OTLP_ENDPOINT: "https://invalid.example",
          DOCKER_TLS_VERIFY: "synthetic",
        },
        encoding: "utf8",
        timeout: 20_000,
      },
    );
    const operations = readFileSync(calls, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(JSON.parse);
    const receipt = JSON.parse(
      readFileSync(join(dir, "task6-native-receipt.json"), "utf8"),
    );
    return { status: result.status, operations, receipt };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("native child environments disable Next telemetry", () => {
  const { operations, receipt, status } = probe();
  assert.ok(operations.length > 0);
  assert.ok(
    operations.every((call) => call.telemetryDisabled),
    "actual command child must disable telemetry",
  );
  assert.equal(status, 0);
  for (const kind of ["command", "start"]) {
    assert.equal(receipt.environment[kind].telemetryDisabled, true);
    assert.deepEqual(receipt.environment[kind].unsafeNames, []);
  }
});

test("native Docker uses the preflighted local daemon", () => {
  for (const selectors of [
    { DOCKER_HOST: "unix:///verified-A.sock" },
    { DOCKER_CONTEXT: "verified-A", DOCKER_CONFIG: "/synthetic-config" },
  ]) {
    const { operations, receipt, status } = probe(selectors);
    assert.ok(
      operations.every((call) => call.selected),
      "child must retain verified A, never HOME default B",
    );
    assert.ok(
      operations.every((call) =>
        call.selectorNames.every((key) => Object.hasOwn(selectors, key)),
      ),
    );
    assert.equal(status, 0);
    assert.equal(receipt.dockerTarget.endpointClass, "local-unix");
    assert.equal(receipt.dockerTarget.matchesParent, true);
    assert.ok(
      operations.some((call) =>
        call.args.includes(
          "label=dev.opensdlc.managed-agent-platform.test-fixture",
        ),
      ),
    );
    assert.ok(
      !operations.some((call) =>
        ["create", "start", "rm"].includes(call.args[0]),
      ),
    );
  }
  for (const [selectors, blocked] of [
    [{}, false],
    [{ DOCKER_HOST: "unix:///verified-A.sock" }, true],
  ]) {
    const result = probe(selectors, blocked);
    assert.notEqual(result.status, 0);
    assert.ok(
      !result.operations.some((call) =>
        ["create", "start", "rm"].includes(call.args[0]),
      ),
    );
  }
});

test("Docker stages disable Next telemetry before execution", () => {
  const stages = readFileSync(join(root, "Dockerfile"), "utf8")
    .split(/^FROM /m)
    .slice(1);
  assert.equal(stages.length, 2);
  for (const [index, stage] of stages.entries()) {
    const flag = stage.search(/^ENV\s+.*\bNEXT_TELEMETRY_DISABLED=1\b/m);
    const execution = stage.search(index === 0 ? /^RUN /m : /^CMD /m);
    assert.ok(
      flag >= 0 && flag < execution,
      `stage ${index + 1} must disable Next telemetry before execution`,
    );
  }
});
