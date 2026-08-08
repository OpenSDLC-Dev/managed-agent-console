#!/usr/bin/env node
/**
 * The half of releasing that release-please deliberately does not do
 * (plan 05 decisions 1 and 2).
 *
 * `skip-changelog` keeps the tool away from the changelog, because this
 * repository's changelog is hand-written prose and CLAUDE.md says a change's
 * narrative is written once. release-please owns package.json, the tag and the
 * GitHub Release; these two verbs own what it will not touch:
 *
 *   node scripts/changelog.mjs prepare 0.2.0   # move the current cycle into
 *                                              # docs/changelog/0.2.0.md,
 *                                              # index it, bump README
 *   node scripts/changelog.mjs notes 0.2.0     # print that file as release
 *                                              # notes (used by release.yml)
 *
 * **Released cycles live in their own files.** CHANGELOG.md holds only the
 * cycle in progress plus an index, because entries here are narrative
 * paragraphs — averaging ~300 words — and a single file accumulating them
 * makes every reader (and every agent) pay for the whole project's history to
 * read what changed this week.
 *
 * The version to prepare is the one release-please proposes in its open
 * release PR's title.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

export const REPO = "https://github.com/OpenSDLC-Dev/managed-agent-console";

const HEADING = "## [Unreleased]";
const INDEX = "## Released";
const EMPTY = "Nothing yet.";
const VERSION = /^\d+\.\d+\.\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Where a released cycle's file lives, relative to the repository root. */
export function sectionPath(version) {
  if (!VERSION.test(version))
    throw new Error(`not a release version: ${version}`);
  return `docs/changelog/${version}.md`;
}

/**
 * Split the cycle in progress out of CHANGELOG.md.
 *
 * @param {string} text CHANGELOG.md
 * @param {{version: string, date: string, repo?: string}} opts
 * @returns {{changelog: string, section: string}} the trimmed index file, and
 *   the released cycle's own file
 */
export function cutRelease(text, { version, date, repo = REPO }) {
  if (!VERSION.test(version))
    throw new Error(`not a release version: ${version}`);
  if (!ISO_DATE.test(date)) throw new Error(`not an ISO date: ${date}`);
  // Running twice must not index one version twice.
  if (text.includes(sectionPath(version))) {
    throw new Error(`CHANGELOG.md already indexes ${version}`);
  }

  const { start, bodyEnd, body } = unreleased(text);
  if (!body.trim() || body.trim() === EMPTY) {
    throw new Error("nothing under [Unreleased] to release");
  }

  // Entries cite the repository root as `./…` while they sit in CHANGELOG.md.
  // Two directories down, that same link has to climb back out.
  const section =
    `# ${version} — ${date}\n\n` +
    body.trim().replace(/\]\(\.\//g, "](../../") +
    "\n";

  // The blank line before the next heading is not cosmetic: `bodyEnd` lands on
  // `## Released`, so without it the placeholder and that heading collide and
  // every release cut leaves CHANGELOG.md failing `pnpm format:check`.
  const emptied =
    text.slice(0, start) + `${HEADING}\n\n${EMPTY}\n\n` + text.slice(bodyEnd);
  return { changelog: index(emptied, { version, date, repo }), section };
}

/**
 * A released cycle's file, as release notes.
 *
 * The title line goes — GitHub shows it beside the tag already — and links are
 * absolutised against the tag, because a release body resolves relative paths
 * against `/releases/`, not the repository, so every link would 404.
 *
 * The title has to *name this version* first. A file copied or renamed by hand
 * would otherwise publish one cycle's narrative under another cycle's tag, and
 * release.yml, which asks for notes by version, would have no way to tell.
 *
 * @param {string} section a `docs/changelog/X.Y.Z.md`
 * @param {{version: string, repo?: string}} opts
 * @returns {string}
 */
export function releaseNotes(section, { version, repo = REPO }) {
  if (!VERSION.test(version))
    throw new Error(`not a release version: ${version}`);
  // A string compare rather than a regex built from `version`: the same
  // CodeQL finding that turned the old section lookup into a line scan.
  const [title = "", ...rest] = section.split("\n");
  const date = title.startsWith(`# ${version} — `)
    ? title.slice(`# ${version} — `.length)
    : "";
  if (!ISO_DATE.test(date)) {
    throw new Error(
      `${sectionPath(version)} does not open with \`# ${version} — YYYY-MM-DD\``,
    );
  }
  const body = rest.join("\n").trim();
  if (!body) throw new Error(`${sectionPath(version)} has no entries`);
  return (
    body.replace(/\]\(\.\.\/\.\.\//g, `](${repo}/blob/v${version}/`) + "\n"
  );
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

/** Add the newest release to the index and repoint [Unreleased] at its tag. */
function index(text, { version, date, repo }) {
  const at = text.indexOf(`${INDEX}\n`);
  if (at === -1) throw new Error(`CHANGELOG.md has no \`${INDEX}\` heading`);
  const rowsStart = text.indexOf("\n- [", at);
  const previous =
    rowsStart === -1
      ? undefined
      : text.slice(rowsStart).match(/^- \[(\d+\.\d+\.\d+)\]/m)?.[1];
  const diff = previous
    ? `[compare](${repo}/compare/v${previous}...v${version})`
    : `[tag](${repo}/releases/tag/v${version})`;
  // The first release has no row to sit above, so it brings its own blank line.
  const row =
    `- [${version}](${sectionPath(version)}) — ${date} · ${diff}\n` +
    (previous ? "" : "\n");

  const insertAt = at + INDEX.length + 2; // past the heading and its blank line
  const out = text.slice(0, insertAt) + row + text.slice(insertAt);

  const link = /^\[Unreleased\]: .*$/m;
  if (!link.test(out)) {
    throw new Error("CHANGELOG.md has no [Unreleased] link definition");
  }
  return out.replace(link, `[Unreleased]: ${repo}/compare/v${version}...HEAD`);
}

function unreleased(text) {
  const start = text.indexOf(`${HEADING}\n`);
  if (start === -1)
    throw new Error(`CHANGELOG.md has no \`${HEADING}\` heading`);
  const bodyStart = start + HEADING.length + 1;
  const next = text.indexOf(`\n${INDEX}`, bodyStart);
  if (next === -1) {
    throw new Error(`CHANGELOG.md has no \`${INDEX}\` heading after it`);
  }
  return { start, bodyEnd: next + 1, body: text.slice(bodyStart, next + 1) };
}

function main(argv) {
  const [verb, version] = argv;
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const changelog = join(root, "CHANGELOG.md");
  const sectionFile = () => join(root, sectionPath(version));

  if (verb === "prepare") {
    const date = today();
    const readme = join(root, "README.md");
    const cut = cutRelease(readFileSync(changelog, "utf8"), { version, date });
    mkdirSync(join(root, "docs", "changelog"), { recursive: true });
    writeFileSync(sectionFile(), cut.section);
    writeFileSync(changelog, cut.changelog);
    writeFileSync(
      readme,
      bumpReadme(readFileSync(readme, "utf8"), { version }),
    );
    console.error(
      `${sectionPath(version)}: written, indexed in CHANGELOG.md\n` +
        `CHANGELOG.md: [Unreleased] emptied\n` +
        `README.md: status line and image pins -> ${version}\n\n` +
        `Now write that file's lead-in by hand: what this release is, and the\n` +
        `platform version the live tier last ran green against (plan 05 decision 9).\n` +
        `Then land this as its own PR and merge release-please's release PR.`,
    );
    return;
  }
  if (verb === "notes") {
    process.stdout.write(
      releaseNotes(readFileSync(sectionFile(), "utf8"), { version }),
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
