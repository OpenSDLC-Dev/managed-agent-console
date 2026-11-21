// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { parse } from "yaml";

type Step = {
  id?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
};
type Job = {
  needs?: string | string[];
  if?: string;
  permissions: Record<string, string>;
  steps: Step[];
};
type Workflow = {
  on: Record<string, unknown>;
  permissions: Record<string, string>;
  jobs: Record<string, Job>;
};
function workflow(file: string) {
  return parse(
    readFileSync(`.github/workflows/${file}.yml`, "utf8"),
  ) as Workflow;
}
const request = workflow("release-request");
const publisher = workflow("release");

it("locks release publication behind the read-only default-branch validator", () => {
  expect(Object.keys(request.on).sort()).toEqual([
    "release",
    "workflow_dispatch",
  ]);
  expect(request.permissions).toEqual({});
  expect(request.jobs.request.permissions).toBeUndefined();
  expect(publisher.on).toEqual({
    workflow_run: { workflows: ["release request"], types: ["completed"] },
  });
  const { validate, notes, build, publish } = publisher.jobs;
  expect(validate.permissions).toEqual({ contents: "read" });
  expect(validate.if).toContain("github.ref == 'refs/heads/main'");
  expect(validate.if).toContain("github.ref_protected");
  expect(validate.steps[0].with?.ref).toBe("${{ github.sha }}");
  expect(notes.needs).toBe("validate");
  expect(build.needs).toBe("validate");
  expect(
    build.steps.find((step) => step.run?.includes("docker build"))?.run,
  ).toContain('--build-arg CONSOLE_BUILD_VERSION="v$VERSION"');
  expect(publish.needs).toEqual(["validate", "build", "notes"]);
  for (const job of [notes, build, publish]) {
    expect(job.steps[0].with).toMatchObject({
      ref: "${{ needs.validate.outputs.revision }}",
      "persist-credentials": false,
    });
  }
  const scan = build.steps.findIndex((step) =>
    step.uses?.startsWith("aquasecurity/trivy-action@"),
  );
  const push = build.steps.findIndex((step) =>
    step.run?.includes("docker push"),
  );
  expect(scan).toBeGreaterThan(0);
  expect(push).toBeGreaterThan(scan);
  for (const { steps } of [
    ...Object.values(request.jobs),
    ...Object.values(publisher.jobs),
  ]) {
    for (const { run } of steps) expect(run ?? "").not.toContain("${{");
  }
});

it.skipIf(process.platform !== "linux")(
  "validates pinned release and backfill revisions using offline Git and release fixtures",
  () => {
    const dir = mkdtempSync(join(tmpdir(), "console-release-"));
    const step = publisher.jobs.validate.steps.find(
      ({ id }) => id === "release",
    );
    expect(step?.run).toBeTypeOf("string");
    const output = join(dir, "output");
    const script = join(dir, "validate");
    const git = (...args: string[]) => {
      const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
      return result.stdout.trim();
    };
    try {
      git("init", "-q", "-b", "main");
      git("config", "user.name", "Synthetic Test");
      git("config", "user.email", "synthetic@example.invalid");
      writeFileSync(join(dir, "package.json"), '{"version":"1.2.3"}');
      git("add", "package.json");
      git("commit", "-qm", "published release");
      git("tag", "-am", "stable release", "v1.2.3");
      const release = git("rev-parse", "HEAD");
      git("commit", "--allow-empty", "-qm", "advance main");
      const main = git("rev-parse", "HEAD");
      // An equivalent branch name must never count as an exact release tag.
      git("branch", "v1.2.4");
      writeFileSync(
        script,
        `gh() { printf '%s\\n' "$RELEASE_FIXTURE"; }\n${step?.run}`,
      );
      const run = (
        event: string,
        sha: string,
        tag = "v1.2.3",
        draft = false,
      ) => {
        writeFileSync(output, "");
        return spawnSync("bash", ["-eo", "pipefail", script], {
          cwd: dir,
          encoding: "utf8",
          env: {
            NODE_ENV: "test",
            PATH: process.env.PATH,
            GITHUB_OUTPUT: output,
            REQUEST_TITLE: `Release request ${tag}`,
            REQUEST_EVENT: event,
            REQUEST_SHA: sha,
            RELEASE_FIXTURE: JSON.stringify({
              tagName: tag,
              isDraft: draft,
              isPrerelease: false,
              publishedAt: draft ? null : "2026-11-18T12:00:00Z",
            }),
          },
        });
      };
      for (const [event, sha] of [
        ["release", release],
        ["workflow_dispatch", main],
      ]) {
        const result = run(event, sha);
        expect(result.status, result.stderr).toBe(0);
        expect(readFileSync(output, "utf8")).toBe(
          `tag=v1.2.3\nversion=1.2.3\nrevision=${release}\n`,
        );
      }
      git("switch", "--quiet", "--detach", release);
      git("commit", "--allow-empty", "-qm", "unmerged candidate");
      git("tag", "v1.2.5");
      git("switch", "--quiet", "main");
      for (const result of [
        run("release", main),
        run("workflow_dispatch", main, "v1.2.4"),
        run("workflow_dispatch", main, "v1.2.3", true),
        run("workflow_dispatch", main, "v1.2.5"),
      ])
        expect(result.status).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

it.skipIf(process.platform !== "linux")(
  "keeps rolling aliases forward-only and records the digest for the exact version",
  () => {
    const dir = mkdtempSync(join(tmpdir(), "console-manifest-"));
    try {
      const manifest = publisher.jobs.publish.steps.find(
        ({ id }) => id === "manifest",
      );
      expect(manifest?.run).toBeTypeOf("string");
      const script = join(dir, "manifest");
      const calls = join(dir, "calls");
      const output = join(dir, "output");
      const summary = join(dir, "summary");
      const digest = `sha256:${"a".repeat(64)}`;
      writeFileSync(
        script,
        `git() { printf '%s\\n' v1.2.3 v1.2.4 v1.3.0 v1.3.1-rc.1; }
docker() {
  case "$*" in
    "login "*) cat >/dev/null ;;
    "buildx imagetools create "*) printf '%s\\n' "$@" >> "$CALLS" ;;
    "buildx imagetools inspect "*) printf '%s\\n' "$DIGEST_FIXTURE" ;;
    *) return 1 ;;
  esac
}
${manifest?.run}`,
      );
      for (const [version, aliases] of [
        ["1.2.3", []],
        ["1.2.4", ["1.2"]],
        ["1.3.0", ["1.3", "latest"]],
      ] as const) {
        writeFileSync(calls, "");
        writeFileSync(output, "");
        writeFileSync(summary, "");
        const result = spawnSync("bash", ["-eo", "pipefail", script], {
          encoding: "utf8",
          env: {
            NODE_ENV: "test",
            PATH: process.env.PATH,
            GITHUB_ACTOR: "synthetic",
            GH_TOKEN: "synthetic",
            GITHUB_OUTPUT: output,
            GITHUB_STEP_SUMMARY: summary,
            IMAGE: "fixture/image",
            V: version,
            CALLS: calls,
            DIGEST_FIXTURE: digest,
          },
        });
        expect(result.status, result.stderr).toBe(0);
        expect(readFileSync(calls, "utf8").trimEnd().split("\n")).toEqual([
          "buildx",
          "imagetools",
          "create",
          ...[version, ...aliases].flatMap((tag) => [
            "-t",
            `fixture/image:${tag}`,
          ]),
          `fixture/image:${version}-amd64`,
          `fixture/image:${version}-arm64`,
        ]);
        expect(readFileSync(output, "utf8")).toBe(`digest=${digest}\n`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
