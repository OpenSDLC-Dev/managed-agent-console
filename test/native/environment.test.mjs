// No Docker daemon or Next process is started by these configuration contracts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "../..");
let pnpmCLI = process.env.npm_config_user_agent?.startsWith("pnpm/")
  ? process.env.npm_execpath
  : undefined;
function probe(
  selectors = { DOCKER_HOST: "unix:///verified-A.sock" },
  {
    blocked = false,
    nodeOnly = false,
    launcher = "direct Node",
    homeLocal = false,
    literalPath = false,
  } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "env-"));
  const calls = join(dir, "calls.jsonl");
  // A copy makes the invoking and Console directories genuinely distinct even
  // when the suite runs from Console. Neither HOME nor the process cwd changes.
  const consoleRoot = join(
    dir,
    literalPath ? "console %NATIVE_LITERAL_PATH% with spaces" : "console",
  );
  mkdirSync(join(consoleRoot, "test/native"), { recursive: true });
  const runtime = join(consoleRoot, "test/native/runtime.mjs");
  writeFileSync(runtime, readFileSync(join(root, "test/native/runtime.mjs")));
  writeFileSync(
    join(consoleRoot, "package.json"),
    readFileSync(join(root, "package.json")),
  );
  const nodeGuard = join(dir, "node-only.mjs");
  writeFileSync(
    nodeGuard,
    `
import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { appendFileSync } from "node:fs";
const spawn = cp.spawn;
cp.spawn = (cmd, args, options) => {
  if (cmd !== process.execPath) {
    appendFileSync(${JSON.stringify(calls)}, JSON.stringify({executableDispatch:true}) + "\\n");
    return spawn(process.execPath, ["-e", "process.exit(97)"], options);
  }
  return spawn(cmd, args, options);
};
syncBuiltinESMExports();
`,
  );
  // Intercept the real runtime spawn boundary, as native-runtime.test.mts does.
  // Only Node is dispatched: no shell, shebang, PATH separator or real Docker.
  // HOME stays untouched; its synthetic default B is never read or contacted.
  const preload = join(dir, "docker.mjs");
  writeFileSync(
    preload,
    `
import cp from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { syncBuiltinESMExports } from "node:module";
const spawn = cp.spawn;
cp.spawn = (cmd, args, options) => {
  if (cmd === process.execPath && args[0] === "-e") return spawn(cmd, args, options);
  if (cmd !== "docker") throw Error("unexpected native command");
  const env = options.env, cwd = options.cwd;
  const configA = resolve(${JSON.stringify(process.cwd())}, "relative-config");
  const configured = env.DOCKER_CONFIG && resolve(cwd, env.DOCKER_CONFIG) === configA;
  const otherLocal = env.DOCKER_CONFIG && resolve(cwd, env.DOCKER_CONFIG) === ${JSON.stringify(resolve(consoleRoot, "relative-config"))};
  const selected = env.DOCKER_CONTEXT === "verified-A" || (!env.DOCKER_CONTEXT && env.DOCKER_HOST === "unix:///verified-A.sock") || configured || (${homeLocal} && !env.DOCKER_CONTEXT && !env.DOCKER_HOST && !env.DOCKER_CONFIG);
  appendFileSync(${JSON.stringify(calls)}, JSON.stringify({args, selected, cwd, literalPathCanary:process.env.NATIVE_LITERAL_PATH === "expanded-wrong-directory", telemetryDisabled:env.NEXT_TELEMETRY_DISABLED === "1", selectorNames:Object.keys(env).filter(k => k.startsWith("DOCKER_"))}) + "\\n");
  let stdout = "", status = 0;
  if (args[0] === "context" && args[1] === "show") stdout = env.DOCKER_CONTEXT || "home-B";
  else if (args[0] === "context" && args[1] === "inspect") stdout = selected ? "unix:///verified-A.sock" : otherLocal ? "unix:///different-local-B.sock" : "tcp://remote-B:2375";
  else if (args[0] === "ps" && (selected || otherLocal)) stdout = args.includes("--filter") && ${blocked} ? "foreign-fixture" : "";
  else if (args[0] === "volume" && (selected || otherLocal)) stdout = "";
  else status = 1;
  return spawn(process.execPath, ["-e", "process.stdout.write(" + JSON.stringify(stdout) + ");process.exit(" + status + ")"], options);
};
syncBuiltinESMExports();
`,
  );
  try {
    const env = { ...process.env };
    for (const key of Object.keys(env))
      if (key.startsWith("DOCKER_")) delete env[key];
    const runtimeArgs = [
      ...(nodeOnly ? ["--import", pathToFileURL(nodeGuard).href] : []),
      "--import",
      pathToFileURL(preload).href,
      runtime,
      "--check-environment",
    ];
    if (launcher === "pnpm --dir" && !pnpmCLI) {
      // Direct `node --test` has no pnpm runner metadata. Ask the real pnpm
      // through a constant script; cwd is an OS argument, never shell text.
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({
          private: true,
          scripts: { "native-pnpm-entry": "node -p process.env.npm_execpath" },
        }),
      );
      const windows = process.platform === "win32";
      const entry = spawnSync(
        windows ? "pnpm run --silent native-pnpm-entry" : "pnpm",
        windows ? [] : ["run", "--silent", "native-pnpm-entry"],
        { cwd: dir, env, encoding: "utf8", shell: windows, timeout: 20_000 },
      );
      assert.equal(entry.error, undefined);
      assert.equal(entry.signal, null);
      assert.equal(entry.status, 0, entry.stderr);
      pnpmCLI = entry.stdout.trim();
      assert.ok(isAbsolute(pnpmCLI), "pnpm must report its absolute CLI entry");
    }
    // Node transports every fixture path literally, including %NAME% on Windows.
    // This is the actual pnpm CLI, not a substitute for its cwd behavior.
    const args =
      launcher === "pnpm --dir"
        ? [
            pnpmCLI,
            "--dir",
            consoleRoot,
            "exec",
            process.execPath,
            ...runtimeArgs,
          ]
        : runtimeArgs;
    const result = spawnSync(process.execPath, args, {
      env: {
        ...env,
        ...selectors,
        NATIVE_EVIDENCE_DIR: dir,
        NATIVE_PLATFORM_SOURCE: root,
        RUN_LIVE_FUTURE: "synthetic",
        MODEL_API_KEY: "synthetic",
        OTEL_EXPORTER_OTLP_ENDPOINT: "https://invalid.example",
        DOCKER_TLS_VERIFY: "synthetic",
        ...(literalPath
          ? { NATIVE_LITERAL_PATH: "expanded-wrong-directory" }
          : {}),
      },
      encoding: "utf8",
      timeout: 20_000,
    });
    assert.equal(
      result.error,
      undefined,
      "runtime must launch without a setup error",
    );
    assert.equal(result.signal, null, "runtime must finish without a timeout");
    let operations, receipt;
    let artifact = "trace";
    try {
      operations = (existsSync(calls) ? readFileSync(calls, "utf8") : "")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map(JSON.parse);
      artifact = "receipt";
      receipt = JSON.parse(
        readFileSync(join(dir, "task6-native-receipt.json"), "utf8"),
      );
    } catch (error) {
      // JSON parse messages can quote private artifact contents. Report only
      // the category and the intercepted child's result, never the exception.
      const category =
        error instanceof SyntaxError
          ? "invalid-json"
          : error.code === "ENOENT"
            ? "missing"
            : "unreadable";
      assert.fail(
        `runtime ${artifact} ${category} through ${launcher}: ${JSON.stringify({
          status: result.status,
          signal: result.signal,
          stdout: result.stdout,
          stderr: result.stderr,
        })}`,
      );
    }
    return {
      status: result.status,
      stderr: result.stderr,
      operations,
      receipt,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

for (const launcher of ["direct Node", "pnpm --dir"]) {
  test(`native Docker refuses relative configuration before dispatch through ${launcher}`, () => {
    for (const selectors of [
      { DOCKER_CONFIG: "relative-config" },
      {
        DOCKER_CONFIG: "relative-config",
        DOCKER_HOST: "unix:///verified-A.sock",
      },
      { DOCKER_CONFIG: "relative-config", DOCKER_CONTEXT: "verified-A" },
    ]) {
      const { operations, receipt, status, stderr } = probe(selectors, {
        launcher,
      });
      assert.deepEqual(
        {
          status,
          explicitRefusal: /DOCKER_CONFIG.*absolute/i.test(stderr),
          dockerDispatches: operations.length,
          resourceOperations: operations.filter((call) =>
            ["create", "start", "exec", "rm"].includes(call.args?.[0]),
          ).length,
        },
        {
          status: 1,
          explicitRefusal: true,
          dockerDispatches: 0,
          resourceOperations: 0,
        },
        "relative configuration must be refused before any Docker dispatch",
      );
      assert.equal(receipt.dockerTarget, undefined);
      assert.equal(receipt.cleaned, true);
    }
  });

  test(`native Docker keeps absolute selectors through ${launcher}`, () => {
    for (const selectors of [
      { DOCKER_HOST: "unix:///verified-A.sock" },
      { DOCKER_CONTEXT: "verified-A" },
      { DOCKER_CONFIG: resolve("relative-config") },
      {
        DOCKER_HOST: "unix:///verified-A.sock",
        DOCKER_CONTEXT: "verified-A",
        DOCKER_CONFIG: resolve("relative-config"),
      },
    ]) {
      const { operations, receipt, status } = probe(selectors, { launcher });
      assert.equal(status, 0);
      assert.ok(operations.length > 0);
      assert.ok(operations.every((call) => call.selected));
      assert.ok(operations.some((call) => call.args.includes("--filter")));
      assert.ok(operations.every((call) => call.telemetryDisabled));
      assert.equal(receipt.dockerTarget.matchesParent, true);
      assert.equal(receipt.cleaned, true);
      assert.ok(
        !operations.some((call) =>
          ["create", "start", "exec", "rm"].includes(call.args[0]),
        ),
      );
      if (launcher === "pnpm --dir")
        assert.ok(
          operations.every((call) => call.cwd !== process.cwd()),
          "the real pnpm launcher must change cwd before the runtime starts",
        );
    }
  });
}

test("native pnpm keeps literal percent and spaces in fixture paths", () => {
  const { operations, receipt, status } = probe(undefined, {
    launcher: "pnpm --dir",
    literalPath: true,
  });
  assert.equal(status, 0);
  assert.ok(operations.length > 0);
  assert.ok(
    operations.every(
      (call) =>
        call.cwd.endsWith("console %NATIVE_LITERAL_PATH% with spaces") &&
        call.cwd !== process.cwd() &&
        call.literalPathCanary,
    ),
  );
  assert.equal(receipt.dockerTarget.matchesParent, true);
  assert.equal(receipt.cleaned, true);
  assert.ok(
    !operations.some((call) =>
      ["create", "start", "exec", "rm"].includes(call.args[0]),
    ),
  );
});

test("native environment contracts need only portable Node executable dispatch", () => {
  const { operations, receipt, status } = probe(undefined, { nodeOnly: true });
  assert.equal(
    status,
    0,
    "configuration contracts must run without shebang or PATH dispatch",
  );
  assert.ok(operations.every((call) => !call.executableDispatch));
  assert.ok(operations.some((call) => call.args?.includes("--filter")));
  assert.equal(receipt.cleaned, true);
});

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
    {
      DOCKER_CONTEXT: "verified-A",
      DOCKER_CONFIG: resolve("synthetic-config"),
    },
    { DOCKER_CONFIG: resolve("relative-config") },
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
    const result = probe(selectors, { blocked });
    assert.notEqual(result.status, 0);
    assert.ok(
      !result.operations.some((call) =>
        ["create", "start", "rm"].includes(call.args[0]),
      ),
    );
  }
});

test("native Docker supports a local HOME default with absent or empty configuration", () => {
  for (const selectors of [{}, { DOCKER_CONFIG: "" }]) {
    const { operations, receipt, status } = probe(selectors, {
      homeLocal: true,
    });
    assert.equal(status, 0);
    assert.ok(operations.length > 0);
    assert.ok(operations.every((call) => call.selected));
    assert.equal(receipt.dockerTarget.matchesParent, true);
    assert.equal(receipt.cleaned, true);
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
