---
trigger: glob
globs: "**/src/app/**,**/src/components/**,**/test/e2e/**,**/test/fidelity/**"
---

# UI evidence

Use the Managed Agents section of platform.claude.com as the design reference. Collect the current reference in Chrome before UI work. Walk `test/fidelity/surfaces.ts` afterward, name the surfaces re-shot in light and dark in the PR, and add a missing surface when it changes. Record intentional self-hosting differences in `docs/design-reference.md`. Record which authenticated reference surfaces you could inspect.

Expose formatted state through a machine-readable `data-*` attribute. End-to-end assertions use that attribute. Keep exactly one assertion of each formatter's human-readable text.
