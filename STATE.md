# STATE.md — Active work

What is being worked on right now, and how far along. **~30 lines, nothing static.** Conventions:
[CLAUDE.md](./CLAUDE.md) · narrative: [CHANGELOG.md](./CHANGELOG.md) · backlog:
[GitHub issues](https://github.com/OpenSDLC-Dev/managed-agent-console/issues).

## Active work

**Sidebar grouped after the reference, and a Dashboard to land on.**
Branch `feat/sidebar-groups-mockup`, in review.

- [x] Reference structure measured in Chrome (2026-08-17): group order, the icon rule, the 40px
      nested indent — recorded in `docs/design-reference.md`
- [x] Mockup reviewed, variant chosen (collapsible headers; cards in sidebar order), then deleted
- [x] Nav order and icons in one place, `src/lib/nav.ts`, read by the sidebar and by ⌘K
- [x] `Build` / `Managed Agents` groups, collapsible; a group whose items are all unserved goes too
- [x] Icons on top-level rows and group headers only; nested rows indent instead
- [x] Wordmark `Agent Console`, subtitle dropped
- [x] `/dashboard` static landing page; `/` redirects there; `dashboard` added to the fidelity manifest
- [x] Surface one-liners moved into the surface registry, read by page headers and cards alike
- [x] typecheck · lint · prettier · 990 unit tests · coverage 95.73/92.95/96.8
- [x] Chrome: `/dashboard` and `/agents` shot light, sidebar order/icons/indent/active state confirmed
- [x] `fidelity:shots`: 80 shots, both themes — `dashboard` new, every other shot moved with the sidebar
- [x] e2e: 62 passed against the mock platform
- [ ] PR opened, CI green
