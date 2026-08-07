import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SURFACES } from "./surfaces";

/** Every route the App Router actually serves, read off disk. */
function appRoutes(dir = "src/app", prefix = ""): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // `(console)` and friends are route groups: they nest files, not URLs.
      const segment = /^\(.*\)$/.test(entry.name) ? "" : `/${entry.name}`;
      routes.push(...appRoutes(`${dir}/${entry.name}`, prefix + segment));
    } else if (entry.name === "page.tsx") {
      routes.push(prefix || "/");
    }
  }
  return routes;
}

/**
 * Routes with no visual surface of their own, and why. Anything else missing
 * from the manifest is a hole in the fidelity pass, not an exemption.
 */
const NO_SURFACE: Record<string, string> = {
  "/": "redirects to /agents; renders nothing",
};

/**
 * The manifest's own invariants (plan 04 slice 4). Screenshots are judged by a
 * human, but the *denominator* has to be trustworthy: the fidelity pass claims
 * "one shot per surface", and a manifest that quietly collapses two surfaces
 * into one file would report coverage it does not have.
 */
describe("the fidelity surface manifest", () => {
  it("gives every surface a unique id", () => {
    // Ids become filenames. A duplicate makes the second shot silently
    // overwrite the first — the walker still passes, and one surface vanishes.
    const ids = SURFACES.map((s) => s.id);
    expect([...new Set(ids)].sort()).toEqual([...ids].sort());
  });

  it("gives every surface a route, a fixture, and a description", () => {
    // The fixture and description are the manifest's whole value over a list
    // of URLs: why the surface looks like that, and what it alone shows.
    for (const surface of SURFACES) {
      expect(surface.route.startsWith("/"), surface.id).toBe(true);
      expect(surface.fixture.length, surface.id).toBeGreaterThan(0);
      expect(surface.description.length, surface.id).toBeGreaterThan(0);
    }
  });

  it("covers every route the app serves", () => {
    // The denominator that matters: a route nobody shot is a route whose
    // fidelity nobody checked. Derived from the App Router's own pages rather
    // than a hand-kept list — a hardcoded expectation would pass forever while
    // new pages went unshot, which is the exact failure this slice exists to
    // stop. Concrete ids collapse back to their dynamic segment.
    const covered = new Set(
      SURFACES.map((s) =>
        s.route.replace(/\/[a-z]+_[A-Za-z0-9]+/g, "/[id]").replace(/\/$/, ""),
      ),
    );
    const unshot = appRoutes()
      .filter((route) => !(route in NO_SURFACE))
      .filter((route) => !covered.has(route));
    expect(unshot).toEqual([]);
  });
});
