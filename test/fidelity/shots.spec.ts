import { mkdir } from "node:fs/promises";
import { test, type Page } from "@playwright/test";
import { SURFACES } from "./surfaces";

/**
 * Walks the surface manifest and writes one screenshot per surface per theme
 * (plan 04 slice 4). Run with `pnpm fidelity:shots`; output lands in the
 * gitignored `fidelity-shots/<theme>/`.
 *
 * These are not assertions. A shot that renders is not a shot that matches the
 * reference — the comparison is the human half of CLAUDE.md's fidelity clause,
 * made against docs/design-reference.md. What this guarantees is only that the
 * pass has a complete, named denominator to compare.
 *
 * Deliberately not a `toHaveScreenshot` baseline suite: pinning bytes would
 * redden CI on a font-hinting difference between two machines while saying
 * nothing about whether the console still looks like the reference.
 */

const OUT = "fidelity-shots";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator("form[data-hydrated]").waitFor();
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/agents$/);
}

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18081/__reset");
});

for (const surface of SURFACES) {
  test(`shot: ${surface.id}`, async ({ page }, testInfo) => {
    const theme = testInfo.project.name;

    // The login gate is the one surface that must be shot signed out.
    if (surface.id === "login") {
      await page.context().clearCookies();
      await page.goto(surface.route);
      await page.locator("form[data-hydrated]").waitFor();
    } else {
      await signIn(page);
      await page.goto(surface.route);
      // The shell's platform probe resolves independently of the page's own
      // data; without this the sidebar is caught mid-"Checking platform…".
      await page
        .locator('[data-testid="connection-dot"]:not([data-state="checking"])')
        .waitFor();
      await surface.setup?.(page);
    }

    // Readiness, using the console's own loading convention: every skeleton
    // carries aria-busy, so their absence means the data arrived.
    //
    // Deliberately not `networkidle` — a session page holds its SSE stream
    // open, so the network is never idle and every trace surface times out.
    // And this check is only worth anything because the marker is uniform:
    // `DataTable` had no aria-busy, so the first run shot six lists of
    // skeleton bars, passed 46/46, and looked like coverage.
    await page.waitForFunction(
      () => !document.querySelector('[aria-busy="true"]'),
    );

    await mkdir(`${OUT}/${theme}`, { recursive: true });
    await page.screenshot({
      path: `${OUT}/${theme}/${surface.id}.png`,
      fullPage: true,
    });
  });
}
