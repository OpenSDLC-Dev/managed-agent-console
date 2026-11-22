# Console contributor guide

## Start the session

Work from the current Git worktree. Read [STATE.md](./STATE.md) for active work.
Look for this session's independent `SessionStart` hook receipt, `harness-doctor: OK`.
If it is missing, run `node scripts/harness-doctor.mjs check` from the root. Inspect the
active worktree, project instruction precedence and native hook trust. A manual pass
verifies files. Confirm the hook separately in a new trusted session. Claude loads
shared settings from its primary working directory. From a subdirectory, restart
Claude at the root reported by `git rev-parse --show-toplevel`, or pass that root's
absolute `.claude/settings.json` path to `claude --settings`. Check for a fresh receipt.

Read every rule returned by `node scripts/harness-doctor.mjs rules <path> ...`
before changing those paths. This also works when a client omits scoped rules.
Change shared instructions in `harness/`. Run `node scripts/harness-doctor.mjs sync`
and then `check` for generated drift. On a writable task, fix the source or adapter and
repeat the check. During a read-only task, report the affected capability and paths.
Preserve unknown hooks and local settings for their owner to reconcile.

## Authority and evidence

This console serves operators of self-hosted managed-agent-platform deployments.
The platform owns API truth and identity. Verify its implemented
contract before changing Console behavior. Use the Managed Agents section of
platform.claude.com for UI fidelity. The [platform contract](./harness/rules/platform-contract.md)
and [UI evidence](./harness/rules/ui-evidence.md) rules explain these boundaries.
Build and verification commands live in [package.json](./package.json) and
[development instructions](./README.md#development). Use live services only with
explicit opt-in. A missing prerequisite on an opted-in run is a failure.

## Issues and delivery

Use the GitHub backlog. File issues with a type and exactly two labels: priority
(`p0`, `p1`, `p2`) and difficulty (`easy`, `medium`, `hard`). Choose Bug for a
regression, Feature for a capability or improvement and Task for a concrete piece of work.
Missing type, priority or difficulty defaults to Feature, `p1` or `hard`, respectively.

Check the issue and [plans](./docs/plan/) for an existing plan. Otherwise run
`node scripts/issue-triage.mjs NUMBER` and give its JSON unchanged to a fresh
[issue-triage](./harness/agents/issue-triage.md) role. Supply source evidence on request.
Only the maintainer updates labels. Start easy work directly, write a plan for medium
work, and record the necessary human decision for hard work.

Branch from fresh main. Update [CHANGELOG.md](./CHANGELOG.md) for notable changes,
STATE.md for active work and plan status when the lifecycle changes. Keep progress
in STATE.md and archived acceptance in [HISTORY.md](./docs/HISTORY.md). Write each
fact once and cite its source. Report observed results and identify unverified claims.

For changes beyond a typo, commit and run [review-branch](./harness/skills/review-branch/SKILL.md).
The reviewer must work independently. Verify parent and child model settings before
counting its verdict. Give evidence for fixes and refutations in the PR. Use a Conventional
Commit PR title. Squash merge after required CI passes and every review thread is resolved,
then sync main. [Releases](./docs/releasing.md) have a separate workflow.

Keep working while an authorized step remains. Pause for human decisions, destructive
actions or changes outside the repository. End task reports with **Blocked on me**,
**Changed** and **Found**, in that order.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
