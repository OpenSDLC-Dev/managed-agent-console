# STATE.md — Active work

What is being worked on right now, and how far along. **~30 lines, nothing static.** Conventions:
[CLAUDE.md](./CLAUDE.md) · narrative: [CHANGELOG.md](./CHANGELOG.md) · backlog:
[GitHub issues](https://github.com/OpenSDLC-Dev/managed-agent-console/issues).

## Active work

**Nothing in flight.** #120 shipped the grouped sidebar and the Dashboard. #125 followed it: the
runtime image refreshes its Alpine packages now, because `node:24-alpine` trails Alpine's own
security fixes and the trivy gate had reddened every PR — and the release build — on a CVE already
patched upstream. #123 and #126 are the dependency bumps that unblocked. Nothing is open on the
backlog.
