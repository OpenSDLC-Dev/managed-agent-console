# STATE.md — Active work

What is being worked on right now, and how far along. **~30 lines, nothing static.** Conventions:
[CLAUDE.md](./CLAUDE.md) · narrative: [CHANGELOG.md](./CHANGELOG.md) · backlog:
[GitHub issues](https://github.com/OpenSDLC-Dev/managed-agent-console/issues).

## Active work

**#104 — the invalid-field indicator.** Branch `fix/104-aria-invalid`.

- [x] Measured the shipped state on a real field in Chrome: the halo paints at 1.43:1 light and
      1.66:1 dark, the dark border at 1.79:1. No alpha reaches 3:1 on every surface, so the halo is
      removed and the border drawn opaque — which is what the reference draws too.
- [x] Wired `aria-invalid` + `aria-describedby` on the only two controls that know a single field is
      wrong (login password, agent-editor raw config), so the styling has an observable before/after.
- [x] Assertions in `globals.test.ts`; unit + e2e cover the wiring; `login-invalid` added to the
      fidelity manifest and shot in both themes.
- [ ] PR open, CI green, review settled.

**Found on the way, filed as #110:** the shared focus ring is under 3:1 in both themes — `/50`
_multiplies_ `--ring`'s own alpha instead of replacing it, so Chrome paints 0.15 where
`globals.test.ts` models 0.5 and reports a pass. Measured 1.39:1 light, 1.70:1 dark. Not fixed here:
it changes focus on every control and re-shoots most of the manifest.

Issue #107 is also still open from the last work.
