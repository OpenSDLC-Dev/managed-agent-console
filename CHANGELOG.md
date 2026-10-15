# Changelog

Notable changes, newest first, in the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
format. This file holds the **cycle in progress**; released cycles are filed under
[docs/changelog/](./docs/changelog/), one per version, and are not edited afterwards.

## [Unreleased]

### Added

- **`MODEL_GATEWAY_BASE_URL` connects the console to the platform's model gateway**
  ([plan 10](docs/plan/10_model-gateway.md)). The console proxies the gateway's admin API under
  `/api/gateway/`, with the same credential rules as the control plane. No screen uses it yet. When
  the variable is unset, every gateway path answers 404.
- **Model Gateway → Providers.** The list shows each vendor account's site, endpoint protocols, key
  and upstream-model counts, and state. A dialog adds a provider from the vendor's published hosts.
  The detail page shows its overview and can disable or delete it. A console without a gateway hides
  the group.
- **A provider's keys and upstream models.** The provider page adds write-only vendor keys, with
  their protocols and weights, and upstream models with limits, prices and the models that route to
  them. An Edit dialog changes the name, extra headers, stall timeout and trace context. The
  console keeps no copy of a vendor key once the gateway has it.
- **Model Gateway → Models.** The list shows each name agents send, with its kind and the upstream
  models it routes to. The inspector shows the routing tiers and each target's share. A dialog adds
  a model or edits its routing: tiers of upstream models with weights, tried in order. An embedding
  model keeps its one upstream model.
- **First-run setup for an empty gateway.** While the gateway has no models, Models says that every
  agent's model call fails. While it also has no provider, Models offers one form. The form makes a
  provider, its key, an upstream model and a model, in that order. A refused step stops the form and
  keeps what was made, and Continue resumes at that step.
- **Model access on API Keys.** A column shows what each key may call through the gateway, and a
  dialog grants no models, every model, or selected models, with per-minute limits. The control
  plane's own keys show their built-in grant, and offer only to remove a policy someone wrote on
  one. An archived or expired key offers only to remove a policy it still has, since a policy blocks
  deleting the models it names. A model's inspector lists the active keys that can call it.

### Security

- **The BFF percent-encodes each path segment it forwards, and refuses one that holds a control
  character.** The URL parser deletes tabs, LFs and CRs before it resolves dot segments. A segment
  such as `..%09` passed the dot-segment check and was sent as `..`, so a crafted link could take
  the management credential outside `/v1`.

### Changed

- **The sidebar shows the console's version under the `Agent Console` wordmark**, not above the
  connection state, and navigation labels are title case: `API Keys`, `Credential Vaults`,
  `Memory Stores`, and `Platform Connected` / `Platform Unreachable` / `Checking Platform…`.

## Released

- [0.8.2](docs/changelog/0.8.2.md) — 2026-10-12 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.8.1...v0.8.2)
- [0.8.1](docs/changelog/0.8.1.md) — 2026-10-04 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.8.0...v0.8.1)
- [0.8.0](docs/changelog/0.8.0.md) — 2026-10-04 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.7.0...v0.8.0)
- [0.7.0](docs/changelog/0.7.0.md) — 2026-09-17 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.6.0...v0.7.0)
- [0.6.0](docs/changelog/0.6.0.md) — 2026-08-16 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.5.0...v0.6.0)
- [0.5.0](docs/changelog/0.5.0.md) — 2026-08-09 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.4.0...v0.5.0)
- [0.4.0](docs/changelog/0.4.0.md) — 2026-08-09 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.3.0...v0.4.0)
- [0.3.0](docs/changelog/0.3.0.md) — 2026-08-08 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.2.0...v0.3.0)
- [0.2.0](docs/changelog/0.2.0.md) — 2026-08-08 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.1.0...v0.2.0)
- [0.1.0](docs/changelog/0.1.0.md) — 2026-08-07 · [tag](https://github.com/OpenSDLC-Dev/managed-agent-console/releases/tag/v0.1.0)

[Unreleased]: https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.8.2...HEAD
