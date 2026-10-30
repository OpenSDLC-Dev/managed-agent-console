// Owned, model-free native integration. No .env or shared stack is used.
import { spawn, spawnSync } from "node:child_process";
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
import { resolve, join } from "node:path";
import { once } from "node:events";

const root = resolve(import.meta.dirname, "../..");
const evidence = process.env.NATIVE_EVIDENCE_DIR;
const platform = process.env.NATIVE_PLATFORM_SOURCE;
if (!evidence || !platform)
  throw new Error(
    "NATIVE_EVIDENCE_DIR and NATIVE_PLATFORM_SOURCE are required (no credential files).",
  );
mkdirSync(evidence, { recursive: true });
const dir = mkdtempSync(join(evidence, "task6-native-"));
const children = [],
  edges = [];
let container;
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
const env = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  TMPDIR: dir,
  NO_PROXY: "*",
  no_proxy: "*",
  NATIVE_RUN_DIR: dir,
  NATIVE_EVIDENCE_DIR: evidence,
};
function command(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    encoding: "utf8",
    ...options,
    env: { ...env, ...options.env },
  });
  if (result.status !== 0)
    throw new Error(
      `${cmd} ${args[0]} failed: ${result.stderr || result.stdout}`,
    );
  return result.stdout.trim();
}
receipt.before = command("docker", ["ps", "--no-trunc", "-aq"])
  .split("\n")
  .filter(Boolean);
record();
function start(cmd, args, name, extra = {}) {
  const fd = openSync(join(dir, `${name}.log`), "w", 0o600);
  const child = spawn(cmd, args, {
    cwd: root,
    env: { ...env, ...extra },
    stdio: ["ignore", fd, fd],
  });
  closeSync(fd);
  children.push(child);
  const creation = {
    name,
    pid: child.pid,
    command: cmd,
    args,
    createdAt: new Date().toISOString(),
  };
  durable(join(dir, `${name}-creation.json`), creation, true);
  receipt.started.push(creation);
  record();
  return child;
}
async function wait(url) {
  for (let n = 0; n < 240; n++) {
    try {
      const response = await fetch(url);
      await response.arrayBuffer();
      if (response.status < 500) return;
    } catch {}
    const dead = children.find((c) => c.exitCode !== null);
    if (dead) throw new Error(`owned process ${dead.pid} exited; see ${dir}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`runtime did not become ready: ${url}`);
}
async function listen(server, port) {
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
let cleaning;
function cleanup() {
  return (cleaning ??= (async () => {
    receipt.cleanupErrors = [];
    await Promise.all(
      edges.map(
        (server) =>
          new Promise((resolve) => {
            server.closeAllConnections();
            server.close(resolve);
          }),
      ),
    );
    for (const child of children.toReversed()) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      let timer;
      await Promise.race([
        exited,
        new Promise((r) => {
          timer = setTimeout(r, 5000);
        }),
      ]);
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await exited;
      }
    }
    if (container) {
      receipt.cleanupCommand = ["docker", "rm", "-f", "-v", container];
      record();
      try {
        receipt.removedContainer = command("docker", [
          "rm",
          "-f",
          "-v",
          container,
        ]);
      } catch (error) {
        receipt.cleanupErrors.push(String(error));
      }
    }
    // Synthetic setup codes are inputs, not evidence.
    for (const mode of ["password", "oidc"])
      rmSync(join(dir, `${mode}-setup-code`), { force: true });
    try {
      receipt.after = command("docker", ["ps", "--no-trunc", "-aq"])
        .split("\n")
        .filter(Boolean);
    } catch (error) {
      receipt.cleanupErrors.push(String(error));
    }
    try {
      const volumes = command("docker", ["volume", "ls", "-q"]).split("\n");
      receipt.volumesAfter = (receipt.volumes ?? []).map((name) => ({
        name,
        absent: !volumes.includes(name),
      }));
    } catch (error) {
      receipt.cleanupErrors.push(String(error));
    }
    receipt.processesAfter = receipt.started.map((p) => {
      const child = children.find((c) => c.pid === p.pid);
      return {
        pid: p.pid,
        exited: child.exitCode !== null || child.signalCode !== null,
        exitCode: child.exitCode,
        signal: child.signalCode,
      };
    });
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
process.once(
  "SIGTERM",
  () => void cleanup().then(() => process.exit(receipt.cleaned ? 0 : 1)),
);
process.once(
  "SIGINT",
  () => void cleanup().then(() => process.exit(receipt.cleaned ? 0 : 1)),
);
try {
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
  container = command("docker", args);
  receipt.container = container;
  receipt.containerCreation = {
    id: container,
    name,
    command: ["docker", ...args],
    createdAt: new Date().toISOString(),
  };
  durable(
    join(dir, "container-creation.json"),
    receipt.containerCreation,
    true,
  );
  record();
  receipt.volumes = JSON.parse(
    command("docker", ["inspect", "--format", "{{json .Mounts}}", container]),
  )
    .filter((mount) => mount.Type === "volume")
    .map((mount) => mount.Name);
  durable(
    join(dir, "volume-creation.json"),
    { container, volumes: receipt.volumes },
    true,
  );
  record();
  command("docker", ["start", container]);
  const port = command("docker", ["port", container, "5432/tcp"])
    .split(":")
    .at(-1);
  for (let i = 0; ; i++) {
    if (
      spawnSync("docker", [
        "exec",
        container,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        "postgres",
      ]).status === 0
    )
      break;
    if (i === 100) throw new Error("owned PostgreSQL not ready");
    await new Promise((r) => setTimeout(r, 100));
  }
  for (const mode of ["password", "oidc"])
    command("docker", [
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
      `\nrequire github.com/OpenSDLC-Dev/managed-agent-platform v0.0.0\nreplace github.com/OpenSDLC-Dev/managed-agent-platform => ${platform}\n`,
  );
  writeFileSync(
    join(goModule, "go.sum"),
    readFileSync(join(platform, "go.sum")),
  );
  writeFileSync(
    join(goModule, "main.go"),
    readFileSync(join(root, "test/native/platform.go")),
  );
  command(
    "go",
    ["build", "-mod=mod", "-o", join(dir, "native-platform"), "."],
    { cwd: goModule },
  );
  process.env.MOCK_OIDC_PORT = "38130";
  process.env.MOCK_OIDC_ISSUER = "http://127.0.0.1:38130";
  const { oidcServer } = await import("../mock-platform/oidc.mjs");
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
  console.log(`native runtime ready; receipt ${join(dir, "receipt.json")}`);
} catch (error) {
  console.error(error);
  await cleanup();
  process.exit(1);
}
