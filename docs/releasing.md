# Releasing

How a console release is cut. The reasoning behind each choice is
[plan 05](./plan/05_release-management.md); the mechanics are
[release-please.yml](../.github/workflows/release-please.yml),
[release.yml](../.github/workflows/release.yml) and [scripts/changelog.mjs](../scripts/changelog.mjs).

## What a release is

- A `vX.Y.Z` tag on `main`, and a GitHub Release whose body is that version's
  `docs/changelog/X.Y.Z.md` — prose, not a list of PR titles.
- A multi-arch image at `ghcr.io/opensdlc-dev/managed-agent-console`, tagged `X.Y.Z`, `X.Y`, `latest`.

Versioning is the console's own 0.x semver, independent of the platform's. Each release **states**
the platform version its live tier last ran green against — a fact about what was exercised, not a
handshake the console enforces.

release-please owns the version, the tag and the Release, and never touches `CHANGELOG.md`
(`skip-changelog`). One step per release stays human: the narrative.

## Cutting one

1. **Land work with Conventional Commit PR titles.** Squash merge makes each title a commit subject;
   release-please reads them and keeps an open release PR proposing the next version.
2. **File the changelog section** for the version that PR proposes:

   ```bash
   pnpm release:prepare X.Y.Z
   ```

   This moves `## [Unreleased]` into `docs/changelog/X.Y.Z.md`, restores an empty `[Unreleased]`,
   indexes the version with a compare link, and bumps README's status line and pinned image tag.

   Then **write that file's lead-in by hand**: what this release is, and the platform version the
   live tier last ran green against. Only that file becomes the release notes, so a compatibility
   fact stated in an older release's file is one this release does not carry. Land it as its own PR,
   titled `docs: prepare X.Y.Z`.

3. **Merge release-please's release PR** — it bumps the version files, tags, and publishes the
   Release.
4. Publishing runs `release.yml` in two independent halves: **notes** replaces the release body with
   `docs/changelog/X.Y.Z.md` (it depends on nothing, so a release whose image fails to build still
   says what it is), and **build → publish** builds both architectures on native runners, each
   trivy-gated **before** anything is pushed, joined into one manifest list. Both halves are
   idempotent.

## If a release exists but has no image

The workflow triggers on a release being published, and a run can always be repeated:

```bash
gh workflow run release.yml -f tag=vX.Y.Z
```

A backfill publishes only its immutable `X.Y.Z`. The rolling `latest` and `X.Y` aliases move only
when the version being published really is the newest, so republishing an old tag cannot silently
downgrade whoever pulls `latest`. The build uses the tag's own tree, which is the point — the image
matches what the tag says.

## One-time setup

- **The GHCR package must be public** — done 2026-08-08. A container package is private on first
  publish even when its repository is public, and there is no REST endpoint for it: package page →
  Package settings → Change visibility → Public. Until then the README's `docker run` fails for
  everyone outside the org. Verify from a shell with no GHCR credentials:
  `docker buildx imagetools inspect ghcr.io/opensdlc-dev/managed-agent-console:X.Y.Z`.
- **The release automation runs as a GitHub App** (`RELEASE_BOT_APP_ID` variable,
  `RELEASE_BOT_PRIVATE_KEY` secret), not as `GITHUB_TOKEN`: a PR opened by `GITHUB_TOKEN` triggers no
  workflows, so it would never collect the checks `main` requires.
