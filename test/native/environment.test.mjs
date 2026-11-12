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
import { performance } from "node:perf_hooks";
import { Script } from "node:vm";

const root = resolve(import.meta.dirname, "../..");
let pnpmCLI = process.env.npm_config_user_agent?.startsWith("pnpm/")
  ? process.env.npm_execpath
  : undefined;
function createPhaseObserver(
  caseId,
  launcher,
  now = () => performance.now(),
  emit = (...args) => console.log(...args),
  evidence,
) {
  let phase = "prepare";
  let started = Number.NaN;
  try {
    const reading = now();
    started = Number.isFinite(reading) ? reading : Number.NaN;
  } catch {
    // Diagnostics must not prevent the original call.
  }
  if (evidence && !Number.isFinite(started)) evidence.unavailable = true;
  function observe(nextPhase, result) {
    // Structural evidence survives unavailable diagnostics and missing durations.
    if (evidence) {
      if (evidence.boundaries.length < 6) evidence.boundaries.push(nextPhase);
      else evidence.overflow = true;
    }
    // Boundaries include helper work between launches. A spawnSync return is
    // not success: its error code, status and signal carry the API outcome.
    try {
      const reading = now();
      const boundary = Number.isFinite(reading) ? reading : Number.NaN;
      const elapsedMs = boundary - started;
      started = boundary < started ? Number.NaN : boundary;
      const launch = phase === "metadata" || phase === "runtime";
      const code = result?.error?.code;
      const signal = result?.signal;
      if (Number.isFinite(elapsedMs) && elapsedMs >= 0)
        emit(
          "native-environment-timing",
          JSON.stringify({
            case: caseId,
            launcher,
            phase,
            elapsedMs,
            api: launch ? "spawnSync" : null,
            outcome: launch ? (result ? "returned" : "threw") : "observed",
            code:
              code == null
                ? null
                : [
                      "ENOENT",
                      "EACCES",
                      "EPERM",
                      "EINVAL",
                      "ETIMEDOUT",
                      "ENOBUFS",
                    ].includes(code)
                  ? code
                  : "other",
            status: Number.isSafeInteger(result?.status) ? result.status : null,
            signal:
              signal == null
                ? null
                : [
                      "SIGTERM",
                      "SIGKILL",
                      "SIGINT",
                      "SIGABRT",
                      "SIGSEGV",
                    ].includes(signal)
                  ? signal
                  : "other",
          }),
        );
      else if (evidence) evidence.unavailable = true;
    } catch {
      started = Number.NaN;
      if (evidence) evidence.unavailable = true;
      // Diagnostics must not replace the original error or assertion.
    }
    phase = nextPhase;
  }
  return observe;
}

// Serialized into the existing preload; no additional process or operation stub.
// Static imports precede this body. Later exit handlers and output cost follow it.
function startPreloadWindow(
  now = () => performance.now(),
  emit = (...args) => console.log(...args),
) {
  let started;
  try {
    started = now();
  } catch {
    // A clock failure must not stop preload dispatch.
  }
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    let elapsedMs = null;
    try {
      const ended = now();
      if (
        Number.isFinite(started) &&
        Number.isFinite(ended) &&
        ended >= started
      ) {
        const elapsed = ended - started;
        if (Number.isFinite(elapsed) && elapsed <= Number.MAX_SAFE_INTEGER)
          elapsedMs = elapsed;
      }
    } catch {
      // Missing samples are unavailable, never an inferred duration.
    }
    try {
      emit("native-environment-preload-window", JSON.stringify({ elapsedMs }));
    } catch {
      // Output failure must not change exit or runtime cleanup.
    }
  };
}

function reportPreloadWindow(
  caseId,
  launcher,
  stdout,
  emit = (...args) => console.log(...args),
) {
  let elapsedMs = null;
  try {
    // Read only a small captured payload. Never forward arbitrary child output.
    const prefix = "native-environment-preload-window ";
    const records =
      typeof stdout === "string" && stdout.length <= 1024
        ? stdout.split(/\r?\n/).filter((line) => line.startsWith(prefix))
        : [];
    if (records.length === 1) {
      const record = JSON.parse(records[0].slice(prefix.length));
      if (
        record !== null &&
        Object.keys(record).join(",") === "elapsedMs" &&
        Number.isFinite(record.elapsedMs) &&
        record.elapsedMs >= 0 &&
        record.elapsedMs <= Number.MAX_SAFE_INTEGER
      )
        elapsedMs = record.elapsedMs;
    }
  } catch {
    // A missing exit callback, broken clock or truncated output is uncertain.
  }
  try {
    emit(
      "native-environment-preload-window",
      JSON.stringify({
        case: caseId,
        launcher,
        available: elapsedMs !== null,
        elapsedMs,
      }),
    );
  } catch {
    // This observation must not replace the original launch result or error.
  }
}

function probe(
  caseId,
  selectors = { DOCKER_HOST: "unix:///verified-A.sock" },
  {
    blocked = false,
    nodeOnly = false,
    launcher = "direct Node",
    homeLocal = false,
    literalPath = false,
  } = {},
) {
  const timing = {
    boundaries: [],
    unavailable: false,
    overflow: false,
  };
  const observe = createPhaseObserver(
    caseId,
    launcher,
    undefined,
    (...args) => {
      console.log(...args);
    },
    timing,
  );
  const dir = mkdtempSync(join(tmpdir(), "env-"));
  try {
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
    // This cwd fixture runs only Node builtins, not application dependencies.
    writeFileSync(
      join(consoleRoot, "package.json"),
      JSON.stringify({ private: true }),
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
  appendFileSync(${JSON.stringify(calls)}, JSON.stringify({nodeDispatch:true}) + "\\n");
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
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { syncBuiltinESMExports } from "node:module";
const finishPreloadWindow = (${startPreloadWindow.toString()})();
process.once("exit", finishPreloadWindow);
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
  // Docker answers here are data, not process-contract subjects.
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.exitCode = null; child.signalCode = null;
  queueMicrotask(() => {
    child.stdout.end(stdout); child.stderr.end();
    child.exitCode = status; child.emit("close", status, null);
  });
  return child;
};
syncBuiltinESMExports();
`,
    );
    const env = { ...process.env };
    for (const key of Object.keys(env))
      if (key.startsWith("DOCKER_")) delete env[key];
    assert.ok(
      readFileSync(join(consoleRoot, "package.json"), "utf8") ===
        JSON.stringify({ private: true }),
      "unexpected native runtime fixture manifest",
    );
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
      assert.ok(
        readFileSync(join(dir, "package.json"), "utf8") ===
          JSON.stringify({
            private: true,
            scripts: {
              "native-pnpm-entry": "node -p process.env.npm_execpath",
            },
          }),
        "unexpected native metadata fixture manifest",
      );
      const windows = process.platform === "win32";
      observe("metadata");
      let entry;
      try {
        entry = spawnSync(
          windows ? "pnpm run --silent native-pnpm-entry" : "pnpm",
          windows ? [] : ["run", "--silent", "native-pnpm-entry"],
          {
            cwd: dir,
            env: { ...env, pnpm_config_verify_deps_before_run: "false" },
            encoding: "utf8",
            shell: windows,
            timeout: 20_000,
          },
        );
      } finally {
        observe("runtime-prepare", entry);
      }
      assert.equal(entry.error, undefined);
      assert.equal(entry.signal, null);
      assert.equal(entry.status, 0, entry.stderr);
      assert.ok(
        !existsSync(join(dir, "node_modules")) &&
          !existsSync(join(dir, "pnpm-lock.yaml")),
        "metadata fixture must not initialize dependencies",
      );
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
    observe("runtime");
    let result;
    try {
      result = spawnSync(process.execPath, args, {
        env: {
          ...env,
          ...selectors,
          // pnpm uses this same child setting. Only the exact fixed manifests
          // checked above may suppress automatic installation here.
          ...(launcher === "pnpm --dir"
            ? { pnpm_config_verify_deps_before_run: "false" }
            : {}),
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
    } finally {
      observe("artifacts", result);
      reportPreloadWindow(caseId, launcher, result?.stdout);
    }
    const diagnostic = JSON.stringify({
      status: result.status,
      signal: result.signal,
      stdout: result.stdout,
      stderr: result.stderr,
    });
    assert.equal(
      result.error,
      undefined,
      `runtime must launch without a setup error: ${diagnostic}`,
    );
    assert.equal(
      result.signal,
      null,
      `runtime must finish without a timeout: ${diagnostic}`,
    );
    assert.ok(
      [dir, consoleRoot].every(
        (fixture) =>
          !existsSync(join(fixture, "node_modules")) &&
          !existsSync(join(fixture, "pnpm-lock.yaml")),
      ),
      "native fixtures must not initialize dependencies",
    );
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
        `runtime ${artifact} ${category} through ${launcher}: ${diagnostic}`,
      );
    }
    // Relative configuration is refused before any command can write a trace.
    assert.ok(
      operations.length > 0 ||
        (result.status === 1 && /DOCKER_CONFIG.*absolute/i.test(result.stderr)),
      `runtime trace empty or missing through ${launcher}: ${diagnostic}`,
    );
    return {
      status: result.status,
      stderr: result.stderr,
      operations,
      receipt,
      // Snapshot actual child artifacts before cleanup; never publish them.
      preloadStdout: result.stdout,
      preloadSource: readFileSync(preload, "utf8"),
      // Keep the reference: finally records cleanup after this return is prepared.
      timing,
    };
  } finally {
    observe("cleanup");
    try {
      rmSync(dir, { recursive: true, force: true });
    } finally {
      observe("end");
    }
  }
}

function assertProbeTiming(
  timing,
  observedOutput,
  caseId,
  launcher,
  status,
  withMetadata,
) {
  assert.ok(timing !== undefined, "real probe timing evidence is required");
  assert.equal(timing.overflow, false, "real probe timing evidence overflowed");
  const boundaries = withMetadata
    ? ["metadata", "runtime-prepare", "runtime", "artifacts", "cleanup", "end"]
    : ["runtime", "artifacts", "cleanup", "end"];
  assert.ok(
    timing.boundaries.length === boundaries.length &&
      timing.boundaries.every((phase, index) => phase === boundaries[index]),
    "real probe timing boundaries must match the actual path",
  );
  assert.equal(typeof timing.unavailable, "boolean");
  assert.ok(
    !observedOutput.invalid,
    "real probe timing must use bounded fixed-marker records",
  );
  if (timing.unavailable) return;

  const phases = withMetadata
    ? [
        "prepare",
        "metadata",
        "runtime-prepare",
        "runtime",
        "artifacts",
        "cleanup",
      ]
    : ["prepare", "runtime", "artifacts", "cleanup"];
  assert.equal(
    observedOutput.records.length,
    phases.length,
    "available real probe timing must emit every phase",
  );
  for (const [index, text] of observedOutput.records.entries()) {
    let record;
    let parsed = false;
    try {
      record = JSON.parse(text);
      parsed = true;
    } catch {
      // Report only a fixed message below, never the private parser preview.
    }
    assert.ok(parsed, "real probe timing record must be valid JSON");
    assert.ok(
      record !== null && typeof record === "object" && !Array.isArray(record),
      "real probe timing record must be an object",
    );
    assert.ok(
      Object.keys(record).sort().join(",") ===
        "api,case,code,elapsedMs,launcher,outcome,phase,signal,status",
      "real probe timing must use only the fixed fields",
    );
    const phase = phases[index];
    const launch = phase === "runtime" || phase === "metadata";
    assert.ok(
      record.case === caseId &&
        record.launcher === launcher &&
        record.phase === phase,
      "real probe timing identity and phase must match the actual path",
    );
    assert.ok(
      Number.isFinite(record.elapsedMs) && record.elapsedMs >= 0,
      "real probe timing duration must be finite and nonnegative",
    );
    assert.ok(
      record.api === (launch ? "spawnSync" : null) &&
        record.outcome === (launch ? "returned" : "observed") &&
        record.status ===
          (phase === "runtime" ? status : phase === "metadata" ? 0 : null) &&
        record.code === null &&
        record.signal === null,
      "real probe timing must preserve the actual API outcome",
    );
  }
}

// These in-memory cases exercise the same observer as probe(), without launches
// or global clock changes. The literal records check omission AND recovery.
for (const status of [0, 23]) {
  const prepare = {
    case: "telemetry",
    launcher: "direct Node",
    phase: "prepare",
    elapsedMs: 10,
    api: null,
    outcome: "observed",
    code: null,
    status: null,
    signal: null,
  };
  const metadata = {
    case: "telemetry",
    launcher: "direct Node",
    phase: "metadata",
    elapsedMs: 10,
    api: "spawnSync",
    outcome: "returned",
    code: null,
    status: 0,
    signal: null,
  };
  const runtimePrepare = {
    case: "telemetry",
    launcher: "direct Node",
    phase: "runtime-prepare",
    elapsedMs: 80,
    api: null,
    outcome: "observed",
    code: null,
    status: null,
    signal: null,
  };
  const runtime = {
    case: "telemetry",
    launcher: "direct Node",
    phase: "runtime",
    elapsedMs: 1000,
    api: "spawnSync",
    outcome: "returned",
    code: null,
    status,
    signal: null,
  };
  const artifacts = {
    case: "telemetry",
    launcher: "direct Node",
    phase: "artifacts",
    elapsedMs: 10,
    api: null,
    outcome: "observed",
    code: null,
    status: null,
    signal: null,
  };
  const cleanup = {
    case: "telemetry",
    launcher: "direct Node",
    phase: "cleanup",
    elapsedMs: 10,
    api: null,
    outcome: "observed",
    code: null,
    status: null,
    signal: null,
  };
  for (const [name, withMetadata, faultIndex, expected, unavailable] of [
    ["valid direct", false, -1, [prepare, runtime, artifacts, cleanup], false],
    [
      "valid metadata",
      true,
      -1,
      [prepare, metadata, runtimePrepare, runtime, artifacts, cleanup],
      false,
    ],
    ["first read", false, 0, [runtime, artifacts, cleanup], true],
    ["runtime end", false, 2, [prepare, cleanup], true],
    ["metadata end", true, 2, [prepare, runtime, artifacts, cleanup], true],
    [
      "metadata runtime end",
      true,
      4,
      [prepare, metadata, runtimePrepare, cleanup],
      true,
    ],
    ["sink failure", false, -1, [prepare, cleanup], true],
  ]) {
    const faults =
      faultIndex < 0
        ? ["none"]
        : [
            "throw",
            "null",
            "string",
            "true",
            "false",
            "NaN",
            "Infinity",
            "-Infinity",
            "undefined",
            "object",
          ];
    for (const fault of faults) {
      test(`phase observer ${name} ${fault} status ${status}`, () => {
        let coercions = 0;
        const clockFailure = new Error("unavailable clock");
        const invalid = {
          throw: clockFailure,
          null: null,
          string: "100",
          true: true,
          false: false,
          NaN: Number.NaN,
          Infinity,
          "-Infinity": -Infinity,
          undefined,
          object: {
            [Symbol.toPrimitive]() {
              coercions++;
              return 100;
            },
          },
        };
        const readings = withMetadata
          ? [0, 10, 20, 100, 1100, 1110, 1120]
          : [90, 100, 1100, 1110, 1120];
        if (faultIndex >= 0) readings[faultIndex] = invalid[fault];
        let reads = 0,
          exhausted = false;
        const emissions = [];
        let attempts = 0;
        const result = Object.freeze({ status, signal: null });
        const evidence = {
          boundaries: [],
          unavailable: false,
          overflow: false,
        };
        const observe = createPhaseObserver(
          "telemetry",
          "direct Node",
          () => {
            if (reads >= readings.length) exhausted = true;
            const reading = readings[reads++];
            if (reading === clockFailure) throw clockFailure;
            return reading;
          },
          (...args) => {
            attempts++;
            if (name === "sink failure" && attempts === 2)
              throw new Error("unavailable sink");
            emissions.push(args);
          },
          evidence,
        );
        assert.doesNotThrow(() => {
          if (withMetadata) {
            observe("metadata");
            observe(
              "runtime-prepare",
              Object.freeze({ status: 0, signal: null }),
            );
          }
          observe("runtime");
          observe("artifacts", result);
          observe("cleanup");
          observe("end");
        });
        // Assertions must stay outside the diagnostic catch, including those
        // about the clock script and sink arguments.
        assert.equal(reads, readings.length);
        assert.equal(exhausted, false);
        assert.equal(coercions, 0);
        assert.equal(evidence.unavailable, unavailable);
        assert.deepEqual(result, { status, signal: null });
        assert.ok(
          emissions.every(
            (args) =>
              args.length === 2 && args[0] === "native-environment-timing",
          ),
        );
        assert.deepEqual(
          emissions.map((args) => JSON.parse(args[1])),
          expected,
        );
      });
    }
  }
}

test("phase observer preserves the original exception identity", () => {
  const original = new Error("original failure");
  const clockFailure = new Error("unavailable clock");
  let reads = 0;
  const emissions = [];
  const observe = createPhaseObserver(
    "telemetry",
    "direct Node",
    () => {
      reads++;
      throw clockFailure;
    },
    (...args) => emissions.push(args),
  );
  assert.throws(
    () => {
      try {
        throw original;
      } finally {
        observe("artifacts");
      }
    },
    (error) => error === original,
  );
  assert.equal(reads, 2);
  assert.deepEqual(emissions, []);

  // Valid clocks expose API outcomes even when the OS operation did not succeed.
  for (const [result, expected] of [
    [undefined, { outcome: "threw", code: null, status: null, signal: null }],
    [
      Object.freeze({
        error: Object.freeze({ code: "ENOENT" }),
        status: null,
        signal: null,
      }),
      { outcome: "returned", code: "ENOENT", status: null, signal: null },
    ],
    [
      Object.freeze({
        error: Object.freeze({ code: "private code" }),
        status: "23",
        signal: null,
      }),
      { outcome: "returned", code: "other", status: null, signal: null },
    ],
    [
      Object.freeze({ status: null, signal: "SIGTERM" }),
      { outcome: "returned", code: null, status: null, signal: "SIGTERM" },
    ],
    [
      Object.freeze({
        status: Number.MAX_SAFE_INTEGER + 1,
        signal: "private signal",
      }),
      { outcome: "returned", code: null, status: null, signal: "other" },
    ],
  ]) {
    const samples = [0, 10, 20];
    const records = [];
    const evidence = { boundaries: [], unavailable: false, overflow: false };
    const observe = createPhaseObserver(
      "telemetry",
      "direct Node",
      () => samples.shift(),
      (...args) => records.push(args),
      evidence,
    );
    observe("runtime");
    let caught;
    try {
      if (result === undefined) throw original;
    } catch (error) {
      caught = error;
    } finally {
      observe("artifacts", result);
    }
    assert.equal(caught, result === undefined ? original : undefined);
    assert.deepEqual(samples, []);
    assert.equal(evidence.unavailable, false);
    assert.deepEqual(
      records.map(([marker, record]) => [marker, JSON.parse(record)]),
      [
        [
          "native-environment-timing",
          {
            case: "telemetry",
            launcher: "direct Node",
            phase: "prepare",
            elapsedMs: 10,
            api: null,
            outcome: "observed",
            code: null,
            status: null,
            signal: null,
          },
        ],
        [
          "native-environment-timing",
          {
            case: "telemetry",
            launcher: "direct Node",
            phase: "runtime",
            elapsedMs: 10,
            api: "spawnSync",
            ...expected,
          },
        ],
      ],
    );
  }

  // A backward boundary cannot become the next phase's start. Recovery can
  // establish a new boundary, but cannot invent the intervening phase's cost.
  const recoverySamples = [90, 100, 80, 1110, 1120];
  const recoveryRecords = [];
  const recoveryEvidence = {
    boundaries: [],
    unavailable: false,
    overflow: false,
  };
  const recover = createPhaseObserver(
    "telemetry",
    "direct Node",
    () => recoverySamples.shift(),
    (marker, record) => recoveryRecords.push([marker, JSON.parse(record)]),
    recoveryEvidence,
  );
  recover("runtime");
  recover("artifacts", Object.freeze({ status: 0, signal: null }));
  recover("cleanup");
  recover("end");
  assert.deepEqual(recoverySamples, []);
  assert.deepEqual(recoveryEvidence, {
    boundaries: ["runtime", "artifacts", "cleanup", "end"],
    unavailable: true,
    overflow: false,
  });
  assert.deepEqual(
    recoveryRecords.map(([marker, record]) => [
      marker,
      record.phase,
      record.elapsedMs,
    ]),
    [
      ["native-environment-timing", "prepare", 10],
      ["native-environment-timing", "cleanup", 10],
    ],
  );

  // These controls exercise the same body serialized into the preload.
  let coercions = 0;
  const coercible = {
    [Symbol.toPrimitive]() {
      coercions++;
      return 100;
    },
  };
  for (const samples of [
    [10, 25],
    [10, 10],
    [25, 10],
    ...[
      null,
      "10",
      true,
      false,
      NaN,
      Infinity,
      -Infinity,
      undefined,
      coercible,
      clockFailure,
    ].flatMap((value) => [
      [value, 25],
      [10, value],
    ]),
    [-Number.MAX_VALUE, Number.MAX_VALUE],
  ]) {
    const records = [];
    let reads = 0;
    const finish = startPreloadWindow(
      () => {
        const value = samples[reads++];
        if (value === clockFailure) throw clockFailure;
        return value;
      },
      (...args) => records.push(args),
    );
    assert.throws(
      () => {
        try {
          throw original;
        } finally {
          finish();
        }
      },
      (error) => error === original,
    );
    finish();
    assert.equal(reads, 2);
    assert.deepEqual(records, [
      [
        "native-environment-preload-window",
        JSON.stringify({
          elapsedMs:
            samples[0] === 10 && samples[1] === 25
              ? 15
              : samples[0] === 10 && samples[1] === 10
                ? 0
                : null,
        }),
      ],
    ]);
  }
  assert.equal(coercions, 0);
  const prefix = "native-environment-preload-window ";
  for (const [stdout, elapsedMs] of [
    [prefix + '{"elapsedMs":15}\n', 15],
    [prefix + '{"elapsedMs":0}\r\n', 0],
    [undefined, null],
    ["", null],
    [prefix + '{"elapsedMs":null}', null],
    [prefix + '{"elapsedMs":"15"}', null],
    [prefix + '{"elapsedMs":-1}', null],
    [prefix + '{"elapsedMs":1e999}', null],
    [prefix + '{"elapsedMs":9007199254740992}', null],
    [prefix + '{"elapsedMs":15,"private":"not-for-output"}', null],
    [prefix + "private-invalid-json", null],
    [(prefix + '{"elapsedMs":15}\n').repeat(2), null],
    ["x".repeat(1025), null],
  ]) {
    const output = [];
    reportPreloadWindow("telemetry", "direct Node", stdout, (...args) =>
      output.push(args),
    );
    assert.deepEqual(output, [
      [
        "native-environment-preload-window",
        JSON.stringify({
          case: "telemetry",
          launcher: "direct Node",
          available: elapsedMs !== null,
          elapsedMs,
        }),
      ],
    ]);
  }
  // Neither child nor parent diagnostic sinks may replace API outcomes.
  for (const result of [
    Object.freeze({ status: 0, signal: null }),
    Object.freeze({ status: 23, signal: null }),
    Object.freeze({ status: null, signal: "SIGTERM" }),
    Object.freeze({
      status: null,
      signal: "SIGTERM",
      error: Object.freeze({ code: "ETIMEDOUT" }),
    }),
    undefined,
  ]) {
    const finish = startPreloadWindow(
      () => 10,
      () => {
        throw clockFailure;
      },
    );
    const run = () => {
      try {
        if (result === undefined) throw original;
        return result;
      } finally {
        finish();
        reportPreloadWindow("telemetry", "direct Node", undefined, () => {
          throw clockFailure;
        });
      }
    };
    if (result === undefined) assert.throws(run, (error) => error === original);
    else assert.equal(run(), result);
  }

  // Run the actual helper in-process. Only the failing write and dispatch
  // boundary are replaced; the owned directory and other file operations are real.
  const initializationFailure = Object.assign(new Error("synthetic ENOSPC"), {
    code: "ENOSPC",
  });
  let ownedRoot;
  let launches = 0;
  const initialize = new Script(`(${probe.toString()})`, {
    filename: "native-probe-initialization.js",
  }).runInNewContext({
    createPhaseObserver,
    startPreloadWindow,
    root,
    join,
    resolve,
    tmpdir,
    mkdirSync,
    readFileSync,
    rmSync,
    process,
    console: { log() {} },
    mkdtempSync(prefix) {
      ownedRoot = mkdtempSync(prefix);
      return ownedRoot;
    },
    writeFileSync(file, ...args) {
      if (file === join(ownedRoot, "docker.mjs")) throw initializationFailure;
      return writeFileSync(file, ...args);
    },
    spawnSync() {
      launches++;
      throw new Error("initialization must not dispatch");
    },
  });
  try {
    assert.throws(
      () => initialize("telemetry", undefined, { launcher: "pnpm --dir" }),
      (error) => error === initializationFailure,
    );
    assert.equal(
      launches,
      0,
      "initialization must launch neither metadata nor runtime",
    );
    assert.ok(ownedRoot, "initialization must create an owned directory");
    assert.equal(
      existsSync(ownedRoot),
      false,
      "failed probe initialization must remove its exact owned directory",
    );
  } finally {
    // A broken cleanup mutation must not leak the directory it demonstrates.
    if (ownedRoot) rmSync(ownedRoot, { recursive: true, force: true });
  }
});

for (const launcher of ["direct Node", "pnpm --dir"]) {
  test(`native Docker refuses relative configuration before dispatch through ${launcher}`, (t) => {
    const observedOutput = { records: [], invalid: false };
    const observedWindow = [];
    const originalLog = console.log;
    t.after(() => {
      console.log = originalLog;
    });
    console.log = function (...args) {
      const result = originalLog.apply(console, args);
      if (args[0] === "native-environment-preload-window") {
        observedWindow.push(args);
        return result;
      }
      if (
        args.length === 2 &&
        args[0] === "native-environment-timing" &&
        typeof args[1] === "string" &&
        args[1].length <= 1024 &&
        observedOutput.records.length < 6
      )
        observedOutput.records.push(args[1]);
      else observedOutput.invalid = true;
      return result;
    };
    for (const [caseId, selectors] of [
      ["relative-config", { DOCKER_CONFIG: "relative-config" }],
      [
        "relative-config-host",
        {
          DOCKER_CONFIG: "relative-config",
          DOCKER_HOST: "unix:///verified-A.sock",
        },
      ],
      [
        "relative-config-context",
        { DOCKER_CONFIG: "relative-config", DOCKER_CONTEXT: "verified-A" },
      ],
    ]) {
      observedWindow.length = 0;
      observedOutput.records.length = 0;
      observedOutput.invalid = false;
      const withMetadata = launcher === "pnpm --dir" && !pnpmCLI;
      const { operations, receipt, status, stderr, timing, preloadStdout } =
        probe(caseId, selectors, {
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
      assert.equal(
        observedWindow.length,
        1,
        "real refusal preload output is required",
      );
      assert.equal(observedWindow[0].length, 2);
      const childWindow =
        /^native-environment-preload-window \{"elapsedMs":(\d+(?:\.\d+)?(?:e[+-]?\d+)?)\}\r?\n$/i.exec(
          preloadStdout,
        );
      assert.ok(childWindow, "actual child preload payload is required");
      const window = JSON.parse(observedWindow[0][1]);
      assert.deepEqual(window, {
        case: caseId,
        launcher,
        available: true,
        elapsedMs: Number(childWindow[1]),
      });
      assert.ok(Number.isFinite(window.elapsedMs) && window.elapsedMs >= 0);
      assertProbeTiming(
        timing,
        observedOutput,
        caseId,
        launcher,
        status,
        withMetadata,
      );
    }
  });

  test(`native Docker keeps absolute selectors through ${launcher}`, () => {
    for (const [caseId, selectors] of [
      ["absolute-host", { DOCKER_HOST: "unix:///verified-A.sock" }],
      ["absolute-context", { DOCKER_CONTEXT: "verified-A" }],
      ["absolute-config", { DOCKER_CONFIG: resolve("relative-config") }],
      [
        "absolute-combined",
        {
          DOCKER_HOST: "unix:///verified-A.sock",
          DOCKER_CONTEXT: "verified-A",
          DOCKER_CONFIG: resolve("relative-config"),
        },
      ],
    ]) {
      const { operations, receipt, status } = probe(caseId, selectors, {
        launcher,
      });
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
  const { operations, receipt, status } = probe("literal-path", undefined, {
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
  const { operations, receipt, status } = probe("node-only", undefined, {
    nodeOnly: true,
  });
  assert.equal(
    status,
    0,
    "configuration contracts must run without shebang or PATH dispatch",
  );
  assert.ok(operations.every((call) => !call.executableDispatch));
  assert.equal(
    operations.filter((call) => call.nodeDispatch).length,
    2,
    "only environment probes need real child processes",
  );
  assert.ok(operations.some((call) => call.args?.includes("--filter")));
  assert.equal(receipt.cleaned, true);
});

test("native child environments disable Next telemetry", (t) => {
  const observedOutput = { records: [], invalid: false };
  const observedWindow = [];
  const originalLog = console.log;
  t.after(() => {
    console.log = originalLog;
  });
  console.log = function (...args) {
    const result = originalLog.apply(console, args);
    if (args[0] === "native-environment-preload-window") {
      observedWindow.push(args);
      return result;
    }
    if (
      args.length === 2 &&
      args[0] === "native-environment-timing" &&
      typeof args[1] === "string" &&
      args[1].length <= 1024 &&
      observedOutput.records.length < 6
    )
      observedOutput.records.push(args[1]);
    else observedOutput.invalid = true;
    return result;
  };
  const launcher = "direct Node";
  const withMetadata = launcher === "pnpm --dir" && !pnpmCLI;
  const { operations, receipt, status, timing, preloadStdout, preloadSource } =
    probe("telemetry");
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
  assert.equal(
    observedWindow.length,
    1,
    "real preload window output is required",
  );
  assert.equal(observedWindow[0].length, 2);
  const [marker, text] = observedWindow[0];
  assert.equal(marker, "native-environment-preload-window");
  const childWindow =
    /^native-environment-preload-window \{"elapsedMs":(\d+(?:\.\d+)?(?:e[+-]?\d+)?)\}\r?\n$/i.exec(
      preloadStdout,
    );
  assert.ok(childWindow, "actual child preload payload is required");
  const window = JSON.parse(text);
  assert.deepEqual(window, {
    case: "telemetry",
    launcher: "direct Node",
    available: true,
    elapsedMs: Number(childWindow[1]),
  });
  assert.ok(Number.isFinite(window.elapsedMs) && window.elapsedMs >= 0);
  // Evaluate the artifact the real child loaded, not a second copy of its factory.
  // Imports are omitted so only isolated bindings can observe clocks or exits.
  for (const [samples, elapsedMs] of [
    [[10, 25], 15],
    [[100.25, 137.75], 37.5],
    [[12, 12], 0],
  ]) {
    let reads = 0;
    const exits = [];
    const output = [];
    try {
      new Script(
        preloadSource.replace(/^import .+ from "node:[^"]+";\n/gm, ""),
        {
          filename: "native-preload-fixture.js",
        },
      ).runInNewContext({
        performance: { now: () => samples[reads++] },
        console: { log: (...args) => output.push(args) },
        process: { once: (...args) => exits.push(args) },
        cp: {},
        syncBuiltinESMExports() {},
      });
    } catch {
      // Never print the generated source, which includes private fixture paths.
      assert.fail("actual generated preload must evaluate in isolation");
    }
    assert.equal(reads, 1, "generated preload must sample its entry clock");
    assert.deepEqual(output, []);
    assert.deepEqual(
      exits.map(([event]) => event),
      ["exit"],
    );
    assert.equal(exits[0].length, 2);
    assert.equal(typeof exits[0][1], "function");
    exits[0][1]();
    exits[0][1]();
    assert.equal(reads, 2, "generated preload must sample its exit clock once");
    assert.deepEqual(output, [
      ["native-environment-preload-window", JSON.stringify({ elapsedMs })],
    ]);
  }
  assertProbeTiming(
    timing,
    observedOutput,
    "telemetry",
    launcher,
    status,
    withMetadata,
  );
});

test("native Docker uses the preflighted local daemon", () => {
  for (const [caseId, selectors] of [
    ["preflight-host", { DOCKER_HOST: "unix:///verified-A.sock" }],
    [
      "preflight-context-config",
      {
        DOCKER_CONTEXT: "verified-A",
        DOCKER_CONFIG: resolve("synthetic-config"),
      },
    ],
    ["preflight-config", { DOCKER_CONFIG: resolve("relative-config") }],
  ]) {
    const { operations, receipt, status } = probe(caseId, selectors);
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
  for (const [caseId, selectors, blocked] of [
    ["preflight-remote-default", {}, false],
    ["preflight-blocked", { DOCKER_HOST: "unix:///verified-A.sock" }, true],
  ]) {
    const result = probe(caseId, selectors, { blocked });
    assert.notEqual(result.status, 0);
    assert.ok(
      !result.operations.some((call) =>
        ["create", "start", "rm"].includes(call.args[0]),
      ),
    );
  }
});

test("native Docker supports a local HOME default with absent or empty configuration", () => {
  for (const [caseId, selectors] of [
    ["home-absent-config", {}],
    ["home-empty-config", { DOCKER_CONFIG: "" }],
  ]) {
    const { operations, receipt, status } = probe(caseId, selectors, {
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
