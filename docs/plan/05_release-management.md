---
status: archived
---

# Release management (plan 05)

Requested 2026-08-07. The console had been feature-complete since plan 03 and never released: no
tag, no image, `package.json` still at the scaffold's 0.1.0, and clone-and-build as the only way to
run it. Four slices, PRs #42–#54 plus release PR #46. Four decisions were the maintainer's before
drafting: GHCR images plus GitHub Releases, automate with release-please, the console's **own 0.x
semver** independent of the platform, and show the version in the sidebar.

The machinery is `.github/workflows/{release-please,release}.yml`, `release-please-config.json` and
`scripts/changelog.mjs`; how to cut one is [docs/releasing.md](../releasing.md).

## Decisions

1. **release-please owns the version, never the narrative** (`skip-changelog: true`). CHANGELOG.md
   stays hand-written, because "a change's narrative is written once" is what makes it worth reading.
   The conflict between tool and convention is dissolved rather than decided.
2. **The narrative cut is one scripted human step, and the release notes are the narrative.** The
   release workflow replaces release-please's commit-derived body with the changelog section, so a
   Release reads as prose rather than a list of PR titles.
3. **The release credential is a GitHub App, not a PAT.** With `GITHUB_TOKEN` the release PR collects
   no checks and `enforce_admins` makes it unmergeable. A fine-grained PAT would work, but the org's
   default policy caps them at **366 days** — the pipeline would break silently about a year out, the
   release PR simply ceasing to appear. An App mints a 1-hour token from a non-expiring key, is
   revoked by uninstalling, and is one workflow step from reversible.
4. **Conventional Commit PR titles, enforced in CI.** Squash merge makes the title the commit
   subject, so the title _is_ the bump signal — a lint job makes it a check rather than a hope.
5. **v0.1.0 was cut by hand, once, as the seed** — release-please needs a tag and a manifest entry to
   reason from, and doing it manually proved the changelog shape before a script had to reproduce it.
6. **Multi-arch, built natively, scanned before push.** amd64 and arm64 each build on their own
   runner and are trivy-gated _before_ anything is pushed, so a published tag is never one scan
   behind. This rules out the standard `push-by-digest` recipe, which pushes first and scans after.
7. **The version reaches the UI by importing `package.json` in a server component** — no
   `NEXT_PUBLIC_*`, no build arg, no runtime env. A unit test asserts the rendered string equals
   `package.json`'s version, so a bump that fails to reach the UI is a red test.
8. **No `/api/version` endpoint** — plan 04 decision 6's reasoning about credentialed images; the
   sidebar already serves the operator who needs it.
9. **Compatibility is stated, not enforced.** Each release records the platform version its live tier
   last ran green against. Inventing a version handshake the platform does not serve would violate
   principle 1; feature detection is issue #33's job.

## Known gaps (recorded, not addressed here)

Nothing verifies the published image actually **boots** — the workflow proves it builds and scans
clean. No SBOM, provenance attestation or signature (additive later; the OCI `source` label is the
prerequisite either way). The platform repo publishes no image, so the compose story is half-paved.
Prereleases are unconfigured.

## Declined (with reasons)

- **Letting release-please generate CHANGELOG.md** — it would prepend PR titles above prose that says
  the same things better, and CLAUDE.md would then be wrong about where a narrative lives.
- **A bot that pushes the changelog cut onto the release PR branch** — re-runs on every
  `synchronize`, must be idempotent, and races release-please's branch regeneration. Real complexity
  for one saved command.
- **QEMU-emulated arm64** — free arm runners exist for public repos; emulating a Next.js build is
  slower and more failure-prone.
- **Lockstep versioning with the platform** (maintainer's call: the console must be able to ship a
  fix without waiting for a platform release) and **CalVer** (semver's break signal is worth more to
  operators upgrading a deployment).
