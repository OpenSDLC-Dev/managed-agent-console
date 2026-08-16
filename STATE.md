# STATE.md — Active work

What is being worked on right now, and how far along. **~30 lines, nothing static.** Conventions:
[CLAUDE.md](./CLAUDE.md) · narrative: [CHANGELOG.md](./CHANGELOG.md) · backlog:
[GitHub issues](https://github.com/OpenSDLC-Dev/managed-agent-console/issues).

## Active work

**Nothing in flight.** #104 shipped in #111.

Two issues are open behind it. #110 is the one that work left behind: the shared focus ring
composites to 1.39:1 light and 1.70:1 dark, and `globals.test.ts` reports it as passing because a
Tailwind modifier _multiplies_ a token's own alpha rather than replacing it. Fixing it changes focus
on every control and re-shoots most of the fidelity manifest, so it is its own slice. #107 is still
open from the work before.
