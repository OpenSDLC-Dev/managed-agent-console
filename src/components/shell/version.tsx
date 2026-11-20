import pkg from "../../../package.json";

/**
 * The self-hosted console's version in the account panel.
 *
 * A deliberate divergence from the reference console, recorded in
 * docs/design-reference.md: a hosted product's operator never wonders what
 * version they are looking at, and a self-hosted one has no other way to tell.
 * Server-rendered from package.json — the version release-please bumps — so
 * nothing has to be kept in sync by hand and no client bundle carries it.
 */
export function ConsoleVersion() {
  return (
    <div
      className="text-xs text-muted-foreground"
      data-console-version={pkg.version}
    >
      v{pkg.version}
    </div>
  );
}
