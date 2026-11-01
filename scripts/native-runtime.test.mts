// @vitest-environment node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { expect, it } from "vitest";

// The preload fails closed: all external commands and network/listeners are
// synthetic. Real Node children exercise error events and signal settlement.
function fixture(kind: string, platformPath = "platform") {
  const dir = mkdtempSync(join(tmpdir(), "nr-"));
  const platform = join(dir, platformPath);
  mkdirSync(platform, { recursive: true });
  writeFileSync(
    join(platform, "go.mod"),
    "module github.com/OpenSDLC-Dev/managed-agent-platform\n\ngo 1.18\n",
  );
  writeFileSync(join(platform, "go.sum"), "");
  const evidence = join(dir, "evidence");
  const calls = join(dir, "calls.jsonl");
  const preload = join(dir, "commands.mjs");
  writeFileSync(
    preload,
    `
import cp from "node:child_process";
import http from "node:http";
import { EventEmitter } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const original = cp.spawn, sync = cp.spawnSync;
const dir = ${JSON.stringify(dir)}, kind = ${JSON.stringify(kind)};
const id = "1".padStart(64, "0");
const log = (value) => appendFileSync(${JSON.stringify(calls)}, JSON.stringify(value) + "\\n");
function result(command, args, options) {
  log({ command, args, cwd: options.cwd });
  if (command === "go") {
    if (kind === "path") return { status: 1, stderr: "path captured" };
    return { status: 0, stdout: "" };
  }
  if (command !== "docker") throw Error("unexpected command " + command);
  switch (args[0]) {
    case "create":
      writeFileSync(args[args.indexOf("--cidfile") + 1], id);
      return { status: 0, stdout: id };
    case "inspect": return { status: 0, stdout: JSON.stringify([{ Type: "volume", Name: "owned-volume" }]) };
    case "start": {
      const receipt = JSON.parse(readFileSync(${JSON.stringify(join(evidence, "task6-native-receipt.json"))}, "utf8"));
      if (receipt.containerCreation?.id !== id) throw Error("missing original creation receipt");
      return { status: 0, stdout: "" };
    }
    case "port":
      if (kind === "readiness") return { status: 1, stderr: "injected readiness failure" };
      return { status: 0, stdout: "127.0.0.1:54321" };
    case "rm": return { status: 0, stdout: id };
    default: return { status: 0, stdout: "" };
  }
}
cp.spawnSync = (command, args, options) => {
  if (command === "docker" && args[0] === "port" && kind === "blocked") {
    log({ held: true });
    return sync(process.execPath, ["-e", "setTimeout(()=>{}, 5000)"], { encoding: "utf8" });
  }
  return { stdout: "", stderr: "", ...result(command, args, options) };
};
cp.spawn = (command, args, options) => {
  if (command === "docker" || command === "go") {
    if (command === "docker" && args[0] === "port" && kind === "blocked") {
      const child = original(process.execPath, ["-e", "setInterval(()=>{}, 1000)"], options);
      log({ held: true, pid: child.pid });
      return child;
    }
    const value = result(command, args, options);
    if (command === "docker" && args[0] === "create" && kind === "create-blocked") {
      const child = original(process.execPath, ["-e", "setInterval(()=>{},1000);setTimeout(()=>process.exit(0),10000)"], options);
      log({ held: true, pid: child.pid });
      return child;
    }
    return original(process.execPath, ["-e", "process.stdout.write(" + JSON.stringify(value.stdout || "") + "); process.stderr.write(" + JSON.stringify(value.stderr || "") + "); process.exit(" + value.status + ")"], options);
  }
  if (command.endsWith("native-platform")) {
    if (kind.startsWith("held-")) {
      // Event-only server: the supervisor owns only the runtime child, even on RED.
      const child = new EventEmitter();
      child.pid = 424242; child.exitCode = null; child.signalCode = null;
      const alive = setInterval(() => {}, 1000);
      child.kill = (signal) => {
        clearInterval(alive); child.signalCode = signal;
        queueMicrotask(() => child.emit("close", null, signal));
        return true;
      };
      log({ server: true, synthetic: true });
      return child;
    }
    if (kind === "console") {
      const child = original(process.execPath, ["-e", "setInterval(()=>{},1000);setTimeout(()=>process.exit(0),10000)"], options);
      log({ server: true, pid: child.pid });
      return child;
    }
    if (kind === "denied" && process.platform === "win32") {
      const child = new EventEmitter();
      child.exitCode = null; child.signalCode = null;
      queueMicrotask(() => { child.emit("error", new Error("synthetic EACCES")); child.emit("close", -1, null); });
      return child;
    }
    const missing = join(dir, kind === "denied" && process.platform !== "win32" ? "not-executable" : "missing");
    if (kind === "denied" && process.platform !== "win32") writeFileSync(missing, "not executable", { mode: 0o600 });
    return original(missing, [], options);
  }
  if (command === process.execPath && args.includes("node_modules/next/dist/bin/next")) return original(join(dir, "missing-console"), [], options);
  throw Error("unexpected spawn " + command);
};
http.createServer = () => {
  const server = new EventEmitter();
  server.listen = () => queueMicrotask(() => server.emit("listening"));
  server.closeAllConnections = () => {};
  server.close = (callback) => callback();
  return server;
};
globalThis.fetch = async (url, { signal } = {}) => {
  if (!kind.startsWith("held-")) return new Response("{}", { status: 200 });
  // An in-flight socket keeps the runtime alive after its server child stops.
  const pending = setInterval(() => {}, 1000);
  const cancelled = () => {
    clearInterval(pending); log({ readinessCancelled: true, kind });
  };
  if (kind === "held-headers") {
    log({ held: kind });
    return new Promise((resolve, reject) => signal?.addEventListener("abort", () => {
      cancelled(); reject(signal.reason);
    }, { once: true }));
  }
  let body;
  const response = new Response(new ReadableStream({ start(controller) { body = controller; } }));
  signal?.addEventListener("abort", () => {
    cancelled(); body.error(signal.reason);
  }, { once: true });
  const read = response.arrayBuffer.bind(response);
  response.arrayBuffer = () => { log({ held: kind }); return read(); };
  return response;
};
syncBuiltinESMExports();
`,
  );
  const args = [
    "--import",
    pathToFileURL(preload).href,
    "test/native/runtime.mjs",
  ];
  const env = {
    NODE_ENV: "test" as const,
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    SystemRoot: process.env.SystemRoot,
    NATIVE_EVIDENCE_DIR: evidence,
    NATIVE_PLATFORM_SOURCE: platform,
  };
  return { dir, evidence, platform, args, env, calls };
}
function assertClean(f: ReturnType<typeof fixture>) {
  const commands = readFileSync(f.calls, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const receipt = JSON.parse(
    readFileSync(join(f.evidence, "task6-native-receipt.json"), "utf8"),
  );
  expect(receipt.containerCreation.id).toBe(receipt.container);
  expect(
    commands.filter((c) => c.args?.[0] === "rm").map((c) => c.args),
  ).toEqual([["rm", "-f", "-v", receipt.container]]);
  expect(receipt.volumesAfter).toEqual([
    { name: "owned-volume", absent: true },
  ]);
  expect(receipt.cleaned).toBe(true);
  return { receipt, commands };
}
it.each(["readiness", "missing", "denied", "console", "sync"])(
  "probe: runtime %s failure awaits exact owned cleanup",
  (kind) => {
    const f = fixture(kind);
    try {
      if (kind === "sync") rmSync(join(f.platform, "go.mod"));
      const result = spawnSync(process.execPath, f.args, {
        env: f.env,
        encoding: "utf8",
        timeout: 12_000,
      });
      expect(result.status, result.stderr).toBe(1);
      expect(result.stderr).toMatch(
        kind === "readiness" ? /injected readiness failure/ : /ENOENT|EACCES/,
      );
      const { receipt } = assertClean(f);
      if (kind === "console")
        expect(
          receipt.processesAfter.every((p: { exited: boolean }) => p.exited),
        ).toBe(true);
    } finally {
      rmSync(f.dir, { recursive: true, force: true });
    }
  },
);
it.skipIf(process.platform === "win32").each(["blocked", "create-blocked"])(
  "probe: SIGTERM interrupts %s before grace and preserves original receipts",
  async (kind) => {
    const f = fixture(kind);
    const child = spawn(process.execPath, f.args, {
      env: f.env,
      stdio: "pipe",
    });
    const exited = once(child, "exit");
    let output = "";
    child.stderr.on("data", (data) => {
      output += data;
    });
    try {
      for (let n = 0; n < 200; n++) {
        if (
          existsSync(f.calls) &&
          readFileSync(f.calls, "utf8").includes('"held":true')
        )
          break;
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(readFileSync(f.calls, "utf8")).toContain('"held":true');
      const start = Date.now();
      child.kill("SIGTERM");
      const result = await Promise.race([
        exited,
        new Promise((r) => setTimeout(() => r("grace expired"), 3000)),
      ]);
      expect(result, output).not.toBe("grace expired");
      expect(Date.now() - start).toBeLessThan(3000);
      expect(result).toEqual([0, null]);
      const { commands } = assertClean(f);
      expect(commands.some((c) => c.command === "go")).toBe(false);
      expect(commands.some((c) => c.server)).toBe(false);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
        await exited;
      }
      rmSync(f.dir, { recursive: true, force: true });
    }
  },
);
it.skipIf(process.platform === "win32").each(["held-headers", "held-body"])(
  "probe: SIGTERM cancels %s readiness before joining startup",
  async (kind) => {
    const f = fixture(kind);
    const child = spawn(process.execPath, f.args, {
      env: f.env,
      stdio: "pipe",
    });
    const closed = once(child, "close");
    let output = "";
    let grace: ReturnType<typeof setTimeout> | undefined;
    child.stderr.on("data", (data) => {
      output += data;
    });
    try {
      for (let n = 0; n < 200; n++) {
        if (
          existsSync(f.calls) &&
          readFileSync(f.calls, "utf8").includes(`"held":"${kind}"`)
        )
          break;
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(readFileSync(f.calls, "utf8")).toContain(`"held":"${kind}"`);
      const start = Date.now();
      child.kill("SIGTERM");
      const result = await Promise.race([
        closed,
        new Promise((r) => {
          grace = setTimeout(() => r("grace expired"), 3000);
        }),
      ]);
      expect(result, output).not.toBe("grace expired");
      expect(Date.now() - start).toBeLessThan(3000);
      expect(result).toEqual([0, null]);
      const { receipt, commands } = assertClean(f);
      expect(commands.filter((c) => c.readinessCancelled)).toHaveLength(1);
      expect(commands.filter((c) => c.server)).toHaveLength(1);
      expect(receipt.started.map((c: { name: string }) => c.name)).toEqual([
        "platform",
      ]);
      expect(receipt.listeners.map((c: { port: number }) => c.port)).toEqual([
        38130,
      ]);
      expect(output).not.toContain("native runtime is stopping");
    } finally {
      clearTimeout(grace);
      // This original handle is the only OS process in the held-readiness probe.
      // SIGKILL is needed on RED, when the broken SIGTERM handler cannot finish.
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
      await closed;
      rmSync(f.dir, { recursive: true, force: true });
    }
  },
);
it.each([
  ["plain", false],
  ["plain", true],
  ["source with spaces", false],
  ["source with spaces", true],
  ...(process.platform === "win32"
    ? []
    : [
        ['source"quote', false],
        ["source\\backslash", false],
      ]),
] as [string, boolean][])(
  "probe: runtime replacement serializes an absolute %s path (relative=%s)",
  (name, relativeSource) => {
    const f = fixture("path", name);
    try {
      // Relative to the invoking console directory, not the generated module.
      if (relativeSource)
        f.env.NATIVE_PLATFORM_SOURCE = relative(process.cwd(), f.platform);
      const result = spawnSync(process.execPath, f.args, {
        env: f.env,
        encoding: "utf8",
        timeout: 12_000,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("path captured");
      const { receipt, commands } = assertClean(f);
      const goModule = join(receipt.dir, "module");
      const directive = readFileSync(join(goModule, "go.mod"), "utf8")
        .split("\n")
        .find((line) => line.startsWith("replace "))!;
      // Inspect the runtime's generated artifact, not a test-built directive.
      // Real offline package loading belongs to the explicit native tier.
      expect(JSON.parse(directive.split(" => ")[1])).toBe(f.platform);
      expect(receipt.platform).toBe(f.platform);
      expect(commands.find((c) => c.command === "go").cwd).toBe(goModule);
    } finally {
      rmSync(f.dir, { recursive: true, force: true });
    }
  },
);
