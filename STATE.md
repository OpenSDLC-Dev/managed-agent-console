# STATE.md — Active work

What is being worked on right now, and how far along. **~30 lines, nothing static.** Conventions:
[CLAUDE.md](./CLAUDE.md) · narrative: [CHANGELOG.md](./CHANGELOG.md) · backlog:
[GitHub issues](https://github.com/OpenSDLC-Dev/managed-agent-console/issues).

## Active work

**Nothing in flight.** #99 closed with [#106](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/106):
the fidelity pass now walks 35 surfaces against two consoles, one of them running
`IDENTITY_MODE=oidc` against a stub provider beside the mock platform, so `login-sso` and
`account-block` are shot rather than compared by hand. It left one defect behind —
[#107](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/107), a doubled divider rule in
the signed-in sidebar footer, which is what the first shot of that surface found.

Both halves of the platform's SSO/RBAC work (#56) are archived:
[plan 07](./docs/plan/07_console-issued-keys.md) (credential issuance) and
[plan 08](./docs/plan/08_console-sso-rbac.md) (browser sign-in, role-aware UI). Plan 08's **D1 is the
decision to revisit first** if this is reopened.
