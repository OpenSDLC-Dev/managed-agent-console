# STATE.md — Active work

What is being worked on right now, and how far along. **~30 lines, nothing static.** Conventions:
[CLAUDE.md](./CLAUDE.md) · narrative: [CHANGELOG.md](./CHANGELOG.md) · backlog:
[GitHub issues](https://github.com/OpenSDLC-Dev/managed-agent-console/issues).

## Active work

**Closing #99** — the fidelity manifest could not reach the SSO-only surfaces, because every
automated tier ran the console in password mode. A stub OpenID Provider now shares the mock
platform's process on its own port, a second `next start` runs `IDENTITY_MODE=oidc`, and `Surface`
carries a `mode`. `login-sso` and `account-block` are in the manifest and shot.

- [x] stub provider, second console, `Surface.mode`, walker branch, narrowed coverage invariant
- [ ] PR green and merged

Both halves of the platform's SSO/RBAC work (#56) are archived:
[plan 07](./docs/plan/07_console-issued-keys.md) (credential issuance) and
[plan 08](./docs/plan/08_console-sso-rbac.md) (browser sign-in, role-aware UI). Plan 08's **D1 is the
decision to revisit first** if this is reopened.
