# Console agent configuration

Keep the shared rules, skills with their attachments, role bodies and hook policies here. The manifest registers each capability. Edit its source and run these commands from the root of this checkout.

```sh
node scripts/harness-doctor.mjs sync
node scripts/harness-doctor.mjs check
node --test scripts/harness-doctor.test.mjs
```

`check --host claude|codex|antigravity` checks the common source and one client's adapters. `rules <path> ...` prints the path and full text of every matching rule, including for files being planned. Run this lookup explicitly in headless Antigravity sessions. A role that only accepts exact file reads can ask its caller to supply the results.

`sync` repairs registered output. Review unexpected files and hooks before reconciling them. Claude settings outside the hook registry remain local to that client. On Windows Git records executable bits in the index. Follow a reported `git add --chmod` instruction for tracked executable skill attachments.

The Codex role hook reads the native `agent_type` and tool name. It declines calls outside the file-read/search capabilities for Console triage and review. Trust the project hook through the normal client flow. Supply evidence directly when a restricted client has no native file tool.

Claude reads shared `.claude/settings.json` from the primary working directory. A bare session started under a worktree subdirectory can load the root guide and still miss the startup hook. Start a fresh session at the root printed by `git rev-parse --show-toplevel`, or use `claude --settings "<absolute-worktree-root>/.claude/settings.json"` and look for the independent receipt. [Claude project settings](https://code.claude.com/docs/en/settings#project-settings)

When upgrading a client, start a fresh session using a clean temporary worktree and observe the hook response separately from the root guide. Invoke the review skill, start a named child, check its model and tools, and inspect a representative file with matching rules. In a scratch checkout change one adapter and confirm a new session names it. Keep actual CLI results separate from offline protocol replay.
