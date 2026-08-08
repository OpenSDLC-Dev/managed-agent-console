import { describe, expect, it } from "vitest";
import {
  bumpReadme,
  cutRelease,
  releaseNotes,
  sectionPath,
  today,
} from "./changelog.mjs";

const REPO = "https://github.com/OpenSDLC-Dev/managed-agent-console";

const CHANGELOG = `# Changelog

Notable changes, newest first.

## [Unreleased]

- **A thing landed** (2026-08-08): the narrative, citing [a file](./src/lib/utils.ts).
- **Another thing** (2026-08-08): more narrative.

## Released

- [0.1.0](docs/changelog/0.1.0.md) — 2026-08-07 · [tag](${REPO}/releases/tag/v0.1.0)

[Unreleased]: ${REPO}/compare/v0.1.0...HEAD
`;

const FIRST_RELEASE = `# Changelog

Notable changes, newest first.

## [Unreleased]

- **Repo bootstrap** (2026-08-02): the beginning.

## Released

[Unreleased]: ${REPO}/compare/HEAD...HEAD
`;

const EMPTY_CHANGELOG = CHANGELOG.replace(
  /- \*\*A thing landed\*\*.*\n- \*\*Another thing\*\*.*/,
  "Nothing yet.",
);

const cut = (text = CHANGELOG, version = "0.2.0", date = "2026-08-09") =>
  cutRelease(text, { version, date });

describe("cutRelease", () => {
  it("moves the cycle into its own file and empties [Unreleased]", () => {
    const { changelog, section } = cut();

    expect(section).toContain("# 0.2.0 — 2026-08-09");
    expect(section).toContain("- **A thing landed**");
    expect(section).toContain("- **Another thing**");
    // Moved, not copied.
    expect(changelog).not.toContain("A thing landed");
    expect(changelog).toContain("## [Unreleased]\n\nNothing yet.\n");
  });

  it("climbs back out of docs/changelog when it rewrites the entries' links", () => {
    // `./src/…` is written relative to the repository root, which is two
    // directories up from where the section lands.
    const { section } = cut();

    expect(section).toContain("[a file](../../src/lib/utils.ts)");
    expect(section).not.toContain("](./");
  });

  it("indexes the release against the one it succeeds", () => {
    const { changelog } = cut();

    expect(changelog).toContain(
      `- [0.2.0](docs/changelog/0.2.0.md) — 2026-08-09 · [compare](${REPO}/compare/v0.1.0...v0.2.0)`,
    );
    // Newest first, and the older row survives.
    expect(changelog.indexOf("[0.2.0](")).toBeLessThan(
      changelog.indexOf("[0.1.0]("),
    );
    expect(changelog).toContain(`[Unreleased]: ${REPO}/compare/v0.2.0...HEAD`);
  });

  it("links a first release to its tag, there being nothing to compare against", () => {
    const { changelog } = cutRelease(FIRST_RELEASE, {
      version: "0.1.0",
      date: "2026-08-07",
    });

    expect(changelog).toContain(
      `- [0.1.0](docs/changelog/0.1.0.md) — 2026-08-07 · [tag](${REPO}/releases/tag/v0.1.0)`,
    );
    // The row brings its own blank line rather than butting against the footer.
    expect(changelog).toContain(`v0.1.0)\n\n[Unreleased]:`);
  });

  it("refuses to cut a release with nothing under [Unreleased]", () => {
    expect(() => cut(EMPTY_CHANGELOG)).toThrow(/nothing under \[Unreleased\]/);
  });

  it("refuses to index the same version twice", () => {
    const once = cut().changelog;

    expect(() => cut(once)).toThrow(/already indexes 0\.2\.0/);
  });

  it("rejects anything that is not a release version and an ISO date", () => {
    for (const version of ["v0.2.0", "0.2", "0.2.0-rc.1"]) {
      expect(() => cut(CHANGELOG, version)).toThrow(/not a release version/);
    }
    expect(() => cut(CHANGELOG, "0.2.0", "9 Aug 2026")).toThrow(
      /not an ISO date/,
    );
  });

  it("names the missing structure instead of corrupting the file", () => {
    expect(() => cut("# Changelog\n\n## Released\n\nx\n")).toThrow(
      /no `## \[Unreleased\]` heading/,
    );
    expect(() => cut("# Changelog\n\n## [Unreleased]\n\n- a thing\n")).toThrow(
      /no `## Released` heading/,
    );
  });
});

describe("releaseNotes", () => {
  it("drops the title and absolutises the entries' links against the tag", () => {
    const { section } = cut();

    const notes = releaseNotes(section, { version: "0.2.0" });

    expect(notes).not.toContain("# 0.2.0 —");
    expect(notes).toContain("- **A thing landed**");
    expect(notes).toContain(`[a file](${REPO}/blob/v0.2.0/src/lib/utils.ts)`);
    expect(notes).not.toContain("](../../");
  });

  it("throws rather than publishing an empty body", () => {
    expect(() =>
      releaseNotes("# 0.2.0 — 2026-08-09\n", { version: "0.2.0" }),
    ).toThrow(/no entries/);
  });
});

describe("sectionPath", () => {
  it("is where prepare writes and notes reads", () => {
    expect(sectionPath("0.2.0")).toBe("docs/changelog/0.2.0.md");
    expect(() => sectionPath("latest")).toThrow(/not a release version/);
  });
});

describe("bumpReadme", () => {
  it("repoints every pinned image reference", () => {
    const readme = [
      "  ghcr.io/opensdlc-dev/managed-agent-console:0.1.0",
      "image: ghcr.io/opensdlc-dev/managed-agent-console:0.1.0",
    ].join("\n");

    expect(bumpReadme(readme, { version: "0.2.0" })).toBe(
      [
        "  ghcr.io/opensdlc-dev/managed-agent-console:0.2.0",
        "image: ghcr.io/opensdlc-dev/managed-agent-console:0.2.0",
      ].join("\n"),
    );
  });

  it("repoints the status line, which nothing else would ever correct", () => {
    // release-please touches package.json and its manifest and nothing else,
    // so a status line left behind would contradict the release it sits in.
    const readme = "**Status: v0.1.0 — the v1 feature set is complete.** More.";

    expect(bumpReadme(readme, { version: "0.2.0" })).toBe(
      "**Status: v0.2.0 — the v1 feature set is complete.** More.",
    );
  });

  it("leaves rolling tags and other images alone", () => {
    const text =
      "managed-agent-console:latest and managed-agent-platform:0.1.0 and node:24-alpine";

    expect(bumpReadme(text, { version: "0.2.0" })).toBe(text);
  });
});

describe("today", () => {
  it("formats the local calendar date, zero-padded", () => {
    expect(today(new Date(2026, 7, 9))).toBe("2026-08-09");
    expect(today(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});
