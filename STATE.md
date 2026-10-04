# STATE.md — Active work

Conventions: [CLAUDE.md](./CLAUDE.md) · changes: [CHANGELOG.md](./CHANGELOG.md).

## Active work

Console 0.8.0 with managed-agent-platform 0.5.0: merge
[release #181](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/181) once the
platform's 0.5.0 images are out, and deploy the console before the platform (#187,
[platform #820](https://github.com/OpenSDLC-Dev/managed-agent-platform/issues/820)). Staging is
parked ([platform #527](https://github.com/OpenSDLC-Dev/managed-agent-platform/issues/527)), so
deploys skip it until it is revived (#197). Follow-up: the mock's fired-session title (#196).

Owner verification of the live Session / child SSE alignment from
[recordings #8](https://github.com/OpenSDLC-Dev/managed-agents-wire-recordings/issues/8):
reconnect reconciliation, preview lifecycle and transcript cards on platform
0.4.0 with console 0.7.0, after [release #121](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/121)
and local Docker delivery. Preserve the #7 acceptance fixture.

Reference facts and capability boundaries: [docs/design-reference.md](./docs/design-reference.md).

Stop after delivery. Scheduled execution #9 and OAuth #10 remain deferred.
