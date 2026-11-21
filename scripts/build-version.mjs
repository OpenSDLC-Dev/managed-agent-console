import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const number = "(?:0|[1-9][0-9]*)";
const release = `v${number}\\.${number}\\.${number}`;
const stableTag = new RegExp(`^${release}$`);
const buildStamp = new RegExp(`^${release}(?:-dev-[0-9a-f]{8})?$`);

/** Resolve once at build time while the checkout is available. */
export function consoleBuildVersion(root = process.cwd(), supplied = "") {
  if (supplied) {
    if (!buildStamp.test(supplied)) {
      throw new Error(`Invalid Console build version: ${supplied}`);
    }
    return supplied;
  }
  if (!existsSync(join(root, ".git"))) return "";
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    return result.status === 0 ? result.stdout.trim() : "";
  };
  const sha = git("rev-parse", "--verify", "HEAD");
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(sha)) return "";
  const base = git(
    "tag",
    "--merged",
    sha,
    "--sort=-version:refname",
    "--list",
    "v[0-9]*",
  )
    .split(/\r?\n/)
    .find((tag) => stableTag.test(tag));
  return base ? `${base}-dev-${sha.slice(0, 8)}` : "";
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const stamp = consoleBuildVersion();
  if (stamp) {
    console.log(stamp);
  } else {
    console.error(
      "A Git checkout with a reachable stable release tag is required to stamp the Console image.",
    );
    process.exitCode = 1;
  }
}
