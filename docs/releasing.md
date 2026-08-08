# Releasing

How a console release is cut and what it publishes. The reasoning behind each
choice is in [docs/plan/05_release-management.md](./plan/05_release-management.md).

## What a release is

- A `vX.Y.Z` tag on `main`, and a GitHub Release whose body is that version's
  `docs/changelog/X.Y.Z.md` — prose, not a list of PR titles.
- A multi-arch image at `ghcr.io/opensdlc-dev/managed-agent-console`, tagged
  `X.Y.Z`, `X.Y`, and `latest`.

Versioning is the console's own 0.x semver, independent of the platform's. Each
release states the platform version its live tier last ran green against; that is
a fact about what was exercised, not a handshake the console enforces.

## Who does what

release-please owns the version number, the tag, and the GitHub Release. It
never touches `CHANGELOG.md` (`skip-changelog`), because this repository's
changelog is hand-written prose and CLAUDE.md says a change's narrative is
written once. So one step per release stays human — the one that requires a
human — and everything mechanical around it is automated.

The changelog is split by release: `CHANGELOG.md` carries only the cycle in
progress plus an index, and each released cycle becomes its own
`docs/changelog/X.Y.Z.md`, written once by the cut and never edited again.
Entries here are narrative paragraphs, so one accumulating file would make every
reader — and every agent — pay for the whole project's history to see what
changed this week.

## Cutting one

1. **Land work with Conventional Commit PR titles.** Squash merge makes each
   title a commit subject; release-please reads them and keeps an open release PR
   proposing the next version (`chore(main): release X.Y.Z`).
2. **File the changelog section** for the version that PR proposes:

   ```bash
   pnpm release:prepare X.Y.Z
   ```

   This moves everything under `## [Unreleased]` into `docs/changelog/X.Y.Z.md`,
   restores an empty `[Unreleased]`, adds the version to the `## Released` index
   with a compare link, repoints the compare-link footer, and bumps README's
   status line and pinned image tag.

   Then **write that file's lead-in by hand**: what this release is, and the
   platform version the live tier last ran green against. Only that file becomes
   the release notes, so a compatibility fact stated in an older release's file
   is a compatibility fact this release does not carry. Land it as its own PR —
   title `docs: prepare X.Y.Z`.

3. **Merge release-please's release PR.** It bumps `package.json` and
   `.release-please-manifest.json`, tags `vX.Y.Z`, and publishes the GitHub
   Release.
4. Publishing that release runs [release.yml](../.github/workflows/release.yml),
   in two independent halves:
   - **notes** — replaces the release body with `docs/changelog/X.Y.Z.md`
     (release-please's own body is a list of PR titles; that file is the
     narrative). It depends on nothing, so a release whose image fails to build
     still says what it is.
   - **build → publish** — both architectures on native runners, each gated on
     trivy (HIGH/CRITICAL, unfixed ignored) **before** anything is pushed, joined
     into one manifest list, with the image coordinates and digest appended to
     the body notes wrote.

Repo-relative links are rewritten twice, and for the same reason each time. The
cut turns `./docs/…` into `../../docs/…`, because the entries move two
directories down from where they were written; the notes step turns those into
absolute blob URLs at the tag, because a release body resolves relative paths
against `/releases/`, not the repository root, so a file copied verbatim would
404 on every link it carries. Both halves of the workflow are idempotent: notes
regenerates the body from the tag's own `docs/changelog/X.Y.Z.md`, and the image
block is cut at its marker before being re-appended.

## If a release exists but has no image

Publish an existing tag by hand — the workflow is triggered by a release being
published, and a run can always be repeated:

```bash
gh workflow run release.yml -f tag=vX.Y.Z
```

This is how `v0.1.0` got its image: the tag was pushed by the release cut, one
slice before the workflow that publishes images existed.

A backfill publishes only its immutable `X.Y.Z`. The rolling aliases `latest`
and `X.Y` move only when the version being published really is the newest (of
all tags, and of its own minor line respectively), so republishing an old tag
cannot silently downgrade whoever pulls `latest`. Publishes are serialized by a
workflow-level concurrency group for the same reason.

The build uses the tag's own tree, which is the point — the image matches what
the tag says. One consequence for `v0.1.0` specifically: that tree predates the
Dockerfile's OCI labels, so its image carries none, and the `--build-arg` the
workflow passes is simply unconsumed (a warning, not a failure). Labels start
with the first tag cut after this slice. Retagging `v0.1.0` to fix it would be
worse than the cosmetic gap it fixes.

## One-time setup

- **The GHCR package must be public** — done 2026-08-08 (issue #56). A container
  package is private on first publish even when its repository is public, and
  `org.opencontainers.image.source` links the package to the repository without
  making it anonymously pullable. Until it is flipped, the README's `docker run`
  fails with an authorization error for everyone outside the org: package page →
  Package settings → Change visibility → Public. There is no REST endpoint for
  this. If the console is ever published under a different package name, it
  applies again. Verify from a shell with no GHCR credentials:

  ```bash
  docker buildx imagetools inspect ghcr.io/opensdlc-dev/managed-agent-console:X.Y.Z
  ```

- **The release automation runs as a GitHub App** (`RELEASE_BOT_APP_ID` variable,
  `RELEASE_BOT_PRIVATE_KEY` secret), not as `GITHUB_TOKEN`: a pull request opened
  by `GITHUB_TOKEN` triggers no workflows, so it would never collect the `ci-ok`
  and `docker` checks `main` requires, and `enforce_admins` means nobody could
  merge it. Fine-grained PATs were declined — the org policy caps them at 366
  days, so the pipeline would break silently about a year on.
