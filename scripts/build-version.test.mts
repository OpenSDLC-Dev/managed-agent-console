// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { consoleBuildVersion } from "./build-version.mjs";

it("stamps a development checkout with its own reachable stable release and commit", () => {
  const root = mkdtempSync(join(tmpdir(), "console-build-version-"));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const commit = (message: string) =>
    git(
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "commit.gpgSign=false",
      "commit",
      "--allow-empty",
      "-qm",
      message,
    );
  try {
    git("init", "-q", "-b", "main");
    git("config", "column.ui", "always");
    commit("initial release");
    git("tag", "v0.9.0");
    git("switch", "-qc", "other");
    commit("another release line");
    git("tag", "v8.0.0");
    git("switch", "-q", "main");
    commit("release");
    git("tag", "v0.10.0");
    commit("next change");
    git("tag", "v1.0.0-rc.1");
    git("tag", "v8.0.0+metadata");
    const revision = git("rev-parse", "HEAD").slice(0, 8);
    expect(consoleBuildVersion(root)).toBe(`v0.10.0-dev-${revision}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("carries the publisher's stamp into a source-only build", () => {
  expect(consoleBuildVersion(tmpdir(), "v1.2.3")).toBe("v1.2.3");
  expect(consoleBuildVersion(tmpdir(), "v0.9.1-dev-41a8318b")).toBe(
    "v0.9.1-dev-41a8318b",
  );
  expect(consoleBuildVersion(tmpdir())).toBe("");
  expect(() => consoleBuildVersion(tmpdir(), "sha-unknown")).toThrow();
});
