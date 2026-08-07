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

## Cutting one

1. **File the changelog section.** `## [Unreleased]` becomes
   `## [X.Y.Z] - YYYY-MM-DD`, a fresh empty `[Unreleased]` goes above it with
   `Nothing yet.`, and the compare-link footer gains the new pair. Bump the image
   tag in README's quickstart in the same PR. Land it, then sync `main`.
2. **Tag `main` at the merge commit:**

   ```bash
   git checkout main && git pull
   git tag -a vX.Y.Z -m "vX.Y.Z — <one line>"
   git push origin vX.Y.Z
   ```

3. **Create the GitHub Release** from that changelog section. Extract it, and
   rewrite the repo-relative links — a release body resolves `./docs/...` against
   `/releases/`, not against the repository root, so every link in a
   copied-verbatim section would 404:

   ```bash
   awk '/^## \[X\.Y\.Z\] - /{f=1;next} /^\[Unreleased\]: /{f=0} f' CHANGELOG.md \
     | sed 's#](\./#](https://github.com/OpenSDLC-Dev/managed-agent-console/blob/vX.Y.Z/#g' \
     > /tmp/notes.md
   gh release create vX.Y.Z --title "vX.Y.Z — <one line>" --notes-file /tmp/notes.md --verify-tag
   ```

4. The tag push runs [release.yml](../.github/workflows/release.yml), which builds
   both architectures on native runners, gates each on trivy (HIGH/CRITICAL,
   unfixed ignored) **before** pushing anything, joins the two scanned images into
   one manifest list, and appends the image coordinates and digest to the Release.

## If a tag already exists but has no image

Tag-push triggers do not fire retroactively. Publish an existing tag by hand:

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
