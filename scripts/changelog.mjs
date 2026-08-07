#!/usr/bin/env node
/**
 * The half of releasing that release-please deliberately does not do
 * (plan 05 decisions 1 and 2).
 *
 * `skip-changelog` keeps the tool away from CHANGELOG.md, because this
 * repository's changelog is hand-written prose and CLAUDE.md says a change's
 * narrative is written once. release-please owns package.json, the tag and the
 * GitHub Release; these two verbs own the file it will not touch:
 *
 *   node scripts/changelog.mjs prepare 0.2.0   # cut [Unreleased] into a dated
 *                                              # section, bump README's pins
 *   node scripts/changelog.mjs notes 0.2.0     # print that section as release
 *                                              # notes (used by release.yml)
 *
 * The version to prepare is the one release-please proposes in its open
 * release PR's title.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

export const REPO = "https://github.com/OpenSDLC-Dev/managed-agent-console";

const HEADING = "## [Unreleased]";
const EMPTY = "Nothing yet.";
const VERSION = /^\d+\.\d+\.\d+$/;

/**
 * Move everything under `## [Unreleased]` into a dated section, restore the
 * placeholder, and repoint the compare-link footer.
 *
 * @param {string} text CHANGELOG.md
 * @param {{version: string, date: string, repo?: string}} opts
 * @returns {string}
 */
export function cutChangelog(text, { version, date, repo = REPO }) {
  if (!VERSION.test(version))
    throw new Error(`not a release version: ${version}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error(`not an ISO date: ${date}`);
  // Running twice must not leave two sections for one version.
  if (text.includes(`## [${version}]`)) {
    throw new Error(`CHANGELOG.md already has a [${version}] section`);
  }

  const { start, bodyEnd, body } = unreleased(text);
  if (!body.trim() || body.trim() === EMPTY) {
    throw new Error("nothing under [Unreleased] to release");
  }

  const previous = text.slice(bodyEnd).match(/^## \[(\d+\.\d+\.\d+)\]/m)?.[1];
  if (!previous) {
    throw new Error("CHANGELOG.md has no previous version to compare against");
  }

  const cut = `${HEADING}\n\n${EMPTY}\n\n## [${version}] - ${date}\n${body}`;
  let out = text.slice(0, start) + cut + text.slice(bodyEnd);

  const unreleasedLink = /^\[Unreleased\]: .*$/m;
  if (!unreleasedLink.test(out)) {
    throw new Error("CHANGELOG.md has no [Unreleased] link definition");
  }
  return out.replace(
    unreleasedLink,
    `[Unreleased]: ${repo}/compare/v${version}...HEAD\n` +
      `[${version}]: ${repo}/compare/v${previous}...v${version}`,
  );
}

/**
 * The body of one released section, as release notes.
 *
 * Repo-relative links are absolutised against the tag: a GitHub Release
 * resolves `./docs/…` against `/releases/`, not the repository root, so a
 * section copied verbatim would 404 on every link it carries.
 *
 * @param {string} text CHANGELOG.md
 * @param {{version: string, repo?: string}} opts
 * @returns {string}
 */
export function releaseNotes(text, { version, repo = REPO }) {
  if (!VERSION.test(version))
    throw new Error(`not a release version: ${version}`);
  // Scanned line by line rather than by a regex built from `version`: even with
  // the check above, interpolating a value into a pattern is the shape static
  // analysis flags, and this reads plainer anyway.
  const marker = `## [${version}] - `;
  const lines = text.split("\n");
  const at = lines.findIndex(
    (line) =>
      line.startsWith(marker) &&
      /^\d{4}-\d{2}-\d{2}$/.test(line.slice(marker.length).trim()),
  );
  if (at === -1) throw new Error(`CHANGELOG.md has no [${version}] section`);

  const rest = lines.slice(at + 1);
  const end = rest.findIndex(
    (line) => line.startsWith("## [") || line.startsWith("[Unreleased]: "),
  );
  const body = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
  if (!body) throw new Error(`the [${version}] section is empty`);
  return body.replace(/\]\(\.\//g, `](${repo}/blob/v${version}/`) + "\n";
}

/**
 * Repoint every version README states: its status line and its pinned image
 * references.
 *
 * README pins a version rather than `latest` because operators should pin —
 * and a pin nobody bumps documents an older image than the release it sits in.
 * The status line is the same hazard one paragraph up: release-please touches
 * only `package.json` and its manifest, so nothing else would ever correct it.
 *
 * @param {string} text
 * @param {{version: string}} opts
 * @returns {string}
 */
export function bumpReadme(text, { version }) {
  if (!VERSION.test(version))
    throw new Error(`not a release version: ${version}`);
  return text
    .replace(/(managed-agent-console:)\d+\.\d+\.\d+/g, `$1${version}`)
    .replace(/(\*\*Status: v)\d+\.\d+\.\d+/g, `$1${version}`);
}

/** Local calendar date — this changelog's dates are the maintainer's, not UTC's. */
export function today(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function unreleased(text) {
  const start = text.indexOf(`${HEADING}\n`);
  if (start === -1)
    throw new Error(`CHANGELOG.md has no \`${HEADING}\` heading`);
  const bodyStart = start + HEADING.length + 1;
  const next = text.indexOf("\n## [", bodyStart);
  if (next === -1) {
    throw new Error("CHANGELOG.md has no released section under [Unreleased]");
  }
  return { start, bodyEnd: next + 1, body: text.slice(bodyStart, next + 1) };
}

function main(argv) {
  const [verb, version] = argv;
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const changelog = join(root, "CHANGELOG.md");

  if (verb === "prepare") {
    const date = today();
    const readme = join(root, "README.md");
    writeFileSync(
      changelog,
      cutChangelog(readFileSync(changelog, "utf8"), { version, date }),
    );
    writeFileSync(
      readme,
      bumpReadme(readFileSync(readme, "utf8"), { version }),
    );
    console.error(
      `CHANGELOG.md: [Unreleased] -> [${version}] - ${date}\n` +
        `README.md: status line and image pins -> ${version}\n\n` +
        `Now write the section's lead-in by hand: what this release is, and the\n` +
        `platform version the live tier last ran green against (plan 05 decision 9).\n` +
        `Then land this as its own PR and merge release-please's release PR.`,
    );
    return;
  }
  if (verb === "notes") {
    process.stdout.write(
      releaseNotes(readFileSync(changelog, "utf8"), { version }),
    );
    return;
  }
  console.error(
    "usage:\n" +
      "  node scripts/changelog.mjs prepare <version>   e.g. 0.2.0\n" +
      "  node scripts/changelog.mjs notes <version>",
  );
  process.exit(2);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`changelog.mjs failed — ${error.message}`);
    process.exit(1);
  }
}
