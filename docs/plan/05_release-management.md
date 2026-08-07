---
status: archived
---

# Release management — the console gets versions, tags, and an image anyone can run

Requested 2026-08-07. The console has been feature-complete since plan 03 and verification-hardened
since plan 04, and in that whole time it has never been released: an operator who wants to run it
must clone the repository and build the image themselves. This plan gives the project a version
identity, an automated cut, a published multi-arch image, and a running console that can say which
version it is.

Four decisions were taken by the maintainer before drafting (2026-08-07): publish **GHCR images plus
GitHub Releases**; automate the cut with **release-please**; version the console on its **own 0.x
semver**, independent of the platform; and **show the version in the sidebar**.

## Ground truth (verified 2026-08-07 against this checkout)

- **There has never been a release.** `git tag -l` returns nothing; `gh release list` returns
  nothing. `package.json` says `"version": "0.1.0"`, added by the scaffold commit (#1) and never
  changed in the 35 commits since — the only `version` line in that file's whole history.
- **The changelog is one 41 KB `## Unreleased` pile.** `grep "^## " CHANGELOG.md` matches exactly
  one line. There are no version sections and no compare-link footer; every change since bootstrap is
  filed as unreleased.
- **CI builds the image and throws it away.** [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
  has a `docker` job that runs `docker build -t managed-agent-console:ci .` and gates it with trivy
  (HIGH/CRITICAL, `ignore-unfixed`), but nothing pushes anywhere. [README.md](../../README.md)'s
  Quickstart is `docker build -t managed-agent-console .` — clone-and-build is the only supported
  path to a running console.
- **`main` is protected in a way that matters here.** `required_status_checks.contexts` is
  `["ci-ok", "docker"]`, `enforce_admins` is `true`, `required_conversation_resolution` is `true`,
  `required_approving_review_count` is `0`. A pull request whose head commit has no `ci-ok`/`docker`
  check **cannot be merged by anyone, including an admin**.
- **Commit subjects are prose, not Conventional Commits.** The last 20 squash-merge subjects read
  `Plan 04 slice 3: semantic state attributes replace formatted-text assertions (#36)`; Dependabot's
  read `Bump actions/checkout from 4.4.0 to 7.0.1 (#18)`. Nothing today would give release-please a
  bump signal.
- **The sidebar has a bottom stack with room for one more line.**
  [src/app/(console)/layout.tsx](<../../src/app/(console)/layout.tsx>) is a **server** component whose
  `<aside>` ends with `ThemeToggle`, a "Platform documentation ↗" link, and `ConnectionStatus`.
  [tsconfig.json](../../tsconfig.json) sets `resolveJsonModule: true`, so a server component can
  import `package.json` and read `version` with no build plumbing and no client-bundle cost.
- **The platform repo's precedent covers half of this.** `../managed-agent-platform` has a `v0.1.0`
  tag, a Keep-a-Changelog `CHANGELOG.md` with `## [Unreleased]` / `## [0.1.0] - 2026-07-17` sections
  and a compare-link footer, and cut it by hand in "Cut release 0.1.0 (#82)" — a PR that moved the
  Unreleased content into a dated section, followed by a tag on `main` after the squash merge. It has
  **no** release workflow and publishes **no** image (`deploy/compose` still says
  `managed-agent-platform:local`). So: mirror its changelog and tag conventions; the automation and
  the image are new ground this repo breaks first.

### Verified externally (2026-08-07)

- release-please's manifest config has **`skip-changelog`** — "Skip updating the changelog. Absence
  defaults to false" ([manifest-releaser.md](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md)).
  This is the hinge that lets the tool own versions without owning our narrative.
- `googleapis/release-please-action@v4` outputs `release_created`, `tag_name`, `version`, `major`,
  `minor`, `patch`, `sha`, `body`, `html_url`, `upload_url` — enough to chain an image job off a cut.
- The action's README states the reason it recommends a PAT over `GITHUB_TOKEN`: _"When you use the
  repository's `GITHUB_TOKEN` to perform tasks, events triggered by the `GITHUB_TOKEN` will not create
  a new workflow run."_ Combined with our branch protection, this is not a preference — with
  `GITHUB_TOKEN` the release PR would be **permanently unmergeable**.
- GitHub-hosted `ubuntu-24.04-arm` runners are free for public repositories (public preview since
  2025-01-16, extended to private repos 2026-01). This repo is public, so arm64 can be built
  **natively** rather than under QEMU emulation.

## Design decisions

1. **release-please owns the version, never the narrative.** `skip-changelog: true`. The tool bumps
   `package.json` + `.release-please-manifest.json`, opens the release PR, tags, and creates the
   GitHub Release. `CHANGELOG.md` stays hand-written, because CLAUDE.md's "a change's narrative is
   written once" is the reason this project's changelog is worth reading. This was named as a
   conflict when the automation was chosen; `skip-changelog` is how the conflict is dissolved rather
   than decided.
2. **The narrative cut is one scripted human step, and the release notes are the narrative.**
   Per release: release-please proposes a version in its PR title → the maintainer runs
   `pnpm changelog:cut <version>` and lands that one-file PR (`## Unreleased` becomes
   `## [X.Y.Z] - YYYY-MM-DD`, a fresh empty `## Unreleased` goes above it, the compare-link footer
   updates) → merging the release PR tags and releases. The release workflow then **replaces**
   release-please's commit-derived release body with that changelog section
   (`gh release edit --notes-file`), so the GitHub Release reads as prose, not as a list of PR titles.
   Everything mechanical is automated; the one human step is the one that requires a human.
3. **A non-`GITHUB_TOKEN` credential is a hard prerequisite, and it is a GitHub App.** See ground
   truth: with `GITHUB_TOKEN` the release PR gets no `ci-ok`/`docker` check and `enforce_admins` makes
   it unmergeable, so slice 3 cannot land before the credential exists. A fine-grained PAT would work
   and is five minutes of setup, but it was declined on expiry: GitHub's default policy for
   organizations caps fine-grained PATs at **366 days**, and this repository lives in the
   `OpenSDLC-Dev` org — so a PAT breaks the release pipeline roughly a year out, silently (the release
   PR simply stops appearing). A GitHub App mints a 1-hour installation token per run from a private
   key that does not expire, attributes its actions to a bot rather than to the maintainer's account
   (`"API requests made by an app installation are attributed to the app"`), is revoked by uninstalling
   rather than by auditing a personal account, and is installable on `managed-agent-platform` when the
   same automation goes there. Concretely: `APP_ID` as a repo variable, the private key as a secret,
   and an `actions/create-github-app-token` step (SHA-pinned like every other action here) feeding
   `token:` to the release-please action. The two are one workflow step apart, so this is reversible
   if the App ever becomes the friction.
4. **Conventional Commit PR titles become the convention, enforced in CI.** Squash merge uses the PR
   title as the commit subject, so the title _is_ the bump signal. CLAUDE.md's iteration workflow
   grows the rule; a PR-title lint job makes it a check rather than a hope. `dependabot.yml` gets
   `commit-message.prefix: chore` so dependency PRs stop being unparseable. Existing history stays as
   it is — release-please only reads commits after the last release tag, and slice 1 plants that tag.
5. **v0.1.0 is cut by hand, once, as the seed.** release-please needs a tag and a manifest entry to
   reason from, and the 41 KB of existing narrative needs to land under a version heading. Doing it by
   hand also proves the changelog shape before a script has to reproduce it, and it mirrors the
   platform's PR #82 exactly.
6. **Multi-arch, built natively, scanned before push.** `linux/amd64` on `ubuntu-latest` and
   `linux/arm64` on `ubuntu-24.04-arm`, joined into a manifest list — QEMU emulation of a Next.js
   build is slow enough to be its own reason not to. trivy gates each architecture's image **before**
   anything is pushed, so a published tag is never one CI's scan behind. Tags: `X.Y.Z`, `X.Y`,
   `latest`.
7. **The version reaches the UI by importing `package.json` in a server component.** No
   `NEXT_PUBLIC_*` (principle 2 keeps that channel clean by habit, not only for credentials), no build
   arg, no runtime env. A unit test asserts the rendered string equals `package.json`'s `version`, so
   a bump that fails to reach the UI is a red test rather than a wrong number in front of an operator.
8. **No `/api/version` endpoint.** Plan 04 decision 6 declined a `/verify` route on the grounds that
   this console ships as a credentialed operator image where a route enumerating internal state is a
   liability. A version string is a mild case of the same class; the sidebar already serves the
   operator who needs it.
9. **Compatibility is stated, not enforced.** Each release records the platform version its live tier
   last ran green against ("Verified against managed-agent-platform vX.Y.Z"). The console does not
   gate on a platform version — feature detection is issue #33's job, and inventing a version
   handshake the platform does not serve would violate principle 1.

## Slices (each lands as its own PR; docs move with the code per CLAUDE.md)

**Slice 1 — cut v0.1.0 by hand.** `CHANGELOG.md` grows the Keep-a-Changelog frame the platform uses:
the existing pile becomes `## [0.1.0] - 2026-08-07`, an empty `## [Unreleased]` goes above it, and a
compare-link footer lands at the bottom. `package.json` stays `0.1.0` (it was right all along). README's status line and STATE.md note the
release. After the squash merge: tag `v0.1.0` on `main` and create the GitHub Release from that
section. No code changes, no fidelity implications. `.release-please-manifest.json` is deliberately
**not** seeded here — a manifest with no config beside it is dead config for two slices; it lands in
slice 3 where it first means something, reading the `v0.1.0` this slice plants.

**Slice 2 — publish the image.** `Dockerfile` gains OCI labels (`org.opencontainers.image.source` is
the one that links the GHCR package to this repo, plus `title`, `description`, `licenses`, `version`).
`.github/workflows/release.yml` builds both architectures natively, scans each with the same trivy
gate CI uses, pushes `ghcr.io/opensdlc-dev/managed-agent-console:{X.Y.Z,X.Y,latest}`, and attaches the
digest to the release. README's Quickstart switches from `docker build` to
`docker run ghcr.io/opensdlc-dev/managed-agent-console:X.Y.Z`, and the compose snippet's `build:` line
becomes an `image:` line. `docs/releasing.md` documents the whole flow end to end. Triggered by tag
push for now, so it works before slice 3 exists and keeps working after — **plus `workflow_dispatch`
taking a tag input**, because tag-push triggers do not fire retroactively and slice 1's `v0.1.0` is
pushed before this workflow exists: without a manual path, the README would point at a tag that never
produced an image. Two one-time steps belong to this slice and are recorded in `docs/releasing.md`,
not left to be rediscovered: dispatching the workflow once against `v0.1.0`, and **flipping the GHCR
package to public** — a container package is private on first publish even when its repository is
public, and the OCI `source` label links the package without making it anonymously pullable, so the
unauthenticated `docker run` this slice puts in the README would 401 for every external reader.

**Slice 3 — automate the cut.** `release-please-config.json` (`release-type: node`,
`skip-changelog: true`, `bump-minor-pre-major: true`), `.release-please-manifest.json` seeded
`{".": "0.1.0"}` to match slice 1's tag, and the workflow that runs the action on an App
installation token; `release.yml` chains off `release_created` instead of a manual tag push, and rewrites
the release body from the changelog section. `scripts/cut-changelog.mjs` + a `changelog:cut` script
implement decision 2's transform, with a unit test over the transform (idempotence, footer links, an
empty Unreleased refusing to cut). CLAUDE.md's iteration workflow gains the Conventional-Commit title
rule; a PR-title lint job enforces it; `dependabot.yml` gets `commit-message.prefix: chore`.
Prerequisite: the GitHub App credential of decision 3 must exist before this slice can land.

**Slice 4 — the console says which version it is.** A line in the sidebar's bottom stack, server
rendered from `package.json`, styled as the muted 13px sibling of the platform-documentation link. A
unit test pins it to `package.json`'s version. The sidebar is global, so this is a 28-surface change:
the full fidelity manifest is re-shot in both themes (56 shots) as PR #40 did, and
`docs/design-reference.md` records the divergence — the reference console shows no version, and this
one does, because a self-hosted deployment has no other way to know what it is running.

## Known gaps (recorded, not addressed here)

- **Nothing verifies the published image actually boots.** The release workflow proves it builds and
  scans clean; a smoke run (`docker run` + hit `/` through the login gate) is a natural follow-up but
  needs a mock platform reachable from the workflow.
- **No SBOM, provenance attestation, or signature.** The maintainer chose image + Release without the
  supply-chain tier. `actions/attest-build-provenance` and cosign are additive later; the OCI
  `source` label from slice 2 is the prerequisite either way.
- **The platform repo publishes no image.** A console image that is `docker run`-able next to a
  platform that is not leaves the compose story half-paved. Cross-repo; out of scope here.
- **Prereleases are unconfigured.** `0.x` with `bump-minor-pre-major` covers the near term; if an RC
  tier is ever wanted, release-please's `prerelease`/`prerelease-type` are the knobs.

## Declined (with reasons)

- **Letting release-please generate `CHANGELOG.md`.** It would prepend a list of PR titles above 41 KB
  of prose that says the same things better, and CLAUDE.md would then be wrong about where a change's
  narrative lives. `skip-changelog` exists precisely for this.
- **A bot that pushes the changelog cut onto the release PR branch.** Fully hands-off, and technically
  workable (push with the same PAT so checks re-run), but it re-runs on every `synchronize`, must be
  idempotent, and races release-please's own branch regeneration — real complexity for one saved
  command. Available later if the manual step grates.
- **QEMU-emulated arm64.** Free arm runners exist for public repos; emulating a full Next.js build is
  the slower and more failure-prone path.
- **Lockstep versioning with the platform.** Rejected by the maintainer: the console must be able to
  ship a fix without waiting for a platform release. Compatibility is stated in the notes instead
  (decision 9).
- **CalVer.** The console's consumers are operators upgrading a deployment; semver's break signal is
  worth more here than a date.
