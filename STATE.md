# STATE.md — Active work

Conventions: [AGENTS.md](./AGENTS.md) · changes: [CHANGELOG.md](./CHANGELOG.md).

## Active work

[Plan 12](./docs/plan/12_console-color.md) records chart, icon and code color differences. Its [browser regressions](./test/e2e/console-colors.spec.ts) exercise both themes.

[Workspace management](./test/e2e/workspace-management.spec.ts) covers creation, grants, switching and archive. Workspace URLs select their own scope per tab. Grant changes release resource caches and in-flight streams. The [two-tab browser contract](./test/e2e/workspace-clients.spec.ts) accompanies [Platform plan 42](https://github.com/OpenSDLC-Dev/managed-agent-platform/blob/main/docs/plan/42_multi-tenant-activation.md). See the [page addresses](./README.md), [change for existing bookmarks](./CHANGELOG.md) and [Agents directory reload and history checks](./test/e2e/agent-inspector.spec.ts).

The Agents workspace Overview, guided Create and directory creation flows are ready for owner verification.
See the [Claude comparison and acceptance steps](./docs/agents-console-comparison.md).

### Owner verification

Owner verification of the live Session / child SSE alignment from
[recordings #8](https://github.com/OpenSDLC-Dev/managed-agents-wire-recordings/issues/8):
reconnect reconciliation, preview lifecycle and transcript cards on platform
0.4.0 with console 0.7.0, after [release #121](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/121)
and local Docker delivery. Preserve the #7 acceptance fixture.

The [header search browser tests](./test/e2e/command-palette.spec.ts) cover page and documentation groups, keyboard activation and workspace destinations. Reference observations and capability boundaries are in the [design reference](./docs/design-reference.md).

Stop after delivery. Scheduled execution #9 and OAuth #10 remain deferred.
