# Releasing

How a console release is cut. The reasoning behind each choice is
[plan 05](./plan/05_release-management.md); the mechanics are
[release-please.yml](../.github/workflows/release-please.yml),
[release.yml](../.github/workflows/release.yml) and [scripts/changelog.mjs](../scripts/changelog.mjs).

## Non-release SHA channel

Check the platform's [active release holds](https://github.com/OpenSDLC-Dev/managed-agent-platform/blob/main/STATE.md)
before merging a release-please PR, cutting a SemVer release or dispatching
`release.yml`, including for an existing tag. While a hold applies, wait.

The platform owns staging deployment and rollback. This repository publishes
the Console image. See [deployment ownership](./deploy-gcp.md).

On a trusted repository push to `main`, `ci.yml` waits for both `ci-ok` and the Docker vulnerability gate.
It builds amd64 and arm64 on native runners, labels the full checked-out source SHA, and scans each child before push.
Run-unique staging tags feed one `sha-<full commit>` manifest tag. No SemVer alias, `latest`, Git tag or Release is created.
The tag may move on a rerun. Deployments must pin the verified index digest, not this mutable tag.

Before a platform deployment consumes that image, verify:

- The exact merged source SHA and successful completed publisher jobs.
- A public manifest index with runnable linux/amd64 and linux/arm64 children.
- Each child's source, revision and `sha-<full commit>` version labels.
- The index digest and compatible platform source SHA recorded for the deployment.

Local publisher tests exercise parsed workflow gates and stubbed shell commands. They do not prove an image was published.
The native integration tier exercises real handlers from the supplied platform checkout; it is not release compatibility certification.

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
4. The published Release starts [the read-only request workflow](../.github/workflows/release-request.yml).
   The publisher runs from protected `main` and verifies that the published `vX.Y.Z` tag points
   to a commit on `main` with the same package version. It pins that commit for notes and image
   builds. Notes run independently of the image build. Both native architecture builds must pass
   the Trivy gate before the publisher joins the images into one manifest list.

## If a release exists but has no image

The workflow triggers on a release being published, and a run can always be repeated:

```bash
gh workflow run release-request.yml --ref main -f tag=vX.Y.Z
```

Use this dispatch for historical releases. GitHub reruns use the original workflow revision.

A backfill publishes the existing release's `X.Y.Z` image from the validated tag commit.
The rolling `latest` and `X.Y` aliases advance only if the release is still the newest stable tag
overall or in its minor version, respectively.

## One-time setup

- **The GHCR package must be public** — done 2026-08-08. A container package is private on first
  publish even when its repository is public, and there is no REST endpoint for it: package page →
  Package settings → Change visibility → Public. Until then image pulls fail for
  everyone outside the org. Verify from a shell with no GHCR credentials:
  `docker buildx imagetools inspect ghcr.io/opensdlc-dev/managed-agent-console:X.Y.Z`.
- **The release automation runs as a GitHub App** (`RELEASE_BOT_APP_ID` variable,
  `RELEASE_BOT_PRIVATE_KEY` secret), not as `GITHUB_TOKEN`: a PR opened by `GITHUB_TOKEN` triggers no
  workflows, so it would never collect the checks `main` requires.
