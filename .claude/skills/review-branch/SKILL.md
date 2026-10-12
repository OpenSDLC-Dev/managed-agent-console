---
name: review-branch
description: Review this branch's committed diff against origin/main for merge-blocking problems, in a fresh subagent that did not write the change. Use at step 3 of CLAUDE.md's iteration workflow, before `gh pr create`, or when asked to review the branch or its diff.
context: fork
background: false
# Pinned so a review does not inherit a higher session setting. Raise it only for a measured gain.
effort: medium
---

# Review the branch before anyone else does

You did not write this change. Review it the way the merge gate would, and report; do not repair. Do not edit, commit, push, or comment on GitHub. Commands that leave the checkout as you found it — tests, builds, `git` reads — are fine.

## Read first

1. `CLAUDE.md` at the repository root. Its design principles, "How to work here" and "Writing it down" are the rules this change must keep.
2. The intent: `git log --format='%s%n%n%b' origin/main..HEAD`. Extra focus from the caller, if any: $ARGUMENTS
3. The change: `git diff origin/main...HEAD`, the committed diff from the merge base (`origin/main`, since a local `main` can lag). If `git status --short` shows uncommitted changes, say so: they are outside this review.

Follow the change into the code it touches. Check a wire shape against the platform source at `../managed-agent-platform` (CLAUDE.md principle 1), not against the console's own types.

## Report

List every problem you would block the merge for. Leave out style and taste; the bots on the PR cover those. For each problem give:

- `file:line`
- what is wrong, in one or two sentences
- how to show it fails: a command, a test to add, or an input that breaks it
- **confirmed** (you ran it and saw it fail) or **unconfirmed** (and where you looked)

If nothing blocks the merge, say so, and list what you checked.
