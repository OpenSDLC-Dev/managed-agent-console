# Product context

## Register

product

## Users and purpose

[CLAUDE.md](./CLAUDE.md#what-this-is) defines the self-hosted platform's operator-facing console.
Its [design principles](./CLAUDE.md#non-negotiable-design-principles) govern authority and capability boundaries.

## Design direction

Keep the existing reference-derived identity, not a new brand for authentication pages.
[Design reference](./docs/design-reference.md) owns the observed layout and interaction facts.
[Global tokens](./src/app/globals.css) own colors, typography and theme roles.

## Boundaries and accessibility

Do not present capabilities that the platform does not implement.
Keep semantics on the platform and presentation in the console.
Preserve the existing contrast, focus and interaction contracts in [global token tests](./src/app/globals.test.ts) and shared components.
New surfaces follow the [Chrome fidelity workflow](./CLAUDE.md#how-to-work-here).
