// @vitest-environment node
import {
  readFileSync,
  mkdtempSync,
  existsSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { Script } from "node:vm";
import { parse } from "yaml";
import { expect, it } from "vitest";

type Step = {
  "continue-on-error"?: boolean | string;
  if?: string | boolean;
  uses?: string;
  run?: string;
  with?: Record<string, string | boolean>;
  env?: Record<string, string>;
};
type Job = {
  "continue-on-error"?: boolean | string;
  needs: string[];
  if: string;
  permissions: Record<string, string>;
  steps: Step[];
  strategy: { matrix: { include: { arch: string; runner: string }[] } };
  env: Record<string, string>;
};
type Workflow = { jobs: Record<string, Job> };
const workflow = parse(
  readFileSync(".github/workflows/ci.yml", "utf8"),
) as Workflow;
const source = () => readFileSync("scripts/publish-sha.sh", "utf8");
const sha = "a".repeat(40);
const image = "ghcr.io/opensdlc-dev/managed-agent-console";
function admitted(
  guard: string,
  eventName: string,
  ref: string,
  repository = "OpenSDLC-Dev/managed-agent-console",
) {
  return new Script(guard.replace(/^\$\{\{\s*|\s*\}\}$/g, "")).runInNewContext({
    github: { event_name: eventName, ref, repository },
  });
}
function check(w: Workflow) {
  const b = w.jobs["sha-build"],
    p = w.jobs["sha-publish"];
  expect(b).toBeDefined();
  expect(p).toBeDefined();
  expect(b.needs).toEqual(["ci-ok", "docker"]);
  expect(p.needs).toEqual(["sha-build"]);
  for (const job of [b, p]) {
    expect(job["continue-on-error"] ?? false).toBe(false);
    expect(admitted(job.if, "push", "refs/heads/main")).toBe(true);
    for (const [event, ref, repo] of [
      ["pull_request", "refs/heads/main"],
      ["push", "refs/heads/feature"],
      ["push", "refs/heads/main", "foreign/fork"],
    ])
      expect(admitted(job.if, event, ref, repo)).toBe(false);
    expect(job.permissions).toEqual({ contents: "read", packages: "write" });
    const checkout = job.steps.filter((s) =>
      s.uses?.startsWith("actions/checkout@"),
    );
    expect(checkout).toHaveLength(1);
    expect(checkout[0].with?.ref).toBe("${{ github.sha }}");
    expect(checkout[0].with?.["persist-credentials"]).toBe(false);
    expect(job.env.SOURCE_SHA).toBe("${{ github.sha }}");
    expect(job.env.IMAGE).toBe(image);
    expect(job.steps.filter((s) => s.run).map((s) => s.run)).toEqual(
      job === b
        ? [
            "bash scripts/publish-sha.sh build",
            "bash scripts/publish-sha.sh push",
          ]
        : ["bash scripts/publish-sha.sh manifest"],
    );
  }
  expect(b.strategy.matrix.include).toEqual([
    { runner: "ubuntu-latest", arch: "amd64" },
    { runner: "ubuntu-24.04-arm", arch: "arm64" },
  ]);
  const scan = b.steps.findIndex((s) =>
    s.uses?.startsWith("aquasecurity/trivy-action@"),
  );
  const push = b.steps.findIndex((s) => s.run?.includes("publish-sha.sh push"));
  expect(scan).toBeGreaterThan(0);
  expect(push).toBeGreaterThan(scan);
  expect(b.steps[scan].if).toBeUndefined();
  expect(b.steps[scan]["continue-on-error"] ?? false).toBe(false);
  // An unconditional push can run after a failed scan even when the job fails.
  expect(b.steps[push].if).toBeUndefined();
  expect(b.steps[scan].with).toMatchObject({
    "scan-type": "image",
    "exit-code": "1",
    severity: "HIGH,CRITICAL",
    "image-ref":
      `${image}:staging-` +
      "${{ github.sha }}-${{ github.run_id }}-${{ github.run_attempt }}-${{ matrix.arch }}",
  });
  expect(b.steps[push].env?.PUBLISH_TOKEN).toBe("${{ secrets.GITHUB_TOKEN }}");
}
it("gates the actual parsed publisher on trusted main, normal CI, scans and both architectures", () =>
  check(workflow));
it.each(["gate", "event", "ref", "repository", "architecture", "scan"])(
  "probe: parsed workflow mutant %s is caught by the same oracle",
  (kind) => {
    const w = structuredClone(workflow),
      b = w.jobs["sha-build"];
    if (kind === "gate") b.needs = ["ci-ok"];
    if (kind === "event") b.if = "github.ref == 'refs/heads/main'";
    if (kind === "ref") b.if = "github.event_name == 'push'";
    if (kind === "repository")
      b.if = "github.event_name == 'push' && github.ref == 'refs/heads/main'";
    if (kind === "architecture") b.strategy.matrix.include.pop();
    if (kind === "scan")
      b.steps = b.steps.filter(
        (s) => !s.uses?.startsWith("aquasecurity/trivy-action@"),
      );
    // YAML still parses and guard expressions still execute. A syntax failure is
    // not a caught mutant: the unchanged production assertions must reject it.
    const parsed = parse(JSON.stringify(w)) as Workflow;
    for (const job of [parsed.jobs["sha-build"], parsed.jobs["sha-publish"]])
      expect(() => admitted(job.if, "push", "refs/heads/main")).not.toThrow();
    expect(() => check(parsed)).toThrow();
  },
);
it.each(["scan-fail-open", "job-fail-open", "unconditional-push"])(
  "probe: parsed failure propagation mutant %s is caught by the same oracle",
  (kind) => {
    const w = structuredClone(workflow);
    const build = w.jobs["sha-build"];
    if (kind === "scan-fail-open")
      build.steps.find((s) =>
        s.uses?.startsWith("aquasecurity/trivy-action@"),
      )!["continue-on-error"] = true;
    if (kind === "job-fail-open") build["continue-on-error"] = true;
    if (kind === "unconditional-push")
      build.steps.find((s) => s.run?.includes("publish-sha.sh push"))!.if =
        "${{ always() }}";
    const parsed = parse(JSON.stringify(w)) as Workflow;
    expect(() => check(parsed)).toThrow();
  },
);
// Git Bash takes POSIX paths even when Node runs natively on Windows.
const shellPath = (file: string) =>
  file
    .replaceAll("\\", "/")
    .replace(
      /^([A-Za-z]):/,
      (_all, drive: string) => `/${drive.toLowerCase()}`,
    );
const gitBash = join(
  process.env.ProgramFiles ?? "C:/Program Files",
  "Git",
  "bin",
  "bash.exe",
);
const bash =
  process.platform === "win32" && existsSync(gitBash) ? gitBash : "bash";
function run(
  script: string,
  command: string,
  overrides: Record<string, string | undefined> = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "sha-probe-"));
  try {
    const file = join(dir, "publish.sh"),
      runner = join(dir, "runner.sh");
    writeFileSync(file, script);
    // Shell functions isolate the real script without platform-dependent
    // executable stubs. The login stub consumes stdin, as Docker does.
    writeFileSync(
      runner,
      `
git() { printf '%s\\n' "$CHECKOUT_SHA"; }
docker() {
  printf '%s\\n' "$*" >> "$CALLS"
  if [ "\${1:-}" = login ]; then read -r token || true; fi
  case "$*" in
    *"imagetools inspect"*)
      if [ "\${BAD_DIGEST:-}" = 1 ]; then echo invalid
      else
        case "$*" in *-amd64*) n=1;; *-arm64*) n=2;; *) n=3;; esac
        printf 'sha256:%064d\\n' "$n"
      fi;;
  esac
}
source "$1" "$2"
`,
    );
    const syntax = spawnSync(
      bash,
      ["--noprofile", "--norc", "-n", shellPath(file)],
      {
        encoding: "utf8",
        env: {
          NODE_ENV: "test",
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
        },
      },
    );
    expect(syntax.status, syntax.stderr).toBe(0);
    const result = spawnSync(
      bash,
      ["--noprofile", "--norc", shellPath(runner), shellPath(file), command],
      {
        encoding: "utf8",
        env: {
          NODE_ENV: "test",
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          GITHUB_EVENT_NAME: "push",
          GITHUB_REF: "refs/heads/main",
          GITHUB_REPOSITORY: "OpenSDLC-Dev/managed-agent-console",
          SOURCE_SHA: sha,
          CHECKOUT_SHA: sha,
          GITHUB_RUN_ID: "42",
          GITHUB_RUN_ATTEMPT: "2",
          ARCH: "amd64",
          IMAGE: image,
          PUBLISH_TOKEN: "synthetic",
          GITHUB_ACTOR: "test",
          GITHUB_OUTPUT: shellPath(join(dir, "output")),
          CALLS: shellPath(join(dir, "calls")),
          ...overrides,
        },
      },
    );
    let calls = "";
    try {
      calls = readFileSync(join(dir, "calls"), "utf8");
    } catch {}
    return { status: result.status, calls, stderr: result.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
it("converts Windows paths for the isolated Git Bash runner", () => {
  expect(shellPath("C:\\Temp\\sha probe\\publish.sh")).toBe(
    "/c/Temp/sha probe/publish.sh",
  );
  expect(shellPath("/tmp/sha-probe/publish.sh")).toBe(
    "/tmp/sha-probe/publish.sh",
  );
});
function checkBuild(result: ReturnType<typeof run>) {
  expect(result.status, result.stderr).toBe(0);
  expect(result.calls).toContain(
    `--platform linux/amd64 --build-arg VERSION=sha-${sha} --build-arg REVISION=${sha}`,
  );
  expect(result.calls).toContain(`staging-${sha}-42-2-amd64`);
}
function checkManifest(result: ReturnType<typeof run>) {
  expect(result.status, result.stderr).toBe(0);
  const create = result.calls
    .split("\n")
    .find((line) => line.startsWith("buildx imagetools create"));
  expect(create).toBe(
    `buildx imagetools create -t ${image}:sha-${sha} ${image}@sha256:${"1".padStart(64, "0")} ${image}@sha256:${"2".padStart(64, "0")}`,
  );
  expect(result.calls).not.toContain(":latest");
}
it("executes actual build/push/manifest shell using isolated registry stubs", () => {
  const script = source();
  checkBuild(run(script, "build"));
  const pushed = run(script, "push");
  expect(pushed.status, pushed.stderr).toBe(0);
  expect(pushed.calls).toContain(`push ${image}:staging-${sha}-42-2-amd64`);
  checkManifest(run(script, "manifest"));
  expect(run(script, "manifest", { BAD_DIGEST: "1" }).status).not.toBe(0);
  for (const overrides of [
    { SOURCE_SHA: "abcdef" },
    { CHECKOUT_SHA: "b".repeat(40) },
    { GITHUB_EVENT_NAME: "pull_request" },
    { GITHUB_REF: "refs/heads/feature" },
    { GITHUB_REPOSITORY: "foreign/fork" },
  ]) {
    for (const command of ["build", "push", "manifest"]) {
      const result = run(script, command, overrides);
      expect(result.status, JSON.stringify(overrides)).not.toBe(0);
      expect(result.calls).toBe("");
    }
  }
  expect(run(script, "build", { ARCH: "riscv64" }).status).not.toBe(0);
});
it.each(["short-sha", "latest"])(
  "probe: runnable shell mutant %s is caught by the same oracle",
  (kind) => {
    const script = source();
    const mutant =
      kind === "short-sha"
        ? script.replace(
            'VERSION="sha-${SOURCE_SHA}"',
            'VERSION="sha-${SOURCE_SHA:0:7}"',
          )
        : script.replace('"$IMAGE:$VERSION"', '"$IMAGE:latest"');
    expect(mutant).not.toBe(script);
    const result = run(mutant, kind === "short-sha" ? "build" : "manifest");
    expect(result.status, result.stderr).toBe(0); // executable, not a syntax-error kill
    expect(() =>
      kind === "short-sha" ? checkBuild(result) : checkManifest(result),
    ).toThrow();
  },
);

it("probe: a parsed scanner skipped by its step condition is rejected", () => {
  const w = structuredClone(workflow);
  const scan = w.jobs["sha-build"].steps.find((step) =>
    step.uses?.startsWith("aquasecurity/trivy-action@"),
  );
  expect(scan).toBeDefined();
  scan!.if = false;
  expect(() => check(w)).toThrow();
});
