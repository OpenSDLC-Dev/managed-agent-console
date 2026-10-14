# STATE.md — Active work

Conventions: [CLAUDE.md](./CLAUDE.md) · changes: [CHANGELOG.md](./CHANGELOG.md).

## Active work

### Model Gateway management — [plan 10](./docs/plan/10_model-gateway.md)

- [x] 1. BFF namespace `/api/gateway`, browser helpers, admin-view transcription, mock gateway
- [ ] 2. Surface probe and query hooks; Providers: list, detail, add; keys; upstream models
- [ ] 3. Models: list, inspector, routing editor; first-run setup
- [ ] 4. API Keys: model access column and dialog
- [ ] 5. Analytics → Usage: overview and request ledger
- [ ] 6. Agent and Dream model select; deploy manifests; fidelity surfaces; live contract

Open: the Analytics label (needs Chrome signed in to the reference); whether staging's console key
is the bootstrap key; the platform PR for the vendor display names.

### Owner verification

Owner verification of the live Session / child SSE alignment from
[recordings #8](https://github.com/OpenSDLC-Dev/managed-agents-wire-recordings/issues/8):
reconnect reconciliation, preview lifecycle and transcript cards on platform
0.4.0 with console 0.7.0, after [release #121](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/121)
and local Docker delivery. Preserve the #7 acceptance fixture.

Reference facts and capability boundaries: [docs/design-reference.md](./docs/design-reference.md).

Stop after delivery. Scheduled execution #9 and OAuth #10 remain deferred.
