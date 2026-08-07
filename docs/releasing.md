# Releasing

How a console release is cut and what it publishes. The reasoning behind each
choice is in [docs/plan/05_release-management.md](./plan/05_release-management.md).

## What a release is

- A `vX.Y.Z` tag on `main`, and a GitHub Release whose body is the matching
  `CHANGELOG.md` section — prose, not a list of PR titles.
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

## Cutting one

1. **Land work with Conventional Commit PR titles.** Squash merge makes each
   title a commit subject; release-please reads them and keeps an open release PR
   proposing the next version (`chore(main): release X.Y.Z`).
2. **File the changelog section** for the version that PR proposes:

   ```bash
   pnpm release:prepare X.Y.Z
   ```

   This moves everything under `## [Unreleased]` into `## [X.Y.Z] - YYYY-MM-DD`,
   restores an empty `[Unreleased]`, repoints the compare-link footer, and bumps
   README's pinned image tag. Land it as its own PR — title `docs: prepare X.Y.Z`.

3. **Merge release-please's release PR.** It bumps `package.json` and
   `.release-please-manifest.json`, tags `vX.Y.Z`, and publishes the GitHub
   Release.
4. Publishing that release runs [release.yml](../.github/workflows/release.yml),
   in two independent halves:
   - **notes** — replaces the release body with the `[X.Y.Z]` changelog section
     (release-please's own body is a list of PR titles; the section is the
     narrative). It depends on nothing, so a release whose image fails to build
     still says what it is.
   - **build → publish** — both architectures on native runners, each gated on
     trivy (HIGH/CRITICAL, unfixed ignored) **before** anything is pushed, joined
     into one manifest list, with the image coordinates and digest appended to
     the body notes wrote.

Repo-relative links in the section are absolutised against the tag on the way out
— a release body resolves `./docs/…` against `/releases/`, not the repository
root, so a section copied verbatim would 404 on every link it carries. Both
halves are idempotent: notes regenerates the body from the tag's own CHANGELOG,
and the image block is cut at its marker before being re-appended.

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

- **The GHCR package must be public.** A container package is private on first
  publish even when its repository is public, and
  `org.opencontainers.image.source` links the package to the repository without
  making it anonymously pullable. Until it is flipped, the README's `docker run`
  fails with an authorization error for everyone outside the org: package page →
  Package settings → Change visibility → Public.
- **The release automation runs as a GitHub App** (`RELEASE_BOT_APP_ID` variable,
  `RELEASE_BOT_PRIVATE_KEY` secret), not as `GITHUB_TOKEN`: a pull request opened
  by `GITHUB_TOKEN` triggers no workflows, so it would never collect the `ci-ok`
  and `docker` checks `main` requires, and `enforce_admins` means nobody could
  merge it. Fine-grained PATs were declined — the org policy caps them at 366
  days, so the pipeline would break silently about a year on.
