import { describe, expect, it } from "vitest";
import { bumpReadme, cutChangelog, releaseNotes, today } from "./changelog.mjs";

const CHANGELOG = `# Changelog

Notable changes, newest first.

## [Unreleased]

- **A thing landed** (2026-08-08): the narrative, citing [a file](./src/lib/utils.ts).
- **Another thing** (2026-08-08): more narrative.

## [0.1.0] - 2026-08-07

The first release.

- **Repo bootstrap** (2026-08-02): the beginning, see [the plan](./docs/plan/01_v1-console.md).

[Unreleased]: https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/OpenSDLC-Dev/managed-agent-console/releases/tag/v0.1.0
`;

const EMPTY_CHANGELOG = CHANGELOG.replace(
  /- \*\*A thing landed\*\*.*\n- \*\*Another thing\*\*.*/,
  "Nothing yet.",
);

describe("cutChangelog", () => {
  it("moves the Unreleased body into a dated section and restores the placeholder", () => {
    const out = cutChangelog(CHANGELOG, {
      version: "0.2.0",
      date: "2026-08-09",
    });

    expect(out).toContain(
      "## [Unreleased]\n\nNothing yet.\n\n## [0.2.0] - 2026-08-09\n\n- **A thing landed**",
    );
    // Moved, not copied: the entry appears once, below the new heading.
    expect(out.match(/A thing landed/g)).toHaveLength(1);
    expect(out.indexOf("A thing landed")).toBeGreaterThan(
      out.indexOf("## [0.2.0]"),
    );
    // Everything already released is untouched.
    expect(out).toContain("## [0.1.0] - 2026-08-07");
    expect(out).toContain("- **Repo bootstrap** (2026-08-02):");
  });

  it("points [Unreleased] at the new tag and gives the new version its own compare link", () => {
    const out = cutChangelog(CHANGELOG, {
      version: "0.2.0",
      date: "2026-08-09",
    });

    expect(out).toContain(
      "[Unreleased]: https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.2.0...HEAD",
    );
    expect(out).toContain(
      "[0.2.0]: https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.1.0...v0.2.0",
    );
    expect(out).toContain(
      "[0.1.0]: https://github.com/OpenSDLC-Dev/managed-agent-console/releases/tag/v0.1.0",
    );
  });

  it("refuses to cut a release with nothing under [Unreleased]", () => {
    expect(() =>
      cutChangelog(EMPTY_CHANGELOG, { version: "0.2.0", date: "2026-08-09" }),
    ).toThrow(/nothing under \[Unreleased\]/);
  });

  it("refuses to cut the same version twice", () => {
    const once = cutChangelog(CHANGELOG, {
      version: "0.2.0",
      date: "2026-08-09",
    });

    expect(() =>
      cutChangelog(once, { version: "0.2.0", date: "2026-08-10" }),
    ).toThrow(/already has a \[0\.2\.0\] section/);
  });

  it("rejects anything that is not a release version and an ISO date", () => {
    for (const version of ["v0.2.0", "0.2", "0.2.0-rc.1"]) {
      expect(() =>
        cutChangelog(CHANGELOG, { version, date: "2026-08-09" }),
      ).toThrow(/not a release version/);
    }
    expect(() =>
      cutChangelog(CHANGELOG, { version: "0.2.0", date: "9 Aug 2026" }),
    ).toThrow(/not an ISO date/);
  });

  it("names the missing structure instead of corrupting the file", () => {
    expect(() =>
      cutChangelog("# Changelog\n\n## [0.1.0] - 2026-08-07\n\nx\n", {
        version: "0.2.0",
        date: "2026-08-09",
      }),
    ).toThrow(/no `## \[Unreleased\]` heading/);
    expect(() =>
      cutChangelog("# Changelog\n\n## [Unreleased]\n\n- a thing\n", {
        version: "0.2.0",
        date: "2026-08-09",
      }),
    ).toThrow(/no released section/);
  });
});

describe("releaseNotes", () => {
  it("returns one section's body and stops at the next heading", () => {
    const notes = releaseNotes(CHANGELOG, { version: "0.1.0" });

    expect(notes).toContain("The first release.");
    expect(notes).toContain("- **Repo bootstrap** (2026-08-02):");
    expect(notes).not.toContain("## [");
    expect(notes).not.toContain("[Unreleased]:");
  });

  it("absolutises repo-relative links against the tag", () => {
    const notes = releaseNotes(CHANGELOG, { version: "0.1.0" });

    expect(notes).toContain(
      "[the plan](https://github.com/OpenSDLC-Dev/managed-agent-console/blob/v0.1.0/docs/plan/01_v1-console.md)",
    );
    expect(notes).not.toContain("](./");
  });

  it("throws rather than returning an empty body for a version it cannot find", () => {
    expect(() => releaseNotes(CHANGELOG, { version: "9.9.9" })).toThrow(
      /no \[9\.9\.9\] section/,
    );
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
