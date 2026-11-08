// Owned, model-free native integration. No .env or shared stack is used.
import { spawn } from "node:child_process";
import { createServer, request } from "node:http";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  fsyncSync,
  rmSync,
} from "node:fs";
import { isAbsolute, resolve, join } from "node:path";
import { once } from "node:events";

const root = resolve(import.meta.dirname, "../..");
const invokingCwd = process.cwd();
const evidence = process.env.NATIVE_EVIDENCE_DIR;
const platform = process.env.NATIVE_PLATFORM_SOURCE
  ? resolve(process.env.NATIVE_PLATFORM_SOURCE)
  : undefined;
if (!evidence || !platform)
  throw new Error(
    "NATIVE_EVIDENCE_DIR and NATIVE_PLATFORM_SOURCE are required (no credential files).",
  );
if (process.platform !== "win32" && platform.includes("\\"))
  throw new Error(
    "NATIVE_PLATFORM_SOURCE cannot contain a literal backslash on non-Windows hosts (Go replacement path limitation).",
  );
mkdirSync(evidence, { recursive: true });
const dir = mkdtempSync(join(evidence, "task6-native-"));
const children = [],
  edges = [];
const readiness = new AbortController();
let container,
  stopping = false,
  ready = false,
  startupDone;
const receipt = { dir, platform, started: [], container: null, cleaned: false };
function durable(path, value, exclusive = false) {
  const fd = openSync(path, exclusive ? "wx" : "w", 0o600);
  try {
    writeFileSync(fd, JSON.stringify(value, null, 2));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
const record = () => {
  durable(join(dir, "receipt.json"), receipt);
  durable(join(evidence, "task6-native-receipt.json"), receipt);
};
record();
const selectors = Object.fromEntries(
  ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG"]
    .filter((key) => process.env[key] !== undefined)
    .map((key) => [key, process.env[key]]),
);
const env = Object.freeze({
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
  SystemRoot: process.env.SystemRoot,
  ...selectors,
  NEXT_TELEMETRY_DISABLED: "1",
  TMPDIR: process.env.TMPDIR || dir,
  NO_PROXY: "*",
  no_proxy: "*",
  NATIVE_RUN_DIR: dir,
  NATIVE_EVIDENCE_DIR: evidence,
});
let dockerEndpoint;
async function effectiveDockerEndpoint(options = {}, duringCleanup = false) {
  const actual = { ...env, ...options.env };
  if (actual.DOCKER_HOST && !actual.DOCKER_CONTEXT) return actual.DOCKER_HOST;
  const context = await command(
    "docker",
    ["context", "show"],
    options,
    duringCleanup,
  );
  return command(
    "docker",
    ["context", "inspect", context, "--format", "{{.Endpoints.docker.Host}}"],
    options,
    duringCleanup,
  );
}
async function preflightDocker() {
  // A launcher such as pnpm --dir can change cwd before this runtime starts.
  // Refuse ambiguous configuration before even dispatching Docker metadata reads.
  if (selectors.DOCKER_CONFIG && !isAbsolute(selectors.DOCKER_CONFIG))
    throw new Error("DOCKER_CONFIG must be an absolute path when nonempty");
  // Check the verified parent's selection and the actual rebuilt child. A
  // different HOME default must never silently redirect startup or cleanup.
  const parent = await effectiveDockerEndpoint({
    cwd: invokingCwd,
    env: selectors,
  });
  const effective = await effectiveDockerEndpoint();
  if (!effective.startsWith("unix://") || effective !== parent)
    throw new Error(
      "native Docker target is not the verified local Unix endpoint",
    );
  const fixtures = await command("docker", [
    "ps",
    "--all",
    "--no-trunc",
    "--filter",
    "label=dev.opensdlc.managed-agent-platform.test-fixture",
    "--format",
    "{{.ID}}",
  ]);
  if (fixtures)
    throw new Error(
      "foreign platform fixture present; no resource operation allowed",
    );
  dockerEndpoint = effective;
  receipt.dockerTarget = {
    endpointClass: "local-unix",
    matchesParent: true,
    selectorNames: Object.keys(selectors),
    checkedAt: new Date().toISOString(),
    foreignFixtures: false,
  };
  record();
}
async function probeEnvironment() {
  const script = `JSON.stringify({telemetryDisabled:process.env.NEXT_TELEMETRY_DISABLED === "1",unsafeNames:Object.keys(process.env).filter(k=>/^(RUN_LIVE_|RUN_EVALS|MODEL_|ANTHROPIC_|AWS_|GOOGLE_|OTEL_|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY)/i.test(k))})`;
  const commandProbe = JSON.parse(
    await command(process.execPath, ["-e", `console.log(${script})`]),
  );
  const path = join(dir, "environment-start.json");
  start(
    process.execPath,
    [
      "-e",
      `require("node:fs").writeFileSync(${JSON.stringify(path)}, ${script}, {mode:0o600})`,
    ],
    "environment-probe",
  );
  await children.at(-1).done;
  const startProbe = JSON.parse(readFileSync(path, "utf8"));
  receipt.environment = { command: commandProbe, start: startProbe };
  record();
  if (
    [commandProbe, startProbe].some(
      (probe) => !probe.telemetryDisabled || probe.unsafeNames.length,
    )
  )
    throw new Error("unsafe native child environment");
}
function checkStarting() {
  if (stopping) throw new Error("native runtime is stopping");
}
function own(child, creation) {
  const entry = { child, creation, error: undefined, closed: false };
  // Failed spawns have no PID. Listen before doing any receipt I/O.
  child.on("error", (error) => {
    entry.error = error;
  });
  entry.done = new Promise((resolve) =>
    child.once("close", () => {
      entry.closed = true;
      resolve();
    }),
  );
  children.push(entry);
  return entry;
}
async function command(cmd, args, options = {}, duringCleanup = false) {
  if (!duringCleanup) checkStarting();
  if (cmd === "docker" && ["create", "start", "exec", "rm"].includes(args[0])) {
    if (
      !dockerEndpoint ||
      (await effectiveDockerEndpoint({}, duringCleanup)) !== dockerEndpoint
    )
      throw new Error(
        "native Docker endpoint changed; refusing resource operation",
      );
  }
  const child = spawn(cmd, args, {
    cwd: root,
    ...options,
    env: { ...env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const creation = {
    command: cmd,
    args,
    pid: child.pid ?? null,
    createdAt: new Date().toISOString(),
  };
  const entry = own(child, creation);
  receipt.commands ??= [];
  receipt.commands.push(creation);
  record();
  let stdout = "",
    stderr = "";
  child.stdout.on("data", (data) => {
    stdout += data;
  });
  child.stderr.on("data", (data) => {
    stderr += data;
  });
  await entry.done;
  if (entry.error) throw entry.error;
  if (child.exitCode !== 0)
    throw new Error(
      `${cmd} ${args[0]} failed: ${stderr || stdout || child.signalCode}`,
    );
  if (!duringCleanup) checkStarting();
  return stdout.trim();
}
function start(cmd, args, name, extra = {}) {
  checkStarting();
  const fd = openSync(join(dir, `${name}.log`), "w", 0o600);
  let entry;
  try {
    const child = spawn(cmd, args, {
      cwd: root,
      env: { ...env, ...extra },
      stdio: ["ignore", fd, fd],
    });
    const creation = {
      name,
      pid: child.pid ?? null,
      command: cmd,
      args,
      createdAt: new Date().toISOString(),
    };
    entry = own(child, creation);
    child.on("error", (error) => {
      void shutdown(error);
    });
    child.on("close", () => {
      if (ready && !stopping)
        void shutdown(
          new Error(
            `owned process ${creation.pid} (${name}) exited; see ${dir}`,
          ),
        );
    });
    durable(join(dir, `${name}-creation.json`), creation, true);
    receipt.started.push(creation);
    record();
  } finally {
    closeSync(fd);
  }
  return entry.child;
}
function checkAlive() {
  const dead = children.find(
    (entry) =>
      entry.creation.name &&
      entry.creation.name !== "environment-probe" &&
      (entry.error || entry.closed),
  );
  if (dead)
    throw new Error(`owned process ${dead.child.pid} exited; see ${dir}`);
}
async function wait(url) {
  for (let n = 0; n < 240; n++) {
    checkStarting();
    checkAlive();
    try {
      const response = await fetch(url, { signal: readiness.signal });
      await response.arrayBuffer();
      checkStarting();
      checkAlive();
      if (response.status === 200) return;
    } catch {
      checkStarting();
    }
    checkAlive();
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`runtime did not become ready: ${url}`);
}
async function listen(server, port) {
  checkStarting();
  edges.push(server);
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  receipt.listeners ??= [];
  receipt.listeners.push({ pid: process.pid, port });
  record();
}
async function edge(port, upstream) {
  const server = createServer((req, res) => {
    const path = new URL(req.url, "http://edge").pathname;
    const backend = path.startsWith("/admin/v1/")
      ? upstream === 38110
        ? 38120
        : 38121
      : path.startsWith("/api/auth/") ||
          path.startsWith("/api/console/") ||
          path.startsWith("/api/oauth/") ||
          path.startsWith("/api/organizations/") ||
          path.startsWith("/v1/")
        ? upstream
        : 38100;
    if (path.endsWith("/stream")) {
      // Keep the original response handle as evidence. Chromium can discard an
      // old document's SSE requests without emitting Playwright finish events.
      receipt.streams ??= [];
      const stream = {
        id: receipt.streams.length + 1,
        port,
        path: req.url,
        openedAt: new Date().toISOString(),
        closedAt: null,
      };
      receipt.streams.push(stream);
      record();
      res.once("close", () => {
        stream.closedAt = new Date().toISOString();
        record();
      });
    }
    const forward = request(
      {
        host: "127.0.0.1",
        port: backend,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (incoming) => {
        // Authority withdrawal can terminate a chunked response mid-frame. Do
        // not leave the browser waiting on an edge response that will never end.
        incoming.on("aborted", () => res.destroy());
        incoming.on("error", () => res.destroy());
        res.writeHead(incoming.statusCode, incoming.headers);
        res.flushHeaders();
        incoming.pipe(res);
      },
    );
    forward.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    res.on("close", () => forward.destroy());
    req.pipe(forward);
  });
  await listen(server, port);
}
let cleaning,
  failed = false;
async function stop(entry) {
  if (entry.closed) return;
  const { child } = entry;
  if (!child.pid) {
    await entry.done;
    return;
  }
  child.kill("SIGTERM");
  let timer;
  await Promise.race([
    entry.done,
    new Promise((resolve) => {
      timer = setTimeout(resolve, 5000);
    }),
  ]);
  clearTimeout(timer);
  if (!entry.closed) {
    child.kill("SIGKILL");
    await entry.done;
  }
}
function captureContainer() {
  if (container) return;
  // Only the original Docker --cidfile receipt establishes ownership after an
  // interrupted create. Never discover a container by name, label or timestamp.
  // SIGKILL or an engine create without a returned receipt cannot be recovered.
  let id;
  try {
    id = readFileSync(join(dir, "container.cid"), "utf8").trim();
  } catch {
    return;
  }
  if (!/^[a-f0-9]{64}$/.test(id))
    throw new Error("invalid original container receipt");
  container = id;
  receipt.container = id;
  receipt.containerCreation = { ...receipt.containerAttempt, id };
  durable(
    join(dir, "container-creation.json"),
    receipt.containerCreation,
    true,
  );
  record();
}
async function captureVolumes(duringCleanup = false) {
  if (!container || receipt.volumes) return;
  receipt.volumes = JSON.parse(
    await command(
      "docker",
      ["inspect", "--format", "{{json .Mounts}}", container],
      {},
      duringCleanup,
    ),
  )
    .filter((mount) => mount.Type === "volume")
    .map((mount) => mount.Name);
  durable(
    join(dir, "volume-creation.json"),
    { container, volumes: receipt.volumes },
    true,
  );
  record();
}
function cleanup() {
  stopping = true;
  // Abort both pending headers and body reads before joining startup. Cleanup
  // commands do not share this signal and must still finish.
  readiness.abort();
  return (cleaning ??= (async () => {
    receipt.cleanupErrors = [];
    // Interrupt and await commands too. Startup sees stopping after every await;
    // join it before final cleanup so it cannot create resources behind us.
    await Promise.all(children.map(stop));
    await startupDone;
    await Promise.all(
      edges.map(
        (server) =>
          new Promise((resolve) => {
            server.closeAllConnections();
            server.close(resolve);
          }),
      ),
    );
    await Promise.all(children.map(stop));
    try {
      captureContainer();
      if (receipt.containerAttempt && !container)
        throw new Error(
          "container creation has no original receipt; ownership outcome is unknown",
        );
      await captureVolumes(true);
    } catch (error) {
      receipt.cleanupErrors.push(String(error));
    }
    if (container) {
      receipt.cleanupCommand = ["docker", "rm", "-f", "-v", container];
      record();
      try {
        receipt.removedContainer = await command(
          "docker",
          ["rm", "-f", "-v", container],
          {},
          true,
        );
      } catch (error) {
        receipt.cleanupErrors.push(String(error));
      }
    }
    for (const mode of ["password", "oidc"])
      rmSync(join(dir, `${mode}-setup-code`), { force: true });
    try {
      receipt.after = (
        dockerEndpoint
          ? await command("docker", ["ps", "--no-trunc", "-aq"], {}, true)
          : ""
      )
        .split("\n")
        .filter(Boolean);
      const volumes = (
        dockerEndpoint
          ? await command("docker", ["volume", "ls", "-q"], {}, true)
          : ""
      ).split("\n");
      receipt.volumesAfter = (receipt.volumes ?? []).map((name) => ({
        name,
        absent: !volumes.includes(name),
      }));
    } catch (error) {
      receipt.cleanupErrors.push(String(error));
    }
    receipt.processesAfter = children.map(
      ({ child, creation, closed, error }) => ({
        pid: creation.pid,
        command: creation.command,
        exited: closed,
        exitCode: child.exitCode,
        signal: child.signalCode,
        ...(error ? { error: String(error) } : {}),
      }),
    );
    receipt.cleaned =
      receipt.cleanupErrors.length === 0 &&
      receipt.processesAfter.every((p) => p.exited) &&
      receipt.volumesAfter?.every((v) => v.absent) &&
      !receipt.after?.includes(container);
    record();
    if (!receipt.cleaned)
      console.error(
        `incomplete cleanup; retained receipt ${join(dir, "receipt.json")}`,
      );
  })());
}
async function shutdown(error) {
  if (error) {
    failed = true;
    console.error(error);
  }
  try {
    await cleanup();
  } catch (error) {
    failed = true;
    console.error(error);
  }
  process.exit(failed || !receipt.cleaned ? 1 : 0);
}
process.on("SIGTERM", () => {
  void shutdown();
});
process.on("SIGINT", () => {
  void shutdown();
});
startupDone = (async () => {
  try {
    await preflightDocker();
    await probeEnvironment();
    if (process.argv.includes("--check-environment")) return;
    receipt.before = (await command("docker", ["ps", "--no-trunc", "-aq"]))
      .split("\n")
      .filter(Boolean);
    record();
    const name = `console-native-${process.pid}-${Date.now()}`;
    const args = [
      "create",
      "--cidfile",
      join(dir, "container.cid"),
      "--name",
      name,
      "--label",
      "console-native-owned=true",
      "-e",
      "POSTGRES_PASSWORD=native-test",
      "-p",
      "127.0.0.1::5432",
      "postgres:18-alpine",
    ];
    receipt.containerAttempt = {
      name,
      command: ["docker", ...args],
      createdAt: new Date().toISOString(),
    };
    durable(
      join(dir, "container-attempt.json"),
      receipt.containerAttempt,
      true,
    );
    record();
    try {
      await command("docker", args);
    } finally {
      captureContainer();
    }
    if (!container)
      throw new Error("Docker returned no original container receipt");
    await captureVolumes();
    await command("docker", ["start", container]);
    const port = (await command("docker", ["port", container, "5432/tcp"]))
      .split(":")
      .at(-1);
    for (let i = 0; ; i++) {
      try {
        await command("docker", [
          "exec",
          container,
          "pg_isready",
          "-h",
          "127.0.0.1",
          "-U",
          "postgres",
        ]);
        break;
      } catch {
        checkStarting();
      }
      if (i === 100) throw new Error("owned PostgreSQL not ready");
      await new Promise((r) => setTimeout(r, 100));
    }
    for (const mode of ["password", "oidc"])
      await command("docker", [
        "exec",
        container,
        "createdb",
        "-h",
        "127.0.0.1",
        "-U",
        "postgres",
        `native_${mode}`,
      ]);
    const goModule = join(dir, "module");
    mkdirSync(goModule);
    const goMod = readFileSync(join(platform, "go.mod"), "utf8").replace(
      /^module .*$/m,
      "module github.com/OpenSDLC-Dev/managed-agent-platform/console-native-test",
    );
    writeFileSync(
      join(goModule, "go.mod"),
      goMod +
        `\nrequire github.com/OpenSDLC-Dev/managed-agent-platform v0.0.0\nreplace github.com/OpenSDLC-Dev/managed-agent-platform => ${JSON.stringify(platform)}\n`,
    );
    writeFileSync(
      join(goModule, "go.sum"),
      readFileSync(join(platform, "go.sum")),
    );
    writeFileSync(
      join(goModule, "main.go"),
      readFileSync(join(root, "test/native/platform.go")),
    );
    await command(
      "go",
      ["build", "-mod=mod", "-o", join(dir, "native-platform"), "."],
      { cwd: goModule },
    );
    process.env.MOCK_OIDC_PORT = "38130";
    process.env.MOCK_OIDC_ISSUER = "http://127.0.0.1:38130";
    const { oidcServer } = await import("../mock-platform/oidc.mjs");
    checkStarting();
    await listen(oidcServer, 38130);
    start(join(dir, "native-platform"), [], "platform", {
      DATABASE_BASE: `postgres://postgres:native-test@127.0.0.1:${port}`,
    });
    await wait("http://127.0.0.1:38110/api/auth/config");
    await wait("http://127.0.0.1:38111/api/auth/config");
    start(
      process.execPath,
      ["node_modules/next/dist/bin/next", "start", "--port", "38100"],
      "console",
      {
        CONSOLE_AUTH_MODE: "platform",
        PLATFORM_API_KEY: "",
        CONSOLE_PASSWORD: "",
        IDENTITY_MODE: "",
        PLATFORM_BASE_URL: "",
      },
    );
    await wait("http://127.0.0.1:38100/api/health");
    await edge(38200, 38110);
    await edge(38201, 38111);
    checkStarting();
    checkAlive();
    ready = true;
    console.log(`native runtime ready; receipt ${join(dir, "receipt.json")}`);
  } catch (error) {
    if (!stopping) {
      console.error(error);
      failed = true;
    }
  }
})();
await startupDone;
if (failed || stopping || process.argv.includes("--check-environment"))
  await shutdown();
